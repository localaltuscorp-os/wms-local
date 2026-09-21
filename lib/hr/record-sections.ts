import { ONBOARDING_SECTIONS, parseRepeaterRows, type OnboardingFileRef } from "@/lib/dossier/onboarding-schema";
import { INTAKE_SECTIONS } from "@/lib/hr/candidate/intake-schema";
import type { HrFormResponse } from "@/lib/hr/forms/schema";

/**
 * The filled Onboarding and Candidate Intake forms as labelled sections.
 *
 * Shared by HR Record's Records card (app/(app)/hr/record/person-records.ts)
 * and the HR records export, which renders the same answers to PDF — moved out
 * of person-records.ts because a "use server" module may export only async
 * functions, and one set of labels for both keeps the screen and the PDF from
 * drifting apart.
 */

export interface RecordItem {
  label: string;
  value: string;
}

export interface RecordSection {
  title: string;
  items: RecordItem[];
}

/** Trimmed non-empty string, else "". */
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Build the grouped, answered-only sections for an onboarding submission. */
export function buildOnboardingSections(
  fields: Record<string, unknown>,
  files: Record<string, OnboardingFileRef>,
): RecordSection[] {
  const sections: RecordSection[] = [];
  for (const section of ONBOARDING_SECTIONS) {
    const items: RecordItem[] = [];
    for (const f of section.fields) {
      if (f.type === "file") {
        const ref = files[f.key];
        const val = ref
          ? clean(ref.fileName) || (ref.link ? "Link provided" : ref.path ? "File attached" : "")
          : "";
        if (val) items.push({ label: f.label, value: val });
        continue;
      }
      if (f.type === "repeater") {
        const rows = parseRepeaterRows(typeof fields[f.key] === "string" ? (fields[f.key] as string) : "");
        rows.forEach((row, i) => {
          const parts = (f.sub ?? [])
            .map((s) => clean(row?.[s.key]))
            .filter(Boolean);
          if (parts.length) items.push({ label: `${f.itemLabel ?? f.label} ${i + 1}`, value: parts.join(" · ") });
        });
        continue;
      }
      const val = clean(fields[f.key]);
      if (val) items.push({ label: f.label, value: val });
    }
    if (items.length) sections.push({ title: section.title, items });
  }
  return sections;
}

/** Distinct repeater-instance uids for a section, in first-seen order, derived
 *  from the data keys (`${sectionId}.${uid}.${field}`) so it's robust even when
 *  the stored `instances` map is missing. */
function repeaterUids(sectionId: string, data: Record<string, unknown>): string[] {
  const prefix = `${sectionId}.`;
  const uids: string[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(data)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const dot = rest.indexOf(".");
    if (dot <= 0) continue; // flat `${section}.${field}` — not a repeater row
    const uid = rest.slice(0, dot);
    if (!seen.has(uid)) { seen.add(uid); uids.push(uid); }
  }
  return uids;
}

/** Build the grouped, answered-only sections for a candidate intake record. */
export function buildCandidateSections(data: Record<string, unknown>): RecordSection[] {
  const sections: RecordSection[] = [];
  for (const section of INTAKE_SECTIONS) {
    if (section.repeat) {
      // One section per filled instance — reads cleanly in the collapsible UI.
      const uids = repeaterUids(section.id, data);
      let n = 0;
      for (const uid of uids) {
        const items: RecordItem[] = [];
        for (const f of section.fields) {
          const val = clean(data[`${section.id}.${uid}.${f.key}`]);
          if (val) items.push({ label: f.label, value: val });
        }
        if (items.length) {
          n += 1;
          sections.push({ title: `${section.title} · ${section.repeat.itemLabel} ${n}`, items });
        }
      }
      continue;
    }
    const items: RecordItem[] = [];
    for (const f of section.fields) {
      const val = clean(data[`${section.id}.${f.key}`]);
      if (val) items.push({ label: f.label, value: val });
    }
    if (items.length) sections.push({ title: section.title, items });
  }
  return sections;
}

/** Sections → the question/answer rows the HR form PDF renderer takes. */
export function sectionsToResponses(sections: RecordSection[]): HrFormResponse[] {
  return sections.flatMap((s) => s.items.map((i) => ({ group: s.title, question: i.label, answer: i.value })));
}
