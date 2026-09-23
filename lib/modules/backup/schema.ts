import { pgTable, integer, text, uuid, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { employees } from "@/db/schema";
import type { RunCounts, RunCursor, RunKind, RunStatus } from "./types";

/**
 * MODULE BACKUP → Google Drive (migration 0244).
 *
 * Declared beside the feature, like lib/hr/records-export/schema.ts, to stay out
 * of the db/schema.ts merge hotspot. Listed in drizzle.config.ts so
 * `drizzle-kit generate` sees these tables instead of proposing to drop them.
 *
 * Four tables, one job each:
 *   settings     the one Drive connection and the nightly schedule
 *   modules      per-module state: is it on, and how far has it been exported
 *   runs         one row per export, with the place a resumed run continues from
 *   grants       who may press Export on which module
 */

export const moduleBackupSettings = pgTable("module_backup_settings", {
  id: integer("id").primaryKey().default(1),
  /** The connected Google account; must equal MODULE_BACKUP_DRIVE_ACCOUNT. */
  accountEmail: text("account_email"),
  /** encryptSecret() ciphertext. Never select this into anything sent to a browser. */
  refreshTokenEnc: text("refresh_token_enc"),
  connectedById: uuid("connected_by_id").references(() => employees.id, { onDelete: "set null" }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  /** The root folder the app creates; `drive.file` scope cannot see one made by hand. */
  rootFolderId: text("root_folder_id"),
  /** Master switch for the nightly save. The Export button works regardless. */
  scheduleEnabled: boolean("schedule_enabled").notNull().default(true),
  /** Hour in IST the nightly save starts. 3 = 03:00 IST, as asked for. */
  runHourIst: integer("run_hour_ist").notNull().default(3),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ModuleBackupSettingsRow = typeof moduleBackupSettings.$inferSelect;

export const moduleBackupModules = pgTable("module_backup_modules", {
  /** A WorkspaceId — "hr", "attendance", "billing"… */
  moduleId: text("module_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  /**
   * THE WATERMARK. Everything created or changed up to this instant is already
   * in Drive, so the next run exports only what came after it. NULL means the
   * module has never been exported, and the next run is the full one.
   */
  exportedThrough: timestamp("exported_through", { withTimezone: true }),
  lastFullAt: timestamp("last_full_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ModuleBackupModuleRow = typeof moduleBackupModules.$inferSelect;

export const moduleBackupRuns = pgTable(
  "module_backup_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: text("module_id").notNull(),
    kind: text("kind").$type<RunKind>().notNull(),
    status: text("status").$type<RunStatus>().notNull().default("pending"),
    /**
     * The window this run covers: everything after `since` and up to `until`.
     * `since` is NULL for the first, full export. `until` is fixed when the run
     * starts, so rows written while it runs belong to the NEXT run rather than
     * being half-caught by this one.
     */
    since: timestamp("since", { withTimezone: true }),
    until: timestamp("until", { withTimezone: true }).notNull(),
    /** Where a resumed run continues from. */
    cursor: jsonb("cursor").$type<RunCursor>(),
    counts: jsonb("counts").$type<RunCounts>(),
    /** The dated folder in Drive: "Attendance / 2026-09-21 03:00". */
    folderName: text("folder_name"),
    /** NULL for the nightly run; set when a person pressed Export. */
    requestedById: uuid("requested_by_id").references(() => employees.id, { onDelete: "set null" }),
    /** Held while a chunk is in flight, so two invocations cannot run the same export. */
    lockUntil: timestamp("lock_until", { withTimezone: true }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("module_backup_runs_module_idx").on(t.moduleId, t.startedAt),
    index("module_backup_runs_status_idx").on(t.status),
  ],
);
export type ModuleBackupRunRow = typeof moduleBackupRuns.$inferSelect;

/**
 * WHO MAY PRESS EXPORT, per module. Manan and Rutvisha to begin with (seeded by
 * the migration), and changeable from the page without a deploy.
 *
 * Access to a module is NOT access to its export: reading one screen is a
 * different thing from carrying the whole module out of the building.
 */
export const moduleBackupGrants = pgTable(
  "module_backup_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: text("module_id").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("module_backup_grants_uniq").on(t.moduleId, t.employeeId),
    index("module_backup_grants_module_idx").on(t.moduleId),
  ],
);
export type ModuleBackupGrantRow = typeof moduleBackupGrants.$inferSelect;
