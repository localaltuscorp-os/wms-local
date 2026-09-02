import { INTAKE_SECTIONS } from "@/lib/hr/candidate/intake-schema";
import type { HrFormResponse } from "@/lib/hr/forms/schema";

/**
 * Flatten a saved Candidate Intake row into the question/answer shape the HR
 * forms index stores (`hr_form_submissions.responses`).
 *
 * PURE — no DB, no I/O — so the shape the HR list, the PDF and the email all
 * render from is testable on its own. The direct counterpart of
 * `lib/dossier/onboarding-responses.ts`, and deliberately the same shape: every
 * registered form hands `recordHrFormSubmission` a flat list of answered
 * questions so that View, PDF and Email need ONE renderer between them rather
 * than one per form.
 *
 * ── KEY SHAPES ─────────────────────────────────────────────────────────────
 * The wizard stores a flat map keyed by `sectionId.fieldKey`, and for a REPEATER
 * section by `sectionId.instanceUid.fieldKey` — where the uids come from the
 * row's own `instances` map, not from a counter. They are not sequential and not
 * guessable (a resumed draft carries uids like `u100000` alongside seeded `i0`),
 * so the instance list has to be read rather than reconstructed.
 *
 * ONLY ANSWERED QUESTIONS travel. A blank field is not an answer, and padding
 * the index with empty rows would make every form look equally complete.
 */
export function intakeResponses(
  values: Record<string, string> | null | undefined,
  instances?: Record<string, string[]> | null,
): HrFormResponse[] {
  const v = values ?? {};
  const inst = instances ?? {};
  const out: HrFormResponse[] = [];

  const push = (question: string, raw: unknown, group: string) => {
    const answer = String(raw ?? "").trim();
    if (!answer) return;
    out.push({ question, answer, group });
  };

  for (const section of INTAKE_SECTIONS) {
    if (section.repeat) {
      const uids = inst[section.id] ?? [];
      uids.forEach((uid, i) => {
        // The heading carries the ordinal so two employers or two degrees stay
        // distinguishable once the uid itself is gone from the rendered output.
        const group = `${section.title} — ${section.repeat?.itemLabel ?? "Item"} ${i + 1}`;
        for (const f of section.fields) {
          push(f.label, v[`${section.id}.${uid}.${f.key}`], group);
        }
      });
      continue;
    }
    for (const f of section.fields) {
      push(f.label, v[`${section.id}.${f.key}`], section.title);
    }
  }

  return out;
}
