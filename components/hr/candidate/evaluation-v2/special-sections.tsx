"use client";

import * as React from "react";
import { Check, Gauge, Sparkles, TrendingUp, TrendingDown, History, AlertTriangle, X } from "lucide-react";
import {
  RECOMMENDATIONS,
  TEXTBOX_FIELDS,
  type EvaluationInstance,
  type EvaluatorRole,
  type OverrideEvent,
  type RecommendationValue,
} from "@/lib/hr/candidate/evaluation-v2";
import { overallScore, eligibilityVerdict, type ScoreContext, type WeightProfile } from "@/lib/hr/candidate/evaluation-v2-scoring";
import { formatDate } from "@/lib/format";
import { computeComposites, scoreBand } from "@/lib/hr/candidate/evaluation-v2-composites";
import { RatingControl } from "./controls";
import { VoiceTextbox } from "./voice";
import { Dial, toneFor } from "./dial";
import { AiInsightsPanel } from "./ai-insights-panel";
import type { EvalController } from "./controller";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* Auto-recommendation heuristic                                       */
/* ------------------------------------------------------------------ */

/** Derive the suggested recommendation from the interview score + eligibility. */
export function autoRecommendation(
  interviewScore: number | null,
  elig: ReturnType<typeof eligibilityVerdict>,
): RecommendationValue | null {
  if (elig.dealbreaker) return "reject";
  if (interviewScore === null) return null;
  if (interviewScore >= 85) return "strong-hire";
  if (interviewScore >= 70) return "hire";
  if (interviewScore >= 58) return "hire-concerns";
  if (interviewScore >= 48) return "hold";
  return "reject";
}

/* ------------------------------------------------------------------ */
/* 8 · Overall Assessment — the finale                                 */
/* ------------------------------------------------------------------ */

export function OverallSection({
  ctrl,
  instance,
  profile,
  ctx,
  candidateId,
  evalRole,
}: {
  ctrl: EvalController;
  instance: EvaluationInstance;
  profile: WeightProfile;
  ctx: ScoreContext;
  candidateId: string;
  evalRole: EvaluatorRole;
}) {
  const composites = React.useMemo(() => computeComposites(instance, profile, ctx), [instance, profile, ctx]);
  const overall = overallScore(instance, profile, ctx);
  const elig = eligibilityVerdict(instance);
  const auto = autoRecommendation(composites.interviewScore, elig);

  return (
    <div className="space-y-6">
      {/* Headline: interview score dial + scorecard rings */}
      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)] max-sm:p-4">
        <div className="flex flex-wrap items-center gap-6">
          <InterviewScoreDial pct={composites.interviewScore} avg={overall.avg} />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Overall Interview Score</p>
            <p className="text-[13px] font-medium leading-snug text-ink-muted">
              Weighted across {overall.ratedSections} / {overall.applicableSections} applicable sections. Composite
              scores below compute live from every rating.
            </p>
            {elig.dealbreaker && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: RED_DEEP }}>
                <AlertTriangle size={13} /> Flagged for review — critical pre-requisite failed
              </span>
            )}
          </div>
        </div>

        {/* Scorecard rings */}
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
          {composites.scorecard.map((c) => (
            <ScorecardRing key={c.key} label={c.label} score={c.score} />
          ))}
        </div>
      </div>

      {/* Index detail: Base indices · driver composites · technical · sales */}
      <div className="grid gap-4 lg:grid-cols-2">
        <IndexCard title="Character & Presence">
          <div className="grid grid-cols-2 gap-3">
            <IndexStat label="Average" value={composites.base.average} kind="score" />
            <div className="grid grid-cols-2 gap-3 col-span-2 sm:col-span-1 sm:grid-cols-1">
              <IndexBadge label="Strength" pct={composites.base.strengthIndex} good icon={<TrendingUp size={13} />} />
              <IndexBadge label="Weakness" pct={composites.base.weaknessIndex} good={false} icon={<TrendingDown size={13} />} />
            </div>
          </div>
        </IndexCard>

        <IndexCard title="Driver Composites">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <IndexStat label="Leadership" value={composites.drivers.leadership} kind="score" small />
            <IndexStat label="Execution" value={composites.drivers.execution} kind="score" small />
            <IndexStat label="Learning" value={composites.drivers.learning} kind="score" small />
            <IndexStat label="Communication" value={composites.drivers.communication} kind="score" small />
            <IndexStat label="Ownership" value={composites.drivers.ownership} kind="score" small />
            <IndexStat label="Overall" value={composites.drivers.overall} kind="score" small />
          </div>
        </IndexCard>

        <IndexCard title="Technical Composites">
          <div className="grid grid-cols-3 gap-2.5">
            <IndexStat label="Technical" value={composites.technical.technical} kind="score" small />
            <IndexStat label="Digital Literacy" value={composites.technical.digitalLiteracy} kind="score" small />
            <IndexStat label="AI Readiness" value={composites.technical.aiReadiness} kind="score" small />
          </div>
        </IndexCard>

        <IndexCard title="Customer-Facing & Sales">
          <div className="grid grid-cols-2 gap-2.5">
            <IndexStat label="Customer-Facing" value={composites.customerFacing} kind="score" small />
            <IndexStat
              label={ctx.isSalesRole ? "Sales Readiness" : "Sales (n/a)"}
              value={ctx.isSalesRole ? composites.salesReadiness : null}
              kind="score"
              small
            />
          </div>
        </IndexCard>
      </div>

      {/* Recommendation + override */}
      <RecommendationPicker ctrl={ctrl} auto={auto} />

      {/* Gut number */}
      <OverallInput ctrl={ctrl} instance={instance} profile={profile} ctx={ctx} />

      {/* AI insights */}
      <AiInsightsPanel ctrl={ctrl} candidateId={candidateId} role={evalRole} />

      {/* Closing narrative */}
      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)] max-sm:p-4">
        <p className="mb-3 text-[13.5px] font-black uppercase tracking-[0.1em] text-ink-soft">Narrative</p>
        <ClosingTextboxes ctrl={ctrl} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interview-score dial (0..100)                                       */
/* ------------------------------------------------------------------ */

function InterviewScoreDial({ pct, avg }: { pct: number | null; avg: number | null }) {
  const tone = toneFor(avg);
  return (
    <Dial
      size={128}
      stroke={11}
      fill={pct === null ? 0 : pct / 100}
      tone={tone}
      sub="Interview Score"
      ariaLabel={pct === null ? "Interview score not yet computed" : `Interview score ${pct} out of 100`}
      main={pct === null ? <span className="text-ink-subtle">—</span> : <>{pct}<span className="text-[0.5em] font-bold text-ink-subtle">/100</span></>}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Scorecard ring                                                      */
/* ------------------------------------------------------------------ */

function ScorecardRing({ label, score }: { label: string; score: number | null }) {
  const band = scoreBand(score);
  const tone = { stroke: band.tone, fg: band.tone };
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-hairline bg-surface-soft px-2 py-3">
      <Dial
        size={72}
        stroke={7}
        fill={score === null ? 0 : score / 10}
        tone={tone}
        ariaLabel={score === null ? `${label} not rated` : `${label} ${fmt(score)} out of 10`}
        main={score === null ? <span className="text-ink-subtle">—</span> : fmt(score)}
      />
      <span className="text-center text-[11.5px] font-bold leading-tight text-ink-strong">{label}</span>
      <span className="text-[10px] font-black uppercase tracking-[0.08em]" style={{ color: band.tone }}>{band.label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Index cards                                                         */
/* ------------------------------------------------------------------ */

function IndexCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <p className="mb-3 text-[12px] font-black uppercase tracking-[0.1em] text-ink-soft">{title}</p>
      {children}
    </div>
  );
}

function IndexStat({ label, value, small }: { label: string; value: number | null; kind: "score"; small?: boolean }) {
  const tone = toneFor(value);
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-3 py-2">
      <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-soft">{label}</p>
      <p
        className={`${small ? "text-[17px]" : "text-[22px]"} font-black leading-none tabular-nums`}
        style={{ fontFamily: DISPLAY, color: value === null ? "var(--color-ink-subtle)" : tone.fg }}
      >
        {value === null ? "—" : fmt(value)}
        <span className={`${small ? "text-[10px]" : "text-[12px]"} font-bold text-ink-subtle`}>/10</span>
      </p>
    </div>
  );
}

function IndexBadge({ label, pct, good, icon }: { label: string; pct: number; good: boolean; icon: React.ReactNode }) {
  const tone = good ? { bg: "color-mix(in srgb, #16a34a 12%, white)", fg: "#15803d" } : { bg: "color-mix(in srgb, var(--color-altus-red) 10%, white)", fg: RED_DEEP };
  return (
    <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: tone.bg }}>
      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: tone.fg }}>
        {icon} {label}
      </span>
      <span className="text-[15px] font-black tabular-nums" style={{ color: tone.fg }}>{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendation picker + override                                    */
/* ------------------------------------------------------------------ */

export function RecommendationPicker({ ctrl, auto }: { ctrl: EvalController; auto: RecommendationValue | null }) {
  const current = ctrl.instance.recommendation;
  const history = ctrl.instance.overrideHistory ?? [];
  const [pending, setPending] = React.useState<RecommendationValue | null>(null);
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState(false);
  const reasonRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (pending) reasonRef.current?.focus();
  }, [pending]);

  const autoMeta = auto ? RECOMMENDATIONS.find((r) => r.value === auto) : null;

  function pick(v: RecommendationValue) {
    if (v === auto || auto === null) {
      // Accepting the suggestion (or no suggestion computed) — no override needed.
      ctrl.acceptRecommendation(v);
      setPending(null);
      setReason("");
      setReasonError(false);
      return;
    }
    // Diverging from the auto suggestion → require a reason.
    setPending(v);
    setReason("");
    setReasonError(false);
  }

  function confirmOverride() {
    if (!pending) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError(true);
      reasonRef.current?.focus();
      return;
    }
    const event: OverrideEvent = { from: auto, to: pending, reason: trimmed, at: new Date().toISOString() };
    ctrl.recordOverride(event);
    setPending(null);
    setReason("");
    setReasonError(false);
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)] max-sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
          Recommendation
        </h3>
        {autoMeta && (
          <span
            className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
            style={{ background: `color-mix(in srgb, ${autoMeta.tone} 12%, white)`, color: autoMeta.tone }}
            title="Auto-suggested from the interview score + eligibility"
          >
            <Sparkles size={12} /> Suggested: {autoMeta.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {RECOMMENDATIONS.map((r) => {
          const active = current === r.value;
          const isAuto = auto === r.value;
          return (
            <button
              key={r.value}
              type="button"
              aria-pressed={active}
              onClick={() => pick(r.value)}
              className="relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold transition-all"
              style={
                active
                  ? {
                      background: `linear-gradient(135deg, ${r.tone}, color-mix(in srgb, ${r.tone} 72%, black))`,
                      color: "#fff",
                      boxShadow: `0 10px 22px -12px ${r.tone}`,
                      transform: "translateY(-1px)",
                    }
                  : { background: "#fff", color: r.tone, border: `1.5px solid color-mix(in srgb, ${r.tone} 40%, white)` }
              }
            >
              <span
                className="grid h-4 w-4 place-items-center rounded-full"
                style={active ? { background: "rgba(255,255,255,0.28)" } : { background: `color-mix(in srgb, ${r.tone} 16%, white)` }}
              >
                {active && <Check size={11} strokeWidth={3.5} />}
              </span>
              {r.label}
              {isAuto && !active && (
                <span className="ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em]" style={{ background: `color-mix(in srgb, ${r.tone} 14%, white)` }}>
                  Auto
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Override reason prompt */}
      {pending && (
        <div className="ev2-collapse mt-4 rounded-2xl border p-4" style={{ borderColor: "color-mix(in srgb, #d97706 40%, white)", background: "color-mix(in srgb, #d97706 7%, white)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: "#b45309" }}>
              <AlertTriangle size={15} /> Overriding “{autoMeta?.label ?? "suggestion"}” → “{RECOMMENDATIONS.find((r) => r.value === pending)?.label}”
            </p>
            <button
              type="button"
              onClick={() => { setPending(null); setReason(""); setReasonError(false); }}
              className="grid h-6 w-6 place-items-center rounded-full text-ink-muted transition-colors hover:bg-hairline"
              aria-label="Cancel override"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            ref={reasonRef}
            value={reason}
            onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonError(false); }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); confirmOverride(); }
            }}
            placeholder="Why does your call differ from the suggested recommendation? (required)"
            rows={2}
            maxLength={2000}
            className="w-full rounded-xl border-2 px-3 py-2 text-[13.5px] leading-relaxed text-ink-strong outline-none transition-colors"
            style={{ resize: "vertical", borderColor: reasonError ? RED : "var(--color-hairline-strong)", background: "#fff" }}
          />
          {reasonError && <p className="mt-1 text-[12px] font-semibold" style={{ color: RED_DEEP }}>A reason is required to override the suggestion.</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setPending(null); setReason(""); setReasonError(false); }}
              className="rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmOverride}
              className="rounded-lg px-4 py-2 text-[12.5px] font-bold text-white transition-colors"
              style={{ background: "#b45309" }}
            >
              Confirm override
            </button>
          </div>
        </div>
      )}

      {/* Override audit history */}
      {history.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">
            <History size={13} /> Override history
          </p>
          <ul className="space-y-1.5">
            {history.slice().reverse().map((ev, i) => {
              const fromL = ev.from ? RECOMMENDATIONS.find((r) => r.value === ev.from)?.label ?? ev.from : "—";
              const toL = RECOMMENDATIONS.find((r) => r.value === ev.to)?.label ?? ev.to;
              return (
                <li key={`${ev.at}-${i}`} className="rounded-lg border border-hairline bg-surface-soft px-3 py-2 text-[12.5px]">
                  <span className="font-bold text-ink-strong">{fromL} → {toL}</span>
                  <span className="ml-2 text-ink-subtle">{formatDate(ev.at)}, {new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  <p className="mt-0.5 font-medium text-ink-muted">{ev.reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gut number                                                          */
/* ------------------------------------------------------------------ */

export function OverallInput({
  ctrl,
  instance,
  profile,
  ctx,
}: {
  ctrl: EvalController;
  instance: EvaluationInstance;
  profile: WeightProfile;
  ctx: ScoreContext;
}) {
  const computed = overallScore(instance, profile, ctx);
  const tone = toneFor(computed.avg);
  const set = instance.overall !== null;
  return (
    <div className="rounded-2xl border-2 p-5" style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))", background: "color-mix(in srgb, var(--color-altus-red) 3%, #fff)" }}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
            <Gauge size={20} className="text-altus-red" /> Your gut number
          </span>
          <div className="mt-3">
            <RatingControl label="Overall interviewer score" value={instance.overall ?? 0} onChange={(v) => ctrl.setOverall(v)} size={36} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-2xl px-5 py-3.5" style={{ background: tone.soft }}>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Computed weighted</p>
            <p className="text-[32px] font-black tabular-nums leading-none" style={{ color: tone.fg, fontFamily: DISPLAY }}>
              {computed.avg === null ? "— / 10" : `${fmt(computed.avg)} / 10`}
            </p>
          </div>
        </div>
      </div>
      {set && instance.overall !== null && computed.avg !== null && Math.abs(instance.overall - computed.avg) >= 2 && (
        <p className="mt-2 text-[12px] font-semibold" style={{ color: RED_DEEP }}>
          Your gut ({fmt(instance.overall)}) differs from the computed score ({fmt(computed.avg)}) by {fmt(Math.abs(instance.overall - computed.avg))} — worth a note on why.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Closing narrative boxes                                             */
/* ------------------------------------------------------------------ */

export function ClosingTextboxes({ ctrl }: { ctrl: EvalController }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {TEXTBOX_FIELDS.map((f, i) => (
        <div key={f.id} className={i === 0 ? "sm:col-span-2" : ""}>
          <VoiceTextbox
            label={f.label}
            value={ctrl.instance.textboxes[f.id] ?? ""}
            onChange={(v) => ctrl.setTextbox(f.id, v)}
            rows={i === 0 ? 4 : 3}
            minHeight={i === 0 ? 96 : 80}
          />
        </div>
      ))}
    </div>
  );
}
