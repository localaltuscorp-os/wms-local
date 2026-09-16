import { pgTable, integer, text, uuid, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { employees } from "@/db/schema";
import type { RunSummary } from "./types";

/**
 * HR Records → Google Drive (migration 0225).
 *
 * Declared beside the feature, like lib/hr/forms/schema.ts, to stay out of the
 * shared db/schema.ts merge hotspot. Listed in drizzle.config.ts so
 * `drizzle-kit generate` sees these tables instead of proposing to drop them.
 */
export const hrRecordsDriveSettings = pgTable("hr_records_drive_settings", {
  id: integer("id").primaryKey().default(1),
  accountEmail: text("account_email"),
  /** encryptSecret() ciphertext. Never select this into anything sent to a browser. */
  refreshTokenEnc: text("refresh_token_enc"),
  connectedById: uuid("connected_by_id").references(() => employees.id, { onDelete: "set null" }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  scheduleEnabled: boolean("schedule_enabled").notNull().default(false),
  intervalMonths: integer("interval_months").notNull().default(1),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  /** NULL = idle · "" = pass started, nobody finished · else last employees.id finished. */
  runCursor: text("run_cursor"),
  lastRunStartedAt: timestamp("last_run_started_at", { withTimezone: true }),
  lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
  lastRunSummary: jsonb("last_run_summary").$type<RunSummary>(),
  lastError: text("last_error"),
  lockUntil: timestamp("lock_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type HrRecordsDriveSettingsRow = typeof hrRecordsDriveSettings.$inferSelect;

export const hrRecordsDriveItems = pgTable(
  "hr_records_drive_items",
  {
    key: text("key").primaryKey(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "cascade" }),
    driveId: text("drive_id").notNull(),
    version: text("version"),
    name: text("name"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hr_records_drive_items_employee_idx").on(t.employeeId)],
);
