import { FileSpreadsheet, FileText, IndianRupee, Lock } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireFinanceAccess } from "@/lib/auth/finance-access";
import { localDateString } from "@/lib/format";
import { loadFinanceAttendanceAnalytics } from "@/lib/attendance/analytics/finance";
import { FinanceMonthSelector } from "@/components/attendance/insights/finance/finance-month-selector";
import { FinanceDashboard } from "@/components/attendance/insights/finance/finance-dashboard";

export const dynamic = "force-dynamic";

/** Default reporting timezone — "today" for the live-row grading. */
const DEFAULT_TZ = "Asia/Kolkata";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

export default async function FinanceAttendanceInsightsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Money view — open to admins/super-admins + the Accounts department.
  await requireFinanceAccess();

  const todayISO = localDateString(DEFAULT_TZ);
  const { year, month } = resolveMonth(sp, todayISO);

  let data: Awaited<ReturnType<typeof loadFinanceAttendanceAnalytics>> | null = null;
  let loadError = false;
  try {
    data = await loadFinanceAttendanceAnalytics(year, month, todayISO);
  } catch (err) {
    console.error("[attendance/insights/finance] load failed", err);
    loadError = true;
  }

  const monthTitle = `${MONTH_NAMES[month - 1] ?? ""} ${year}`;

  const exportBtnCls =
    "wg-btn inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white/75 py-2 px-4 text-[13.5px] font-bold text-ink-strong hover:border-hairline-strong hover:text-[var(--color-altus-red-deep)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        {/* ── Glass hero band ─────────────────────────────────────────── */}
        <section className="admin-section-band wg-rise mb-6 px-8 py-7 max-md:px-5 max-md:py-5">
          <div className="relative flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <span className="admin-section-icon size-12 shrink-0 max-md:hidden">
                <IndianRupee size={24} strokeWidth={2.2} aria-hidden />
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
                  Finance · Payroll impact
                </div>
                <div className="mt-1 flex items-center gap-3 flex-wrap">
                  <h1
                    className="text-ink-strong"
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontWeight: 800,
                      fontSize: "clamp(28px, 4vw, 38px)",
                      lineHeight: 1.05,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {monthTitle}
                  </h1>
                  {data?.isFrozen && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white"
                      style={{ background: "linear-gradient(135deg, var(--color-slate), var(--color-slate-deep))" }}
                    >
                      <Lock size={12} strokeWidth={2.6} /> Frozen
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[15px] font-medium text-ink-muted max-w-[70ch]">
                  Salary lost to attendance, decomposed into absence, unpaid-leave, half-day and
                  late-penalty buckets — with projected payroll. Read-only.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 max-md:items-start max-md:w-full">
              <FinanceMonthSelector year={year} month={month} />
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`/attendance/export.xlsx?y=${year}&m=${month}`} className={exportBtnCls}>
                  <FileSpreadsheet size={15} strokeWidth={2.2} />
                  Export Excel
                </a>
                <a href={`/attendance/export.pdf?y=${year}&m=${month}`} className={exportBtnCls}>
                  <FileText size={15} strokeWidth={2.2} />
                  Export PDF
                </a>
              </div>
            </div>
          </div>

          {data && !loadError && (
            <div className="relative mt-5 flex items-center gap-2.5 flex-wrap">
              <span className="admin-stat-pill">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-subtle">People</span>
                <span
                  className="tabular-nums leading-none text-ink-strong"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}
                >
                  {data.headcount}
                </span>
              </span>
              <span className="admin-stat-pill">
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-subtle">With CTC</span>
                <span
                  className="tabular-nums leading-none text-ink-strong"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}
                >
                  {data.withSalaryProfile}
                </span>
              </span>
              {data.withoutSalaryProfile > 0 && (
                <span className="admin-stat-pill">
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-ink-subtle">No CTC</span>
                  <span
                    className="tabular-nums leading-none text-ink-strong"
                    style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}
                  >
                    {data.withoutSalaryProfile}
                  </span>
                </span>
              )}
            </div>
          )}
        </section>

        {loadError || !data ? (
          <div
            className="rounded-section bg-surface-card border border-hairline p-10 text-center"
            style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
          >
            <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>
              Could not load the payroll-impact dashboard.
            </p>
            <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>
              Please refresh in a moment.
            </p>
          </div>
        ) : (
          <FinanceDashboard data={data} />
        )}
      </PageShell>
    </>
  );
}
