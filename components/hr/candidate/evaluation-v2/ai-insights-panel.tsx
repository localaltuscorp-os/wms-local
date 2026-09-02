"use client";

import * as React from "react";
import { Sparkles, Loader2, Cpu, PencilLine, RefreshCw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { EvaluatorRole, InterviewAiInsights } from "@/lib/hr/candidate/evaluation-v2";
// The insights server action is built in parallel (other agent). Written against
// its published signature; see interview-insights-actions.ts.
import { generateInterviewInsights } from "@/app/(app)/hr/interview-insights-actions";
import { formatDate } from "@/lib/format";
import type { EvalController } from "./controller";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

/** Which insight fields are single strings vs string-lists (one item per line). */
const STRING_FIELDS: { key: keyof InterviewAiInsights; label: string; full?: boolean }[] = [
  { key: "summary", label: "Summary", full: true },
  { key: "behavioural", label: "Behavioural Read" },
  { key: "technical", label: "Technical Read" },
  { key: "learningPotential", label: "Learning Potential" },
  { key: "leadershipPotential", label: "Leadership Potential" },
  { key: "cultureMatch", label: "Culture Match" },
  { key: "roleSuitability", label: "Role Suitability" },
  { key: "recommendedDepartment", label: "Recommended Department" },
  { key: "salaryRange", label: "Salary Range" },
  { key: "nextRound", label: "Next Round" },
];
const LIST_FIELDS: { key: keyof InterviewAiInsights; label: string }[] = [
  { key: "strengths", label: "Strengths" },
  { key: "concerns", label: "Concerns" },
  { key: "trainingSuggestions", label: "Training Suggestions" },
  { key: "nextRoundQuestions", label: "Next-Round Questions" },
  { key: "riskFactors", label: "Risk Factors" },
];

/**
 * AI Insights — generates (via the interview-insights server action) a structured
 * read of the candidate, then renders every field as an EDITABLE control. Any edit
 * stamps `edited=true` and persists into instance.aiInsights via the controller.
 * Shows a provenance badge (AI vs heuristic).
 */
export function AiInsightsPanel({
  ctrl,
  candidateId,
  role,
}: {
  ctrl: EvalController;
  candidateId: string;
  /** Which evaluator instance to summarise (interviewer / management). */
  role: EvaluatorRole;
}) {
  const insights = ctrl.instance.aiInsights ?? null;
  const [loading, setLoading] = React.useState(false);

  const patchField = React.useCallback(
    (key: keyof InterviewAiInsights, value: string | string[]) => {
      const cur = ctrl.instance.aiInsights;
      if (!cur) return;
      ctrl.setAiInsights({ ...cur, [key]: value, edited: true });
    },
    [ctrl],
  );

  const generate = React.useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    try {
      const res = await generateInterviewInsights(candidateId, role);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      ctrl.setAiInsights(res.insights);
    } catch {
      fireToast({ message: "Couldn't generate insights — please try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [candidateId, role, ctrl]);

  return (
    <div
      className="rounded-2xl border p-5 max-sm:p-4"
      style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, white)", background: "color-mix(in srgb, var(--color-altus-red) 3%, white)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          <Sparkles size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
            AI Insights
          </h3>
          <p className="text-[12.5px] font-medium text-ink-muted">
            A structured read of the interview — generate, then refine any field before you save.
          </p>
        </div>
        {insights && <SourceBadge source={insights.source} edited={insights.edited} />}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading || !candidateId}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-[12.5px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : insights ? <RefreshCw size={14} /> : <Sparkles size={14} />}
          {loading ? "Generating…" : insights ? "Regenerate" : "Generate insights"}
        </button>
      </div>

      {!insights ? (
        <div className="mt-4 grid place-items-center rounded-xl border border-solid border-hairline-strong bg-white px-6 py-10 text-center">
          <Cpu size={26} strokeWidth={1.8} style={{ color: RED_DEEP }} />
          <p className="mt-2 max-w-[46ch] text-[13px] font-medium text-ink-muted">
            Generate an AI read of the ratings and notes. Every field stays fully editable — the model drafts, you decide.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {STRING_FIELDS.map((f) => (
              <div key={String(f.key)} className={f.full ? "sm:col-span-2" : ""}>
                <InsightTextarea
                  label={f.label}
                  value={(insights[f.key] as string) ?? ""}
                  onChange={(v) => patchField(f.key, v)}
                  rows={f.full ? 3 : 2}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIST_FIELDS.map((f) => (
              <InsightListEditor
                key={String(f.key)}
                label={f.label}
                value={(insights[f.key] as string[]) ?? []}
                onChange={(v) => patchField(f.key, v)}
              />
            ))}
          </div>
          <p className="text-[11.5px] font-medium text-ink-subtle">
            Generated {formatDate(insights.generatedAt)}, {new Date(insights.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Lists take one item per line.
          </p>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source, edited }: { source: "ai" | "heuristic"; edited?: boolean }) {
  const isAi = source === "ai";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.08em]"
        style={
          isAi
            ? { background: "color-mix(in srgb, #2563eb 12%, white)", color: "#1d4ed8" }
            : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", border: "1px solid var(--color-hairline)" }
        }
        title={isAi ? "Drafted by the AI model" : "Drafted from a heuristic fallback"}
      >
        {isAi ? <Cpu size={11} /> : <PencilLine size={11} />} {isAi ? "AI" : "Heuristic"}
      </span>
      {edited && (
        <span
          className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[10.5px] font-black uppercase tracking-[0.08em]"
          style={{ background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }}
          title="Edited by a human"
        >
          <PencilLine size={11} /> Edited
        </span>
      )}
    </span>
  );
}

/** Grow a textarea to fit ALL its content (Sir: AI insights were clipped in
 *  fixed-height boxes). Re-measures whenever the value changes. */
function useAutoGrow(value: string) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return ref;
}

function InsightTextarea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  const id = React.useId();
  const ref = useAutoGrow(value);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(rows, 2)}
        maxLength={4000}
        className="w-full overflow-hidden rounded-xl border px-3 py-2 text-[13.5px] leading-relaxed text-ink-strong outline-none transition-colors focus:border-altus-red"
        style={{ resize: "none", borderColor: "var(--color-hairline-strong)", background: "#fff" }}
      />
    </div>
  );
}

function InsightListEditor({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const id = React.useId();
  const [text, setText] = React.useState(value.join("\n"));
  const ref = useAutoGrow(text);
  // Keep the local text in sync when a fresh blob arrives (generate/regenerate).
  React.useEffect(() => {
    setText(value.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join("")]);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean));
        }}
        rows={2}
        maxLength={4000}
        placeholder="One item per line…"
        className="w-full overflow-hidden rounded-xl border px-3 py-2 text-[13.5px] leading-relaxed text-ink-strong outline-none transition-colors focus:border-altus-red"
        style={{ resize: "none", borderColor: "var(--color-hairline-strong)", background: "#fff" }}
      />
    </div>
  );
}
