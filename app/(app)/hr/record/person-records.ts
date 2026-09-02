"use server";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, onboardingSubmissions } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { resolvePersonEmployee } from "./resolve-person";
import {
  ONBOARDING_SECTIONS,
  parseRepeaterRows,
  type OnboardingFileRef,
} from "@/lib/dossier/onboarding-schema";
import { INTAKE_SECTIONS } from "@/lib/hr/candidate/intake-schema";

/**
 * Read-only "Records" loader for the HR Record hub.
 *
 * For a selected person (an `employees.id`) this surfaces their ALREADY-FILLED
 * details from two self-service forms so HR can read them in one place:
 *   • Onboarding Form  — the joining-data form (`onboarding_submissions`, keyed by
 *                        employee_id). Answers live in `fields`; attachments in
 *                        `files`. Rendered with the human labels + section
 *                        grouping from ONBOARDING_SECTIONS (answered fields only).
 *   • Candidate Record — the walk-in interview intake (`candidate_intake`),
 *                        matched to the employee BY EMAIL (login or personal,
 *                        case-insensitive). Answers live in `data`, keyed
 *                        `${sectionId}.${field}` (flat) or
 *                        `${sectionId}.${uid}.${field}` (repeater rows). Rendered
 *                        with the labels from INTAKE_SECTIONS.
 *
 * HR-gated, read-only, query-light (a couple of indexed lookups). On any auth
 * failure / error it degrades to `{ onboarding: null, candidate: null }` so the
 * card simply shows its "fill it" empty states.
 */

export interface RecordItem {
  label: string;
  value: string;
}

export interface RecordSection {
  title: string;
  items: RecordItem[];
}

export interface OnboardingRecord {
  status: string; // 'draft' | 'submitted'
  submittedAt: string | null;
  sections: RecordSection[];
}

export interface CandidateRecord {
  id: string;
  status: string; // 'new' | 'shortlisted' | 'rejected' | 'hired'
  submittedAt: string | null;
  sections: RecordSection[];
}

export interface PersonRecords {
  onboarding: OnboardingRecord | null;
  candidate: CandidateRecord | null;
}

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const EMPTY: PersonRecords = { onboarding: null, candidate: null };

/** Trimmed non-empty string, else "". */
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Build the grouped, answered-only sections for an onboarding submission. */
function buildOnboardingSections(
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
function buildCandidateSections(data: Record<string, unknown>): RecordSection[] {
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

export async function getPersonRecords(employeeId: string): Promise<PersonRecords> {
  try {
    await requireHrStaff();
  } catch {
    return EMPTY;
  }
  if (!isUuid(employeeId)) return EMPTY;

  try {
    const emp = await resolvePersonEmployee(employeeId);
    if (!emp) return EMPTY;

    // ── Onboarding submission (by employee_id) ──
    const [sub] = await db
      .select({
        fields: onboardingSubmissions.fields,
        files: onboardingSubmissions.files,
        status: onboardingSubmissions.status,
        submittedAt: onboardingSubmissions.submittedAt,
      })
      .from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.employeeId, emp.id))
      .limit(1);

    let onboarding: OnboardingRecord | null = null;
    if (sub) {
      onboarding = {
        status: sub.status,
        submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
        sections: buildOnboardingSections(
          (sub.fields as Record<string, unknown>) ?? {},
          (sub.files as Record<string, OnboardingFileRef>) ?? {},
        ),
      };
    }

    // ── Candidate intake (by email — login OR personal, case-insensitive) ──
    const emails = [emp.email, emp.personalEmail]
      .map((e) => clean(e).toLowerCase())
      .filter((e): e is string => e.length > 0);
    let candidate: CandidateRecord | null = null;
    if (emails.length) {
      const [cand] = await db
        .select({
          id: candidateIntake.id,
          data: candidateIntake.data,
          status: candidateIntake.status,
          submittedAt: candidateIntake.submittedAt,
        })
        .from(candidateIntake)
        .where(inArray(sql`lower(${candidateIntake.email})`, emails))
        // Prefer a submitted, most-recent record.
        .orderBy(desc(candidateIntake.submittedAt), desc(candidateIntake.createdAt))
        .limit(1);
      if (cand) {
        candidate = {
          id: cand.id,
          status: cand.status,
          submittedAt: cand.submittedAt ? cand.submittedAt.toISOString() : null,
          sections: buildCandidateSections((cand.data as Record<string, unknown>) ?? {}),
        };
      }
    }

    return { onboarding, candidate };
  } catch {
    return EMPTY;
  }
}
