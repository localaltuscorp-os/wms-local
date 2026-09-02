import "server-only";

// Server-only core for POLICY acknowledgement / day-one signing. Imported ONLY
// by the /api/hr/policies/* route handler (server) — never by a client
// component — so the db + auth graph it pulls stays strictly server-runtime and
// never reaches a client bundle (mirrors lib/hr/letters/issue-core.ts).
//
// Policies are signed on DAY ONE by the employee themselves. To reuse the
// existing DigiLocker document_signatures flow (which resolves a signable
// document from a `document_instances` row attached to an employee), we FILE a
// policy instance for the current user and start a pending signature, then hand
// back the instance id. The client redirects to the universal signing surface
// (/documents/sign?kind=letter&doc=<instanceId>), where SignDocument drives the
// DigiLocker verify → draw/type → signed-PDF archive flow unchanged.
//
// No PDF is rendered here: finalizeSignature() builds the signed PDF itself, so
// the filed instance only needs to exist + be attached to the signer. Every
// write is auth-guarded + rate-limited.

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getEntity } from "@/lib/hr/entities";
import { getPolicy, isPolicyKey } from "./registry";
import { markPolicyPending, currentPolicyVersion } from "./compliance-sync";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface AcknowledgePolicyInput {
  /** The policy key (must be a registered, authored policy). */
  key?: string;
  /** The paying entity the reader signed under (branding only). */
  entity?: string;
}

/**
 * File a policy acknowledgement for the CURRENT user and start a pending
 * signature, returning the signable document id. The caller (client) then
 * navigates to `/documents/sign?kind=letter&doc=<docId>` to complete the
 * DigiLocker-verified signature.
 *
 * Idempotent-ish: if the user already has an unsigned instance for this policy,
 * we reuse it (so re-clicking "Sign" doesn't spawn duplicate rows). Any user may
 * sign a policy that applies to them — no admin gate (unlike issuing a letter).
 */
export async function acknowledgePolicy(
  input: AcknowledgePolicyInput,
): Promise<Result<{ docId: string; signatureId: string | null }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const key = (input.key ?? "").trim();
  if (!key || !isPolicyKey(key)) {
    return { ok: false, error: "This policy isn't published yet." };
  }
  const policy = getPolicy(key);
  if (!policy) return { ok: false, error: "This policy isn't published yet." };

  const resolvedEntity = getEntity(input.entity ?? policy.entityDefault ?? null);

  try {
    // Which version is published RIGHT NOW. An instance is only reusable when it
    // was filed against this SAME version — otherwise a re-published policy could
    // never be re-signed (the flow found the old signed row and showed "already
    // signed", so "Sign again" dead-ended).
    const version = await currentPolicyVersion(key);

    // Reuse the newest instance for this (user, policy) — but only if it belongs
    // to the current version.
    const existing = await db
      .select({ id: documentInstances.id, mergeValues: documentInstances.mergeValues })
      .from(documentInstances)
      .where(
        and(
          eq(documentInstances.typeKey, key),
          eq(documentInstances.employeeId, me.id),
        ),
      )
      .orderBy(desc(documentInstances.createdAt))
      .limit(1);

    // Instances filed before versioning carry no __version — treat them as v1.
    const prevVersion = Number(
      (existing[0]?.mergeValues as Record<string, unknown> | null)?.__version ?? 1,
    );
    let docId = existing[0] && prevVersion === version ? existing[0].id : null;

    if (!docId) {
      const [row] = await db
        .insert(documentInstances)
        .values({
          typeKey: key,
          employeeId: me.id,
          status: "sent",
          // merge_values is a string map — the version is stamped as a string and
          // parsed back with Number() on read.
          mergeValues: { __entity: resolvedEntity.id, __version: String(version) },
          bodySnapshotMd: JSON.stringify({ key, entity: resolvedEntity.id, kind: "policy", version }),
          issuedById: me.id,
          issuedAt: new Date(),
        })
        .returning({ id: documentInstances.id });
      if (!row) return { ok: false, error: "Could not file the policy acknowledgement." };
      docId = row.id;
    }

    // Create-or-load the pending signature row (docKind 'letter' — policies live
    // in document_instances, which resolveFromInstance() handles for 'letter').
    let signatureId: string | null = null;
    const sig = await db
      .select({ id: documentSignatures.id, status: documentSignatures.status })
      .from(documentSignatures)
      .where(
        and(
          eq(documentSignatures.docKind, "letter"),
          eq(documentSignatures.docId, docId),
        ),
      )
      .orderBy(desc(documentSignatures.createdAt))
      .limit(1);

    if (sig[0]) {
      signatureId = sig[0].id;
    } else {
      const [inserted] = await db
        .insert(documentSignatures)
        .values({
          docKind: "letter",
          docId,
          signerEmployeeId: me.id,
          status: "pending",
          createdById: me.id,
        })
        .returning({ id: documentSignatures.id });
      signatureId = inserted?.id ?? null;
    }

    // Mirror: seed a `pending` policy_compliance row so the employee portal
    // ledger reflects that signing has started. Best-effort — never blocks.
    try {
      await markPolicyPending(me.id, key, docId);
    } catch (err) {
      console.error("[acknowledgePolicy] policy_compliance pending mirror failed", err);
    }

    return { ok: true, docId, signatureId };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
