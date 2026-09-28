import { Target, TrendingUp } from "lucide-react";
import { formatInr } from "@/lib/format";
import { formatMonthKey } from "@/lib/incentive/analytics/periods";
import { IncentiveEmptyState } from "../ui/states";

/**
 * TARGET vs ACTUAL, FOR THE SELECTED PERIOD — the compact visual block.
 *
 * ── WHAT WAS WRONG BEFORE ──────────────────────────────────────────────────
 * The period selector changed the figures but there was nothing to LOOK at: a
 * large area held two numbers and a lot of white space, and a period with no
 * activity rendered as the same mostly-empty box. This section is what fills it
 * — and it is deliberately small, because the alternative (a full-height chart
 * card per metric) is the "giant empty container" the brief rules out.
 *
 * ── ONLY REAL NUMBERS, AND NO GAPS FILLED IN ───────────────────────────────
 * Every bar is a sum of rows that exist. A month with no incentives is a
 * genuine zero, drawn at zero — and when the whole period is empty the block
 * collapses to ONE compact line saying so, rather than a chart of nothing.
 * Nothing here invents a target, a trend or an average to make the shape look
 * better: a month with no target reads "no target", not ₹0.
 *
 * ── WHY THE MONTHLY STRIP IS HIDDEN FOR A MONTH ────────────────────────────
 * A single-month period has no shape to show — one bar at 100% is decoration,
 * not information. The strip appears only when the period spans more than one
 * month and at least one of them has something in it.
 */

export interface PeriodProgressProps {
  /** The period's own label — "Sep 2026", "Q3 2026", "2026". */
  label: string;
  /** Whose figures these are — "You", "You and your team", a colleague's name. */
  scopeLabel: string;
  /** Total earned by that scope over the period. */
  earned: number;
  /** Total target for the period, or null when none is set. */
  target: number | null;
  /** earned − target; null without a target. Negative is a deficit. */
  difference: number | null;
  /** Ascending, one entry per month in the period. */
  monthly: readonly { month: string; earned: number; target: number | null }[];
}

/** Attainment as a percentage, or null when there is no target to attain. */
function attainmentPct(earned: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return (earned / target) * 100;
}

function toneFor(pct: number | null): { ink: string; fill: string } {
  if (pct === null) return { ink: "var(--color-ink-muted)", fill: "var(--color-altus-red)" };
  if (pct >= 100) return { ink: "#147D73", fill: "#16a34a" };
  if (pct >= 60) return { ink: "#7C3D09", fill: "#d97706" };
  return { ink: "#B4160E", fill: "#E10600" };
}

export function PeriodProgress({
  label,
  scopeLabel,
  earned,
  target,
  difference,
  monthly,
}: PeriodProgressProps) {
  const pct = attainmentPct(earned, target);
  const anyEarned = monthly.some((m) => m.earned > 0);
  const showMonths = monthly.length > 1 && anyEarned;

  // ── NOTHING TO SHOW, SAID IN ONE LINE ──
  // Not a chart of zeroes, and not a large box: the period is genuinely empty,
  // so the block says which period and what to do about it.
  if (!anyEarned && target === null) {
    return (
      <section aria-label="Target and attainment" className="rounded-2xl border border-hairline bg-surface-card">
        <IncentiveEmptyState
          compact
          icon={Target}
          title={`No targets or earnings in ${label}`}
          body={`Nothing has been recorded for ${scopeLabel} in this period. Set a target above, or pick another period.`}
        />
      </section>
    );
  }

  const tone = toneFor(pct);
  // The bar's scale is the larger of the two, so a target that beats the
  // actual still renders a full-width reference line to measure against.
  const scale = Math.max(target ?? 0, earned, 1);
  const earnedPctOfBar = Math.min(100, (earned / scale) * 100);
  const targetPctOfBar = target === null ? null : Math.min(100, (target / scale) * 100);
  const peak = Math.max(...monthly.map((m) => Math.max(m.earned, m.target ?? 0)), 1);

  return (
    <section
      aria-label="Target and attainment"
      className="rounded-2xl border border-hairline bg-surface-card px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-extrabold text-ink-strong">Target vs Actual</h2>
        <span className="text-[12.5px] font-semibold text-ink-subtle">
          {label} · {scopeLabel}
        </span>
      </div>

      {/* ── THE THREE FIGURES, then the bar that relates them. ── */}
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">Target</div>
          <div className="text-[17px] font-black tabular-nums text-ink-strong">
            {target === null ? "Not set" : formatInr(target)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">Actual</div>
          <div className="text-[17px] font-black tabular-nums text-ink-strong">{formatInr(earned)}</div>
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">Attainment</div>
          <div className="text-[17px] font-black tabular-nums" style={{ color: tone.ink }}>
            {pct === null ? "—" : `${pct.toFixed(1)}%`}
          </div>
        </div>
        {difference !== null && (
          <div className="ml-auto text-right">
            <div className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
              {difference < 0 ? "Short by" : "Ahead by"}
            </div>
            <div
              className="text-[14px] font-black tabular-nums"
              style={{ color: difference < 0 ? "#B4160E" : "#147D73" }}
            >
              {formatInr(Math.abs(difference))}
            </div>
          </div>
        )}
      </div>

      {target === null ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-subtle">
          <TrendingUp size={13} strokeWidth={2.6} aria-hidden />
          No target set for {label}, so attainment cannot be measured.
        </p>
      ) : (
        <div className="mt-3">
          {/* Actual fill over a track, with a reference line where the target
              sits — so "how far along" and "how far to go" are one glance. */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-pill bg-surface-soft">
            <div
              className="h-full rounded-pill transition-[width] duration-500"
              style={{ width: `${earnedPctOfBar}%`, background: tone.fill }}
            />
            {targetPctOfBar !== null && (
              <span
                aria-hidden
                className="absolute top-0 h-full w-0.5 bg-ink-strong/70"
                style={{ left: `calc(${targetPctOfBar}% - 1px)` }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── EARNED OVER TIME ── */}
      {showMonths && (
        <div className="mt-4 border-t border-hairline pt-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-[12.5px] font-extrabold text-ink-strong">Earned by month</h3>
            <span className="text-[11.5px] font-semibold text-ink-subtle">
              target shown as a tick where one is set
            </span>
          </div>
          <div className="flex items-end gap-1.5" role="img" aria-label={`Incentives earned by month, ${label}`}>
            {monthly.map((m) => {
              const earnH = Math.max(m.earned > 0 ? 3 : 0, (m.earned / peak) * 44);
              const targetH = m.target === null ? null : Math.max(3, (m.target / peak) * 44);
              return (
                <div
                  key={m.month}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${formatMonthKey(m.month)} — earned ${formatInr(m.earned)}${
                    m.target === null ? ", no target" : `, target ${formatInr(m.target)}`
                  }`}
                >
                  <div className="relative flex h-[46px] w-full items-end justify-center">
                    {/* The target tick, drawn BEHIND the bar so a month that hit
                        its target reads as the bar reaching the line. */}
                    {targetH !== null && (
                      <span
                        aria-hidden
                        className="absolute w-full max-w-[26px] border-t border-dashed border-ink-subtle/70"
                        style={{ bottom: `${targetH}px` }}
                      />
                    )}
                    <span
                      className="w-full max-w-[26px] rounded-t-[3px]"
                      style={{
                        height: `${earnH}px`,
                        background: m.earned > 0 ? "var(--color-altus-red)" : "transparent",
                      }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[10.5px] font-bold tabular-nums text-ink-subtle">
                    {formatMonthKey(m.month).split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
