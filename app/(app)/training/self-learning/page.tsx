import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listSelfLearning, selfLearnMinutesThisMonth } from "@/lib/queries/learning";
import { getScoreConfig } from "@/lib/queries/pms";
import { monthStart } from "@/lib/weekly-goals/week";
import { SelfLearningForm, SelfLearningItem } from "@/components/training/learning/self-learning-form";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

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
        <PageCommandBar title="Self-Learning" />

        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          {/* Progress meter */}
          <aside>
            <div className="wg-rise h-full rounded-xl border border-hairline bg-surface-card p-4 shadow-sm" style={{ animationDelay: "0ms" }}>
              <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft">{monthName}</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 32, lineHeight: 1, color: ACCENT_DEEP }}>
                  {hoursDone}
                </span>
                <span className="mb-1 text-[15px] font-bold text-ink-muted">
                  / {targetHours || "—"} hrs
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }}>
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

          </aside>

          <section>
            <div className="wg-rise h-full rounded-xl border border-hairline bg-surface-card p-4 shadow-sm" style={{ animationDelay: "35ms" }}>
              <h2 className="text-[15px] font-bold text-ink-strong">Log an Entry</h2>
              <p className="mt-0.5 mb-3 text-[12.5px] font-medium text-ink-subtle">Evidence supports score.</p>
              <SelfLearningForm />
            </div>
          </section>
        </div>

        <section className="mt-4">
          <div className="wg-rise rounded-xl border border-hairline bg-surface-card p-4 shadow-sm" style={{ animationDelay: "70ms" }}>
              <h2 className="text-[15px] font-bold text-ink-strong">This Month's Learning</h2>
              <p className="mt-0.5 mb-3 text-[12.5px] font-medium text-ink-subtle">{monthName}</p>
              {rows.length === 0 ? (
                <div className="rounded-lg border border-solid border-hairline-strong px-4 py-5 text-center">
                  <p className="text-[14px] font-bold text-ink-strong">Nothing logged yet this month</p>
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
      </main>
    </>
  );
}
