import "server-only";

// Policy-compliance MIRROR — reconciliation glue.
//
// There are two ways the app can talk about "has this person signed a policy":
//   1. document_signatures (a policy is a document_instances row + a signature
//      that flips to status "signed" in finalizeSignature). This is the SOURCE
//      OF TRUTH — it's what actually changes when a person signs — and it's what
//      `getPolicySigningStatus` reads for the HR-Record tracker AND the
//      candidate/employee checklist.
//   2. policy_compliance (policy_key, employee_id, status pending|signed) — the
//      CMS re-sign campaign ledger, ALSO read by the employee /portal.
//
// Nothing used to write "signed" into policy_compliance, so the portal ledger
// drifted from reality. These helpers keep policy_compliance IN SYNC with the
// signature flow so every surface agrees. They are strictly best-effort — the
// caller wraps them so a mirror failure never blocks signing.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { policyCompliance, policyDocuments } from "@/db/schema";

/** Current published version for a policy key (defaults to 1 when the CMS has no
 *  row for a code-registered policy). */
export async function currentPolicyVersion(policyKey: string): Promise<number> {
  return currentVersion(policyKey);
}

async function currentVersion(policyKey: string): Promise<number> {
  const [row] = await db
    .select({ v: policyDocuments.currentVersion })
    .from(policyDocuments)
    .where(eq(policyDocuments.key, policyKey))
    .limit(1);
  return row?.v ?? 1;
}

/**
 * Record that `employeeId` has STARTED signing `policyKey` — seed a `pending`
 * compliance row if none exists yet. Never downgrades an existing row (a CMS
 * campaign row or an already-signed row wins). Best-effort.
 */
export async function markPolicyPending(
  employeeId: string,
  policyKey: string,
  docInstanceId: string,
): Promise<void> {
  const version = await currentVersion(policyKey);
  await db
    .insert(policyCompliance)
    .values({ policyKey, employeeId, version, status: "pending", docInstanceId })
    .onConflictDoNothing({ target: [policyCompliance.policyKey, policyCompliance.employeeId] });
}

/**
 * Record that `employeeId` has SIGNED `policyKey` — flips (or creates) the
 * compliance row to `signed` with the signature timestamp + instance id, so the
 * employee portal ledger matches the document-signature source of truth.
 * Best-effort.
 */
export async function markPolicySigned(
  employeeId: string,
  policyKey: string,
  docInstanceId: string,
  signedAt: Date,
): Promise<void> {
  const version = await currentVersion(policyKey);
  await db
    .insert(policyCompliance)
    .values({ policyKey, employeeId, version, status: "signed", signedAt, docInstanceId })
    .onConflictDoUpdate({
      target: [policyCompliance.policyKey, policyCompliance.employeeId],
      // `version` MUST be part of the update — re-signing a newly published
      // version otherwise left the ledger stamped with the OLD version number.
      set: { status: "signed", signedAt, docInstanceId, version, updatedAt: new Date() },
    });
}

/** Resolve the policy key for a signed LETTER-kind document instance — returns
 *  the typeKey when it is a registered policy, else null. */
export async function policyKeyForInstance(docInstanceId: string): Promise<string | null> {
  const { documentInstances } = await import("@/db/schema");
  const { isPolicyKey } = await import("./registry");
  const [row] = await db
    .select({ typeKey: documentInstances.typeKey })
    .from(documentInstances)
    .where(eq(documentInstances.id, docInstanceId))
    .limit(1);
  const key = row?.typeKey ?? null;
  return key && isPolicyKey(key) ? key : null;
}
