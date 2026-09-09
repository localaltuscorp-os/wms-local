import { CheckCircle2, History, Sparkles, Timer } from "lucide-react";
import type { DailyScore } from "@/lib/queries/daily-score";

/**
 * DAILY SCORE strip — the "how did the day actually go" read-out Sir asked for:
 * today's done-out-of-planned, the same over a trailing window, the FRESH vs
 * CARRIED split of what got finished, and the average delay between a task's
 * original due date and the day it was really completed.
 *
 * The delay figure is the point of the whole strip: "on an average this person
 * finishes his tasks with a 3-day delay" is a fact you cannot get from a
 * percentage. It is shown with its sample size, because an average over two
 * tasks is not the same claim as one over forty.
 */
export function DailyScoreCard({ score }: { score: DailyScore }) {
  const pct = (d: number, t: number) => (t > 0 ? Math.round((d / t) * 100) : 0);
  const late = score.avgDelayDays != null && score.avgDelayDays > 0;
  const early = score.avgDelayDays != null && score.avgDelayDays < 0;

  return (
    <section className="mb-4 rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-altus-red-deep">
            Daily score
          </h3>
          <p className="text-[12px] font-medium text-ink-subtle">
            What you planned versus what you actually closed.
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="text-[13px] font-bold text-ink-muted">
            Today{" "}
            <span className="text-[20px] font-black tabular-nums text-ink-strong">
              {score.today.done}/{score.today.total}
            </span>{" "}
            <span className="tabular-nums text-ink-subtle">({pct(score.today.done, score.today.total)}%)</span>
          </span>
          <span className="text-[13px] font-bold text-ink-muted">
            Last {score.window.days}d{" "}
            <span className="text-[20px] font-black tabular-nums text-ink-strong">
              {score.window.done}/{score.window.total}
            </span>{" "}
            <span className="tabular-nums text-ink-subtle">({pct(score.window.done, score.window.total)}%)</span>
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Tile
          icon={<Sparkles size={13} strokeWidth={2.6} />}
          label="Fresh done"
          value={String(score.freshDone)}
          hint="planned today, closed today"
          tone="var(--color-green-deep)"
        />
        <Tile
          icon={<History size={13} strokeWidth={2.6} />}
          label="Carried done"
          value={String(score.carriedDone)}
          hint="owed from before, cleared today"
          tone="var(--color-amber-deep)"
        />
        <Tile
          icon={<CheckCircle2 size={13} strokeWidth={2.6} />}
          label="Still open"
          value={String(score.openToday)}
          hint="on today's plan, not done"
          tone="var(--color-ink-soft)"
        />
        <Tile
          icon={<Timer size={13} strokeWidth={2.6} />}
          label="Average delay"
          value={
            score.avgDelayDays == null
              ? "—"
              : `${Math.abs(score.avgDelayDays)}d ${late ? "late" : early ? "early" : ""}`.trim()
          }
          hint={
            score.delaySamples > 0
              ? `original due vs actual, ${score.delaySamples} task${score.delaySamples === 1 ? "" : "s"}`
              : "no dated task closed yet"
          }
          tone={late ? "var(--color-altus-red-deep)" : "var(--color-green-deep)"}
        />
      </div>
    </section>
  );
}

function Tile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em]" style={{ color: tone }}>
        {icon}
        {label}
      </span>
      <p className="mt-1 text-[19px] font-black leading-none tabular-nums text-ink-strong">{value}</p>
      <p className="mt-1 text-[10.5px] font-medium text-ink-subtle">{hint}</p>
    </div>
  );
}
