"use client";

import * as React from "react";
import { Loader2, Save, ClipboardCheck, SlidersHorizontal, ChevronDown, RotateCcw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";
import { getCandidateEvaluation, saveCandidateEvaluation } from "@/app/(app)/hr/candidate-actions";
import { setEvaluationWeights } from "@/app/(app)/hr/eval-weights-actions";
import {
  EVAL_CATEGORIES,
  TOTAL_CRITERIA,
  ratedCount,
  type Ratings,
  type Score,
} from "@/lib/hr/candidate/evaluation-checklist";
import {
  weightedOverall,
  equalWeights,
  weightsTotal,
  type EvaluationWeights,
} from "@/lib/hr/candidate/evaluation-weights";
import { EvaluationChecklistBody } from "@/components/hr/candidate/evaluation-checklist-body";

const RED = "var(--color-altus-red)";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function CandidateEvaluationScreen({
  candidates,
  weights: initialWeights,
  canEditWeights = false,
}: {
  candidates: CandidateRow[];
  weights: EvaluationWeights;
  canEditWeights?: boolean;
}) {
  const [candidateId, setCandidateId] = React.useState("");
  const [ratings, setRatings] = React.useState<Ratings>({});
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  // The APPLIED weights that drive the weighted overall (updated after a save).
  const [weights, setWeights] = React.useState<EvaluationWeights>(initialWeights);

  async function selectCandidate(id: string) {
    setCandidateId(id);
    setRatings({});
    setDirty(false);
    if (!id) return;
    setLoading(true);
    try {
      setRatings(await getCandidateEvaluation(id));
    } finally {
      setLoading(false);
    }
  }

  function setRating(critId: string, v: number) {
    setRatings((p) => {
      const next = { ...p };
      if (v <= 0) delete next[critId];
      else next[critId] = v;
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!candidateId) {
      fireToast({ message: "Pick a candidate to save this evaluation.", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await saveCandidateEvaluation(candidateId, ratings);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setDirty(false);
      fireToast({ message: "Evaluation saved to the candidate's record." });
    } finally {
      setSaving(false);
    }
  }

  const reviewed = ratedCount(ratings);
  const pct = Math.round((reviewed / Math.max(TOTAL_CRITERIA, 1)) * 100);
  const overall = weightedOverall(ratings, weights);

  return (
    <>
      <div className="mb-6">
        <span
          className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
          style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}
        >
          <ClipboardCheck size={13} strokeWidth={2.6} /> Pre-Interview · Evaluation
        </span>
        <h1
          className="mt-2 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
        >
          Candidate Evaluation Checklist
        </h1>
        <p className="mt-1.5 max-w-[74ch] text-[15px] font-medium text-ink-muted">
          Rate each criterion out of 10 as you speak with the candidate — section scores, the overall score and the Quick Summary fill in automatically.
        </p>
      </div>

      {/* Control bar: candidate picker + live progress + overall score + save */}
      <div className="sticky top-[64px] z-10 mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-white/95 p-4 backdrop-blur">
        <select
          value={candidateId}
          onChange={(e) => selectCandidate(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14px] font-medium text-ink-strong outline-none focus:border-altus-red"
        >
          <option value="">— Select candidate —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName || "Unnamed"}{c.positionApplied ? ` · ${c.positionApplied}` : ""}
            </option>
          ))}
        </select>

        <div className="min-w-[200px] flex-1">
          <div className="flex items-center justify-between text-[13px] font-semibold text-ink-strong">
            <span>Progress</span>
            <span className="tabular-nums" style={{ color: "var(--color-altus-red-deep)" }}>{reviewed} / {TOTAL_CRITERIA} rated</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${RED}, var(--color-altus-red-deep))`, transition: "width 0.35s cubic-bezier(0.22,1,0.36,1)" }} />
          </div>
        </div>

        <ScorePill label="Overall" score={overall} big />

        <button
          type="button"
          onClick={save}
          disabled={saving || !candidateId}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-5 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {dirty ? "Save" : "Saved"}
        </button>
      </div>

      {canEditWeights && (
        <SectionWeightsEditor weights={weights} onApplied={setWeights} />
      )}

      {loading && <p className="mb-4 text-[13.5px] text-ink-muted">Loading this candidate's evaluation…</p>}

      <EvaluationChecklistBody ratings={ratings} onRate={setRating} weights={weights} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION WEIGHTS EDITOR — super-admin only
// ─────────────────────────────────────────────────────────────────────────────

function SectionWeightsEditor({
  weights,
  onApplied,
}: {
  weights: EvaluationWeights;
  onApplied: (w: EvaluationWeights) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<EvaluationWeights>(weights);
  const [saving, setSaving] = React.useState(false);

  // Keep the draft in sync when the applied weights change (e.g. after a save).
  React.useEffect(() => { setDraft(weights); }, [weights]);

  const total = weightsTotal(draft);
  const valid = Math.round(total * 100) / 100 === 100;
  const dirty = EVAL_CATEGORIES.some((c) => (Number(draft[c.id]) || 0) !== (Number(weights[c.id]) || 0));

  function setOne(id: string, raw: string) {
    const n = raw === "" ? 0 : Number(raw);
    setDraft((p) => ({ ...p, [id]: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0 }));
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const payload: EvaluationWeights = {};
      for (const c of EVAL_CATEGORIES) payload[c.id] = Number(draft[c.id]) || 0;
      const res = await setEvaluationWeights(payload);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      onApplied(payload);
      fireToast({ message: "Section weights saved — the overall score is now weighted." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-hairline bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#E10600,#A80400)" }}>
            <SlidersHorizontal size={16} />
          </span>
          <span>
            <span className="block text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>Section Weights</span>
            <span className="block text-[12.5px] font-medium text-ink-muted">Super-admin · set how much each section counts toward the overall (must total 100).</span>
          </span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-ink-muted transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div className="border-t border-hairline px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-sm:grid-cols-1">
            {EVAL_CATEGORIES.map((cat, i) => (
              <label key={cat.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: RED }}>{i + 1}</span>
                  <span className="truncate">{cat.title}</span>
                </span>
                <span className="relative shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={String(Number(draft[cat.id]) || 0)}
                    onChange={(e) => setOne(cat.id, e.target.value)}
                    className="w-[92px] rounded-lg border border-hairline-strong bg-white px-3 py-2 pr-7 text-right text-[14px] font-bold tabular-nums text-ink-strong outline-none focus:border-altus-red"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-ink-subtle">%</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold tabular-nums"
                style={valid
                  ? { background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }
                  : { background: "color-mix(in srgb, var(--color-altus-red) 12%, white)", color: "var(--color-altus-red-deep)" }}
              >
                <span className="text-[10.5px] uppercase tracking-wide opacity-80">Total</span>
                {Number.isInteger(total) ? total : total.toFixed(1)} / 100
              </span>
              {!valid && (
                <span className="text-[12.5px] font-semibold text-altus-red">
                  Must total exactly 100 — {total < 100 ? `add ${(100 - total).toFixed(total % 1 ? 1 : 0)}` : `remove ${(total - 100).toFixed(total % 1 ? 1 : 0)}`}.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(equalWeights())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                <RotateCcw size={14} /> Reset to equal
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!valid || !dirty || saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save weights
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, score, big }: { label: string; score: Score; big?: boolean }) {
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold tabular-nums ${big ? "text-[14px]" : "text-[13px]"}`}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="text-[10.5px] uppercase tracking-wide opacity-80">{label}</span>
      {rated ? `${fmt(score.avg)} / 10` : "— / 10"}
    </span>
  );
}
