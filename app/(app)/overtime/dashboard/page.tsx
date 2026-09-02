import { Clock, CheckCircle2, Hourglass, Timer, BarChart3, XCircle } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { requireUser, forbiddenError } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import { getOvertimeDashboard, overtimeScopeFor } from "@/lib/queries/overtime";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";

function fmtHours(n: number): string {
  return `${n.toFixed(n % 1 === 0 ? 0 : 2)}h`;
}

function StatCard({
  label,
  value,
  sub,
  Icon,
  accent,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  Icon: typeof Clock;
  accent: string;
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
          <Icon size={17} strokeWidth={2.4} />
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
      {sub && (
        <div className="mt-1 text-[12px] font-medium text-ink-subtle">{sub}</div>
      )}
    </div>
  );
}

export default async function OvertimeDashboardPage() {
  const me = await requireUser();
  const scope = await overtimeScopeFor(me);

  // Reviewers only — admin OR a manager with reports.
  const canReview = scope.all || scope.ids.length > 1;
  if (!canReview) throw forbiddenError();

  const todayISO = localDateString(TZ);
  const [y, m] = todayISO.split("-");
  const monthStartISO = `${y}-${m}-01`;
  const monthLabel = new Date(`${monthStartISO}T00:00:00`).toLocaleDateString(
    "en-IN",
    { month: "short", year: "numeric" },
  );

  const dash = await getOvertimeDashboard({
    employeeId: me.id,
    isAdmin: me.isAdmin,
    monthStartISO,
    monthLabel,
  });

  const maxAllTime = Math.max(1, ...dash.people.map((p) => p.allTimeHours));

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
          <div className="mt-2.5 flex items-end justify-between gap-6 flex-wrap">
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
                  fontSize: "clamp(28px,3.4vw,44px)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                }}
              >
                Overtime Dashboard
              </h1>
              <p className="mt-1.5 max-w-[76ch] text-[15px] font-medium text-ink-muted">
                Hours by person, this month vs all-time, and pending approvals.
              </p>
            </div>
          </div>
        </header>

        {/* ── Stat cards ── */}
        <section
          aria-label="Overtime totals"
          className="mb-6 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2 max-sm:grid-cols-1"
        >
          <StatCard
            label={`This month (${monthLabel})`}
            value={fmtHours(dash.monthTotalHours)}
            sub="Total logged hours"
            Icon={Clock}
            accent={GREEN}
            delay={0}
          />
          <StatCard
            label="All-time"
            value={fmtHours(dash.allTimeTotalHours)}
            sub="Total logged hours"
            Icon={BarChart3}
            accent="#334155"
            delay={50}
          />
          <StatCard
            label="Pending"
            value={String(dash.pendingCount)}
            sub="Awaiting your review"
            Icon={Hourglass}
            accent={dash.pendingCount > 0 ? "#d97706" : "#334155"}
            delay={100}
          />
          <StatCard
            label="Approved"
            value={String(dash.byStatus.approved)}
            sub={`${dash.byStatus.rejected} rejected`}
            Icon={CheckCircle2}
            accent={GREEN_DEEP}
            delay={150}
          />
        </section>

        {/* ── By-person bars ── */}
        <section
          className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-5"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
            animationDelay: "200ms",
          }}
        >
          <h2
            className="mb-1 font-bold text-ink-strong"
            style={{ fontSize: 18, letterSpacing: "-0.01em" }}
          >
            Overtime by Person
          </h2>
          <p className="mb-5 text-[13px] font-medium text-ink-subtle">
            All-time hours per person. Filled bar = approved; lighter = pending /
            rejected.
          </p>

          {dash.people.length === 0 ? (
            <div className="py-10 text-center">
              <XCircle
                size={26}
                strokeWidth={1.8}
                className="mx-auto mb-3 text-ink-subtle"
              />
              <p className="font-bold text-ink-strong" style={{ fontSize: 15 }}>
                No overtime logged yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {dash.people.map((p, i) => {
                const totalPct = (p.allTimeHours / maxAllTime) * 100;
                const approvedPct =
                  p.allTimeHours > 0
                    ? (p.allTimeApprovedHours / p.allTimeHours) * 100
                    : 0;
                return (
                  <div
                    key={p.employeeId}
                    className="wg-rise flex items-center gap-3.5"
                    style={{ animationDelay: `${240 + i * 40}ms` }}
                  >
                    <EmployeeAvatar name={p.employeeName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="truncate text-[14px] font-semibold text-ink-strong">
                          {p.employeeName}
                        </span>
                        <span className="text-[14px] font-bold text-ink-strong tabular-nums whitespace-nowrap">
                          {fmtHours(p.allTimeHours)}
                          <span className="ml-2 text-[12px] font-medium text-ink-subtle">
                            {fmtHours(p.monthHours)} this month
                          </span>
                        </span>
                      </div>
                      <div
                        className="h-3 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--color-hairline)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${totalPct}%`,
                            background: `linear-gradient(90deg, ${GREEN_DEEP}, ${GREEN})`,
                            opacity: 0.3,
                          }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${approvedPct}%`,
                              background: `linear-gradient(90deg, ${GREEN_DEEP}, ${GREEN})`,
                              opacity: 3.33, // counteracts the parent 0.3 → reads solid
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
