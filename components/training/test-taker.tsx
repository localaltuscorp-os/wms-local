"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2, Check, X, ArrowLeft, RotateCcw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { submitAttempt } from "@/app/(app)/training/actions";
import type { TakingTest } from "@/lib/queries/training";

const FIELD = "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-3 text-[15px] font-medium text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

export function TestTaker({ test }: { test: TakingTest }) {
  const router = useRouter();
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ score: number; passed: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function setAnswer(qid: string, val: string) {
    setAnswers((a) => ({ ...a, [qid]: val }));
  }

  async function onSubmit() {
    setError(null);
    const unanswered = test.questions.filter((q) => !answers[q.id]?.trim());
    if (unanswered.length > 0) {
      setError(`Answer all ${test.questions.length} questions before submitting (${unanswered.length} left).`);
      return;
    }
    setSubmitting(true);
    const res = await submitAttempt({ testId: test.testId, answers });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult({ score: res.score, passed: res.passed });
    router.refresh();
  }

  if (result) {
    return (
      <div className="mx-auto max-w-[640px] rounded-section border border-hairline bg-surface-card p-8 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <div className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-full" style={{ background: result.passed ? "color-mix(in srgb, var(--color-green) 16%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 12%, transparent)" }}>
          {result.passed ? <Check size={32} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} /> : <X size={32} strokeWidth={2.6} style={{ color: "var(--color-altus-red-deep)" }} />}
        </div>
        <h2 className="font-bold text-ink-strong" style={{ fontSize: 24 }}>{result.passed ? "Passed" : "Not Passed"}</h2>
        <p className="mt-1 text-[16px] font-semibold" style={{ color: result.passed ? "var(--color-green-deep)" : "var(--color-altus-red-deep)" }}>You scored {result.score}% · pass mark {test.passMark}%</p>
        {!result.passed && <p className="mt-2 text-[14px] font-medium text-ink-muted">Your manager has been notified. Review the material and try again.</p>}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" onClick={() => router.push(`/training/${test.materialId}` as Route)} className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong hover:border-hairline-strong"><ArrowLeft size={16} /> Back to Material</button>
          <button type="button" onClick={() => { setResult(null); setAnswers({}); }} className="inline-flex items-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}><RotateCcw size={16} /> Retake</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[820px] flex flex-col gap-4">
      {test.questions.map((q, i) => (
        <div key={q.id} className="rounded-section border border-hairline bg-surface-card p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white tabular-nums" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>{i + 1}</span>
            <p className="text-[16px] font-semibold text-ink-strong" style={{ lineHeight: 1.4 }}>{q.prompt}</p>
          </div>
          {q.type === "mcq" ? (
            <div className="ml-10 flex flex-col gap-2">
              {q.options.map((opt, oi) => {
                const selected = answers[q.id] === String(oi);
                return (
                  <button key={oi} type="button" onClick={() => setAnswer(q.id, String(oi))} className="flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors" style={selected ? { borderColor: "var(--color-altus-red)", background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)" } : { borderColor: "var(--color-hairline-strong)", background: "#fff" }}>
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2" style={selected ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" } : { borderColor: "var(--color-hairline-strong)" }}>{selected && <Check size={12} strokeWidth={3} className="text-white" />}</span>
                    <span className="text-[15px] font-medium text-ink-strong">{opt}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ml-10">
              <input className={FIELD} value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} placeholder="Type your answer" />
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-[14px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-5">
        <button type="button" onClick={() => router.push(`/training/${test.materialId}` as Route)} className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-white px-5 py-3 text-[15px] font-bold text-ink-strong hover:border-hairline-strong"><ArrowLeft size={16} /> Cancel</button>
        <button type="button" onClick={onSubmit} disabled={submitting} className="inline-flex items-center gap-2 rounded-xl py-3 px-7 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}>
          {submitting ? <Loader2 size={17} className="animate-spin" /> : null} Submit Test
        </button>
      </div>
    </div>
  );
}
