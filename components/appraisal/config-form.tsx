"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Plus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveAppraisalConfig } from "@/app/(app)/appraisal/actions";
import {
  APPRAISAL_DIMENSIONS,
  APPRAISAL_DIMENSION_LABELS,
  type AppraisalDimension,
} from "@/db/enums";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const inputCls = "rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[13px] outline-none w-full";

export interface ConfigInitial {
  dimensionWeights: Record<AppraisalDimension, number>;
  ratingTerms: Array<{ min: number; label: string }>;
  incentiveTargetPct: number;
  knowledgeSharingRule: { do: number; give: number };
  culturePerMonth: number;
}

export function ConfigForm({ initial }: { initial: ConfigInitial }) {
  const router = useRouter();
  const [weights, setWeights] = React.useState<Record<string, string>>(
    Object.fromEntries(APPRAISAL_DIMENSIONS.map((d) => [d, String(initial.dimensionWeights[d] ?? 0)])),
  );
  const [terms, setTerms] = React.useState(initial.ratingTerms.map((t) => ({ ...t })));
  const [target, setTarget] = React.useState(String(initial.incentiveTargetPct));
  const [doN, setDoN] = React.useState(String(initial.knowledgeSharingRule.do));
  const [giveN, setGiveN] = React.useState(String(initial.knowledgeSharingRule.give));
  const [culture, setCulture] = React.useState(String(initial.culturePerMonth));
  const [pending, start] = React.useTransition();

  const sum = APPRAISAL_DIMENSIONS.reduce((s, d) => s + (Number(weights[d]) || 0), 0);
  const sumOk = Math.round(sum) === 100;

  function save() {
    if (!sumOk) {
      fireToast({ message: `Dimension weights must total 100% (currently ${Math.round(sum)}%).`, type: "error" });
      return;
    }
    const dimensionWeights = Object.fromEntries(
      APPRAISAL_DIMENSIONS.map((d) => [d, Number(weights[d]) || 0]),
    );
    start(async () => {
      const res = await saveAppraisalConfig({
        dimensionWeights,
        ratingTerms: terms.map((t) => ({ min: Number(t.min) || 0, label: t.label })),
        incentiveTargetPct: Number(target) || 20,
        knowledgeSharingRule: { do: Number(doN) || 0, give: Number(giveN) || 0 },
        culturePerMonth: Number(culture) || 3,
      });
      if (res.ok) {
        fireToast({ message: "Configuration saved.", type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink-strong">Dimension Weights</h2>
          <span className="text-[13px] font-bold tabular-nums" style={{ color: sum === 100 ? "#16a34a" : "#dc2626" }}>
            Total {sum}% {sum === 100 ? "✓" : "(should be 100)"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
          {APPRAISAL_DIMENSIONS.map((d) => (
            <label key={d} className="flex items-center justify-between gap-2 rounded-lg bg-surface-soft px-3 py-2">
              <span className="text-[13px] font-semibold text-ink-strong">{APPRAISAL_DIMENSION_LABELS[d]}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={weights[d]}
                onChange={(e) => setWeights((w) => ({ ...w, [d]: e.target.value }))}
                className="rounded-lg border border-hairline bg-white px-2 py-1 text-[13px] text-right tabular-nums outline-none"
                style={{ maxWidth: 72 }}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink-subtle">Non-managers drop Problem Solving / Growth Mindset / Ability; the engine renormalises the rest to 100.</p>
      </section>

      <section className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink-strong">Rating Terms</h2>
          <button
            type="button"
            onClick={() => setTerms((t) => [...t, { min: 0, label: "New band" }])}
            className="inline-flex items-center gap-1 rounded-pill border-2 bg-white/70 px-3 py-1 text-[12px] font-bold"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
          >
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {terms.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[12px] text-ink-subtle">≥</span>
              <input
                type="number"
                min={0}
                max={100}
                value={t.min}
                onChange={(e) => setTerms((arr) => arr.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)))}
                className="rounded-lg border border-hairline bg-white px-2 py-1 text-[13px] tabular-nums outline-none"
                style={{ maxWidth: 72 }}
              />
              <span className="text-[12px] text-ink-subtle">%</span>
              <input
                value={t.label}
                onChange={(e) => setTerms((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className={inputCls}
                style={{ flex: 1 }}
              />
              <button type="button" onClick={() => setTerms((arr) => arr.filter((_, j) => j !== i))} className="rounded-lg bg-white p-1.5 text-rose-700" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <h2 className="mb-3 text-[15px] font-bold text-ink-strong">Auto-Dimension Knobs</h2>
        <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-ink-subtle">Incentive Target (% of Base Salary)</span>
            <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-ink-subtle">Culture Items / Month</span>
            <input type="number" value={culture} onChange={(e) => setCulture(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-ink-subtle">Knowledge: Sessions to Attend</span>
            <input type="number" value={doN} onChange={(e) => setDoN(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-ink-subtle">Knowledge: Sessions to Deliver</span>
            <input type="number" value={giveN} onChange={(e) => setGiveN(e.target.value)} className={inputCls} />
          </label>
        </div>
      </section>

      <div>
        <button
          type="button"
          onClick={save}
          disabled={pending || !sumOk}
          title={sumOk ? undefined : "Dimension weights must total 100%"}
          className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Configuration
        </button>
        {!sumOk && (
          <p className="mt-2 text-[12.5px] font-semibold text-rose-600">
            Dimension weights currently total {Math.round(sum)}%. Adjust them to 100% to save.
          </p>
        )}
      </div>
    </div>
  );
}
