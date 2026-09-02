import { FileSpreadsheet, FileText } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireAdmin } from "@/lib/auth/current";
import { getMonthDashboard } from "@/lib/queries/attendance-status";
import { localDateString } from "@/lib/format";
import { AttendanceDashboardTable } from "@/components/attendance/dashboard/dashboard-table";
import { AttendanceMonthSelector } from "@/components/attendance/dashboard/month-selector";

export const dynamic = "force-dynamic";

/** Default reporting timezone — "today" for the live-row grading. The
 *  per-employee query still reads each employee's own tz internally. */
const DEFAULT_TZ = "Asia/Kolkata";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Parse `?y=&m=`; fall back to the current month in the reporting tz. */
function resolveMonth(
  sp: Record<string, string | string[] | undefined>,
  todayISO: string,
): { year: number; month: number } {
  const [cy, cm] = todayISO.split("-").map(Number);
  const rawY = typeof sp.y === "string" ? Number(sp.y) : NaN;
  const rawM = typeof sp.m === "string" ? Number(sp.m) : NaN;
  const year =
    Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month =
    Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

export default async function AttendanceDashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  await requireAdmin();

  const todayISO = localDateString(DEFAULT_TZ);
  const { year, month } = resolveMonth(sp, todayISO);

  let rows: Awaited<ReturnType<typeof getMonthDashboard>>;
  let loadError = false;
  try {
    rows = await getMonthDashboard(year, month, todayISO);
  } catch (err) {
    console.error("[attendance/dashboard] load failed", err);
    rows = [];
    loadError = true;
  }

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-12 max-md:px-4 pt-8 pb-16">
        <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
              Admin · Attendance
            </div>
            <h1 className="text-display-lg text-ink-strong mt-1">
              Attendance Dashboard
            </h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              Monthly per-person summary. Click a row to see the daily log.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <AttendanceMonthSelector year={year} month={month} />
            {/* Task A7 — month-scoped report exports. Plain links: the routes
                respond with an attachment Content-Disposition. */}
            <a
              href={`/attendance/export.xlsx?y=${year}&m=${month}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-semibold text-ink-strong hover:border-hairline-strong transition-colors"
            >
              <FileSpreadsheet size={15} strokeWidth={2.2} />
              Export Excel
            </a>
            <a
              href={`/attendance/export.pdf?y=${year}&m=${month}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-semibold text-ink-strong hover:border-hairline-strong transition-colors"
            >
              <FileText size={15} strokeWidth={2.2} />
              Export PDF
            </a>
            <button
              type="button"
              disabled
              title="Coming in Phase 2"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card py-2.5 px-4 text-[14px] font-semibold text-ink-subtle opacity-60 cursor-not-allowed"
            >
              Generate Salary
              <span className="text-[10px] uppercase tracking-wide font-bold text-ink-subtle">
                Phase 2
              </span>
            </button>
          </div>
        </header>

        {loadError ? (
          <div
            className="rounded-section bg-surface-card border border-hairline p-10 text-center"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>
              Could not load the attendance dashboard.
            </p>
            <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>
              Please refresh in a moment.
            </p>
          </div>
        ) : (
          <AttendanceDashboardTable rows={rows} year={year} month={month} />
        )}
      </main>
      <DashboardFooter />
    </>
  );
}
