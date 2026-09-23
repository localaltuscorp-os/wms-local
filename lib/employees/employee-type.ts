import { EMPLOYEE_TYPE_LABELS, EMPLOYEE_TYPES, type EmployeeTypeCode } from "@/db/enums";

/**
 * EMPLOYEE TYPE — Employee or Intern. Pure, client-safe.
 *
 * ── WHY THIS IS NOT INFERRED FROM A DESIGNATION'S NAME ─────────────────────
 * Whether somebody can earn an incentive depends on it (interns cannot), so it
 * has to be a fact an administrator maintains rather than a substring match:
 * a rename would otherwise silently change who gets paid, and nothing would
 * report that it had. So the flag lives on the DESIGNATION MASTER
 * (`designations.employee_type`), a row in a master screen, and an individual
 * may override it on their own record (`employees.employee_type`).
 *
 * The one place designation text was ever matched is migration 0244, which
 * materialised the old heuristic into the column exactly once. NO CODE BELOW
 * READS A NAME.
 *
 * ── WHY IT LIVES IN lib/employees AND NOT IN THE INCENTIVE MODULE ──────────
 * Employee type is a fact about an employee that several modules may read; the
 * incentive rule happens to be the first thing that needs it. `lib/incentive/
 * master.ts` re-exports these so the eligibility rule and its callers still
 * import one module, but the definition sits with the employee.
 */

export { EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABELS };
export type { EmployeeTypeCode };

/**
 * The effective employee type: the person's own override if they have one,
 * otherwise their designation's flag, otherwise `employee`.
 *
 * The parameters are typed `string | null` rather than `EmployeeTypeCode`
 * deliberately: they are read from database columns that are text + CHECK, and a
 * value from an older row must not be trusted to be one of the two codes merely
 * because the type says so. An unrecognised value falls through to the next
 * level rather than being returned.
 */
export function resolveEmployeeType(input: {
  override?: string | null;
  designationType?: string | null;
}): EmployeeTypeCode {
  if (input.override === "intern" || input.override === "employee") return input.override;
  if (input.designationType === "intern" || input.designationType === "employee") {
    return input.designationType;
  }
  return "employee";
}

/** Is this person an intern? Takes an ALREADY-RESOLVED type, or the override. */
export function isIntern(e: { employeeType?: string | null }): boolean {
  return (e.employeeType ?? "employee") === "intern";
}

export function isEmployeeTypeCode(v: unknown): v is EmployeeTypeCode {
  return typeof v === "string" && (EMPLOYEE_TYPES as readonly string[]).includes(v);
}

/**
 * The picker's options.
 *
 * NAMED `…_KIND_OPTIONS` BECAUSE THE NAME IS TAKEN: `EMPLOYEE_TYPE_OPTIONS`
 * already exists in `lib/attendance/worker-type.ts` for the WORKER type
 * (Full Time / First Half / …), which the Employee Master relabels "Shift
 * Type". Two different fields, two different vocabularies, and one shared name
 * would be a silent mistake every time somebody imported the wrong one.
 * `employee` first, because it is the common case.
 */
export const EMPLOYEE_KIND_OPTIONS: readonly { value: EmployeeTypeCode; label: string }[] =
  EMPLOYEE_TYPES.map((t) => ({ value: t, label: EMPLOYEE_TYPE_LABELS[t] }));

/** What an empty override means on screen — it is not "unset", it is "inherit". */
export const EMPLOYEE_TYPE_INHERIT_LABEL = "Follow designation";
