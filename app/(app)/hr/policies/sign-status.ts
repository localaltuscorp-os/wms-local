"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures, policyDocuments } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { POLICY_CARDS, isPolicyKey } from "@/lib/hr/policies/registry";

/**
 * The CURRENT user's own policy-signing status — which published policies they
 * have already SIGNED (and when). Lets the "All Policies" popup badge each card
 * ✓ Signed vs "Sign", and lets a single policy page show "You signed this on …"
 * instead of prompting to sign again. Self-scoped: no HR gate, everyone can see
 * their own status (mirrors the source-of-truth query in
 * app/(app)/hr/record/policy-status.ts, but for `me`).
 */
export interface MyPolicySignStatus {
  /** policy key → ISO signedAt, for every policy the caller has already signed. */
  signed: Record<string, string>;
  /**
   * policy key → true when the caller HAS signed the policy but only an OLDER
   * version of it — a newer version has since been published, so they should
   * sign again. (Signatures filed before versioning count as version 1.)
   */
  outdated?: Record<string, true>;
}

export async function getMyPolicySignStatus(): Promise<MyPolicySignStatus> {
  const me = await requireUser();
  return getPolicySignStatusFor(me.id);
}

/**
 * The same self-status query for an explicit employee id — used where there is
 * no request cookie to resolve `me` (the mobile API, which authenticates via a
 * Bearer token instead). Kept in this file so the web and mobile surfaces read
 * the identical query and can never disagree about who has signed what.
 */
export async function getPolicySignStatusFor(employeeId: string): Promise<MyPolicySignStatus> {
  const keys = POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key)).map((c) => c.key);
  if (keys.length === 0) return { signed: {} };

  const rows = await db
    .select({
      typeKey: documentInstances.typeKey,
      signedAt: documentSignatures.signedAt,
      mergeValues: documentInstances.mergeValues,
    })
    .from(documentInstances)
    .innerJoin(
      documentSignatures,
      and(
        eq(documentSignatures.docId, documentInstances.id),
        eq(documentSignatures.docKind, "letter"),
        eq(documentSignatures.status, "signed"),
      ),
    )
    .where(
      and(
        eq(documentInstances.employeeId, employeeId),
        inArray(documentInstances.typeKey, keys),
      ),
    );

  // Which version of each policy is published right now (missing CMS row → v1).
  const published = new Map<string, number>();
  try {
    const pv = await db
      .select({ key: policyDocuments.key, v: policyDocuments.currentVersion })
      .from(policyDocuments)
      .where(inArray(policyDocuments.key, keys));
    for (const p of pv) published.set(p.key, p.v ?? 1);
  } catch {
    /* CMS unavailable → treat everything as v1 (never blocks the status read). */
  }

  const signed: Record<string, string> = {};
  /** policy key → the newest version the caller has actually signed. */
  const signedVersion = new Map<string, number>();
  for (const r of rows) {
    if (!r.typeKey) continue;
    const iso = (r.signedAt ?? new Date()).toISOString();
    // Keep the earliest signed timestamp if a key somehow has more than one.
    const existing = signed[r.typeKey];
    if (!existing || iso < existing) signed[r.typeKey] = iso;
    // Instances filed before versioning carry no __version — count them as v1.
    const v = Number((r.mergeValues as Record<string, unknown> | null)?.__version ?? 1);
    signedVersion.set(r.typeKey, Math.max(signedVersion.get(r.typeKey) ?? 0, v));
  }

  const outdated: Record<string, true> = {};
  for (const key of Object.keys(signed)) {
    if ((signedVersion.get(key) ?? 1) < (published.get(key) ?? 1)) outdated[key] = true;
  }
  return { signed, outdated };
}
