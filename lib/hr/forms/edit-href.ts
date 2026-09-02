import { getHrForm } from "./registry";

/**
 * Where an authorised admin goes to OPEN AND EDIT one specific employee's saved
 * form.
 *
 * ── WHY THIS IS NOT JUST `HrFormDef.href` ──────────────────────────────────
 * The registry's `href` names the form's MODULE, not one person's copy of it:
 * `/dossier/onboarding` with no employee on the URL falls back to the VIEWER's
 * own form. Following it from someone else's HR Record therefore opens the
 * admin's own onboarding data — the exact failure this module has to make
 * impossible, because the mistake is invisible: the form loads, it looks filled,
 * and the save lands on the wrong record.
 *
 * So an edit link is only ever produced when the destination route accepts the
 * subject's id, and the id is always baked in. A form with no employee-scoped
 * editor returns null and the caller offers View instead of Edit — a missing
 * button is recoverable, a button that edits the wrong person is not.
 *
 * PURE (no `server-only`, no DB): the HR Record client component builds these
 * links, and the loader checks them, so both must be able to import it.
 */
export function employeeFormEditHref(formKey: string, employeeId: string): string | null {
  if (!employeeId.trim()) return null;
  const emp = encodeURIComponent(employeeId);
  switch (formKey) {
    // One row per employee, upserted on employee_id — editing updates that row
    // rather than filing a second submission. See submitOnboarding.
    case "onboarding":
      return `/dossier/onboarding?emp=${emp}`;
    // The exit forms live in a workspace that picks its own employee and takes
    // no id on the URL, so there is nothing safe to link to yet.
    default:
      return null;
  }
}

/** The form's own module, for a "where does this live?" link. Never employee-scoped. */
export function hrFormModuleHref(formKey: string): string | null {
  return getHrForm(formKey)?.href ?? null;
}
