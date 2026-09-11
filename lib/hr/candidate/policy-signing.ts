import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidatePolicySignatures, policyCompliance } from "@/db/schema";
import { POLICY_CARDS, getPolicy, isPolicyKey } from "@/lib/hr/policies/registry";
import { currentPolicyVersion } from "@/lib/hr/policies/compliance-sync";

/**
 * CANDIDATE POLICY SIGNING (migration 0222) — the acknowledgements, without a
 * login.
 *
 * ── WHAT A CANDIDATE'S SIGNATURE IS, AND IS NOT ────────────────────────────
 * An employee signs a policy through DigiLocker: Aadhaar-verified identity, an
 * archived signed PDF, a `document_signatures` row. A candidate has no account
 * and no DigiLocker session, so what we can honestly collect from them is
 * TYPED ACCEPTANCE of a named version at a known time — weaker evidence, and
 * recorded in its own table (`candidate_policy_signatures`) that says so.
 * Filing it among the verified signatures would let the two be confused by
 * somebody reading the ledger a year from now.
 *
 * `policy_compliance` IS still mirrored, because that is the ledger every HR
 * screen already reads to answer "who has acknowledged what". The mirror row
 * carries `docInstanceId: null`, which is exactly what distinguishes it from a
 * DigiLocker-backed one for anyone who looks.
 *
 * ── EDITABLE AFTER SIGNING ─────────────────────────────────────────────────
 * Same promise as the interview form: the link stays live for its full term and
 * re-accepting UPDATES the row rather than stacking another. A candidate can
 * come back, re-read what they agreed to, and sign again — which is also what
 * happens when a policy is republished at a new version.
 */

/** The policies a candidate is asked to sign: every published, authored one. */
export function candidatePolicyKeys(): string[] {
  return POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key) && getPolicy(c.key)).map(
    (c) => c.key,
  );
}

export interface CandidatePolicyState {
  key: string;
  title: string;
  blurb: string;
  badge: string;
  /** ISO timestamp of their acceptance, or null when not signed yet. */
  signedAt: string | null;
  /** The name they typed, so the page can show what they signed as. */
  signedName: string | null;
  /**
   * They signed, but an OLDER version than the one now published — the card
   * must not read as done. Same rule the employee surfaces use.
   */
  outdated: boolean;
}

/** Every policy this candidate must sign, with their own progress against it. */
export async function listCandidatePolicies(intakeId: string): Promise<CandidatePolicyState[]> {
  const keys = candidatePolicyKeys();
  const rows = await db
    .select({
      policyKey: candidatePolicySignatures.policyKey,
      version: candidatePolicySignatures.version,
      signedAt: candidatePolicySignatures.signedAt,
      signedName: candidatePolicySignatures.signedName,
    })
    .from(candidatePolicySignatures)
    .where(eq(candidatePolicySignatures.intakeId, intakeId));
  const mine = new Map(rows.map((r) => [r.policyKey, r]));

  const out: CandidatePolicyState[] = [];
  for (const card of POLICY_CARDS) {
    if (!keys.includes(card.key)) continue;
    const row = mine.get(card.key);
    const published = await currentPolicyVersion(card.key);
    out.push({
      key: card.key,
      title: card.title,
      blurb: card.blurb,
      badge: card.badge,
      signedAt: row ? row.signedAt.toISOString() : null,
      signedName: row?.signedName ?? null,
      outdated: row ? row.version < published : false,
    });
  }
  return out;
}

/**
 * Record a candidate's acceptance of one policy.
 *
 * Writes BOTH the candidate table (the honest record of what was collected) and
 * the `policy_compliance` ledger (what HR already reads), in that order, so a
 * failure can only ever leave the ledger behind the candidate table rather than
 * claiming a signature that was never taken.
 */
export async function signCandidatePolicy(args: {
  intakeId: string;
  employeeId: string;
  policyKey: string;
  signedName: string;
}): Promise<void> {
  const { intakeId, employeeId, policyKey, signedName } = args;
  const version = await currentPolicyVersion(policyKey);
  const now = new Date();

  await db
    .insert(candidatePolicySignatures)
    .values({ intakeId, employeeId, policyKey, version, signedName, signedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [candidatePolicySignatures.intakeId, candidatePolicySignatures.policyKey],
      // Re-accepting re-stamps the version too: signing again after a policy is
      // republished must not leave the row claiming the older text.
      set: { signedName, signedAt: now, updatedAt: now, version, employeeId },
    });

  // Mirror into the ledger HR already reads. `docInstanceId` stays null — that
  // is the marker of a typed candidate acceptance rather than a DigiLocker one.
  await db
    .insert(policyCompliance)
    .values({ policyKey, employeeId, version, status: "signed", signedAt: now })
    .onConflictDoUpdate({
      target: [policyCompliance.policyKey, policyCompliance.employeeId],
      set: { status: "signed", signedAt: now, version, updatedAt: now },
    });
}

/** One candidate's acceptance of one policy, or null. */
export async function candidatePolicySignature(intakeId: string, policyKey: string) {
  const [row] = await db
    .select()
    .from(candidatePolicySignatures)
    .where(
      and(
        eq(candidatePolicySignatures.intakeId, intakeId),
        eq(candidatePolicySignatures.policyKey, policyKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
