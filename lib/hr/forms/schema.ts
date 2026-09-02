import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { candidateIntake, employees } from "@/db/schema";

/**
 * HR form submissions — a uniform INDEX over the HR lifecycle forms, which each
 * keep their own table (`exit_records`, induction rows, candidate rows …).
 *
 * Defined in this module rather than the shared `db/schema.ts` for the same
 * reason the Exit module does it (see lib/hr/exit/schema.ts): the feature owns
 * its own table and stays out of shared-file merge conflicts. The table itself
 * is created by db/migrations/0181_hr_form_submissions.sql.
 *
 * This is an index, NOT a replacement. Nothing here is the source of truth for a
 * form's contents — the owning table still is. What this adds is the ability to
 * answer "which forms has this person filled?" and "show me everyone's exit
 * interviews from last month" without querying every form table in the product.
 */
export const hrFormSubmissions = pgTable(
  "hr_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Joins to the code registry (lib/hr/forms/registry.ts). */
    formKey: text("form_key").notNull(),
    /** Snapshot — an old submission keeps the name it was filed under. */
    formName: text("form_name").notNull(),
    /** Snapshot of the HR lifecycle stage key ("exit", "pre-joining", …). */
    section: text("section").notNull(),

    /**
     * WHOSE form this is, when the subject is an employee. Drives the employee's
     * list and the permission gate.
     *
     * NULLABLE since 0203, and exactly one of this / `candidateIntakeId` is set —
     * enforced in the database by `hr_form_submissions_subject_chk`, not by
     * convention. Four HR forms are filled before the person is an employee at
     * all; see the migration for why the subject had to become a choice.
     */
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),

    /** WHOSE form this is, when the subject is still a candidate (0203). */
    candidateIntakeId: uuid("candidate_intake_id").references(() => candidateIntake.id, {
      onDelete: "cascade",
    }),
    /** WHO filled it — often HR on the employee's behalf. Never gates visibility. */
    submittedById: uuid("submitted_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),

    status: text("status").$type<HrFormStatus>().notNull().default("draft"),

    /** Normalised completed responses — see `HrFormResponse`. */
    responses: jsonb("responses").$type<HrFormResponse[]>().notNull().default([]),

    /** Soft pointer to the owning row (table varies per row, so no FK). */
    sourceTable: text("source_table"),
    sourceId: uuid("source_id"),

    /** Stamped only when status flips to "submitted"; NULL for drafts. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // These MIRROR db/migrations/0181 + 0182 exactly, including sort direction and
  // the partial predicate. Drizzle never created this table — the migrations did
  // — so anything declared loosely here reads as DRIFT to `drizzle-kit generate`,
  // which then proposes dropping and recreating the real thing. An index that
  // merely names the same columns is a DIFFERENT index to Postgres.
  (t) => [
    // `DESC NULLS LAST` is load-bearing, not decoration: the two list pages order
    // by submitted_at desc nulls last, and only this form of the index can serve
    // that ordering.
    index("hr_form_submissions_employee_idx").on(t.employeeId, t.submittedAt.desc().nullsLast()),
    index("hr_form_submissions_submitted_idx").on(t.submittedAt.desc().nullsLast()),
    index("hr_form_submissions_status_idx").on(t.status),
    index("hr_form_submissions_section_idx").on(t.section),
    index("hr_form_submissions_form_idx").on(t.formKey),
    // The idempotency guarantee itself. `recordHrFormSubmission` arbitrates its
    // upsert on exactly this index, so it is not optional metadata — a database
    // built without it accepts duplicate index rows per form silently.
    uniqueIndex("hr_form_submissions_source_uniq")
      .on(t.formKey, t.employeeId, t.sourceId)
      .where(sql`${t.sourceId} is not null`),
    // 0203. The candidate-side arbiter. NOT a duplicate of the index above: once
    // employee_id became nullable that one stopped constraining candidate rows,
    // because Postgres treats NULLs in a unique index as distinct — so every
    // autosave tick would insert a fresh row.
    uniqueIndex("hr_form_submissions_candidate_source_uniq")
      .on(t.formKey, t.candidateIntakeId, t.sourceId)
      .where(sql`${t.candidateIntakeId} is not null and ${t.sourceId} is not null`),
    index("hr_form_submissions_candidate_idx").on(
      t.candidateIntakeId,
      t.submittedAt.desc().nullsLast(),
    ),
    // 0182. The `.$type<HrFormStatus>()` above is a compile-time cast; this is
    // what actually stops a bad value reaching the client renderer.
    check("hr_form_submissions_status_chk", sql`${t.status} in ('draft', 'submitted')`),
    // 0203. A row always has exactly one subject. Without this, relaxing the
    // employee_id NOT NULL would permit a submission belonging to nobody — which
    // renders in the lists with an empty name and no way to trace it back.
    check(
      "hr_form_submissions_subject_chk",
      sql`(${t.employeeId} is not null and ${t.candidateIntakeId} is null)
           or (${t.employeeId} is null and ${t.candidateIntakeId} is not null)`,
    ),
  ],
);

/**
 * Coerce a `status` read from the database into the enum.
 *
 * Defence in depth BEHIND the 0182 CHECK constraint, for the window where a row
 * predates it or the constraint is missing on a freshly-pushed environment. The
 * client's STATUS_META lookup would otherwise return `undefined` and blank the
 * whole Filled Forms table on a single bad row. Unknown reads as `draft` — the
 * column default, and the reading that errs toward "not yet filed" rather than
 * claiming a submission that never happened.
 */
export function asHrFormStatus(v: string | null | undefined): HrFormStatus {
  return v === "submitted" ? "submitted" : "draft";
}

/** `draft` = Save Draft; `submitted` = Submit succeeded and the row was stamped. */
export type HrFormStatus = "draft" | "submitted";

/**
 * One answered question, flattened. Heterogeneous sources ({fields, ratings} vs
 * {fields, checked} vs a candidate row) normalise to this on write, so View, PDF
 * and Email each need ONE renderer instead of one per form.
 *
 * `group` is an optional section heading within the form (e.g. "Work
 * Environment"); the renderers use it to keep a long form readable.
 */
export interface HrFormResponse {
  question: string;
  answer: string;
  group?: string;
}

export type HrFormSubmission = typeof hrFormSubmissions.$inferSelect;
export type NewHrFormSubmission = typeof hrFormSubmissions.$inferInsert;
