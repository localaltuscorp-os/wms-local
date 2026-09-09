"use server";

import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, employeeEvents, onboardingSubmissions } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { resolvePersonEmployee } from "./resolve-person";
import { deriveOfficialEmail } from "@/lib/hr/official-email";
import { HR_CONTACT } from "@/lib/hr/firm";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { generateInvitePassword } from "@/lib/auth/default-password";
import { sendWelcomeEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";

/**
 * Post-joining workflow status + actions for the HR Record control panel.
 *
 * The HR Record hub is per-CANDIDATE (a `candidate_intake` row); everything here
 * resolves that person to their `employees` account BY EMAIL — the exact pattern
 * the policy-signing + exit loaders use — and then reports / drives the two
 * onboarding-gated post-joining steps:
 *   • Create Official Email  (derive + store firstname.lastname@company, send the
 *                             welcome mail, stamp email_provisioned_at)
 *   • Allocate Assets        (stamp assets_allocated_at)
 *
 * Both steps stay LOCKED until the employee's onboarding form is submitted
 * (`onboarding_submissions.status = 'submitted'`). Read-only status is honest:
 * an unlinked / no-onboarding person shows matched:false / locked. HR-gated.
 */

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export interface WorkflowStatus {
  /** True when the candidate resolved to an employee account (by email). */
  matched: boolean;
  employeeId: string | null;
  employeeName: string | null;
  /** Onboarding form state for the linked employee. */
  onboardingExists: boolean;
  onboardingSubmitted: boolean;
  onboardingSubmittedAt: string | null;
  /** Official-email provisioning. */
  officialEmail: string | null;
  emailProvisionedAt: string | null;
  /** A live preview of the address that WOULD be provisioned (collision-safe). */
  suggestedOfficialEmail: string | null;
  /** Asset allocation. */
  assetsAllocatedAt: string | null;
  /** Where the welcome mail would go (personal ?? account email). */
  welcomeTo: string | null;
}

type StatusResult = { ok: true; status: WorkflowStatus } | { ok: false; error: string };

// The HR-Record person id is an employee id (candidate id still works as a
// fallback) — resolved centrally in ./resolve-person.
async function resolveEmployeeByCandidate(candidateId: string) {
  return resolvePersonEmployee(candidateId);
}

async function loadOnboarding(employeeId: string) {
  const [sub] = await db
    .select({ status: onboardingSubmissions.status, submittedAt: onboardingSubmissions.submittedAt })
    .from(onboardingSubmissions)
    .where(eq(onboardingSubmissions.employeeId, employeeId))
    .limit(1);
  return sub ?? null;
}

/** Every already-taken official-email local part / address — for collision-safe
 *  derivation. One small indexed scan of non-null official emails. */
async function takenOfficialEmails(): Promise<string[]> {
  const rows = await db
    .select({ e: employees.officialEmail })
    .from(employees)
    .where(isNotNull(employees.officialEmail));
  return rows.map((r) => r.e).filter((e): e is string => !!e);
}

const empty: WorkflowStatus = {
  matched: false,
  employeeId: null,
  employeeName: null,
  onboardingExists: false,
  onboardingSubmitted: false,
  onboardingSubmittedAt: null,
  officialEmail: null,
  emailProvisionedAt: null,
  suggestedOfficialEmail: null,
  assetsAllocatedAt: null,
  welcomeTo: null,
};

export async function getWorkflowStatus(candidateId: string): Promise<StatusResult> {
  try {
    await requireHrStaff();
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid person." };

  try {
    const emp = await resolveEmployeeByCandidate(candidateId);
    if (!emp) return { ok: true, status: empty };

    const sub = await loadOnboarding(emp.id);
    const submitted = sub?.status === "submitted";

    return {
      ok: true,
      status: {
        matched: true,
        employeeId: emp.id,
        employeeName: emp.name,
        onboardingExists: !!sub,
        onboardingSubmitted: submitted,
        onboardingSubmittedAt: sub?.submittedAt ? sub.submittedAt.toISOString() : null,
        // Every current employee already has their company address as their
        // LOGIN email ({namesurname}.altuscorp@gmail.com), so that IS their
        // official email — no re-provisioning. The dedicated official_email
        // column only matters for a brand-new hire provisioned from scratch.
        officialEmail: emp.officialEmail ?? emp.email,
        emailProvisionedAt: emp.emailProvisionedAt ? emp.emailProvisionedAt.toISOString() : null,
        suggestedOfficialEmail: emp.officialEmail
          ? emp.officialEmail
          : deriveOfficialEmail(emp.name, await takenOfficialEmails()),
        assetsAllocatedAt: emp.assetsAllocatedAt ? emp.assetsAllocatedAt.toISOString() : null,
        welcomeTo: emp.personalEmail ?? emp.email ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load workflow status." };
  }
}

/**
 * Provision the official company email for the candidate's linked employee:
 * derive `firstname.lastname@company`, store it, stamp `email_provisioned_at`,
 * mint a fresh dashboard password (best-effort), and send the WELCOME email to
 * the employee's PERSONAL inbox. LOCKED until onboarding is submitted. The
 * welcome mail never blocks the action (fail-soft). Returns the fresh status.
 */
export async function createOfficialEmail(candidateId: string): Promise<StatusResult> {
  let actorId: string;
  try {
    actorId = (await requireHrStaff()).id;
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid person." };

  try {
    const emp = await resolveEmployeeByCandidate(candidateId);
    if (!emp) return { ok: false, error: "This person isn't linked to an employee account yet." };

    const sub = await loadOnboarding(emp.id);
    if (sub?.status !== "submitted") {
      return { ok: false, error: "The onboarding form must be submitted before creating the official email." };
    }
    if (emp.officialEmail && emp.emailProvisionedAt) {
      return { ok: false, error: "The official email is already provisioned." };
    }

    const official = deriveOfficialEmail(emp.name, await takenOfficialEmails());
    const now = new Date();

    // Best-effort: mint a fresh dashboard password so the welcome mail can carry
    // real credentials. Non-fatal — if there's no Firebase account or the reset
    // fails, we still provision + welcome (password omitted from the mail).
    // ONLY reset when Resend is configured, so we never orphan a fresh password
    // that would never reach the employee (e.g. dev with no Resend key).
    let password: string | null = null;
    if (emp.firebaseUid && process.env.RESEND_API_KEY) {
      try {
        const fresh = generateInvitePassword();
        await getFirebaseAdminAuth().updateUser(emp.firebaseUid, { password: fresh });
        password = fresh;
      } catch (err) {
        console.error("[createOfficialEmail] password reset failed — welcoming without a password", err);
      }
    }

    await db
      .update(employees)
      .set({
        officialEmail: official,
        emailProvisionedAt: now,
        // Backfill personal_email from the account email when unset, so the
        // welcome mail (and future sends) have a personal address on file.
        personalEmail: emp.personalEmail ?? emp.email,
      })
      .where(eq(employees.id, emp.id));

    // Welcome mail → the employee's OWN personal inbox only. Fail-soft.
    const welcomeTo = emp.personalEmail ?? emp.email;
    if (welcomeTo) {
      try {
        await sendWelcomeEmail({
          email: welcomeTo,
          employeeName: emp.name,
          officialEmail: official,
          loginEmail: emp.email,
          password,
          loginUrl: `${siteUrl()}/login`,
          hrEmail: HR_CONTACT.email,
        });
      } catch (err) {
        console.error("[createOfficialEmail] welcome email threw", err);
      }
    }

    try {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId,
        eventType: "edited",
        toValue: { officialEmail: official, emailProvisionedAt: now.toISOString() },
      });
    } catch (err) {
      console.error("[createOfficialEmail] audit write failed", err);
    }

    return getWorkflowStatus(candidateId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the official email." };
  }
}

/**
 * Mark company assets as allocated for the candidate's linked employee — stamps
 * `assets_allocated_at`. LOCKED until onboarding is submitted. Optional `notes`
 * are recorded on the audit event (no dedicated column). Returns fresh status.
 */
export async function allocateAssets(candidateId: string, notes?: string): Promise<StatusResult> {
  let actorId: string;
  try {
    actorId = (await requireHrStaff()).id;
  } catch {
    return { ok: false, error: "Not authorised." };
  }
  if (!isUuid(candidateId)) return { ok: false, error: "Invalid person." };

  try {
    const emp = await resolveEmployeeByCandidate(candidateId);
    if (!emp) return { ok: false, error: "This person isn't linked to an employee account yet." };

    const sub = await loadOnboarding(emp.id);
    if (sub?.status !== "submitted") {
      return { ok: false, error: "The onboarding form must be submitted before allocating assets." };
    }
    if (emp.assetsAllocatedAt) {
      return { ok: false, error: "Assets are already marked allocated." };
    }

    const now = new Date();
    await db.update(employees).set({ assetsAllocatedAt: now }).where(eq(employees.id, emp.id));

    try {
      await db.insert(employeeEvents).values({
        employeeId: emp.id,
        actorId,
        eventType: "edited",
        toValue: {
          assetsAllocatedAt: now.toISOString(),
          ...(notes && notes.trim() ? { assetNotes: notes.trim().slice(0, 500) } : {}),
        },
      });
    } catch (err) {
      console.error("[allocateAssets] audit write failed", err);
    }

    return getWorkflowStatus(candidateId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not allocate assets." };
  }
}
