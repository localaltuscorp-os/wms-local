import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, authSessions, type Employee } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

/** Why a candidate account was closed (audit / telemetry only). */
export type DisableReason = "submitted" | "hired" | "rejected" | "manual" | "intake_deleted";

/**
 * The SINGLE closer for a candidate guest-account. Called by EVERY exit — form
 * submit, hire/reject, manual deactivate, and intake-delete — so no path does a
 * bare flag flip. Fail-closed and idempotent:
 *   1. `candidate_active = false` + stamp `deactivated_at` (the real login gate;
 *      `isLoginLive` denies the next request — DB read, not a stale token).
 *   2. Firebase `disabled = true` + `revokeRefreshTokens` — kills any live token
 *      immediately AND makes a public forgot-password reset useless (a disabled
 *      user can't sign in even with a fresh password).
 *   3. Drop the candidate's auth-session rows.
 * NEVER touches `is_active`.
 */
async function closeCandidateRow(emp: Employee, reason: DisableReason): Promise<{ ok: boolean }> {
  if (emp.accountType !== "candidate") return { ok: true }; // nothing to close
  if (!emp.candidateActive) return { ok: true }; // already closed — idempotent

  await db
    .update(employees)
    .set({ candidateActive: false, deactivatedAt: new Date() })
    .where(eq(employees.id, emp.id));

  if (emp.firebaseUid) {
    try {
      const auth = getFirebaseAdminAuth();
      await auth.updateUser(emp.firebaseUid, { disabled: true });
      await auth.revokeRefreshTokens(emp.firebaseUid);
    } catch (err) {
      // The DB gate above already denies login; Firebase disable is defense in
      // depth. Log and continue — never leave the account half-closed.
      console.error(`[candidate] Firebase disable failed for ${emp.firebaseUid} (${reason})`, err);
    }
  }
  await db.delete(authSessions).where(eq(authSessions.employeeId, emp.id)).catch(() => {});
  return { ok: true };
}

/** Close a candidate account by its linked intake row id (submit / hire / reject / delete). */
export async function disableCandidateAccountByIntakeId(
  intakeId: string,
  reason: DisableReason,
): Promise<{ ok: boolean; error?: string }> {
  const emp = await db.query.employees.findFirst({
    where: eq(employees.candidateIntakeId, intakeId),
  });
  if (!emp) return { ok: true }; // no linked account — nothing to close
  return closeCandidateRow(emp, reason);
}

/** Close a candidate account by its employees.id (HR "Deactivate"). */
export async function disableCandidateAccountByEmployeeId(
  candidateEmployeeId: string,
  reason: DisableReason,
): Promise<{ ok: boolean; error?: string }> {
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, candidateEmployeeId) });
  if (!emp || emp.accountType !== "candidate") return { ok: false, error: "No candidate account." };
  return closeCandidateRow(emp, reason);
}

/** Re-open a previously-disabled candidate account (HR-triggered). */
export async function reactivateCandidateAccountById(
  candidateEmployeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, candidateEmployeeId) });
  if (!emp || emp.accountType !== "candidate") return { ok: false, error: "No candidate account." };
  await db
    .update(employees)
    .set({ candidateActive: true, deactivatedAt: null })
    .where(eq(employees.id, emp.id));
  if (emp.firebaseUid) {
    try {
      await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { disabled: false });
    } catch (err) {
      console.error(`[candidate] Firebase re-enable failed for ${emp.firebaseUid}`, err);
    }
  }
  return { ok: true };
}
