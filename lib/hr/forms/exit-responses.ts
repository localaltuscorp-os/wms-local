import {
  EXIT_TEXT_QUESTIONS,
  EXIT_CHOICE_QUESTIONS,
  EXIT_RATING_ASPECTS,
  EXIT_RATING_SCALE,
  EXIT_ENV_FEEDBACK,
  EXIT_INFRA_FEEDBACK,
  CLEARANCE_ROWS,
  HANDOVER_NOTES_LABEL,
} from "@/lib/hr/exit/content";
import type { ExitInterviewData, ExitHandoverData } from "@/lib/hr/exit/schema";
import type { HrFormResponse } from "./schema";

/**
 * Flatten the Exit forms' stored payloads into the index's uniform
 * question/answer shape.
 *
 * The point is that the SNAPSHOT CARRIES REAL QUESTION TEXT, not field keys.
 * `exit_records.data` stores `{ fields: { q1: "…" }, ratings: { compensation: 4 } }`
 * — meaningless on its own. Reading the prompts out of `lib/hr/exit/content.ts`
 * (the same module the form renders from) means a submission viewed a year later
 * still reads as the questionnaire the employee actually answered, even if the
 * wording has since changed in the product.
 *
 * PURE — no DB, no "use server". The recorder calls it on write; the PDF and
 * View renderers read the stored result, so there is one flattening rule.
 *
 * Unanswered questions are OMITTED rather than emitted blank: a filled form that
 * skipped six optional prompts should read as what was said, not as a wall of
 * empty rows.
 */

const RATING_LABEL = new Map(EXIT_RATING_SCALE.map((s) => [s.value, s.label]));

/** Trim and drop empties so a whitespace-only answer counts as unanswered. */
function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Exit Interview (Annexure B). Questions are emitted in their numbered order
 * (`n`), which interleaves the free-text and multiple-choice sets — that is the
 * order they appear on the form, and a PDF that reordered them would not match
 * the paper annexure it stands in for.
 */
export function exitInterviewResponses(data: ExitInterviewData): HrFormResponse[] {
  const fields = data.fields ?? {};
  const ratings = data.ratings ?? {};
  const out: HrFormResponse[] = [];

  // Identity header — captured on the form itself, so it travels with the answers.
  const header: [string, string][] = [
    ["Employee", clean(fields.header_employeeName)],
    ["Designation", clean(fields.header_designation)],
    ["Manager", clean(fields.header_managerName)],
  ];
  for (const [question, answer] of header) {
    if (answer) out.push({ group: "Details", question, answer });
  }

  // Numbered questionnaire — text and choice questions merged, then ordered by
  // the question number the form displays.
  type Numbered = { n: number; entries: HrFormResponse[] };
  const numbered: Numbered[] = [];

  for (const q of Object.values(EXIT_TEXT_QUESTIONS)) {
    const answer = clean(fields[q.id]);
    if (answer) {
      numbered.push({ n: q.n, entries: [{ group: "Questionnaire", question: `${q.n}. ${q.prompt}`, answer }] });
    }
  }

  for (const q of EXIT_CHOICE_QUESTIONS) {
    const answer = clean(fields[q.id]);
    const comment = clean(fields[`${q.id}_comments`]);
    if (!answer && !comment) continue;
    const entries: HrFormResponse[] = [];
    if (answer) entries.push({ group: "Questionnaire", question: `${q.n}. ${q.prompt}`, answer });
    // A comment without a selection still matters — keep it, labelled so it is
    // obviously the follow-up to its question rather than a stray note.
    if (comment) entries.push({ group: "Questionnaire", question: `${q.n}. Comments`, answer: comment });
    numbered.push({ n: q.n, entries });
  }

  numbered.sort((a, b) => a.n - b.n);
  for (const item of numbered) out.push(...item.entries);

  // Rating matrix — stored 1–5, rendered with the word the form showed, because
  // "4" alone tells a reader nothing about which end of the scale is good.
  for (const aspect of EXIT_RATING_ASPECTS) {
    const score = ratings[aspect.id];
    if (typeof score !== "number") continue;
    const label = RATING_LABEL.get(score);
    out.push({
      group: "Ratings",
      question: aspect.label,
      answer: label ? `${score}/5 · ${label}` : `${score}/5`,
    });
  }

  // The two open-ended prompts that close the form (numbered 11 and 12).
  for (const block of [EXIT_ENV_FEEDBACK, EXIT_INFRA_FEEDBACK]) {
    const answer = clean(fields[block.id]);
    if (answer) out.push({ group: "Feedback", question: `${block.n}. ${block.prompt}`, answer });
  }

  return out;
}

/**
 * Handover & Clearance Checklist (Annexure A). Grouped by the department that
 * owns each clearance line.
 *
 * Unticked items ARE emitted here, unlike the interview's skipped questions — on
 * a clearance checklist "not done" is the whole point of the document, and an
 * F&F team reading the PDF needs to see what is still outstanding, not a short
 * list of what happened to be finished.
 */
export function exitHandoverResponses(data: ExitHandoverData): HrFormResponse[] {
  const fields = data.fields ?? {};
  const checked = data.checked ?? {};
  const out: HrFormResponse[] = [];

  for (const row of CLEARANCE_ROWS) {
    for (const item of row.items) {
      out.push({
        group: row.department,
        question: item.label,
        answer: checked[item.id] ? "Cleared" : "Pending",
      });
    }
    // Each department signs its own block off.
    const name = clean(fields[`signoff_${row.id}_name`]);
    const date = clean(fields[`signoff_${row.id}_date`]);
    if (name) out.push({ group: row.department, question: "Signed off by", answer: name });
    if (date) out.push({ group: row.department, question: "Sign-off date", answer: date });
  }

  const notes = clean(fields.notes);
  if (notes) out.push({ group: "Notes", question: HANDOVER_NOTES_LABEL, answer: notes });

  return out;
}

/** Dispatch on the exit record's `kind`, so callers don't branch themselves. */
export function exitResponsesFor(
  kind: "interview" | "handover",
  data: ExitInterviewData | ExitHandoverData,
): HrFormResponse[] {
  return kind === "interview"
    ? exitInterviewResponses(data as ExitInterviewData)
    : exitHandoverResponses(data as ExitHandoverData);
}

/** The registry key each exit form records under. */
export function exitFormKey(kind: "interview" | "handover"): string {
  return kind === "interview" ? "exit-interview" : "exit-handover";
}
