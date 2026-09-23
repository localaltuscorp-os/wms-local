import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, policyCompliance, policyDocuments } from "@/db/schema";
import { POLICY_CARDS, getPolicy, isPolicyKey } from "@/lib/hr/policies/registry";
import { sendPlainEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import { formatDateHr } from "@/lib/format";
import { afterResponse } from "@/lib/after";
import { policiesSignedRecipients } from "@/lib/hr/notify-recipients";

/**
 * "xyz HAS SIGNED THE POLICIES" — one mail to the HR desk + Manan, sent at the
 * moment a person's LAST outstanding policy is signed.
 *
 * ONCE PER COMPLETION, NOT PER POLICY. A candidate signs about six policies in a
 * sitting; six near-identical mails would teach HR to ignore them. So every
 * signing path takes a "before" snapshot ({@link hasSignedAllPolicies}) ahead of
 * its write and calls {@link notifyIfPoliciesJustCompleted} after — the mail goes
 * only on the false → true transition. Re-signing an already complete set, or a
 * policy republished at a new version and signed again, mails again only if the
 * set had genuinely become incomplete in between.
 *
 * Covers all three signing paths: a candidate on a link (policy-signing.ts), an
 * employee's signature-image sign-off (sign-off-actions.ts) and DigiLocker
 * (compliance-sync.ts → markPolicySigned).
 */

/** The policies everyone is asked to sign: every published, authored one. */
export function requiredPolicyKeys(): string[] {
  return POLICY_CARDS.filter((c) => c.status === "ready" && isPolicyKey(c.key) && getPolicy(c.key)).map(
    (c) => c.key,
  );
}

/** Has this person signed the CURRENT version of every required policy? */
export async function hasSignedAllPolicies(employeeId: string): Promise<boolean> {
  const keys = requiredPolicyKeys();
  if (keys.length === 0) return false;

  const [rows, versions] = await Promise.all([
    db
      .select({ key: policyCompliance.policyKey, version: policyCompliance.version, status: policyCompliance.status })
      .from(policyCompliance)
      .where(and(eq(policyCompliance.employeeId, employeeId), inArray(policyCompliance.policyKey, keys))),
    db
      .select({ key: policyDocuments.key, v: policyDocuments.currentVersion })
      .from(policyDocuments)
      .where(inArray(policyDocuments.key, keys)),
  ]);
  const current = new Map(versions.map((r) => [r.key, r.v ?? 1]));
  const mine = new Map(rows.map((r) => [r.key, r]));
  return keys.every((k) => {
    const row = mine.get(k);
    return !!row && row.status === "signed" && row.version >= (current.get(k) ?? 1);
  });
}

/**
 * Call AFTER a signing write, with the snapshot taken BEFORE it. Mails (after the
 * response) only when this signature is the one that completed the set. Never
 * throws — a signature must never fail because a notification did.
 */
export async function notifyIfPoliciesJustCompleted(employeeId: string, completeBefore: boolean): Promise<void> {
  if (completeBefore) return;
  try {
    if (!(await hasSignedAllPolicies(employeeId))) return;
    afterResponse(() => sendPoliciesSignedMail(employeeId));
  } catch (err) {
    console.warn(`[policies] completion check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Snapshot helper for callers — never throws; an unknown state reads as "not complete". */
export async function policiesCompleteSnapshot(employeeId: string): Promise<boolean> {
  return hasSignedAllPolicies(employeeId).catch(() => false);
}

async function sendPoliciesSignedMail(employeeId: string): Promise<void> {
  try {
    const [emp] = await db
      .select({
        name: employees.name,
        email: employees.email,
        personalEmail: employees.personalEmail,
        accountType: employees.accountType,
      })
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!emp) return;

    const name = emp.name?.trim() || "Someone";
    const who = emp.accountType === "candidate" ? "Candidate" : "Employee";
    const count = requiredPolicyKeys().length;
    const res = await sendPlainEmail({
      to: policiesSignedRecipients(),
      subject: `${name} has signed the policies`,
      text: [
        `${name} has signed all ${count} company policies.`,
        ``,
        `${who}: ${name}`,
        ...(emp.personalEmail || emp.email ? [`Email: ${emp.personalEmail || emp.email}`] : []),
        `Date: ${formatDateHr(new Date())}`,
        ``,
        `See who has signed what: ${siteUrl()}/hr/record`,
        ``,
        `— Altus Corp Dashboard`,
      ].join("\n"),
    });
    if (res.error) console.warn(`[policies] signed notify not sent: ${res.error}`);
  } catch (err) {
    console.warn(`[policies] signed notify threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
