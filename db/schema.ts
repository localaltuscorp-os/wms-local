import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  boolean,
  jsonb,
  integer,
  numeric,
  primaryKey,
  time,
  date,
  uniqueIndex,
  doublePrecision,
  real,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  TASK_STATUSES,
  EMPLOYEE_ROLES,
  TASK_PRIORITIES,
  APPROVAL_STATUSES,
} from "./enums";
import type { FormFieldDef } from "@/lib/forms/field-types";

export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const employeeRoleEnum = pgEnum("employee_role", EMPLOYEE_ROLES);
export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUSES);

// Salary module (migration 0062) — admin-managed rosters referenced by the
// employees FKs below. Declared first so the FK callbacks resolve cleanly.
export const designations = pgTable(
  "designations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("designations_active_name_idx").on(t.isActive, t.name)],
);

export const payingEntities = pgTable(
  "paying_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("paying_entities_active_name_idx").on(t.isActive, t.name)],
);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: employeeRoleEnum("role").notNull(),
  avatarUrl: text("avatar_url"),
  // Legacy free-text department.  Kept during the M3 soft migration:
  // every server action that sets department writes BOTH this column
  // and `department_id` so existing readers (status table, CSV, etc.)
  // keep working.  Will be dropped in a future migration once the FK
  // is verified-authoritative.
  department: text("department"),
  // M3: canonical FK into `departments`.  Source of truth for the
  // admin-managed list; nullable until an admin picks one.
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // M2.0 additions:
  firebaseUid: text("firebase_uid").unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  // Admin password-reset lockout marker (migration 0043). Set when an admin
  // resets the password (sessions revoked); cleared on next successful login.
  // Non-null => show the "changed by admin" message on a failed sign-in.
  passwordResetByAdminAt: timestamp("password_reset_by_admin_at", {
    withTimezone: true,
  }),
  // Anti-proxy attendance (migration 0056): biometric punch is mandatory,
  // enforced in app code. Admins can exempt employees whose device has no
  // fingerprint/Face-ID sensor — exempt employees fall back to GPS-only.
  attendanceBiometricExempt: boolean("attendance_biometric_exempt")
    .notNull()
    .default(false),
  // M2.3-lite: inbox last-visit marker — drives unread-badge math.
  lastInboxVisitAt: timestamp("last_inbox_visit_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // M4 — multi-channel dispatch: per-channel opt-in flags + auxiliary
  // contact info (Slack uid cached after first email lookup, WhatsApp
  // phone in E.164 format, locale for template rendering).
  slackUserId: text("slack_user_id"),
  emailOptIn: boolean("email_opt_in").notNull().default(true),
  slackOptIn: boolean("slack_opt_in").notNull().default(true),
  whatsappPhone: text("whatsapp_phone"),
  whatsappOptedIn: boolean("whatsapp_opted_in").notNull().default(false),
  whatsappTemplateLocale: text("whatsapp_template_locale").notNull().default("en"),
  // Profile v2 (migration 0035) — identity, workflow, appearance preferences.
  // All columns NOT NULL with defaults so existing rows behave identically.
  bio: text("bio"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  availability: text("availability")
    .notNull()
    .default("available")
    .$type<"available" | "focused" | "heads_down" | "away">(),
  availabilityAutoRevertAt: timestamp("availability_auto_revert_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  workingHoursStart: time("working_hours_start").notNull().default("10:00"),
  workingHoursEnd: time("working_hours_end").notNull().default("19:00"),
  workingDays: integer("working_days").array().notNull().default(sql`'{1,2,3,4,5,6}'::int[]`),
  quietHoursStart: time("quiet_hours_start"),
  quietHoursEnd: time("quiet_hours_end"),
  digestTime: time("digest_time").notNull().default("08:00"),
  digestFrequency: text("digest_frequency")
    .notNull()
    .default("daily")
    .$type<"off" | "daily" | "weekly">(),
  theme: text("theme")
    .notNull()
    .default("system")
    .$type<"light" | "dark" | "system">(),
  density: text("density").notNull().default("cozy").$type<"cozy" | "compact">(),
  accent: text("accent").notNull().default("#E10600"),
  oooStart: date("ooo_start"),
  oooEnd: date("ooo_end"),
  oooDelegateId: uuid("ooo_delegate_id").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
  managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
  // Salary module (migration 0062) — admin-managed roster FKs.
  designationId: uuid("designation_id").references(() => designations.id, {
    onDelete: "set null",
  }),
  payingEntityId: uuid("paying_entity_id").references(() => payingEntities.id, {
    onDelete: "set null",
  }),
  // Profile v2 (migration 0038) — mention escalation override scalar.
  mentionEscalation: boolean("mention_escalation").notNull().default(true),
  // Google Calendar sync (migration 0043) — per-user OAuth. The refresh token
  // is long-lived; we exchange it for short-lived access tokens on demand.
  // Server-only: never selected into client-bound queries.
  googleRefreshToken: text("google_refresh_token"),
  googleEmail: text("google_email"),
  googleConnectedAt: timestamp("google_connected_at", { withTimezone: true }),
  // Performance criteria (Manan 2026-06) — admin-editable; shown in Profile >
  // Performance and Weekly Goals. Free text (comma-separated points).
  performanceCriteria: text("performance_criteria"),
  // Key Result Areas (Manan 2026-06) — admin-editable companion to criteria.
  kra: text("kra"),
  // Attendance Phase A (0058) — weekly off day (0=Sun..6=Sat; default Sunday)
  // and per-employee schedule overrides. Null override => use org defaults.
  weeklyOff: integer("weekly_off").notNull().default(0),
  attOfficialStart: time("att_official_start"),
  attLateAfter: time("att_late_after"),
  attOfficialEnd: time("att_official_end"),
  attEarlyBefore: time("att_early_before"),
  // Attendance Phase B (0060) — probation-end anchor for the paid-leave cycle.
  // Pulled forward from Phase C (salary): the leave allowance accrues from this
  // date and nothing accrues before it. Null => no anchor yet (0 paid leaves).
  probationEnd: date("probation_end"),
});

/**
 * Profile v2 — achievements_earned (migration 0040).
 * Per-user badge unlocks. Definitions live in `lib/achievements/definitions.ts`
 * keyed by string; no separate `achievements` table to seed.
 */
export const achievementsEarned = pgTable(
  "achievements_earned",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    achievementKey: text("achievement_key").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    progress: jsonb("progress"),
  },
  (t) => [index("achievements_earned_employee_idx").on(t.employeeId)],
);

/**
 * Profile v2 — pinned_items (migration 0039).
 * Per-user shelf of pinned tasks/projects/documents on /profile.
 * Order via `sort_order`; uniqueness on (employee, kind, item).
 */
export const pinnedItems = pgTable(
  "pinned_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().$type<"task" | "project" | "document">(),
    itemId: uuid("item_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pinned_items_employee_idx").on(t.employeeId, t.sortOrder)],
);

/**
 * Profile v2 — notification_preferences (migration 0038).
 * Per-recipient × per-kind × per-channel override matrix. Absence of a
 * row means "fall back to the legacy email_opt_in / slack_opt_in /
 * whatsapp_opted_in scalars on employees".
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_preferences_employee_idx").on(t.employeeId),
  ],
);

/**
 * Profile v2 — auth_sessions (migration 0036).
 * Written by /api/auth/session on cookie mint; updated by a middleware
 * helper on each request (debounced). Powers the Identity tab's
 * "Active sessions" list + "Sign out everywhere" button.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    firebaseUid: text("firebase_uid").notNull(),
    sessionHash: text("session_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    country: text("country"),
    city: text("city"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("auth_sessions_employee_idx").on(
      t.employeeId,
      t.revokedAt,
      t.lastSeenAt,
    ),
    index("auth_sessions_firebase_uid_idx").on(t.firebaseUid),
  ],
);

/**
 * Profile v2 — audit_data_exports (migration 0037).
 * "Download my data" request log. Cron picks pending rows, writes a ZIP
 * to documents bucket, emails the user.
 */
export const auditDataExports = pgTable(
  "audit_data_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    filePath: text("file_path"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "processing" | "done" | "failed">(),
    error: text("error"),
  },
  (t) => [
    index("audit_data_exports_employee_idx").on(
      t.employeeId,
      t.requestedAt,
    ),
  ],
);

/**
 * M3 — admin-managed list of departments.  The seed migration backfills
 * one row per distinct existing `employees.department` value; from then
 * on admins maintain the list via /admin/departments.  `is_active`
 * controls whether the dept shows up in pickers; we never hard-delete
 * (employees keep their FK reference).
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("departments_active_sort_idx").on(t.isActive, t.sortOrder, t.name)],
);

/**
 * Many-to-many membership: one person can belong to several departments.
 * Source of truth for department membership.  The `is_primary` row mirrors
 * the legacy single-department columns on `employees` (department / department_id)
 * — exactly one membership per employee should carry is_primary = true, and
 * that one feeds every single-label reader (task rows, CSV, status table).
 */
export const employeeDepartments = pgTable(
  "employee_departments",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.employeeId, t.departmentId] }),
    index("employee_departments_department_idx").on(t.departmentId),
    index("employee_departments_employee_idx").on(t.employeeId),
  ],
);

/**
 * Client list — backs the "Client Name" picker on the task forms.  Mirrors
 * the `departments` pattern: an admin/seed-managed canonical list that the
 * New Task / Edit Task dropdowns read from.  Unlike departments, ANY
 * authenticated user can append a new client inline ("+ Add new client…")
 * while creating a task, so the insert RLS policy is open to all
 * authenticated users (see migration 0022).  We never hard-delete; flip
 * `is_active` to hide a client from the picker.
 */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("clients_active_name_idx").on(t.isActive, t.name)],
);

/**
 * Subjects — canonical list backing the "Subject" picker on the task forms.
 * Mirrors the `clients` pattern exactly: an admin/seed-managed list that the
 * New Task / Edit Task dropdowns read from, with an inline "+ Add new
 * subject…" affordance open to any authenticated user. Stored on the
 * free-text `tasks.subject` column; renames propagate to matching tasks.
 */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("subjects_active_name_idx").on(t.isActive, t.name)],
);

/**
 * Project Management (Manan #23/#24). A self-referential tree:
 * Project → Milestone → Result. Tasks link to any node via
 * `tasks.project_node_id` (the "action" connected to a project/milestone/
 * result). We never hard-delete — archive instead.
 */
export const projectNodes = pgTable(
  "project_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind")
      .$type<"project" | "milestone" | "result" | "action" | "sub_action">()
      .notNull(),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(100),
    isArchived: boolean("is_archived").notNull().default(false),
    // #13 — overhaul fields.
    description: text("description"),
    notes: text("notes"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_nodes_parent_idx").on(t.parentId),
    index("project_nodes_kind_idx").on(t.kind, t.isArchived),
  ],
);

/**
 * #13 — team members involved in a project node (alongside owner_id).
 * Composite PK so a person can't be added twice to the same node.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    projectNodeId: uuid("project_node_id")
      .notNull()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectNodeId, t.employeeId] })],
);

/**
 * Document library (Manan #27/#28). The catalogue for files stored in the
 * private "documents" Storage bucket — title required, description optional,
 * with provenance and an optional link to a task.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_created_idx").on(t.createdAt),
    index("documents_task_idx").on(t.taskId),
  ],
);

// M5.1 — admin-managed display overrides for the 9 task statuses. PK is the
// task_status enum value; updates only (RLS: insert/delete revoked at the
// table level + only `update` policy). Seeded by migration 0016 so the
// default render is identical to today's hard-coded labels/tones.
export const statusSettings = pgTable("status_settings", {
  status: taskStatusEnum("status").primaryKey(),
  label: text("label").notNull(),
  colorToken: text("color_token").notNull(),
  displayOrder: integer("display_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    doerId: uuid("doer_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    initiatorId: uuid("initiator_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    priority: taskPriorityEnum("priority").notNull().default("not_imp_not_urgent"),
    status: taskStatusEnum("status").notNull().default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    transferredFromId: uuid("transferred_from_id").references(
      () => employees.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    subject: text("subject"),
    // Client this task belongs to. Free-text mirroring `subject` (the
    // `clients` table is just the picker roster). Added in migration 0042 and
    // backfilled from the old "Client/Participant:" notes / form title.
    client: text("client"),
    // Google Calendar sync (migration 0043): the event id created on the
    // synced doer's calendar, and which doer's calendar holds it (so a
    // reassign can move the event). Null when not synced.
    googleEventId: text("google_event_id"),
    googleSyncedDoerId: uuid("google_synced_doer_id"),
    archived: boolean("archived").notNull().default(false),
    // M2.1 additions — provenance + approval (approved_* used in M2.2) + optimistic lock
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    approvedById: uuid("approved_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNote: text("approval_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    legacyImportKey: text("legacy_import_key"),
    shortId: text("short_id"),
    // Friendly sequential task number (#1042). DB-assigned via a sequence
    // default + NOT NULL (see migration 0046); kept nullable here so inserts
    // don't have to supply it and the DB fills it in.
    taskNo: integer("task_no"),
    // Tier-3 (2026-05-20) additions:
    //   tags          — comma-of-chips, free-form (no enum). NULL = no tags.
    //   approvalStatus — admin-only verdict layered on top of `status`. NULL
    //                    = no verdict yet; when set, surfaces on the row +
    //                    the dashboard's "Task Approval Status" axis.
    //   revisedTargetDate — admin-only revised due date. Coexists with
    //                       `due_at` so the original commitment isn't lost.
    tags: text("tags").array(),
    approvalStatus: approvalStatusEnum("approval_status"),
    revisedTargetDate: timestamp("revised_target_date", { withTimezone: true }),
    // Read-receipt (migration 0045): set when any user first opens the task
    // detail. NULL = never opened. Powers the "Not Read" stat card.
    firstReadAt: timestamp("first_read_at", { withTimezone: true }),
    // Tier-4 (2026-05-20) — Google-Calendar-style internal scheduling.
    // NOT synced to any actual calendar API; these are just metadata
    // fields the team uses to plan when work happens.
    //   startsAt / endsAt — explicit time block when the task is on the
    //     calendar. Independent of due_at (which is the deadline).
    //   allDay — when true, the time portion of starts_at / ends_at is
    //     decorative; UI shows "All day" instead of clock times.
    //   recurrence — repeat pattern token ("none" | "daily" | "weekly" |
    //     "monthly" | "yearly"). Null treated as "none".
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    recurrence: text("recurrence"),
    // Manan #20 — RRULE-lite structured recurrence (weekdays / monthly mode /
    // end). Coexists with `recurrence` (coarse frequency). Originals carry
    // the rule; materialized child instances do not (parent_id points back).
    recurrenceRule: text("recurrence_rule"),
    // Phase 5.2 — recurrence materialization markers. NULL on originals
    // (rule-holders); set on every dated instance the cron creates.
    recurrenceParentId: uuid("recurrence_parent_id"),
    recurrenceOccurrenceDate: text("recurrence_occurrence_date"),
    // Manan #24 — optional link to a Project Management node (the "action"
    // connected to a project / milestone / result). The FK + onDelete SET
    // NULL + matching index were created by migration 0027; the
    // `.references()` declaration is mirrored here so drizzle-kit
    // generate stays consistent with the DB.
    projectNodeId: uuid("project_node_id").references(() => projectNodes.id, {
      onDelete: "set null",
    }),
    // Search infra (migration 0061). DB-generated STORED columns — never
    // written by app code. `searchText` backs the trigram GIN (indexed ILIKE +
    // fuzzy). Declared here only so drizzle-kit generate stays consistent with
    // the live DB. The `search_tsv` tsvector column is intentionally NOT
    // declared as a Drizzle column (no first-class tsvector type); its index
    // is created by the migration directly.
    searchText: text("search_text").generatedAlwaysAs(
      sql`coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(client,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(notes,'')`,
    ),
  },
  (t) => [
    index("tasks_doer_created_idx").on(t.doerId, t.createdAt),
    index("tasks_initiator_created_idx").on(t.initiatorId, t.createdAt),
    index("tasks_status_created_idx").on(t.status, t.createdAt),
    index("tasks_pending_created_idx")
      .on(t.createdAt)
      .where(
        sql`${t.status} IN ('not_started','initiated','follow_up','need_help','need_info','follow_up_1','follow_up_2','follow_up_3')`,
      ),
    index("tasks_archived_idx").on(t.archived, t.createdAt),
    index("tasks_created_by_idx").on(t.createdById),
    index("tasks_approval_status_idx").on(t.approvalStatus),
    // Added 2026-05-25 (migration 0029) to back the queries flagged by
    // the hardening audit — see the migration file for context.
    index("tasks_due_at_idx").on(t.dueAt),
    index("tasks_approved_by_idx").on(t.approvedById),
    index("tasks_transferred_from_idx").on(t.transferredFromId),
    index("tasks_project_node_idx").on(t.projectNodeId),
    // Search infra (migration 0061) — trigram GIN backing indexed ILIKE +
    // fuzzy over the generated `search_text` column.
    index("tasks_search_trgm_idx").using("gin", t.searchText.asc().op("gin_trgm_ops")),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_events_task_created_idx").on(t.taskId, t.createdAt),
    index("task_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("task_events_created_idx").on(t.createdAt),
  ],
);

/**
 * M2.3 — frozen contract for the `kind` column on notifications.
 *
 * Add a new kind here AND in lib/notifications/dispatch.ts.  The DB
 * column is `text` (not an enum) so the union is the canonical source
 * of truth — anything outside it is a TS error at the call site.
 */
export const NOTIFICATION_KINDS = [
  "task_assigned",
  "task_initiated",
  "status_changed",
  "approved",
  "declined",
  "reassigned",
  "transferred",
  "cancelled",
  "commented",
  "overdue_digest",
  // Attendance Phase A (0058) — text column, no DB change needed.
  "attendance_late",
  "attendance_late_waived",
  "attendance_half_day",
  "attendance_device",
  // Attendance Phase B (0059) — late-deduction alert. Inbox-only until B8 wires
  // its email template; routed to the inbox-only arm in lib/email/resend.ts.
  "attendance_late_deduction",
  // Weekly Goals (Manan 2026-06) — delivered by their own cron (email + in-app).
  "weekly_goals_assigned",
  "weekly_goals_fill_reminder",
  "weekly_goals_incomplete",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => taskEvents.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body"),
    actorId: uuid("actor_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // M4 — channel-by-channel audit trail of which arms actually
    // delivered for this notification.  Source-of-truth column going
    // forward; the legacy `email_sent_at` is also written in parallel
    // for M2.3-era readers but should NOT be the basis of new logic.
    deliveredChannels: text("delivered_channels")
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    index("notifications_user_unread_created_idx").on(
      t.userId,
      t.readAt,
      t.createdAt,
    ),
    index("notifications_user_kind_created_idx").on(
      t.userId,
      t.kind,
      t.createdAt,
    ),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

/**
 * Phase 3.5 — Document mutation audit log. Append-only rows recording every
 * document create / rename / description-change / file-replace / delete.
 * The `documentId` FK is nullable so a delete-event survives after the
 * referenced document row goes away; `documentTitle` is snapshotted at
 * write-time so the log row stays self-readable.
 */
export const documentEvents = pgTable(
  "document_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    documentTitle: text("document_title").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type")
      .$type<"created" | "renamed" | "description_changed" | "file_replaced" | "deleted">()
      .notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("document_events_doc_created_idx").on(t.documentId, t.createdAt),
    index("document_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("document_events_created_idx").on(t.createdAt),
  ],
);

/**
 * Phase 2.1 — Per-attempt audit + retry queue for notification dispatch.
 * One row per (notification, channel) attempt. The 4-arm fan-out in
 * `lib/notifications/dispatch.ts` writes one row per attempt; the
 * `/api/cron/retry-dispatch` route picks up `failed` rows whose
 * `next_attempt_at` has elapsed and re-runs that single channel.
 *
 * `status` values:
 *   - `sent`             — delivered.
 *   - `skipped`          — channel disabled or recipient opted out.
 *   - `failed`           — transient error; retry-eligible.
 *   - `failed_terminal`  — gave up after the retry budget.
 */
export const notificationDispatchLog = pgTable(
  "notification_dispatch_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: text("channel")
      .$type<"email" | "slack" | "whatsapp" | "web_push">()
      .notNull(),
    status: text("status")
      .$type<"sent" | "skipped" | "failed" | "failed_terminal">()
      .notNull(),
    errorMessage: text("error_message"),
    attemptCount: integer("attempt_count").notNull().default(1),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_dispatch_log_retry_idx")
      .on(t.nextAttemptAt, t.attemptCount)
      .where(sql`status = 'failed'`),
    index("notification_dispatch_log_notification_idx").on(
      t.notificationId,
      t.channel,
      t.attemptedAt,
    ),
  ],
);

/**
 * M4 — Web Push subscriptions.  One row per device that has registered
 * via the Service Worker.  `endpoint` is globally unique; `p256dh` and
 * `auth` are the per-subscription crypto keys returned by the browser's
 * PushManager.  We retain `user_agent` for debug-only display in
 * /profile (so users can recognise which devices are still subscribed).
 *
 * RLS — declared in migration 0014: a user reads/inserts/deletes ONLY
 * their own subscriptions; admins can read + delete anyone's.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * M3 — single-row organisation settings.  The CHECK constraint (id = 1)
 * is enforced at the DB level; in app code we always read/write the row
 * via `orgSettings` queries that hard-code `id = 1`.  Adding new
 * org-level knobs = add a column here + bump the form on /admin/settings.
 */
export const orgSettings = pgTable("org_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("Altus Corp"),
  logoUrl: text("logo_url"),
  digestHourIst: integer("digest_hour_ist").notNull().default(9),
  idleTimeoutMinutes: integer("idle_timeout_minutes").notNull().default(10),
  workingDays: integer("working_days")
    .array()
    .notNull()
    .default(sql`array[1,2,3,4,5]`),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  allowSelfRegister: boolean("allow_self_register").notNull().default(false),
  // M5.1 — per-event channel routing. Key = NotificationKind, value = channels
  // array. SQL default seeded in migration 0017; the empty TS default below is
  // only used if a fresh insert ever bypasses the migration default.
  notificationMatrix: jsonb("notification_matrix")
    .notNull()
    .$type<Record<string, string[]>>()
    .default({}),
  // sir's changes #8 — admin-defined kanban column order (ordered array of
  // column ids: TaskStatus values + the synthetic "__archived__"). null = use
  // the built-in default order. Lives here, not status_settings, because the
  // Archived column isn't a real status.
  boardColumnOrder: jsonb("board_column_order").$type<string[]>(),
  // Default earner for "PS Sold through Social Media" sheet incentive.
  incentiveSocialEarner: text("incentive_social_earner").notNull().default("Rohan Choudhary"),
  // 0054 — geofenced attendance. The office anchor point + how far from it
  // a punch is accepted (metres). Null lat/lng = geofence not configured,
  // punches are accepted from anywhere (location still recorded if granted).
  officeLat: doublePrecision("office_lat"),
  officeLng: doublePrecision("office_lng"),
  attendanceRadiusM: integer("attendance_radius_m").notNull().default(100),
  // Attendance Phase A (0058) — org-wide schedule defaults. Per-employee
  // overrides live on `employees`; null there => fall back to these.
  attLateAfter: time("att_late_after").default("10:50"),
  attEarlyBefore: time("att_early_before").default("19:20"),
  attFullDayHours: numeric("att_full_day_hours").default("9"),
  attHalfDayHours: numeric("att_half_day_hours").default("5"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
});

/**
 * M3 close-out — append-only admin audit trails.  Two tables so the
 * future "Admin activity" feed can union them with task_events without a
 * second hop.  Pattern mirrors task_events: pin actor_id, lock immutable.
 */
export const employeeEvents = pgTable(
  "employee_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("employee_events_employee_created_idx").on(t.employeeId, t.createdAt),
    index("employee_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("employee_events_created_idx").on(t.createdAt),
  ],
);

export const settingsEvents = pgTable(
  "settings_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    targetId: text("target_id"),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("settings_events_scope_target_created_idx").on(
      t.scope,
      t.targetId,
      t.createdAt,
    ),
    index("settings_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("settings_events_created_idx").on(t.createdAt),
  ],
);

/**
 * Attendance (migration 0053) — one row per punch. Ported from the Ecosystem
 * "Employee Attendance Form" (Date + In/Out + Notes). `log_date` is the
 * calendar day in the employee's own timezone, computed server-side at punch
 * time; UNIQUE (employee, day, kind) means one check-in + one check-out per
 * day — a second punch of the same kind is a friendly error, not an update,
 * so the log stays honest.
 */
export const attendanceLogs = pgTable(
  "attendance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    kind: text("kind").$type<"in" | "out">().notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note"),
    // 0054 — where the punch happened and how the person was verified.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracyM: real("accuracy_m"),
    distanceM: real("distance_m"),
    verifyMethod: text("verify_method")
      .$type<"biometric" | "gps_only" | "none">()
      .notNull()
      .default("none"),
    credentialId: text("credential_id"),
    // Mobile (device-binding, 0063) — the registered phone a native self-punch
    // came from. NULL for web/WebAuthn or admin punches. FK enforced in SQL.
    mobileDeviceId: uuid("mobile_device_id"),
    // Attendance Phase A (0058) — who recorded the punch and why. `admin`
    // punches carry a `recordedById`; `reason` is one of PUNCH_REASONS.
    source: text("source").$type<"self" | "admin">().notNull().default("self"),
    reason: text("reason"),
    recordedById: uuid("recorded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("attendance_logs_employee_day_kind_uq").on(
      t.employeeId,
      t.logDate,
      t.kind,
    ),
    index("attendance_logs_date_idx").on(t.logDate),
    index("attendance_logs_employee_date_idx").on(t.employeeId, t.logDate),
  ],
);

/**
 * Mobile attendance devices (0063) — device-binding anti-proxy for the native
 * app. Each physical phone generates an opaque `deviceId` (kept in the OS
 * keystore) and enrolls it to ONE employee; `deviceId` is globally unique so a
 * phone can't be shared across people. The native app gates each punch with the
 * device's own fingerprint/Face ID (`expo-local-authentication`) before calling
 * the punch API, and the punch is stamped with this device (attendance_logs.
 * mobile_device_id). Admins are alerted whenever a new device enrolls.
 */
export const mobileDevices = pgTable(
  "mobile_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    label: text("label"),
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("mobile_devices_device_id_uq").on(t.deviceId),
    index("mobile_devices_employee_idx").on(t.employeeId),
  ],
);

/**
 * Incentive requests (migration 0053) — ported from the Ecosystem "Incentive
 * Request" form. `type` picks one of the four request shapes; the per-type
 * fields live in `details` (validated against lib/incentive-fields.ts at the
 * action layer, same generic field-config the form renders from). Admins
 * approve/reject via the decided_* columns.
 */
export const incentiveRequests = pgTable(
  "incentive_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<
        "bss_conversion" | "sales_pitch" | "client_happiness" | "group_intro" | "project" | "sheet" | "weekly_goal"
      >()
      .notNull(),
    status: text("status")
      .$type<"pending" | "approved" | "rejected">()
      .notNull()
      .default("pending"),
    details: jsonb("details")
      .notNull()
      .$type<Record<string, string>>()
      .default({}),
    // Ledger fields (migration 0057). amount is admin-overridable; unpaid is
    // derived (amount − paidAmt, only once approved) so it isn't stored.
    amount: integer("amount").notNull().default(0),
    paid: boolean("paid").notNull().default(false),
    paidAmt: integer("paid_amt").notNull().default(0),
    paidDate: date("paid_date"),
    conditions: jsonb("conditions").$type<Record<string, string>>(),
    label: text("label"),
    source: text("source").notNull().default("form"),
    sourceRef: text("source_ref"),
    archived: boolean("archived").notNull().default(false),
    decidedById: uuid("decided_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("incentive_requests_employee_created_idx").on(
      t.employeeId,
      t.createdAt,
    ),
    index("incentive_requests_status_created_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Outstanding tracker (migration 0053) — receivables ledger. The Ecosystem
 * version lived in a Google Apps Script app (tracker / collection /
 * dashboard); this is the native rebuild. Entries are admin-managed; any
 * authenticated user can log a collection follow-up (note + optional payment
 * received), which rolls up into amount_received and auto-advances status
 * (open → partial → paid). `written_off` is an explicit admin verdict.
 */
export const outstandingEntries = pgTable(
  "outstanding_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    client: text("client").notNull(),
    // Invoice no / particulars — free text, optional.
    particulars: text("particulars"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    amountReceived: numeric("amount_received", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    dueDate: date("due_date"),
    status: text("status")
      .$type<"open" | "partial" | "paid" | "written_off">()
      .notNull()
      .default("open"),
    // Who chases this receivable. Optional.
    ownerId: uuid("owner_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("outstanding_entries_status_due_idx").on(t.status, t.dueDate),
    index("outstanding_entries_client_idx").on(t.client),
  ],
);

/** Collection follow-up log — append-only, one row per touch. */
export const outstandingFollowups = pgTable(
  "outstanding_followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => outstandingEntries.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    note: text("note").notNull(),
    // Client promised to pay by this date (optional).
    promisedDate: date("promised_date"),
    // Payment recorded with this follow-up (optional) — rolled up into the
    // parent entry's amount_received by the action.
    amountReceived: numeric("amount_received", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("outstanding_followups_entry_created_idx").on(
      t.entryId,
      t.createdAt,
    ),
  ],
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type OrgSettings = typeof orgSettings.$inferSelect;
export type NewOrgSettings = typeof orgSettings.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type EmployeeDepartment = typeof employeeDepartments.$inferSelect;
export type NewEmployeeDepartment = typeof employeeDepartments.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type ProjectNode = typeof projectNodes.$inferSelect;
export type NewProjectNode = typeof projectNodes.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationDispatchLog = typeof notificationDispatchLog.$inferSelect;
export type NewNotificationDispatchLog = typeof notificationDispatchLog.$inferInsert;
export type EmployeeEvent = typeof employeeEvents.$inferSelect;
export type NewEmployeeEvent = typeof employeeEvents.$inferInsert;
export type SettingsEvent = typeof settingsEvents.$inferSelect;
export type NewSettingsEvent = typeof settingsEvents.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
export type AuditDataExport = typeof auditDataExports.$inferSelect;
export type NewAuditDataExport = typeof auditDataExports.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
export type PinnedItem = typeof pinnedItems.$inferSelect;
export type NewPinnedItem = typeof pinnedItems.$inferInsert;
export type AchievementEarned = typeof achievementsEarned.$inferSelect;
export type NewAchievementEarned = typeof achievementsEarned.$inferInsert;
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;

/**
 * WebAuthn device passkeys (migration 0054) — one row per registered
 * platform authenticator (phone fingerprint / Face ID). Punching attendance
 * requires a fresh user-verified assertion against one of these, which is
 * what makes the punch "biometric" rather than just "logged in".
 */
export const webauthnCredentials = pgTable(
  "webauthn_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: text("transports"),
    deviceLabel: text("device_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("webauthn_credentials_employee_idx").on(t.employeeId)],
);

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type IncentiveRequest = typeof incentiveRequests.$inferSelect;
export type NewIncentiveRequest = typeof incentiveRequests.$inferInsert;

// ── Attendance Phase B (migration 0059) ────────────────────────────────────
// Holiday calendar, paid/unpaid leave requests, and comp-off credits. All
// columns are `text` enums (canonical unions live in db/enums.ts).

export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holidayDate: date("holiday_date").notNull().unique(),
    label: text("label").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("holidays_date_idx").on(t.holidayDate)],
);

export type Holiday = typeof holidays.$inferSelect;
export type NewHoliday = typeof holidays.$inferInsert;

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"paid" | "unpaid">().notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    days: numeric("days", { precision: 5, scale: 1 }).notNull(),
    reason: text("reason"),
    status: text("status")
      .$type<"pending" | "approved" | "rejected" | "cancelled">()
      .notNull()
      .default("pending"),
    decidedById: uuid("decided_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("leave_requests_employee_start_idx").on(t.employeeId, t.startDate),
    index("leave_requests_status_idx").on(t.status),
  ],
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;

export const compOffCredits = pgTable(
  "comp_off_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    earnedDate: date("earned_date").notNull(),
    redeemedDate: date("redeemed_date"),
    status: text("status")
      .$type<"open" | "redeemed">()
      .notNull()
      .default("open"),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("comp_off_credits_employee_status_idx").on(t.employeeId, t.status)],
);

export type CompOffCredit = typeof compOffCredits.$inferSelect;
export type NewCompOffCredit = typeof compOffCredits.$inferInsert;
export type OutstandingEntry = typeof outstandingEntries.$inferSelect;
export type NewOutstandingEntry = typeof outstandingEntries.$inferInsert;
export type OutstandingFollowup = typeof outstandingFollowups.$inferSelect;
export type NewOutstandingFollowup = typeof outstandingFollowups.$inferInsert;

/**
 * Outstanding tracker v2 (native rebuild). Admin-managed rosters
 * (products / entities / payment modes) mirror the `clients` pattern; a
 * `contract` defines a payment schedule that is materialized into editable
 * `installment` rows; `collections` net oldest-first against balances.
 * `installments.contract_id` is intentionally nullable to allow ad-hoc
 * one-off receivables not tied to a contract.
 */
// ── Outstanding tracker v2 (native rebuild, migration 0055) ────────────────
export const outstandingProducts = pgTable(
  "outstanding_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outstanding_products_active_name_idx").on(t.isActive, t.name)],
);

export const outstandingEntitiesTbl = pgTable(
  "outstanding_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outstanding_entities_active_name_idx").on(t.isActive, t.name)],
);

export const outstandingPaymentModes = pgTable(
  "outstanding_payment_modes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outstanding_payment_modes_active_name_idx").on(t.isActive, t.name)],
);

// iter-2: responsibles became their own roster (was a direct employees FK).
// The actual DB FK swap happens in a later SQL migration; this model points the
// Drizzle references at the new target.
export const outstandingResponsibles = pgTable(
  "outstanding_responsibles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outstanding_responsibles_active_name_idx").on(t.isActive, t.name)],
);

export const outstandingContracts = pgTable(
  "outstanding_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientName: text("client_name").notNull(),
    contactPhone: text("contact_phone"),
    productId: uuid("product_id").references(() => outstandingProducts.id, { onDelete: "set null" }),
    entityId: uuid("entity_id").references(() => outstandingEntitiesTbl.id, { onDelete: "set null" }),
    responsibleId: uuid("responsible_id").references(() => outstandingResponsibles.id, { onDelete: "set null" }),
    expectedModeId: uuid("expected_mode_id").references(() => outstandingPaymentModes.id, { onDelete: "set null" }),
    cycle: text("cycle").$type<"subscription" | "monthly_bill" | "full_payment" | "partial_payment" | "slabs">().notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    baseAmount: numeric("base_amount", { precision: 14, scale: 2 }).notNull(),
    gstRate: integer("gst_rate").notNull().default(0),
    startDate: date("start_date").notNull(),
    retainerStart: date("retainer_start"),
    retainerEnd: date("retainer_end"),
    billDate: integer("bill_date"),
    emiCount: integer("emi_count"),
    frequency: text("frequency"),
    periods: integer("periods"),
    endDate: date("end_date"),
    pdcReceived: boolean("pdc_received").notNull().default(false),
    comments: text("comments"),
    importBatchId: uuid("import_batch_id"),
    status: text("status")
      .$type<"active" | "closed" | "written_off">()
      .notNull()
      .default("active"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outstanding_contracts_client_idx").on(t.clientName),
    index("outstanding_contracts_status_idx").on(t.status),
  ],
);

export const outstandingInstallments = pgTable(
  "outstanding_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractId: uuid("contract_id").references(() => outstandingContracts.id, { onDelete: "cascade" }),
    periodIndex: integer("period_index"),
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outstanding_installments_due_idx").on(t.dueDate),
    index("outstanding_installments_contract_idx").on(t.contractId, t.periodIndex),
  ],
);

export const outstandingCollections = pgTable(
  "outstanding_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientName: text("client_name").notNull(),
    contractId: uuid("contract_id").references(() => outstandingContracts.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paymentModeId: uuid("payment_mode_id").references(() => outstandingPaymentModes.id, { onDelete: "set null" }),
    responsibleId: uuid("responsible_id").references(() => outstandingResponsibles.id, { onDelete: "set null" }),
    collectedAt: date("collected_at").notNull(),
    comments: text("comments"),
    importBatchId: uuid("import_batch_id"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outstanding_collections_client_idx").on(t.clientName),
    index("outstanding_collections_date_idx").on(t.collectedAt),
  ],
);

export const outstandingAttachments = pgTable(
  "outstanding_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: text("owner_type").$type<"contract" | "collection">().notNull(),
    ownerId: uuid("owner_id").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outstanding_attachments_owner_idx").on(t.ownerType, t.ownerId)],
);

export type OutstandingResponsible = typeof outstandingResponsibles.$inferSelect;
export type NewOutstandingResponsible = typeof outstandingResponsibles.$inferInsert;
export type OutstandingContract = typeof outstandingContracts.$inferSelect;
export type NewOutstandingContract = typeof outstandingContracts.$inferInsert;
export type OutstandingInstallment = typeof outstandingInstallments.$inferSelect;
export type NewOutstandingInstallment = typeof outstandingInstallments.$inferInsert;
export type OutstandingCollection = typeof outstandingCollections.$inferSelect;
export type NewOutstandingCollection = typeof outstandingCollections.$inferInsert;
export type OutstandingAttachment = typeof outstandingAttachments.$inferSelect;
export type NewOutstandingAttachment = typeof outstandingAttachments.$inferInsert;

// ── Salary module (migration 0062) ─────────────────────────────────────────
// Per-employee salary profiles, monthly salary runs, advances, policy and
// policy-consent records. Money is numeric(14,2) rupees (house style), read as
// strings. The designations/paying_entities rosters are declared above (near
// employees) so the employees FKs resolve.

export const salaryProfiles = pgTable("salary_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .unique()
    .references(() => employees.id, { onDelete: "cascade" }),
  annualCtc: numeric("annual_ctc", { precision: 14, scale: 2 }).notNull().default("0"),
  tdsMonthly: numeric("tds_monthly", { precision: 14, scale: 2 }).notNull().default("0"),
  ptExempt: boolean("pt_exempt").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salaryAdvances = pgTable(
  "salary_advances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    advanceDate: date("advance_date").notNull(),
    fy: text("fy").notNull(),
    month: text("month").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("salary_advances_emp_month_idx").on(t.employeeId, t.month)],
);

export const salaryRuns = pgTable(
  "salary_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fy: text("fy").notNull(),
    month: text("month").notNull(),
    annualCtc: numeric("annual_ctc", { precision: 14, scale: 2 }).notNull(),
    daysInMonth: integer("days_in_month").notNull(),
    payableDays: numeric("payable_days", { precision: 6, scale: 2 }).notNull(),
    lateMarks: integer("late_marks").notNull().default(0),
    lateDeductionDays: numeric("late_deduction_days", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull(),
    pt: numeric("pt", { precision: 14, scale: 2 }).notNull().default("0"),
    tds: numeric("tds", { precision: 14, scale: 2 }).notNull().default("0"),
    advances: numeric("advances", { precision: 14, scale: 2 }).notNull().default("0"),
    pendingBalanceIn: numeric("pending_balance_in", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    netPayable: numeric("net_payable", { precision: 14, scale: 2 }).notNull(),
    disbursed: boolean("disbursed").notNull().default(false),
    disbursedAmount: numeric("disbursed_amount", { precision: 14, scale: 2 }),
    approvedById: uuid("approved_by_id").references(() => employees.id, { onDelete: "set null" }),
    generatedById: uuid("generated_by_id").references(() => employees.id, { onDelete: "set null" }),
    source: text("source").notNull().default("generated"),
    importBatchId: uuid("import_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("salary_runs_emp_month_uq").on(t.employeeId, t.month),
    index("salary_runs_month_idx").on(t.month),
    index("salary_runs_import_batch_idx").on(t.importBatchId),
  ],
);

export const salaryPolicies = pgTable("salary_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedById: uuid("uploaded_by_id").references(() => employees.id, { onDelete: "set null" }),
  isCurrent: boolean("is_current").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salaryPolicyConsents = pgTable(
  "salary_policy_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    signatureKind: text("signature_kind").notNull(),
    signaturePath: text("signature_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("salary_policy_consents_emp_version_uq").on(t.employeeId, t.policyVersion),
  ],
);

export type Designation = typeof designations.$inferSelect;
export type NewDesignation = typeof designations.$inferInsert;
export type PayingEntity = typeof payingEntities.$inferSelect;
export type NewPayingEntity = typeof payingEntities.$inferInsert;
export type SalaryProfile = typeof salaryProfiles.$inferSelect;
export type NewSalaryProfile = typeof salaryProfiles.$inferInsert;
export type SalaryAdvance = typeof salaryAdvances.$inferSelect;
export type NewSalaryAdvance = typeof salaryAdvances.$inferInsert;
export type SalaryRun = typeof salaryRuns.$inferSelect;
export type NewSalaryRun = typeof salaryRuns.$inferInsert;
export type SalaryPolicy = typeof salaryPolicies.$inferSelect;
export type NewSalaryPolicy = typeof salaryPolicies.$inferInsert;
export type SalaryPolicyConsent = typeof salaryPolicyConsents.$inferSelect;
export type NewSalaryPolicyConsent = typeof salaryPolicyConsents.$inferInsert;



/* ================================================================== */
/* Weekly Goals (Manan 2026-06) — per-week priority planner.           */
/* ================================================================== */

export const weeklyGoals = pgTable(
  "weekly_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    position: integer("position").notNull().default(1),
    client: text("client"),
    subject: text("subject"),
    priority: taskPriorityEnum("priority").notNull().default("imp_not_urgent"),
    incentive: boolean("incentive").notNull().default(false),
    incentiveAmount: integer("incentive_amount").notNull().default(0),
    kpi: boolean("kpi").notNull().default(false),
    targetDone: text("target_done"),
    pctDone: integer("pct_done").notNull().default(0),
    pctUpdatedById: uuid("pct_updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    pctUpdatedAt: timestamp("pct_updated_at", { withTimezone: true }),
    explanation: text("explanation"),
    linkUrl: text("link_url"),
    carriedFromId: uuid("carried_from_id"),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("weekly_goals_employee_week_idx").on(t.employeeId, t.weekStart),
    index("weekly_goals_week_idx").on(t.weekStart),
    index("weekly_goals_carried_from_idx").on(t.carriedFromId),
  ],
);

/* ================================================================== */
/* Index hub (Manan 2026-06) — the editable Ecosystem Index.           */
/* ================================================================== */

export const indexSections = pgTable(
  "index_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("index_sections_order_idx").on(t.sortOrder)],
);

export const indexLinks = pgTable(
  "index_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => indexSections.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("index_links_section_idx").on(t.sectionId, t.sortOrder)],
);

export type WeeklyGoal = typeof weeklyGoals.$inferSelect;
export type NewWeeklyGoal = typeof weeklyGoals.$inferInsert;
export type IndexSection = typeof indexSections.$inferSelect;
export type NewIndexSection = typeof indexSections.$inferInsert;
export type IndexLink = typeof indexLinks.$inferSelect;
export type NewIndexLink = typeof indexLinks.$inferInsert;

/* ================================================================== */
/* Dynamic form modules (Manan 2026-06) — Reimbursements, Leave        */
/* Approval, Record Reference, Participant Breakthrough.               */
/* ================================================================== */

/**
 * One submission to any of the four modules. `fields` holds the employee's
 * answers; `adminFields` holds the manual fields an admin fills while
 * processing. `status` is the decision (pending → approved/rejected/granted).
 */
export const moduleSubmissions = pgTable(
  "module_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: text("module").notNull(), // reimbursement | leave | reference | breakthrough
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fields: jsonb("fields").notNull().$type<Record<string, string>>().default({}),
    adminFields: jsonb("admin_fields").notNull().$type<Record<string, string>>().default({}),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    decidedById: uuid("decided_by_id").references(() => employees.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("module_submissions_module_created_idx").on(t.module, t.createdAt),
    index("module_submissions_employee_idx").on(t.employeeId),
  ],
);

/**
 * Admin-saved overrides for a form's field list. `form_key` is e.g.
 * "module:reimbursement", "module:reimbursement:admin", or
 * "incentive:bss_conversion". When a row exists its `fields` replace the code
 * default; deleting the row restores the default.
 */
export const formConfigs = pgTable("form_configs", {
  formKey: text("form_key").primaryKey(),
  fields: jsonb("fields").notNull().$type<FormFieldDef[]>().default([]),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Global, admin-extensible Product Name list shared by every product field. */
export const productOptions = pgTable(
  "product_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_options_label_idx").on(t.label)],
);

export type ModuleSubmission = typeof moduleSubmissions.$inferSelect;
export type NewModuleSubmission = typeof moduleSubmissions.$inferInsert;
export type FormConfig = typeof formConfigs.$inferSelect;
export type NewFormConfig = typeof formConfigs.$inferInsert;
export type ProductOption = typeof productOptions.$inferSelect;
export type NewProductOption = typeof productOptions.$inferInsert;
