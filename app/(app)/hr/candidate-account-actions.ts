"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employees, candidateIntake } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { generateInvitePassword } from "@/lib/auth/default-password";
import { sendCredentialsEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";
import {
  disableCandidateAccountByEmployeeId,
  reactivateCandidateAccountById,
} from "@/lib/hr/candidate/account-lifecycle";
import type { LifecycleResult } from "@/lib/hr/candidate/account-types";

/**
 * Candidate guest-account lifecycle (HR-gated). A candidate account is a
 * limited login that can ONLY fill its own interview form (mig 0183): a
 * Firebase user + a `account_type='candidate'`, `is_active=false`,
 * `candidate_active=true` employees row linked to a draft `candidate_intake`.
 * Credentials are returned SHOW-ONCE (never persisted); HR hands them to the
 * candidate. Every close routes through the hardened lifecycle helper.
 */

const UUID = z.string().uuid();
const CreateSchema = z.object({
  name: z.string().trim().min(1, "Enter the candidate's name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  positionApplied: z.string().trim().max(160).optional(),
});

/** Create a candidate guest-account + its draft intake row. Returns show-once creds. */
export async function createCandidateAccount(input: {
  name: string;
  email: string;
  positionApplied?: string;
}): Promise<LifecycleResult> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { name, email, positionApplied } = parsed.data;

  // A super-admin email must NEVER be turned into a candidate (priv-esc guard).
  if (isSuperAdmin(email)) return { ok: false, error: "This email can't be used for a candidate account." };

  // Case-insensitive dup guard (the DB unique on email is the real arbiter below).
  const existing = await db.query.employees.findFirst({
    where: sql`lower(${employees.email}) = ${email}`,
  });
  if (existing) return { ok: false, error: "An account with this email already exists." };

  // 1. Firebase user with a fresh one-off password.
  const auth = getFirebaseAdminAuth();
  const password = generateInvitePassword();
  let fbUid: string;
  try {
    const u = await auth.createUser({ email, password, emailVerified: true, disabled: false });
    fbUid = u.uid;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Firebase: ${msg}` };
  }

  // 2. Supabase-RLS claim (same as employees) + candidate marker for the L0 hint.
  try {
    await auth.setCustomUserClaims(fbUid, { role: "authenticated", candidate: true });
  } catch (err) {
    console.error(`[candidate] setCustomUserClaims failed for ${fbUid} — continuing`, err);
  }

  // 3. Draft intake row (prefill position); rollback the Firebase user on failure.
  let intakeId: string;
  try {
    const [row] = await db
      .insert(candidateIntake)
      .values({ fullName: name, email, positionApplied: positionApplied ?? null, createdById: me.id })
      .returning({ id: candidateIntake.id });
    if (!row) throw new Error("intake insert returned no row");
    intakeId = row.id;
  } catch (err: unknown) {
    await auth.deleteUser(fbUid).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 4. Candidate employees row — EXPLICIT sentinels (is_active=false is enforced
  //    by the DB CHECK; candidate_active=true is the login gate).
  try {
    const [emp] = await db
      .insert(employees)
      .values({
        name,
        email,
        role: "doer", // inert filler — a candidate never reaches role-driven surfaces
        isAdmin: false,
        isActive: false,
        accountType: "candidate",
        candidateActive: true,
        candidateIntakeId: intakeId,
        firebaseUid: fbUid,
        invitedAt: new Date(),
      })
      .returning({ id: employees.id });
    if (!emp) throw new Error("insert returned no row");
  } catch (err: unknown) {
    await db.delete(candidateIntake).where(eq(candidateIntake.id, intakeId)).catch(() => {});
    await auth.deleteUser(fbUid).catch(() => {});
    const e = err as { code?: string; message?: string };
    if (e?.code === "23505") return { ok: false, error: "An account with this email already exists." };
    return { ok: false, error: `DB: ${e?.message ?? String(err)}` };
  }

  const loginUrl = `${siteUrl()}/login`;
  // Best-effort email as well as the show-once return (the return is primary).
  const mail = await sendCredentialsEmail({
    email,
    inviteeName: name,
    inviterName: me.name,
    password,
    loginUrl,
  }).catch(() => ({ id: null, error: "send failed" }));

  revalidatePath("/hr/candidates");
  return {
    ok: true,
    credentials: { email, password, loginUrl },
    warning: mail.error ? "Couldn't email the candidate — hand them the details shown here." : undefined,
  };
}

/** Deactivate a candidate account (manual) — can no longer log in. */
export async function deactivateCandidateAccount(candidateEmployeeId: string): Promise<LifecycleResult> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.safeParse(candidateEmployeeId).success) return { ok: false, error: "Invalid account." };

  const res = await disableCandidateAccountByEmployeeId(candidateEmployeeId, "manual");
  if (!res.ok) return { ok: false, error: res.error ?? "Couldn't deactivate." };
  revalidatePath("/hr/candidates");
  return { ok: true };
}

/** Re-open a deactivated candidate account. */
export async function reactivateCandidateAccount(candidateEmployeeId: string): Promise<LifecycleResult> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.safeParse(candidateEmployeeId).success) return { ok: false, error: "Invalid account." };

  const res = await reactivateCandidateAccountById(candidateEmployeeId);
  if (!res.ok) return { ok: false, error: res.error ?? "Couldn't reactivate." };
  revalidatePath("/hr/candidates");
  return { ok: true };
}

/** Mint a fresh password for an ACTIVE candidate account (resend == reset). */
export async function resetCandidateCredentials(candidateEmployeeId: string): Promise<LifecycleResult> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (!UUID.safeParse(candidateEmployeeId).success) return { ok: false, error: "Invalid account." };

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, candidateEmployeeId) });
  if (!emp || emp.accountType !== "candidate") return { ok: false, error: "No candidate account." };
  if (!emp.candidateActive) return { ok: false, error: "Reactivate the account first." };
  if (!emp.firebaseUid) return { ok: false, error: "This account has no login." };

  const password = generateInvitePassword();
  try {
    await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { password });
  } catch (err: unknown) {
    return { ok: false, error: `Firebase: ${err instanceof Error ? err.message : String(err)}` };
  }
  const loginUrl = `${siteUrl()}/login`;
  const mail = await sendCredentialsEmail({
    email: emp.email,
    inviteeName: emp.name,
    inviterName: me.name,
    password,
    loginUrl,
  }).catch(() => ({ id: null, error: "send failed" }));

  return {
    ok: true,
    credentials: { email: emp.email, password, loginUrl },
    warning: mail.error ? "Couldn't email the candidate — hand them the details shown here." : undefined,
  };
}
