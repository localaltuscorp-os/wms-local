import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { employees } from "@/db/schema";

/**
 * Employee Exit forms — the Exit Interview Questionnaire and the Handover &
 * Clearance Checklist. Defined in this module (not the big db/schema.ts) so the
 * Exit feature owns its own table and stays out of shared-nav merge conflicts;
 * the table itself is created by db/migrations/0160_exit_records.sql.
 *
 * `kind`: 'interview' | 'handover'. `data` holds the full form payload (answers,
 * 1-5 ratings, checklist ticks, sign-offs) as JSON.
 */
export const exitRecords = pgTable(
  "exit_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull().default({}),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exit_records_employee_idx").on(t.employeeId),
    index("exit_records_kind_idx").on(t.kind),
    index("exit_records_updated_idx").on(t.updatedAt),
  ],
);

export type ExitRecord = typeof exitRecords.$inferSelect;
export type NewExitRecord = typeof exitRecords.$inferInsert;

export type ExitKind = "interview" | "handover";

/**
 * Typed shapes of the `data` jsonb payload. The column stays a free-form jsonb
 * (so persistence never breaks when copy/fields evolve), but these interfaces
 * keep the form <-> store contract sound and documented.
 *
 * `fields` is a flat string map keyed by question/field id — including the new
 * exit-interview keys `header_designation`, `header_managerName`,
 * `env_culture_feedback`, `infrastructure_feedback`, and the handover `notes`
 * key. `ratings` maps each rating-aspect id to its 1–5 score (5 = Excellent).
 */
export interface ExitInterviewData {
  fields?: Record<string, string>;
  ratings?: Record<string, number>;
}

export interface ExitHandoverData {
  fields?: Record<string, string>;
  checked?: Record<string, boolean>;
}

export type ExitRecordData = ExitInterviewData | ExitHandoverData;

/**
 * Rich roster row the Exit page hands to the forms. Carries enough identity to
 * power the searchable Employee dropdown and auto-fill Manager / Designation
 * (interview) and Employee ID / Department (handover). Sourced from `employees`
 * with self-join → manager name and FK joins → designation/department (legacy
 * `department` text as fallback). Kept in this pure module so it can be imported
 * from both the server loader (a "use server" file may only export async fns)
 * and the client form components.
 */
export interface ExitRosterEmployee {
  id: string;
  name: string;
  designation: string;
  managerName: string;
  department: string;
  employeeCode?: string;
}
