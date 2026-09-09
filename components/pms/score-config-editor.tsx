"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Scale, SlidersHorizontal, Spline, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveScoreConfig } from "@/app/(app)/pms/actions";
import type { PmsScoreConfig } from "@/lib/pms/engines/config";
import { MODULE_THEME } from "@/lib/module-theme";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

const WEIGHTS: [keyof PmsScoreConfig["weights"], string][] = [
  ["kpi", "KPI (Weekly + Incentive)"], ["skillUpgrade", "Skill Upgrade (Training)"],
  ["compliance", "Compliance (DCC + Checklist)"], ["attitude", "Attitude & Mindset"],
  ["teamwork", "Team Work (Peers)"],
];
const WEIGHT_SHORT: Record<keyof PmsScoreConfig["weights"], string> = {
  kpi: "KPI",
  skillUpgrade: "Skill",
  compliance: "Comply",
  attitude: "Attitude",
  teamwork: "Team",
};
const THRESHOLDS: [keyof PmsScoreConfig["thresholds"], string, string][] = [
  ["promotionScore", "Promotion Score", "Score ≥ this flags a promotion review"],
  ["recognitionScore", "Recognition Score", "Score ≥ this suggests recognition"],
  ["minTenureDays", "Min Tenure (Days)", "Days employed before promotion-eligible"],
  ["trainGiveHoursPerMonth", "Give Hrs / Mo", "Hours managers must train others"],
  ["trainAttendHoursPerMonth", "Attend Hrs / Mo", "Hours everyone must attend training"],
  ["selfLearnHoursPerMonth", "Self-Learn Hrs / Mo", "Hours of self-learning required"],
  ["shareMinPerWeek", "Share Mins / Wk", "Weekly Share minutes (compulsory)"],
  ["assessmentPassPct", "Assessment Pass %", "Below this = fail → redo (waivable)"],
  ["noScheduleAlertDays", "No-Schedule Alert (Days)", "Alert if no training scheduled in N days"],
  ["noAttendPromptDays", "No-Attend Prompt (Days)", "Prompt to pick a training after N days"],
  ["maxSessionMinutes", "Max Session (Mins)", "No single session longer than this"],
  ["lateGraceDays", "Late Grace (Days)", "Allowed late arrivals before it counts"],
  ["onTimeRateFloor", "On-Time Floor (0–1)", "Min punctual share for full credit"],
];
const FORMULA: [keyof PmsScoreConfig["formula"], string][] = [
  ["kpiWeeklyWeight", "KPI · Weekly Goals"], ["kpiIncentiveWeight", "KPI · Incentive"],
  ["skillAttendWeight", "Skill · Attended"], ["skillGiveWeight", "Skill · Given"],
  ["skillSelfLearnWeight", "Skill · Self-Learn"], ["skillShareWeight", "Skill · Share"],
  ["compDccWeight", "Compliance · DCC"], ["compChecklistWeight", "Compliance · Checklist"],
  ["ratingFloor", "Rating Floor (1–5)"], ["ratingCeil", "Rating Ceiling (1–5)"],
];

export function ScoreConfigEditor({ initial }: { initial: PmsScoreConfig }) {
  const router = useRouter();
  const [weights, setWeights] = React.useState(initial.weights);
  const [thresholds, setThresholds] = React.useState(initial.thresholds);
  const [formula, setFormula] = React.useState(initial.formula);
  const [pending, start] = React.useTransition();

  const weightTotal = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  function save() {
    start(async () => {
      const res = await saveScoreConfig({ weights, thresholds, formula });
      if (!res.ok) { fireToast({ message: res.error }); return; }
      fireToast({ message: "Scoring policy saved — applies on the next score.", type: "success" });
      router.refresh();
    });
  }

  const numInput =
    "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[15px] text-ink-strong outline-none focus:border-2 tabular-nums";

  return (
    <div className="space-y-6">
      {/* Weights */}
      <section className="wg-rise rounded-2xl bg-surface-card p-6 max-md:p-4" style={{ boxShadow: CARD_SHADOW }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-grid size-9 shrink-0 place-items-center rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Scale size={17} strokeWidth={2.4} />
            </span>
            <h2
              className="text-[19px] text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, letterSpacing: "-0.01em" }}
            >
              Pillar Weights
            </h2>
          </div>
          <span
            className="rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums"
            style={{
              background: `color-mix(in srgb, ${weightTotal > 0 ? ACCENT : "#64748b"} 9%, transparent)`,
              color: weightTotal > 0 ? ACCENT_DEEP : "var(--color-ink-subtle)",
            }}
          >
            total {weightTotal} · relative (normalised)
          </span>
        </div>
        <p className="mt-2 text-[13.5px] text-ink-muted">How much each pillar counts toward the score. Relative — a pillar with no data is excluded, not zeroed.</p>

        {/* Live weight-share bar — folds over the inputs, zero queries */}
        {weightTotal > 0 && (
          <div className="mt-4" aria-hidden>
            <div className="flex h-3 w-full overflow-hidden rounded-pill" style={{ background: "var(--color-surface-soft)" }}>
              {WEIGHTS.map(([k], i) => {
                const share = (Number(weights[k]) || 0) / weightTotal;
                if (share <= 0) return null;
                return (
                  <span
                    key={k}
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${share * 100}%`,
                      background: `color-mix(in srgb, ${ACCENT} ${100 - i * 16}%, #fff)`,
                    }}
                    title={`${WEIGHT_SHORT[k]} ${(share * 100).toFixed(0)}%`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {WEIGHTS.map(([k], i) => {
                const share = weightTotal > 0 ? (Number(weights[k]) || 0) / weightTotal : 0;
                return (
                  <span key={k} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-subtle">
                    <span
                      className="inline-block size-2.5 rounded-[4px]"
                      style={{ background: `color-mix(in srgb, ${ACCENT} ${100 - i * 16}%, #fff)` }}
                    />
                    {WEIGHT_SHORT[k]} <span className="tabular-nums">{(share * 100).toFixed(0)}%</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-5 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2">
          {WEIGHTS.map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</span>
              <input type="number" min={0} step={1} value={String(weights[k])}
                onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                className={numInput} style={{ borderColor: undefined }} />
            </label>
          ))}
        </div>
      </section>

      {/* Thresholds */}
      <section
        className="wg-rise rounded-2xl bg-surface-card p-6 max-md:p-4"
        style={{ boxShadow: CARD_SHADOW, animationDelay: "50ms" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-grid size-9 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <SlidersHorizontal size={17} strokeWidth={2.4} />
          </span>
          <h2
            className="text-[19px] text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, letterSpacing: "-0.01em" }}
          >
            Thresholds
          </h2>
        </div>
        <p className="mt-2 text-[13.5px] text-ink-muted">The gates for the human-released promotion + recognition signals. Nothing is auto-actioned.</p>
        <div className="mt-4 grid grid-cols-4 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2">
          {THRESHOLDS.map(([k, label, hint]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</span>
              <input type="number" step="any" value={String(thresholds[k])}
                onChange={(e) => setThresholds((t) => ({ ...t, [k]: Number(e.target.value) }))}
                className={numInput} />
              <span className="mt-1 block text-[11.5px] text-ink-subtle">{hint}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Formula coefficients */}
      <section
        className="wg-rise rounded-2xl bg-surface-card p-6 max-md:p-4"
        style={{ boxShadow: CARD_SHADOW, animationDelay: "100ms" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-grid size-9 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Spline size={17} strokeWidth={2.4} />
          </span>
          <h2
            className="text-[19px] text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, letterSpacing: "-0.01em" }}
          >
            Pillar Curves
          </h2>
        </div>
        <p className="mt-2 text-[13.5px] text-ink-muted">A multiplier on each pillar&apos;s raw rate (1.0 = as-is). Tune how steep each pillar rewards.</p>
        <div className="mt-4 grid grid-cols-5 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2">
          {FORMULA.map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</span>
              <input type="number" step="0.1" value={String(formula[k])}
                onChange={(e) => setFormula((f) => ({ ...f, [k]: Number(e.target.value) }))}
                className={numInput} />
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={pending}
          className="brand-btn wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-6 py-3 text-[15px] font-bold text-white transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow: `0 10px 24px -12px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}>
          {pending ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={2.4} />}
          {pending ? "Saving…" : "Save Scoring Policy"}
        </button>
      </div>
    </div>
  );
}
