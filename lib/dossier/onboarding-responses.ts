import {
  ONBOARDING_SECTIONS,
  parseRepeaterRows,
  type OnbField,
  type OnboardingFileRef,
} from "@/lib/dossier/onboarding-schema";
import type { HrFormResponse } from "@/lib/hr/forms/schema";

/**
 * Flatten a saved onboarding submission into the question/answer shape the HR
 * forms index stores (`hr_form_submissions.responses`).
 *
 * PURE — no DB, no I/O — so the shape the HR list, the PDF and the email all
 * render from is testable on its own.
 *
 * WHY IT EXISTS: every other registered form hands `recordHrFormSubmission` a
 * flat list of answered questions. Onboarding stores a `fields` map keyed by
 * field id plus a separate `files` map, so it needs the same normalisation the
 * exit forms do — labels instead of keys, section headings kept, and repeaters
 * expanded into one line per row.
 *
 * ONLY ANSWERED QUESTIONS travel. A blank field is not an answer, and padding
 * the index with empty rows would make every form look equally complete.
 */
export function onboardingResponses(
  fields: Record<string, string>,
  files: Record<string, OnboardingFileRef> = {},
): HrFormResponse[] {
  const out: HrFormResponse[] = [];

  for (const section of ONBOARDING_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === "file") {
        const ref = files[f.key];
        // A file counts as answered when SOMETHING is on file — an upload or a
        // pasted link. The index records that it exists, never the signed URL:
        // those expire, and this row long outlives them.
        const answer = ref?.fileName?.trim() || (ref?.link ? "Link provided" : "");
        if (answer) out.push({ question: f.label, answer, group: section.title });
        continue;
      }

      const raw = (fields[f.key] ?? "").trim();
      if (!raw) continue;

      if (f.type === "repeater") {
        for (const line of repeaterLines(f, raw)) {
          out.push({ question: f.label, answer: line, group: section.title });
        }
        continue;
      }

      out.push({ question: f.label, answer: raw, group: section.title });
    }
  }

  return out;
}

/**
 * One readable line per repeater row — "Label: value · Label: value".
 *
 * A repeater is stored as a JSON array of column maps. Rendering the raw JSON
 * into the index would be honest but unreadable, and every consumer (list, PDF,
 * email) would have to re-parse it.
 */
function repeaterLines(f: OnbField, raw: string): string[] {
  // `parseRepeaterRows` SWALLOWS a parse failure and returns [] rather than
  // throwing, so "unparseable" and "genuinely empty" arrive looking identical.
  // Both must fall back to the raw value: an answer the employee typed is never
  // dropped just because this renderer could not pretty-print it. A garbled line
  // is recoverable; a silently missing one is not.
  const rows = parseRepeaterRows(raw);

  const cols = f.sub ?? [];
  const lines = rows
    .map((row) =>
      cols
        .map((c) => {
          const v = (row[c.key] ?? "").trim();
          return v ? `${c.label}: ${v}` : "";
        })
        .filter(Boolean)
        .join(" · "),
    )
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines : [raw];
}
