// WS-5 Salary core — kill-switch for the v2 salary math.
//
// PAYROLL SAFETY: every new v2 computation (proration v2, CTC-breakup payable,
// accountant adjustments, entity totals after PT) is gated behind this single
// flag. Default OFF — while off, the existing live salary numbers
// (lib/salary/compute.ts + the imported salary_breakup sheet) are the source of
// truth and MUST NOT move. Sir flips SALARY_V2="true" only after verifying the
// v2 numbers match on a real payroll month.
//
// Read directly from process.env (like the other repo kill-switches:
// DCC_GATE_OFF, MANAGER_GATES_OFF, RELAY_OFF, …) — no lib/env.ts registration,
// so it needs no schema change to add or remove.

/** True only when SALARY_V2 is explicitly turned on. Fail-safe: any other value
 *  (unset, "false", "0", "") keeps v2 math dark. */
export function salaryV2Enabled(): boolean {
  return process.env.SALARY_V2 === "true";
}
