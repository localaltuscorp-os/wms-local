import { requireAdmin } from "@/lib/auth/current";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { SalaryLineageView } from "@/components/admin/salary-lineage-view";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { getSalaryLineage, salaryLineageMonths } from "@/lib/queries/salary-lineage";

export const dynamic = "force-dynamic";

interface Props { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SalaryLineagePage({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const [profiles, storedMonths] = await Promise.all([listSalaryProfiles(), salaryLineageMonths()]);
  const employees = profiles.map((profile) => ({ id: profile.employeeId, name: profile.name }));
  const selectedEmployee = typeof params.employee === "string" && employees.some((row) => row.id === params.employee)
    ? params.employee
    : employees[0]?.id ?? "";
  const fallbackMonth = new Date().toISOString().slice(0, 7);
  const months = storedMonths.length ? storedMonths : [fallbackMonth];
  const selectedMonth = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : months[0] ?? fallbackMonth;
  const data = selectedEmployee ? await getSalaryLineage(selectedEmployee, selectedMonth) : null;

  return <AdminSection title="Salary Lineage" subtitle="Trace salary, tax, payroll and financial connections.">
    <SalaryLineageView data={data} employees={employees} months={months} />
  </AdminSection>;
}
