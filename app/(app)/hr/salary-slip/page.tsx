import { redirect } from "next/navigation";

/**
 * Salary Slip moved to the Employees room on 2026-09-12 — see
 * app/(app)/salary-slip/page.tsx for why the route moved rather than the rail
 * entry alone.
 *
 * Kept as a redirect because this path is the one every employee has been
 * reaching their own payslips through, and because the `hr.salary-slip`
 * permission node still names it. A 404 here would read as "your payslips are
 * gone".
 */
export default function MovedSalarySlipPage(): never {
  redirect("/salary-slip");
}
