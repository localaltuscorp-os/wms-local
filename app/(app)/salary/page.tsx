import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { SalaryReport } from "@/components/salary/salary-report";
import { SalaryImportDialog } from "@/components/salary/salary-import-dialog";
import { requireAdmin } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { listRunsForMonth } from "@/lib/queries/salary";
import { monthLabel } from "@/lib/salary/period";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function SalaryPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;

  const raw = typeof sp.month === "string" ? sp.month : undefined;
  const month =
    raw && MONTH_RE.test(raw)
      ? raw
      : localDateString("Asia/Kolkata").slice(0, 7);

  const rows = await listRunsForMonth(month);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-16">
        <div className="mb-4 flex justify-end">
          <SalaryImportDialog />
        </div>
        <SalaryReport month={month} monthLabel={monthLabel(month)} rows={rows} />
      </main>
      <DashboardFooter />
    </>
  );
}
