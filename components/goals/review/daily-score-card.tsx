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
    <section aria-label="Daily score" className="mb-1 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12px] font-black uppercase tracking-[0.08em] text-ink-strong">Daily score</span>
      <div className="flex flex-wrap items-center gap-2">
        <Tile
          icon={<CheckCircle2 size={13} strokeWidth={2.6} />}
          label="Today"
          value={`${score.today.done}/${score.today.total} (${pct(score.today.done, score.today.total)}%)`}
          hint="today's plan"
          tone="var(--color-altus-red-deep)"
        />
        <Tile
          icon={<History size={13} strokeWidth={2.6} />}
          label={`Last ${score.window.days}d`}
          value={`${score.window.done}/${score.window.total} (${pct(score.window.done, score.window.total)}%)`}
          hint="trailing period"
          tone="var(--color-ink-soft)"
        />
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
    <div className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-3">
      <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: tone }}>
        {icon}
        {label}
      </span>
      <p className="font-black leading-none tabular-nums text-ink-strong">{value}</p>
      <span className="sr-only">{hint}</span>
    </div>
  );
}
