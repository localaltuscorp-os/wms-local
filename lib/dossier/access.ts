import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";
import { isHrIntakeGrantee } from "@/lib/hr/intake-grantees";
import type { Employee } from "@/db/schema";

/**
 * Access model for the Employee Dossier:
 *  - EVERY signed-in employee can open it and view/download THEIR OWN documents.
 *  - Admins (DB isAdmin OR super-admin email) see and manage EVERYONE's dossier
 *    — upload, edit, archive, browse by type.
 *  - HR STAFF get the same reach for the ONBOARDING FORM specifically (see
 *    `canManageEmployeeOnboarding`). Collecting and correcting joining data is
 *    HR's job, and requiring a DB `is_admin` flag for it meant an HR person
 *    could open a colleague's form only to be bounced to /dossier.
 * Uploads/edits are always admin-only; employees are read-only on their file.
 */
export interface DossierAccess {
  me: Employee;
  /** Can see & manage every employee's dossier (not just their own). */
  isAdmin: boolean;
  /** In the HR department (or a super-admin). Grants onboarding-form reach only
   *  — NOT the wider dossier, which stays admin-managed. */
  isHr: boolean;
  /** On the narrow HR-intake allow-list (lib/hr/intake-access.ts). Grants the
   *  SAME onboarding-form reach as `isHr` and nothing else — kept as its own
   *  flag so a future reader can't widen HR by widening this. */
  isIntake: boolean;
}

/** House kill-switch convention: DOSSIER_OFF === "true" hides the module. */
export function dossierEnabled(): boolean {
  return process.env.DOSSIER_OFF !== "true";
}

export async function dossierAccess(): Promise<DossierAccess> {
  const me = await requireUser();
  const admin = me.isAdmin || isSuperAdmin(me.email);
  // Fail CLOSED on an HR-department lookup error: `isHrStaff` reads the
  // department join, and an unavailable one must not silently widen who can read
  // a colleague's bank details.
  const hr = admin || (await isHrStaff(me).catch(() => false));
  return { me, isAdmin: admin, isHr: hr, isIntake: isHrIntakeGrantee(me.email) };
}

/** For pages: resolves access or bounces to /hub when the module is off. */
export async function requireDossierAccess(): Promise<DossierAccess> {
  if (!dossierEnabled()) redirect("/hub");
  return dossierAccess();
}

/** True when the caller may view/manage this specific employee's dossier. */
export function canAccessEmployeeDossier(access: DossierAccess, employeeId: string): boolean {
  return access.isAdmin || access.me.id === employeeId;
}

/**
 * True when the caller may open AND update this employee's ONBOARDING FORM.
 *
 * Wider than `canAccessEmployeeDossier` by exactly one role: HR staff. The
 * onboarding form is the joining-data intake HR owns — chasing it, correcting an
 * address or a bank account, and re-submitting on someone's behalf is the job.
 * The rest of the dossier (documents, uploads, archive) is unchanged and stays
 * admin-only.
 */
export function canManageEmployeeOnboarding(
  access: DossierAccess,
  employeeId: string,
): boolean {
  return access.isAdmin || access.isHr || access.isIntake || access.me.id === employeeId;
}
