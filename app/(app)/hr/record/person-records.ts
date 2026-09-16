"use server";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, onboardingSubmissions } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { resolvePersonEmployee } from "./resolve-person";
import type { OnboardingFileRef } from "@/lib/dossier/onboarding-schema";
import { buildCandidateSections, buildOnboardingSections, type RecordSection } from "@/lib/hr/record-sections";

export type { RecordItem, RecordSection } from "@/lib/hr/record-sections";

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
 * The section builders live in lib/hr/record-sections.ts, shared with the HR
 * records export so the PDF and this card read the same labels.
 *
 * HR-gated, read-only, query-light (a couple of indexed lookups). On any auth
 * failure / error it degrades to `{ onboarding: null, candidate: null }` so the
 * card simply shows its "fill it" empty states.
 */

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
