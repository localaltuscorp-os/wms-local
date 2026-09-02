"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Save, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { saveTest } from "@/app/(app)/training/actions";
import type { AuthoringQuestion } from "@/lib/queries/training";

const FIELD = "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

interface EditQ {
  prompt: string;
  options: string[]; // mcq
  correctIndex: number; // mcq
  answers: string; // fill_blank — newline-separated acceptable answers
  marks: number;
}

function fromAuthoring(q: AuthoringQuestion): EditQ {
  if (q.type === "mcq") {
    return { prompt: q.prompt, options: q.options.length ? q.options : ["", ""], correctIndex: Number(q.correctAnswers[0] ?? 0) || 0, answers: "", marks: q.marks };
  }
  return { prompt: q.prompt, options: ["", ""], correctIndex: 0, answers: q.correctAnswers.join("\n"), marks: q.marks };
}

export function TestAuthor({
  materialId,
  kind,
  passMark,
  initialQuestions,
}: {
  materialId: string;
  kind: 1 | 2;
  passMark: number;
  initialQuestions: AuthoringQuestion[];
}) {
  const router = useRouter();
  const isMcq = kind === 1;
  const [questions, setQuestions] = React.useState<EditQ[]>(
    initialQuestions.length
      ? initialQuestions.map(fromAuthoring)
      : [isMcq ? { prompt: "", options: ["", ""], correctIndex: 0, answers: "", marks: 1 } : { prompt: "", options: [], correctIndex: 0, answers: "", marks: 1 }],
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function update(i: number, patch: Partial<EditQ>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }
  function addQ() {
    setQuestions((qs) => [...qs, isMcq ? { prompt: "", options: ["", ""], correctIndex: 0, answers: "", marks: 1 } : { prompt: "", options: [], correctIndex: 0, answers: "", marks: 1 }]);
  }
  function removeQ(i: number) {
    setQuestions((qs) => (qs.length > 1 ? qs.filter((_, j) => j !== i) : qs));
  }

  async function onSave() {
    setError(null);
    const payloadQuestions = questions.map((q) => {
      if (isMcq) {
        const opts = q.options.map((o) => o.trim()).filter(Boolean);
        return { type: "mcq" as const, prompt: q.prompt.trim(), options: opts, correctAnswers: [String(q.correctIndex)], marks: q.marks };
      }
      const answers = q.answers.split("\n").map((a) => a.trim()).filter(Boolean);
      return { type: "fill_blank" as const, prompt: q.prompt.trim(), options: [], correctAnswers: answers, marks: q.marks };
    });
    // client-side validation
    for (const q of payloadQuestions) {
      if (!q.prompt) return setError("Every question needs text.");
      if (q.type === "mcq" && q.options.length < 2) return setError("MCQ questions need at least 2 options.");
      if (q.type === "mcq" && (Number(q.correctAnswers[0]) >= q.options.length)) return setError("Pick a valid correct option for each MCQ.");
      if (q.type === "fill_blank" && q.correctAnswers.length === 0) return setError("Fill-blank questions need at least one acceptable answer.");
    }
    setSaving(true);
    const res = await saveTest({ materialId, kind, questions: payloadQuestions });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    fireToast({ message: `Test ${kind} saved.`, type: "success" });
    router.refresh();
  }

  return (
    <section className="rounded-section border border-hairline bg-surface-card p-6 max-md:p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-ink-strong" style={{ fontSize: 18 }}>Test {kind} · {isMcq ? "MCQ" : "Fill in the Blank"}</h2>
          <p className="text-[13px] font-medium text-ink-subtle">Pass mark {passMark}%. {isMcq ? "Pick the one correct option." : "Type all acceptable answers (one per line); matching is case-insensitive."}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <div key={i} className="rounded-xl border border-hairline bg-surface-soft p-4">
            <div className="mb-2.5 flex items-start gap-2">
              <span className="mt-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white tabular-nums" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>{i + 1}</span>
              <textarea className={FIELD + " min-h-[48px] resize-y"} value={q.prompt} maxLength={2000} onChange={(e) => update(i, { prompt: e.target.value })} placeholder="Question prompt" />
              <button type="button" onClick={() => removeQ(i)} aria-label="Remove question" className="mt-1.5 text-ink-subtle hover:text-altus-red"><Trash2 size={16} /></button>
            </div>

            {isMcq ? (
              <div className="ml-8 flex flex-col gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button type="button" onClick={() => update(i, { correctIndex: oi })} aria-label="Mark correct" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors" style={q.correctIndex === oi ? { background: "var(--color-green)", borderColor: "var(--color-green)" } : { borderColor: "var(--color-hairline-strong)" }}>
                      {q.correctIndex === oi && <Check size={13} strokeWidth={3} className="text-white" />}
                    </button>
                    <input className={FIELD} value={opt} maxLength={500} onChange={(e) => update(i, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })} placeholder={`Option ${oi + 1}`} />
                    {q.options.length > 2 && <button type="button" onClick={() => update(i, { options: q.options.filter((_, j) => j !== oi), correctIndex: Math.min(q.correctIndex, q.options.length - 2) })} className="text-ink-subtle hover:text-altus-red"><Trash2 size={14} /></button>}
                  </div>
                ))}
                <button type="button" onClick={() => update(i, { options: [...q.options, ""] })} className="inline-flex w-fit items-center gap-1.5 text-[13px] font-bold text-altus-red"><Plus size={14} /> Add Option</button>
              </div>
            ) : (
              <div className="ml-8">
                <textarea className={FIELD + " min-h-[64px] resize-y"} value={q.answers} onChange={(e) => update(i, { answers: e.target.value })} placeholder={"Acceptable answers, one per line"} />
              </div>
            )}

            <div className="ml-8 mt-2 flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase text-ink-subtle">Marks</span>
              <input type="number" min={1} max={100} className="w-20 rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-[14px] font-semibold text-ink-strong outline-none" value={q.marks} onChange={(e) => update(i, { marks: Math.max(1, parseInt(e.target.value) || 1) })} />
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addQ} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-strong hover:border-altus-red"><Plus size={16} /> Add Question</button>

      {error && <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>{error}</p>}

      <div className="mt-5 border-t border-hairline pt-4">
        <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl py-2.5 px-6 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} strokeWidth={2.4} />} Save Test {kind}
        </button>
      </div>
    </section>
  );
}
