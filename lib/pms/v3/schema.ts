/**
 * PMS v3 (WS-2) — NEW table definitions, kept OUT of db/schema.ts on purpose.
 *
 * These are defined here (a normal drizzle pgTable file) so the v3 read layer and
 * server actions typecheck and run TODAY, while the canonical merge into
 * db/schema.ts + a numbered migration is done by the schema owner at ship time
 * (see the INTEGRATION NOTE at the bottom of the deliverable — it contains the
 * paste-ready drizzle defs AND idempotent DDL). `db.select().from(table)` does
 * not require the table to be registered in the drizzle() schema map, so these
 * work against the live pool as soon as the idempotent DDL is applied.
 *
 * NOTHING here is wired into the live score — it is all inert until PMS_V3=true.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  smallint,
  numeric,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employees } from "@/db/schema";

/**
 * Singleton config row ('default') — THE single source of every v3 weight,
 * grade-band threshold, blend split, subjective-factor catalog and X-Factor cap.
 * Stored as one jsonb blob so the shape can grow without a migration; the admin
 * editor writes it back. The engines read ONLY this — no weight is hardcoded.
 */
export const pmsV3Config = pgTable("pms_v3_config", {
  id: text("id").primaryKey().default("default"),
  config: jsonb("config").notNull().default({}),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PmsV3ConfigRow = typeof pmsV3Config.$inferSelect;

/**
 * One subjective factor score, by one rater, for one subject, for one month.
 * raterRole ∈ self | manager | manan. `points` is the 0–10 subjective score.
 * The two justifications (Q1 points GIVEN, Q2 points TAKEN) are stored here but
 * are surfaced to MANAN ONLY (enforced in the read layer + UI, never sent to the
 * subject or the manager view).
 */
export const pmsSubjectiveScore = pgTable(
  "pms_subjective_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM'
    raterRole: text("rater_role").notNull(), // self | manager | manan
    raterId: uuid("rater_id").references(() => employees.id, { onDelete: "set null" }),
    factorKey: text("factor_key").notNull(), // matches a key in config.factors
    points: smallint("points"), // 0..10
    justifyGiven: text("justify_given"), // Q1 — why these points were GIVEN (Manan-only)
    justifyTaken: text("justify_taken"), // Q2 — why points were TAKEN (Manan-only)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pms_subjective_subj_period_role_factor_uq").on(
      t.subjectId,
      t.period,
      t.raterRole,
      t.factorKey,
    ),
    index("pms_subjective_subject_idx").on(t.subjectId, t.period),
  ],
);
export type PmsSubjectiveScore = typeof pmsSubjectiveScore.$inferSelect;

/**
 * X-Factor — extra points Manan adds at will, with MANDATORY evidence: either a
 * link to a recording (`evidenceKind='recording'`) OR an attached + summarised
 * transcript (`evidenceKind='transcript'`, transcriptSummary required). Manan-only.
 */
export const pmsXfactor = pgTable(
  "pms_xfactor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM'
    points: numeric("points", { precision: 6, scale: 2 }).notNull().default("0"),
    evidenceKind: text("evidence_kind").notNull(), // recording | transcript
    evidenceUrl: text("evidence_url"), // link/upload path to the recording or attachment
    transcriptSummary: text("transcript_summary"), // required when evidenceKind='transcript'
    note: text("note"),
    addedById: uuid("added_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_xfactor_subject_idx").on(t.subjectId, t.period)],
);
export type PmsXfactor = typeof pmsXfactor.$inferSelect;

/**
 * One paragraph of the Altus Corp Constitution (para-by-para scoring source).
 * Seeded verbatim from the Google Doc (see constitution-data.ts). `isHeading`
 * marks section headers (not scored). `weight` is the admin-set weight; the admin
 * distributes a total of 100 across the scorable paragraphs.
 */
export const pmsConstitutionPara = pgTable(
  "pms_constitution_para",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    position: integer("position").notNull(),
    isHeading: boolean("is_heading").notNull().default(false),
    title: text("title"), // heading label, when isHeading
    body: text("body").notNull(),
    weight: numeric("weight", { precision: 6, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_constitution_para_pos_idx").on(t.position)],
);
export type PmsConstitutionPara = typeof pmsConstitutionPara.$inferSelect;

/**
 * A Constitution paragraph score — by admin OR by the subject (self). Semi-
 * objective: the admin scores AND the person self-scores each paragraph, and the
 * perception gap is shown back. raterRole ∈ admin | self. `points` 0..10.
 */
export const pmsConstitutionScore = pgTable(
  "pms_constitution_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM'
    paraId: uuid("para_id").notNull().references(() => pmsConstitutionPara.id, { onDelete: "cascade" }),
    raterRole: text("rater_role").notNull(), // admin | self
    raterId: uuid("rater_id").references(() => employees.id, { onDelete: "set null" }),
    points: smallint("points"), // 0..10
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pms_constitution_score_subj_period_para_role_uq").on(
      t.subjectId,
      t.period,
      t.paraId,
      t.raterRole,
    ),
    index("pms_constitution_score_subject_idx").on(t.subjectId, t.period),
  ],
);
export type PmsConstitutionScore = typeof pmsConstitutionScore.$inferSelect;
