"use client";

import { Trophy, Check, Minus } from "lucide-react";
import {
  EVAL_CATEGORIES,
  SUMMARY_ITEMS,
  TOTAL_CRITERIA,
  categoryScore,
  overallScore,
  summaryScore,
  scoreStatus,
  type Ratings,
  type Score,
  type SummaryStatus,
} from "@/lib/hr/candidate/evaluation-checklist";
import { weightedOverall, type EvaluationWeights } from "@/lib/hr/candidate/evaluation-weights";
import { StarRating } from "@/components/hr/candidate/star-rating";

const RED = "var(--color-altus-red)";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function summaryTone(status: SummaryStatus) {
  return status === "met"
    ? { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d" }
    : status === "partial"
      ? { bg: "color-mix(in srgb, #f59e0b 16%, white)", fg: "#b45309" }
      : { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)" };
}

/**
 * The single, shared body of the Candidate Evaluation Checklist: the 8 category
 * cards (each with its section score), the overall-score banner, and the derived
 * Quick Interview Summary. Presentational — the owning screen supplies `ratings`
 * and (when editable) `onRate`. Passing `readOnly` renders non-interactive stars.
 *
 * Used editable by the standalone Evaluation screen + the Management Assessment
 * screen, and read-only by the Evaluation Record view — one source of truth.
 */
export function EvaluationChecklistBody({
  ratings,
  onRate,
  readOnly = false,
  weights,
}: {
  ratings: Ratings;
  onRate?: (criterionId: string, value: number) => void;
  readOnly?: boolean;
  /** When supplied, the OVERALL banner becomes the WEIGHTED overall and each
   *  section shows its weight. Omit for a flat, unweighted average. */
  weights?: EvaluationWeights;
}) {
  const overall = weights ? weightedOverall(ratings, weights) : overallScore(ratings);
  const editable = !readOnly && !!onRate;

  return (
    <div>
      {/* Category cards with per-section score */}
      <div className="space-y-4">
        {EVAL_CATEGORIES.map((cat, ci) => {
          const cs = categoryScore(cat, ratings);
          return (
            <section key={cat.id} className="rounded-2xl border border-hairline bg-white p-6 max-md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2.5 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black text-white" style={{ background: RED }}>{ci + 1}</span>
                  {cat.title}
                </h2>
                <div className="flex items-center gap-2">
                  {weights && (
                    <span
                      className="hidden shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold tabular-nums sm:inline-flex"
                      style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-muted)" }}
                      title="This section's weight toward the overall score"
                    >
                      <span className="text-[9.5px] uppercase tracking-wide opacity-75">Weight</span>
                      {Number(weights[cat.id]) || 0}%
                    </span>
                  )}
                  <ScorePill label="Section" score={cs} />
                </div>
              </div>
              {cat.groups.map((g, gi) => (
                <div key={gi} className={gi > 0 ? "mt-5" : ""}>
                  {g.label && <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-soft">{g.label}</h3>}
                  <div className="divide-y divide-hairline/70">
                    {g.criteria.map((cr) => (
                      <div key={cr.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <span className="min-w-[200px] flex-1 text-[14.5px] font-medium leading-snug text-ink-strong">{cr.label}</span>
                        <StarRating
                          value={ratings[cr.id] ?? 0}
                          readOnly={!editable}
                          onChange={editable ? (v) => onRate?.(cr.id, v) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {/* Overall score banner */}
      <section
        className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 text-white"
        style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)" }}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><Trophy size={24} /></span>
          <div>
            <span className="block text-[12px] font-bold uppercase tracking-[0.16em] text-white/70">{weights ? "Weighted Overall" : "Overall Score"}</span>
            <span className="block text-[13px] font-medium text-white/80">
              {weights
                ? `Weighted across ${overall.rated} of ${TOTAL_CRITERIA} rated criteria`
                : `Average across ${overall.rated} of ${TOTAL_CRITERIA} rated criteria`}
            </span>
          </div>
        </div>
        <span className="text-right tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 40, lineHeight: 1 }}>
          {overall.rated ? fmt(overall.avg) : "—"}<span className="text-[20px] font-bold text-white/70"> / 10</span>
        </span>
      </section>

      {/* Quick Interview Summary — auto-derived scores */}
      <section className="mt-6 rounded-2xl border border-hairline bg-white p-6 max-md:p-5">
        <h2 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 20 }}>
          Quick Interview Summary
        </h2>
        <p className="mt-1 mb-4 text-[13.5px] text-ink-muted">Auto-derived scores from the ratings above — no need to re-rate.</p>
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          {SUMMARY_ITEMS.map((item) => {
            const s = summaryScore(item, ratings);
            const st = scoreStatus(s);
            const tone = summaryTone(st);
            return (
              <div key={item.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: tone.bg }}>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: st === "unmet" ? "transparent" : tone.fg, color: "#fff" }}>
                  {st === "met" ? <Check size={12} strokeWidth={3.2} /> : st === "partial" ? <Minus size={12} strokeWidth={3.2} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong">{item.label}</span>
                <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: tone.fg }}>
                  {s.rated ? `${fmt(s.avg)} / 10` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ScorePill({ label, score }: { label: string; score: Score }) {
  const rated = score.rated > 0;
  const tone = !rated
    ? { bg: "var(--color-surface-soft)", fg: "var(--color-ink-subtle)" }
    : score.avg >= 7
      ? { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d" }
      : score.avg >= 4
        ? { bg: "color-mix(in srgb, #f59e0b 16%, white)", fg: "#b45309" }
        : { bg: "color-mix(in srgb, var(--color-altus-red) 12%, white)", fg: "var(--color-altus-red-deep)" };
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold tabular-nums"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="text-[10.5px] uppercase tracking-wide opacity-80">{label}</span>
      {rated ? `${fmt(score.avg)} / 10` : "— / 10"}
    </span>
  );
}
