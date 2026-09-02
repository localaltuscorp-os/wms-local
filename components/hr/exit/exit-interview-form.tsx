"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { useAutosave } from "@/components/hr/forms/use-autosave";
import { SaveIndicator } from "@/components/hr/forms/save-indicator";
import { saveExitRecord } from "@/app/(app)/hr/exit/exit-actions";
import {
  EXIT_TEXT_QUESTIONS,
  EXIT_CHOICE_QUESTIONS,
  EXIT_RATING_ASPECTS,
  EXIT_RATING_LEGEND,
  EXIT_ENV_FEEDBACK,
  EXIT_INFRA_FEEDBACK,
  EXIT_CONFIDENTIALITY_NOTE,
} from "@/lib/hr/exit/content";
import { FloatingInput, FloatingTextarea, ChipGroup, RatingMatrix, LabelValueGrid, EmployeeCombobox, AutoFillField } from "./exit-fields";
import { validateExitSubmission } from "@/lib/hr/exit/validate";
import { focusField, type PersistOutcome } from "./persist-outcome";
import type { ExitRosterEmployee } from "@/lib/hr/exit/schema";

type Fields = Record<string, string>;
type Ratings = Record<string, number>;

interface InitialData {
  fields?: Fields;
  ratings?: Ratings;
}

export function ExitInterviewForm({
  employeeId,
  employeeName,
  roster = [],
  onEmployeeChange,
  recordId,
  initial,
  initialStatus = "draft",
  onBack,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  /** Full roster powering the searchable Employee dropdown + auto-fill. */
  roster?: ExitRosterEmployee[];
  /** Switch the record to another employee (workspace re-loads their form). */
  onEmployeeChange?: (id: string) => void;
  recordId: string | null;
  initial?: InitialData;
  /** Whether this record was already SUBMITTED, read from the submissions index
   *  by `getExitRecord`. Without it, re-opening a filed interview showed "Draft
   *  saved" and a live Submit button over work HR had already received. */
  initialStatus?: "draft" | "submitted";
  onBack: () => void;
  onSaved?: (id: string) => void;
}) {
  const rosterEmp = roster.find((e) => e.id === employeeId) ?? null;
  const [fields, setFields] = React.useState<Fields>(() => {
    const seeded: Fields = { ...(initial?.fields ?? {}) };
    seeded.header_employeeName = seeded.header_employeeName || employeeName;
    // Auto-fill Manager / Designation from the roster only when not already saved.
    if (!seeded.header_designation) seeded.header_designation = rosterEmp?.designation ?? "";
    if (!seeded.header_managerName) seeded.header_managerName = rosterEmp?.managerName ?? "";
    return seeded;
  });
  const [ratings, setRatings] = React.useState<Ratings>(() => initial?.ratings ?? {});
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(initialStatus === "submitted");
  const idRef = React.useRef<string | null>(recordId);
  const stateRef = React.useRef({ fields, ratings });
  stateRef.current = { fields, ratings };

  const setF = React.useCallback((k: string, v: string) => {
    setFields((p) => ({ ...p, [k]: v }));
  }, []);
  const setR = React.useCallback((id: string, v: number) => {
    setRatings((p) => ({ ...p, [id]: v }));
  }, []);

  /**
   * `silent` suppresses only the SUCCESS toast (autosave shouldn't chatter).
   * Errors are always reported — a save that failed is never a quiet event.
   */
  const persist = React.useCallback(
    async (silent: boolean, status: "draft" | "submitted" = "draft"): Promise<PersistOutcome> => {
      const s = stateRef.current;
      const res = await saveExitRecord({
        id: idRef.current ?? undefined,
        employeeId,
        kind: "interview",
        data: { fields: s.fields, ratings: s.ratings },
        status,
      });
      if (res.ok) {
        idRef.current = res.id;

        // A submit fires its own, more specific confirmation.
        if (!silent && status !== "submitted") fireToast({ message: "Exit interview saved." });
        onSaved?.(res.id);
        return "ok";
      }
      if (!silent) fireToast({ message: res.error, type: "error" });
      return "failed";
    },
    [employeeId, onSaved],
  );

  /**
   * ONE autosave, shared with every other HR form. Replaces a bespoke 1400ms
   * interval that polled a hand-maintained dirty flag, never retried a failed
   * write and never told anyone it had failed.
   */
  const autosave = useAutosave({
    data: { fields, ratings },
    save: async () => {
      const outcome = await persist(true);
      return outcome === "ok" ? { ok: true } : { ok: false, error: "Could not save." };
    },
  });

  async function onSaveClick() {
    setSaving(true);
    try {
      // Through the hook, not around it: flush() waits out an in-flight autosave
      // and writes the LATEST state, so the button and the autosave are never two
      // competing writers of the same row.
      const ok = await autosave.flush();
      if (ok) fireToast({ message: "Draft saved." });
    } finally {
      setSaving(false);
    }
  }

  /**
   * Submit — the same write, stamped `submitted` so it leaves Drafts and lands
   * in My Filled Forms. Success is reported ONLY from the action's result, so
   * the confirmation can never run ahead of the database.
   *
   * Every path here ends in a message. This click used to be able to do nothing
   * at all: it ran with `silent`, so a server error was swallowed, and it gave
   * up immediately if an autosave held the lock — which, on a form that saves
   * every 1.4s while you type, is exactly when someone finishes the last field
   * and clicks Submit.
   */
  async function onSubmitClick() {
    const check = validateExitSubmission("interview", stateRef.current);
    if (!check.ok) {
      fireToast({ message: check.error, type: "error" });
      focusField(check.missing[0]);
      return;
    }

    setSubmitting(true);
    try {
      // Land any pending autosave FIRST, then submit once. The old retry budget
      // existed only to out-wait an autosave that could hold the lock; flush()
      // now does that deterministically, so Submit can no longer no-op.
      await autosave.flush();
      const outcome = await persist(false, "submitted");
      if (outcome === "ok") {
        setSubmitted(true);
        fireToast({ message: "Exit interview submitted." });
      }
      // "failed" already toasted the server's own reason inside persist.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ex-step mx-auto w-full max-w-[920px] px-6 pb-40 pt-8 max-md:px-4">
      {/* title + confidentiality note */}
      <div className="mb-6">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-muted">Annexure B</span>
        <h1
          className="mt-1 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.01em" }}
        >
          Director Exit Interview
        </h1>
        <p
          className="mt-3 rounded-xl px-4 py-3 text-[13.5px] leading-relaxed text-ink-strong"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 5%, #fff)",
            border: "1px solid color-mix(in srgb, var(--color-altus-red) 18%, #fff)",
          }}
        >
          <strong style={{ color: "var(--color-altus-red-deep)" }}>Confidentiality Note:</strong> {EXIT_CONFIDENTIALITY_NOTE}
        </p>
      </div>

      {/* identity recap — aligned label → value grid */}
      <div className="mb-6 rounded-2xl border border-hairline bg-white px-5 py-4 max-md:px-4">
        <LabelValueGrid
          rows={[
            { label: "Employee", value: fields.header_employeeName || employeeName },
            { label: "Designation", value: fields.header_designation },
            { label: "Manager", value: fields.header_managerName },
            { label: "Form", value: "Director Exit Interview · Annexure B" },
          ]}
        />
      </div>

      {/* header fields — searchable employee dropdown auto-fills Manager + Designation */}
      <div className="mb-4">
        <EmployeeCombobox
          label="Employee Name"
          roster={roster}
          value={employeeId}
          onChange={(id) => onEmployeeChange?.(id)}
          autoFocus
        />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <AutoFillField label="Designation" value={fields.header_designation ?? ""} onChange={(v) => setF("header_designation", v)} />
        <AutoFillField label="Manager Name" value={fields.header_managerName ?? ""} onChange={(v) => setF("header_managerName", v)} />
        <FloatingInput label="Date of Exit Interview" type="date" fieldKey="header_dateOfInterview" value={fields.header_dateOfInterview ?? ""} onChange={(v) => setF("header_dateOfInterview", v)} />
      </div>

      <div className="flex flex-col gap-7">
        {/* Q1 */}
        <Question n={EXIT_TEXT_QUESTIONS.q1!.n} prompt={EXIT_TEXT_QUESTIONS.q1!.prompt}>
          <FloatingTextarea label="Your Answer" value={fields.q1 ?? ""} onChange={(v) => setF("q1", v)} />
        </Question>

        {/* Q2–Q5, Q8 interleaved with the text questions in document order */}
        <ChoiceBlock q={EXIT_CHOICE_QUESTIONS[0]!} fields={fields} setF={setF} />
        <ChoiceBlock q={EXIT_CHOICE_QUESTIONS[1]!} fields={fields} setF={setF} />
        <ChoiceBlock q={EXIT_CHOICE_QUESTIONS[2]!} fields={fields} setF={setF} />
        <ChoiceBlock q={EXIT_CHOICE_QUESTIONS[3]!} fields={fields} setF={setF} />

        {/* Q6 */}
        <Question n={EXIT_TEXT_QUESTIONS.q6!.n} prompt={EXIT_TEXT_QUESTIONS.q6!.prompt}>
          <FloatingTextarea label="Your Answer" value={fields.q6 ?? ""} onChange={(v) => setF("q6", v)} />
        </Question>

        {/* Q7 */}
        <Question n={EXIT_TEXT_QUESTIONS.q7!.n} prompt={EXIT_TEXT_QUESTIONS.q7!.prompt}>
          <FloatingTextarea label="Your Answer" value={fields.q7 ?? ""} onChange={(v) => setF("q7", v)} />
        </Question>

        {/* Q8 */}
        <ChoiceBlock q={EXIT_CHOICE_QUESTIONS[4]!} fields={fields} setF={setF} />

        {/* Q9 */}
        <Question n={EXIT_TEXT_QUESTIONS.q9!.n} prompt={EXIT_TEXT_QUESTIONS.q9!.prompt}>
          <FloatingTextarea label="Your Answer" value={fields.q9 ?? ""} onChange={(v) => setF("q9", v)} />
        </Question>

        {/* About the Firm — standardized 5-point ratings + open feedback */}
        <SectionHeading title="About the Firm" hint="Rate each aspect on the 5-point scale, then add anything in your own words." />

        {/* Q10 — rating matrix (5-point: Poor → Excellent) */}
        <Question n={10} prompt="Please rate the following experience areas (Poor → Excellent).">
          <RatingMatrix aspects={EXIT_RATING_ASPECTS} legend={EXIT_RATING_LEGEND} values={ratings} onChange={setR} />
        </Question>

        {/* Q11 — open-ended work environment & culture (replaces de-duplicated ratings) */}
        <Question n={EXIT_ENV_FEEDBACK.n} prompt={EXIT_ENV_FEEDBACK.prompt}>
          <FloatingTextarea label={EXIT_ENV_FEEDBACK.label} value={fields[EXIT_ENV_FEEDBACK.id] ?? ""} onChange={(v) => setF(EXIT_ENV_FEEDBACK.id, v)} />
        </Question>

        {/* Q12 — infrastructure feedback (new) */}
        <Question n={EXIT_INFRA_FEEDBACK.n} prompt={EXIT_INFRA_FEEDBACK.prompt}>
          <FloatingTextarea label={EXIT_INFRA_FEEDBACK.label} value={fields[EXIT_INFRA_FEEDBACK.id] ?? ""} onChange={(v) => setF(EXIT_INFRA_FEEDBACK.id, v)} />
        </Question>
      </div>

      {/* signatures */}
      <div className="mt-10 rounded-2xl border border-hairline bg-white p-6 max-md:p-4">
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-muted">Sign-off</h2>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <FloatingInput label="Employee Signature (name)" fieldKey="sign_employeeName" value={fields.sign_employeeName ?? ""} onChange={(v) => setF("sign_employeeName", v)} />
          <FloatingInput label="Date" type="date" value={fields.sign_employeeDate ?? ""} onChange={(v) => setF("sign_employeeDate", v)} />
          <FloatingInput label="HR Representative Signature (name)" value={fields.sign_hrName ?? ""} onChange={(v) => setF("sign_hrName", v)} />
          <FloatingInput label="Date" type="date" value={fields.sign_hrDate ?? ""} onChange={(v) => setF("sign_hrDate", v)} />
        </div>
      </div>

      {/* sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-white/95 px-6 py-3.5 backdrop-blur max-md:px-4">
        <div className="mx-auto flex w-full max-w-[920px] items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong transition-colors hover:border-ink-soft"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="flex items-center gap-3">
            {/* Reports what the SERVER confirmed: "Submitted" only appears once
                the submit write came back ok. */}
            {submitted ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "#16a34a" }}>
                <Check size={13} strokeWidth={3} /> Submitted
              </span>
            ) : (
              <SaveIndicator
                state={autosave.state}
                savedAt={autosave.savedAt}
                error={autosave.error}
              />
            )}
            <button
              onClick={onSaveClick}
              disabled={saving || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-5 py-2.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saving ? "Saving…" : "Save Draft"}
            </button>
            {/* Already submitted: the record is filed and HR has been mailed, so
                there is nothing left for this button to do. Edits still save —
                the server keeps a submitted form submitted. */}
            <button
              onClick={onSubmitClick}
              disabled={saving || submitting || submitted}
              title={submitted ? "This interview has already been submitted." : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-6 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="h-px flex-none" style={{ width: 22, background: "var(--color-altus-red)" }} aria-hidden />
      <div>
        <h2 className="text-[15px] font-black uppercase tracking-[0.08em] text-ink-strong" style={{ color: "var(--color-altus-red-deep)" }}>
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[12.5px] text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}

function Question({ n, prompt, children }: { n: number; prompt: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex gap-2.5">
        <span
          className="grid h-6 w-6 flex-none place-items-center rounded-full text-[12px] font-black text-white"
          style={{ background: "var(--color-altus-red)" }}
        >
          {n}
        </span>
        <h3 className="text-[15.5px] font-bold leading-snug text-ink-strong">{prompt}</h3>
      </div>
      <div className="pl-[34px] max-md:pl-0">{children}</div>
    </section>
  );
}

function ChoiceBlock({
  q,
  fields,
  setF,
}: {
  q: { id: string; n: number; prompt: string; choices: string[]; comments?: boolean };
  fields: Fields;
  setF: (k: string, v: string) => void;
}) {
  return (
    <Question n={q.n} prompt={q.prompt}>
      <ChipGroup options={q.choices} value={fields[q.id] ?? ""} onChange={(v) => setF(q.id, v)} />
      {q.comments && (
        <div className="mt-3">
          <FloatingTextarea label="Comments" value={fields[`${q.id}_comments`] ?? ""} onChange={(v) => setF(`${q.id}_comments`, v)} rows={2} />
        </div>
      )}
    </Question>
  );
}
