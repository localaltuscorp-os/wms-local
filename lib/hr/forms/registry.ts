/**
 * The HR forms catalogue — which forms feed the submissions index, what they're
 * called, and which lifecycle stage they belong to.
 *
 * PURE by design: no icons, no `server-only`, no DB. The list surfaces (client)
 * and the recorder (server) both import it, and pulling `lib/hr/lifecycle.ts` in
 * as a VALUE would drag lucide icon components into client bundles for nothing.
 * The `import type` below is fully erased at compile time, so it buys the pin
 * without the payload.
 *
 * Each entry describes a form that ALREADY EXISTS and already owns its own
 * table. Registering it here does not change how it saves — it only teaches the
 * index what to call it and where to send someone who clicks through.
 */

import type { HrStageKey } from "@/lib/hr/lifecycle";

/**
 * HR lifecycle stage keys, in lifecycle order.
 *
 * PINNED to `HrStageKey` in lib/hr/lifecycle.ts, in both directions: `satisfies`
 * catches a key renamed or removed there, and `Record<HrStageKey, string>` on the
 * labels below catches one added. The list is duplicated here on purpose (this
 * module stays pure), but the duplication is now checked by the compiler rather
 * than by a comment promising a test that never existed.
 */
export const HR_SECTIONS = [
  "pre-interview",
  "post-interview",
  "pre-joining",
  "during",
  "appraisal",
  "exit",
] as const satisfies readonly HrStageKey[];

export type HrSectionKey = HrStageKey;

export const HR_SECTION_LABEL: Record<HrSectionKey, string> = {
  "pre-interview": "Pre-Interview",
  "post-interview": "Post-Interview",
  "pre-joining": "Post-Appointment",
  during: "During Employment",
  appraisal: "Appraisal",
  exit: "Exit",
};

/**
 * WHOSE form it is. Candidate-stage forms are filled before the person is an
 * employee and are keyed to `candidate_intake` instead; see migration 0203 and
 * the subject CHECK on hr_form_submissions. Getting this wrong is not a cosmetic
 * error — the recorder picks which unique index arbitrates the upsert from it,
 * so a mislabelled form silently loses its de-duplication.
 */
export type HrFormSubject = "employee" | "candidate";

export interface HrFormDef {
  /** Stable id stored on every submission row. Never change one in place. */
  key: string;
  /** Display name, snapshotted onto each submission at save time. */
  name: string;
  section: HrSectionKey;
  /** Where "open the form" goes. The form keeps its own page and behaviour. */
  href: string;
  /** The table that actually owns this form's data — documentation for readers
   *  chasing a row back to its source, and what `sourceTable` is set to. */
  sourceTable: string;
  /** Employee-subject unless stated. See {@link HrFormSubject}. */
  subject: HrFormSubject;
}

/**
 * The registered forms. Adding one here does NOT make it record submissions —
 * its save action has to call `recordHrFormSubmission`. Keeping the two steps
 * separate means a form can be listed as "known" before it's wired, instead of
 * silently producing rows nobody renders.
 */
export const HR_FORMS: HrFormDef[] = [
  {
    // The joining-data intake every employee fills. It was missing from this
    // list, so `submitOnboarding` had nothing to index against and a submitted
    // onboarding form never reached My/All Filled Forms — the HR module read it
    // as "not filled" however many times the employee had actually sent it.
    key: "onboarding",
    name: "Employee Onboarding Form",
    section: "pre-joining",
    href: "/dossier/onboarding",
    sourceTable: "onboarding_submissions",
    subject: "employee",
  },
  {
    // Filled before there is an employee record at all — hence subject
    // "candidate" and the 0203 schema change that made that expressible.
    key: "candidate-intake",
    name: "Candidate Intake Form",
    section: "pre-interview",
    href: "/hr/intake",
    sourceTable: "candidate_intake",
    subject: "candidate",
  },
  {
    key: "candidate-evaluation-v2",
    name: "Candidate Evaluation",
    section: "post-interview",
    href: "/hr/evaluation",
    sourceTable: "candidate_intake",
    subject: "candidate",
  },
  {
    key: "management-assessment",
    name: "Management Assessment",
    section: "post-interview",
    href: "/hr/management-assessment",
    sourceTable: "candidate_intake",
    subject: "candidate",
  },
  {
    key: "kpi-assignment",
    name: "KPI Assignment",
    section: "during",
    href: "/hr/kpi",
    sourceTable: "kpi_assignments",
    subject: "employee",
  },
  {
    key: "ctc-breakup",
    name: "CTC / Compensation",
    section: "pre-joining",
    href: "/hr/ctc",
    sourceTable: "ctc_breakups",
    subject: "employee",
  },
  {
    key: "exit-interview",
    name: "Exit Interview",
    section: "exit",
    href: "/hr/exit/interview",
    sourceTable: "exit_records",
    subject: "employee",
  },
  {
    key: "exit-handover",
    name: "Handover & Clearance Checklist",
    section: "exit",
    href: "/hr/exit/interview",
    sourceTable: "exit_records",
    subject: "employee",
  },
];

const BY_KEY = new Map(HR_FORMS.map((f) => [f.key, f]));

export function getHrForm(key: string): HrFormDef | undefined {
  return BY_KEY.get(key);
}

export function isHrSection(v: string): v is HrSectionKey {
  return (HR_SECTIONS as readonly string[]).includes(v);
}

/** Label for a stored section key. Falls back to the raw key so a submission
 *  filed under a stage that was later removed still renders something rather
 *  than an empty cell. */
export function hrSectionLabel(key: string): string {
  return isHrSection(key) ? HR_SECTION_LABEL[key] : key;
}
