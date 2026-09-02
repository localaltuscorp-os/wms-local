// Professional Tax (PT) policy — Sir, 2026-07-10.
//
// PT of ₹200/month is deducted from EVERY employee EXCEPT:
//   1. interns (designation "Intern"), and
//   2. two named exceptions — Dattaram Kap and Parvez Khan.
// Those exempt groups pay ₹0 PT; everyone else has ₹200 cut.
//
// This is the single source of truth for PT exemption. It is policy-authoritative:
// the salary_profiles.pt_exempt flag is NOT consulted for this rule, so the
// exempt set is exactly {interns} ∪ {Dattaram, Parvez} — no drift, no manual toggle.
// Pure (no DB / no server-only) so it can be unit-tested and reused freely.

export const PT_AMOUNT = 200;

/** Employee IDs explicitly exempt from PT by name (Sir's two exceptions). */
export const PT_EXEMPT_EMPLOYEE_IDS: ReadonlySet<string> = new Set([
  "c2209647-892b-4c4f-8e93-ad46500c5912", // Dattaram Kap
  "83e8fcd8-454c-41c7-93b9-5ea80737c8ae", // Parvez Khan
]);

/** An "Intern" designation (case/space-insensitive) is PT-exempt. */
export function isInternDesignation(designationName: string | null | undefined): boolean {
  return (designationName ?? "").trim().toLowerCase().includes("intern");
}

/** True when this employee should NOT have PT deducted (₹0 PT). */
export function isPtExempt(opts: {
  employeeId: string;
  designationName?: string | null;
}): boolean {
  return PT_EXEMPT_EMPLOYEE_IDS.has(opts.employeeId) || isInternDesignation(opts.designationName);
}
