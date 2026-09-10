/**
 * HR INTAKE GRANT - a NARROW slice of HR for people who fill the joining
 * paperwork without running the department.
 *
 * Unlocks exactly two things:
 *   - the ONBOARDING FORM for any employee (see lib/dossier/access.ts)
 *   - the CANDIDATE EVALUATION checklist, plus the candidate PICKER on
 *     /hr/evaluation that is the only way to reach it
 *
 * It deliberately does NOT unlock the rest of HR. Letters, salary, the candidate
 * RECORDS table (/hr/candidates), the evaluation WEIGHT profiles and the wider
 * dossier (documents, uploads, archive) all still require `isHrStaff`/`isAdmin`.
 * The alternative - adding these people to the "HR" department - would have
 * granted every one of those, including reach into colleagues' bank details via
 * the dossier. That is why this list exists instead of a department row.
 *
 * ── PURE + CLIENT-SAFE ─────────────────────────────────────────────────────
 * No `server-only`, no DB import - same shape as lib/auth/super-admin.ts. The
 * async guards that need the department lookup live in ./intake-access.ts. Keep
 * this file dependency-free so it stays unit-testable and usable from a client
 * component that wants to hide a control.
 *
 * ── KEYED BY EMAIL ─────────────────────────────────────────────────────────
 * Same reasoning as lib/teams/roster.ts: `employees.email` is unique and
 * survives a rename, while the uuid differs between environments and the display
 * name drifts. Compared case-insensitively.
 */
export const HR_INTAKE_EMAILS = [
  "jeevanbharambe.altuscorp@gmail.com", // Jeevan Bharambe
  "rohanchoudhary.altuscorp@gmail.com", // Rohan Choudhary
  "mitulmehta.altuscorp@gmail.com", // Mitul Mehta
  // ⚠ Rashmi is still MISSING: her address appears nowhere in the repo, and the
  // employees table was unreachable when this list was written, so there was
  // nothing to check a guess against. Add the exact address here - guessing at
  // an access-control key is how the wrong person gets in.
] as const;

/** True for a narrow-grant holder. Pure and synchronous. */
export function isHrIntakeGrantee(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return HR_INTAKE_EMAILS.includes(e as (typeof HR_INTAKE_EMAILS)[number]);
}
