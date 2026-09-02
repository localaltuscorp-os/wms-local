import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BarChart3, ClipboardList, ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireUser } from "@/lib/auth/current";
import { isFinanceViewer } from "@/lib/auth/finance-access";
import { isHrStaff } from "@/lib/hr/access";
import { localDateString } from "@/lib/format";
import { loadOrgAttendanceAnalytics } from "@/lib/attendance/analytics/org";
import { loadOrgAttendanceDeepReads } from "@/lib/attendance/analytics/deep-reads";
import { AttendanceMonthSelector } from "@/components/attendance/dashboard/month-selector";
import { OrgDashboard } from "@/components/attendance/insights/org/org-dashboard";
import { OrgDashboardSkeleton } from "@/components/attendance/insights/org/dashboard-skeleton";

export const dynamic = "force-dynamic";

/** Default reporting timezone for the "today" reference in month grading. */
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
  const year = Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month = Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

export default async function AttendanceInsightsPage({ searchParams }: PageProps) {
  // Workforce Intelligence is open to Finance viewers (admins + Accounts) AND
  // to HR staff — the three surfaces this dashboard serves.
  const me = await requireUser();
  const [finance, hr] = await Promise.all([isFinanceViewer(me), isHrStaff(me)]);
  if (!finance && !hr) redirect("/hub");

  const sp = await searchParams;
  const todayISO = localDateString(DEFAULT_TZ);
  const { year, month } = resolveMonth(sp, todayISO);

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthTitle = `${MONTH_NAMES[month - 1] ?? ""} ${year}`;

  const backBtnCls =
    "wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/75 py-2 px-4 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:text-[var(--color-altus-red-deep)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        {/* ── Glass hero band ── */}
        <section className="admin-section-band wg-rise mb-6 px-8 py-7 max-md:px-5 max-md:py-5">
          <div className="relative flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <span className="admin-section-icon size-12 shrink-0 max-md:hidden">
                <BarChart3 size={24} strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0">
                <div
                  className="uppercase font-bold text-ink-subtle"
                  style={{
                    fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                  }}
                >
                  Workforce Intelligence
                </div>
                <h1
                  className="mt-1 text-ink-strong"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: "clamp(28px, 4vw, 38px)",
                    lineHeight: 1.05,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Attendance Insights — {monthTitle}
                </h1>
                <p className="mt-2 text-[15px] font-medium text-ink-muted">
                  Org-wide attendance, punctuality, hours &amp; workforce health.
                  Click a KPI or slice to cross-filter · click any person for their drill-down.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 max-md:items-start max-md:w-full">
              <AttendanceMonthSelector year={year} month={month} />
              <div className="flex items-center gap-2 flex-wrap">
                <a href="/attendance/dashboard" className={backBtnCls}>
                  <ClipboardList size={15} strokeWidth={2.2} />
                  Att Report
                </a>
                <a href="/attendance" className={backBtnCls}>
                  <ArrowLeft size={15} strokeWidth={2.2} />
                  Back to Attendance
                </a>
              </div>
            </div>
          </div>
        </section>

        <Suspense fallback={<OrgDashboardSkeleton />}>
          <DashboardContent year={year} month={month} todayISO={todayISO} />
        </Suspense>
      </PageShell>
    </>
  );
}

/** Async data island — streams behind the Suspense skeleton. */
async function DashboardContent({
  year,
  month,
  todayISO,
}: {
  year: number;
  month: number;
  todayISO: string;
}) {
  let data: Awaited<ReturnType<typeof loadOrgAttendanceAnalytics>> | null = null;
  let deep: Awaited<ReturnType<typeof loadOrgAttendanceDeepReads>> | null = null;
  try {
    [data, deep] = await Promise.all([
      loadOrgAttendanceAnalytics(year, month, todayISO),
      loadOrgAttendanceDeepReads(year, month, todayISO),
    ]);
  } catch (err) {
    console.error("[attendance/insights] load failed", err);
  }

  if (!data || !deep) {
    return (
      <div
        className="rounded-section bg-surface-card border border-hairline p-10 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>
          Could not load Workforce Intelligence.
        </p>
        <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>
          Please refresh in a moment.
        </p>
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div
        className="rounded-section bg-surface-card border border-hairline p-10 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>
          No attendance data for this month yet.
        </p>
        <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>
          Pick another month, or check back once punches roll in.
        </p>
      </div>
    );
  }

  return <OrgDashboard data={data} deep={deep} />;
}
