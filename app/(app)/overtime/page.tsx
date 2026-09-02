import type { Route } from "next";
import Link from "next/link";
import {
  BarChart3,
  Timer,
  Clock,
  CheckCircle2,
  Hourglass,
  CalendarDays,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireUser } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import {
  listOvertimeEntries,
  listOvertimeLoggableEmployees,
  overtimeScopeFor,
} from "@/lib/queries/overtime";
import { OvertimeClient } from "@/components/overtime/overtime-client";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

function fmtHours(n: number): string {
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)}h`;
}

export default async function OvertimePage() {
  const me = await requireUser();
  const todayISO = localDateString(TZ);

  const [rows, loggableFor, scope] = await Promise.all([
    listOvertimeEntries({ employeeId: me.id, isAdmin: me.isAdmin }),
    listOvertimeLoggableEmployees({ employeeId: me.id, isAdmin: me.isAdmin }),
    overtimeScopeFor(me),
  ]);

  // Reviewer = admin (scope.all) OR a manager whose scope spans more than self.
  const canReview = scope.all || scope.ids.length > 1;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  // ── KPIs folded over the already-loaded rows (zero extra queries) ──
  const monthPrefix = todayISO.slice(0, 7);
  const monthLabel = new Date(`${monthPrefix}-01T00:00:00`).toLocaleDateString(
    "en-IN",
    { month: "short", year: "numeric" },
  );
  const sum = (rs: typeof rows) => rs.reduce((s, r) => s + r.hours, 0);
  const totalHours = sum(rows);
  const approvedHours = sum(rows.filter((r) => r.status === "approved"));
  const pendingHours = sum(rows.filter((r) => r.status === "pending"));
  const monthHours = sum(rows.filter((r) => r.workDate.startsWith(monthPrefix)));
  const approvedRate = totalHours > 0 ? approvedHours / totalHours : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[1400px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        {/* ── Glass hero ── */}
        <header
          className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
          style={{
            background: [
              `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${GREEN} 9%, transparent), transparent 55%)`,
              `radial-gradient(80% 160% at 0% 100%, color-mix(in srgb, ${GREEN} 5%, transparent), transparent 52%)`,
              "rgba(255, 255, 255, 0.72)",
            ].join(", "),
            backdropFilter: "blur(14px) saturate(140%)",
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
          }}
        >
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                style={{
                  background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                }}
              >
                <Timer size={13} strokeWidth={2.6} /> Employees · Overtime
              </span>
              <h1
                className="mt-3 text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(30px,3.6vw,46px)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                }}
              >
                Overtime
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                {canReview
                  ? "Log extra hours and review your team's overtime."
                  : "Log the extra hours you put in. Your manager approves them."}
              </p>
            </div>

            {canReview && (
              <Link
                href={"/overtime/dashboard" as Route}
                className="brand-btn wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white whitespace-nowrap"
                style={{
                  background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
                  boxShadow: `0 10px 24px -12px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}
              >
                <BarChart3 size={16} strokeWidth={2.4} />
                Team Dashboard
                {pendingCount > 0 && (
                  <span
                    className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
                    style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}
                  >
                    {pendingCount}
                  </span>
                )}
              </Link>
            )}
          </div>
        </header>

        {/* ── KPI strip (folded over the loaded rows — zero extra queries) ── */}
        <section
          aria-label="Overtime totals"
          className="mb-6 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1"
        >
          <KpiCard
            icon={<Clock size={17} strokeWidth={2.4} />}
            accent={GREEN}
            label="Total OT hours"
            value={fmtHours(totalHours)}
            caption={`${rows.length} ${rows.length === 1 ? "entry" : "entries"} logged`}
            delay={0}
          />
          <KpiCard
            icon={<CheckCircle2 size={17} strokeWidth={2.4} />}
            accent={GREEN_DEEP}
            label="Approved hours"
            value={fmtHours(approvedHours)}
            caption={
              approvedRate != null
                ? `${(approvedRate * 100).toFixed(0)}% of logged hours`
                : "nothing logged yet"
            }
            progress={approvedRate}
            delay={50}
          />
          <KpiCard
            icon={<Hourglass size={17} strokeWidth={2.4} />}
            accent={pendingCount > 0 ? "#d97706" : "#334155"}
            label="Pending"
            value={String(pendingCount)}
            caption={
              pendingCount > 0
                ? `${fmtHours(pendingHours)} awaiting review`
                : "all reviewed"
            }
            delay={100}
          />
          <KpiCard
            icon={<CalendarDays size={17} strokeWidth={2.4} />}
            accent="#334155"
            label={`This month (${monthLabel})`}
            value={fmtHours(monthHours)}
            caption="hours logged this month"
            delay={150}
          />
        </section>

        <OvertimeClient
          rows={rows}
          meId={me.id}
          loggableFor={loggableFor}
          canReview={canReview}
          todayISO={todayISO}
        />
      </main>
    </>
  );
}

/* ── KPI card — same construction as the Attendance / Salary / Incentive stat cards ── */

function KpiCard({
  icon,
  accent,
  label,
  value,
  caption,
  progress,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
  delay: number;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{
            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
            color: accent,
          }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </div>
  );
}
