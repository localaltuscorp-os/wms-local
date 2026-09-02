import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { MODULE_THEME } from "@/lib/module-theme";
import { listSelfLearning, selfLearnMinutesThisMonth } from "@/lib/queries/learning";
import { getScoreConfig } from "@/lib/queries/pms";
import { monthStart } from "@/lib/weekly-goals/week";
import { SelfLearningForm, SelfLearningItem } from "@/components/training/learning/self-learning-form";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400"; // Altus red deep

function nextMonthStart(ms: string): string {
  const [y, m] = ms.split("-").map(Number);
  const next = m === 12 ? { y: y! + 1, m: 1 } : { y: y!, m: m! + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-01`;
}

export default async function SelfLearningPage() {
  const me = await requireWorkspace("training");
  const ms = monthStart();
  const monthEnd = nextMonthStart(ms);
  const [rows, minutesThisMonth, cfg] = await Promise.all([
    listSelfLearning(me.id, ms, monthEnd),
    selfLearnMinutesThisMonth(me.id),
    getScoreConfig(),
  ]);

  const targetHours = cfg.thresholds.selfLearnHoursPerMonth || 0;
  const targetMin = Math.round(targetHours * 60);
  const pct = targetMin > 0 ? Math.min(100, Math.round((minutesThisMonth / targetMin) * 100)) : 0;
  const hoursDone = (minutesThisMonth / 60).toFixed(1);
  const monthName = new Date(`${ms}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const met = targetMin > 0 && minutesThisMonth >= targetMin;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            Skill Upgrade
          </span>
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 8 }}
          >
            Self-Learning
          </h1>
          <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
            Log what you learn from books, videos and YouTube — with evidence. This feeds your PMS Skill-Upgrade score.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          {/* Progress meter */}
          <aside className="flex flex-col gap-5">
            <div className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm" style={{ animationDelay: "0ms" }}>
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft">{monthName}</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 40, lineHeight: 1, color: ACCENT_DEEP }}>
                  {hoursDone}
                </span>
                <span className="mb-1 text-[15px] font-bold text-ink-muted">
                  / {targetHours || "—"} hrs
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: met ? "linear-gradient(90deg, #16a34a, #15803d)" : `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                />
              </div>
              <p className="mt-2.5 text-[13.5px] font-semibold" style={{ color: met ? "#15803d" : "var(--color-ink-muted)" }}>
                {met
                  ? "Monthly target met — nice."
                  : targetMin > 0
                    ? `${Math.max(0, Math.ceil((targetMin - minutesThisMonth) / 60 * 10) / 10)} hrs to go this month.`
                    : "Keep a steady self-learning habit."}
              </p>
              <p className="mt-1 text-[12.5px] font-medium text-ink-subtle">
                {minutesThisMonth} min logged · {rows.length} {rows.length === 1 ? "entry" : "entries"}
              </p>
            </div>

            <div className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm" style={{ animationDelay: "35ms" }}>
              <h2 className="text-[15px] font-bold text-ink-strong">Log an Entry</h2>
              <p className="mt-0.5 mb-4 text-[13px] font-medium text-ink-subtle">Evidence (a link) is required.</p>
              <SelfLearningForm />
            </div>
          </aside>

          {/* This-month list */}
          <section className="col-span-2 max-lg:col-span-1">
            <div className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm" style={{ animationDelay: "70ms" }}>
              <h2 className="text-[15px] font-bold text-ink-strong">This Month's Learning</h2>
              <p className="mt-0.5 mb-4 text-[13px] font-medium text-ink-subtle">{monthName}</p>
              {rows.length === 0 ? (
                <div className="rounded-xl border border-solid border-hairline-strong p-10 text-center">
                  <p className="text-[15px] font-bold text-ink-strong">Nothing logged yet this month</p>
                  <p className="mt-1 text-[13.5px] font-medium text-ink-muted">Add your first self-learning entry on the left.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rows.map((r) => (
                    <SelfLearningItem
                      key={r.id}
                      id={r.id}
                      kind={r.kind}
                      title={r.title}
                      minutes={r.minutes}
                      learnDate={r.learnDate}
                      sourceUrl={r.sourceUrl}
                      evidenceUrl={r.evidenceUrl}
                      notes={r.notes}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
