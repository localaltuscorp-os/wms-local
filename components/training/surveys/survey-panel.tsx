"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { upsertSurvey, submitSurveyResponse, DEFAULT_SURVEY_QUESTIONS } from "@/app/(app)/training/surveys/actions";
import { StarRating } from "@/components/ui/star-rating";
import type { SurveyQuestion, QuestionAggregate } from "@/lib/queries/surveys";

const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-3 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

/** Trainer: author the survey. */
function AuthorForm({ sessionId, initial }: { sessionId: string; initial: string[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [questions, setQuestions] = React.useState<string[]>(initial.length ? initial : [...DEFAULT_SURVEY_QUESTIONS]);

  async function save() {
    setPending(true);
    const res = await upsertSurvey({
      sessionId,
      questions: questions.filter((q) => q.trim().length >= 2).map((prompt) => ({ prompt: prompt.trim() })),
    });
    setPending(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Survey saved.", type: "success" });
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {questions.map((q, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className={INPUT} value={q} maxLength={500} onChange={(e) => setQuestions((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" onClick={() => setQuestions((p) => p.filter((_, j) => j !== i))} className="text-ink-subtle hover:text-altus-red" aria-label="Remove question">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setQuestions((p) => [...p, ""])} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft">
        <Plus size={15} /> Add question
      </button>
      <button type="button" onClick={save} disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Save Survey
      </button>
    </div>
  );
}

/** Attendee: fill the anonymous survey. */
function FillForm({ surveyId, questions }: { surveyId: string; questions: SurveyQuestion[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [answers, setAnswers] = React.useState<Record<string, number | null>>({});
  const [comment, setComment] = React.useState("");

  async function submit() {
    setPending(true);
    const res = await submitSurveyResponse({
      surveyId,
      answers: questions.map((q) => ({ questionId: q.id, rating: answers[q.id] ?? null, comment })),
    });
    setPending(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Feedback submitted — anonymous.", type: "success" });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <p className="text-[13px] font-semibold text-ink-subtle">Your identity is never shown to the trainer.</p>
      {questions.map((q) => (
        <div key={q.id} className="rounded-xl border border-hairline bg-white px-4 py-3">
          <p className="mb-2 text-[14px] font-semibold text-ink-strong">{q.prompt}</p>
          <StarRating value={answers[q.id] ?? 0} onChange={(n) => setAnswers((p) => ({ ...p, [q.id]: n }))} label={q.prompt} />
        </div>
      ))}
      <textarea className={INPUT + " resize-y"} rows={2} maxLength={2000} placeholder="Optional written comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button type="button" onClick={submit} disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Submit Feedback
      </button>
    </div>
  );
}

export function SurveyPanel({
  sessionId,
  survey,
  aggregate,
  canManage,
  hasResponded,
}: {
  sessionId: string;
  survey: { id: string; title: string | null; questions: SurveyQuestion[] } | null;
  aggregate: { responses: number; questions: QuestionAggregate[] } | null;
  canManage: boolean;
  hasResponded: boolean;
}) {
  if (canManage) {
    return (
      <div className="grid gap-6">
        <AuthorForm sessionId={sessionId} initial={survey?.questions.map((q) => q.prompt) ?? []} />
        {aggregate && aggregate.responses > 0 && (
          <div className="grid gap-2">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink-soft">Aggregate · {aggregate.responses} responses</h3>
            {aggregate.questions.map((q) => (
              <div key={q.questionId} className="flex items-center justify-between rounded-lg bg-[rgba(15,23,42,0.03)] px-3 py-2 text-[13px]">
                <span className="font-semibold text-ink-soft">{q.prompt}</span>
                <span className="font-bold text-ink-strong">{q.average != null ? `${q.average} / 5` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!survey) return <p className="text-ink-subtle">No survey yet.</p>;
  if (hasResponded) return <p className="font-semibold text-ink-subtle">You have already given feedback. Thank you.</p>;
  return <FillForm surveyId={survey.id} questions={survey.questions} />;
}
