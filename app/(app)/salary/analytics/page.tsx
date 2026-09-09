import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { Clock, ChevronLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireAdmin } from "@/lib/auth/current";
import { salaryAnalyticsEnabled } from "@/lib/salary/analytics-flag";
import { salaryBreakupMonths, listSalaryBreakup } from "@/lib/queries/salary-breakup";
import { loadAttendanceAnalytics } from "@/lib/queries/salary-attendance-analytics";
import { monthLabel } from "@/lib/salary/period";
import { AttendanceAnalyticsBlock } from "@/components/salary/attendance-analytics-block";
import { AttendanceAiInsights } from "@/components/salary/attendance-ai-insights";
import { DisciplineNote } from "@/components/salary/discipline-note";
import { getDisciplineNote } from "./actions";

// WS-5 Salary — READ-ONLY attendance-analytics drill-down for one person+month.
// Flag-gated (SALARY_ANALYTICS, default ON); 404s when off. New route, touches
// no existing file. Reached from the salary sheet (see INTEGRATION NOTE for the
// per-row link wiring).

export const dynamic = "force-dynamic";

const GREEN = "var(--color-altus-red-deep)";
const MONTH_RE = /^\d{4}-\d{2}$/;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SalaryAnalyticsPage({ searchParams }: PageProps) {
  await requireAdmin();
  if (!salaryAnalyticsEnabled()) notFound();

  const sp = await searchParams;
  const months = await salaryBreakupMonths();
  const rawMonth = typeof sp.month === "string" ? sp.month : undefined;
  const nowYm = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  const defaultMonth = months.find((m) => m < nowYm) ?? months[0] ?? nowYm;
  const month = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : defaultMonth;

  const rawEmp = typeof sp.employee === "string" ? sp.employee : undefined;

  // Roster for the month = the people on that month's salary sheet who are
  // linked to an employee id (analytics needs the id to grade attendance).
  const sheet = await listSalaryBreakup(month);
  const roster = sheet
    .filter((r) => r.employeeId)
    .map((r) => ({ id: r.employeeId as string, name: r.employeeName }));
  const rosterIds = new Set(roster.map((r) => r.id));

  const selectedEmp = rawEmp && rosterIds.has(rawEmp) ? rawEmp : undefined;
  const analytics = selectedEmp ? await loadAttendanceAnalytics(selectedEmp, month) : null;
  const disciplineNote = selectedEmp ? await getDisciplineNote(selectedEmp, month) : "";
  const selectedName = roster.find((r) => r.id === selectedEmp)?.name ?? "";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1100px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* Hero */}
        <header className="wg-rise mb-5 flex flex-col items-start">
          <Link
            href={`/salary?month=${month}` as Route}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-subtle hover:text-ink-strong"
          >
            <ChevronLeft size={15} strokeWidth={2.6} /> Salary Sheet
          </Link>
          <span
            className="mt-3 inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white"
            style={{ background: `linear-gradient(135deg, var(--color-altus-red), ${GREEN})` }}
          >
            <Clock size={13} strokeWidth={2.6} /> {monthLabel(month)} · Attendance analytics
          </span>
          <h1
            className="mt-3 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px, 3.4vw, 42px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            Discipline &amp; Attendance Read-Out
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[15px] font-medium text-ink-muted">
            Late / waived / early-start ratios (X of N, with %) across this month, the last three
            months and the fiscal year — plus an AI pros-and-cons read. Read-only: nothing here
            changes pay.
          </p>
        </header>

        {/* Person picker */}
        <nav
          aria-label="Select employee"
          className="wg-rise mb-5 flex flex-wrap gap-2"
          style={{ animationDelay: "40ms" }}
        >
          {roster.length === 0 ? (
            <p className="text-[14px] text-ink-subtle">
              No linked employees on {monthLabel(month)}&apos;s salary sheet.
            </p>
          ) : (
            roster.map((p) => {
              const active = p.id === selectedEmp;
              return (
                <Link
                  key={p.id}
                  href={`/salary/analytics?month=${month}&employee=${p.id}` as Route}
                  aria-current={active ? "page" : undefined}
                  className="wg-btn rounded-pill px-3.5 py-1.5 text-[13px] font-bold"
                  style={
                    active
                      ? {
                          background: `linear-gradient(135deg, var(--color-altus-red), ${GREEN})`,
                          color: "#fff",
                        }
                      : {
                          background: "var(--color-surface-card)",
                          color: "var(--color-ink-soft)",
                          boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                        }
                  }
                >
                  {p.name}
                </Link>
              );
            })
          )}
        </nav>

        {/* Analytics */}
        {analytics ? (
          <div className="flex flex-col gap-4">
            <AttendanceAnalyticsBlock data={analytics} />
            <Suspense fallback={<AiSkeleton />}>
              <AttendanceAiInsights data={analytics} />
            </Suspense>
            {selectedEmp && (
              <DisciplineNote employeeId={selectedEmp} month={month} initial={disciplineNote} name={selectedName} />
            )}
          </div>
        ) : (
          <section className="wg-rise admin-panel px-6 py-14 text-center" style={{ animationDelay: "80ms" }}>
            <p
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-serif), system-ui, sans-serif",
                fontStyle: "italic",
                fontSize: 21,
                letterSpacing: "-0.015em",
              }}
            >
              Pick a person above
            </p>
            <p className="mt-2 text-[14px] text-ink-subtle">
              Their attendance analytics for {monthLabel(month)} will appear here.
            </p>
          </section>
        )}
      </main>
    </>
  );
}

function AiSkeleton() {
  return (
    <section className="admin-panel px-6 py-5" aria-hidden>
      <div className="h-4 w-24 animate-pulse rounded-pill bg-surface-track" />
      <div className="mt-3 h-5 w-2/3 animate-pulse rounded-pill bg-surface-track" />
      <div className="mt-4 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <div className="h-24 animate-pulse rounded-2xl bg-surface-track" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-track" />
      </div>
    </section>
  );
}
