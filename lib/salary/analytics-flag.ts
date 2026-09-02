// WS-5 Salary — kill-switch for the attendance ANALYTICS block.
//
// This is READ-ONLY analytics (days late / waived / started-early ratios + an
// AI pros/cons read-out). It changes NO money and writes nothing, so unlike the
// v2 salary math (SALARY_V2, default OFF) it defaults ON. Flip it off only if
// the block ever misbehaves in prod.
//
// Read directly from process.env (like the other repo kill-switches:
// SALARY_V2, DCC_GATE_OFF, MANAGER_GATES_OFF …) — no lib/env.ts registration.

/** True unless SALARY_ANALYTICS is explicitly "false". Default ON. */
export function salaryAnalyticsEnabled(): boolean {
  return process.env.SALARY_ANALYTICS !== "false";
}
