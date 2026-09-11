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
  smallint,
  primaryKey,
  time,
  date,
  uniqueIndex,
  doublePrecision,
  real,
  bigint,
  bigserial,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  type DeviceKind,
  type AttendanceAuditAction,
  type AttendanceAuthorizationContext,
  type RemoteWorkMode,
  type RemoteWorkStatus,
  type RemoteReasonBucket,
  type RecurrenceMode,
  type OfficePhoneAvailability,
  TASK_STATUSES,
  EMPLOYEE_ROLES,
  TASK_PRIORITIES,
  APPROVAL_STATUSES,
  APPROVAL_LEVELS,
  type TaskStatus,
  type AccountType,
  type EmploymentStatus,
  type ExitReason,
  type RehireEligibility,
  type ReligionCode,
  type EventStatus,
  type EventSource,
  type HolidayAppliesTo,
  type AgreementType,
  type AgreementStatus,
  type HrTicketStatus,
  type HrTicketPriority,
  type HrTicketCategory,
  type HrTicketSource,
  type AppraisalDimension,
  type AppraisalCycleStatus,
  type AppraisalItemStatus,
  type AppraisalScoreStage,
  type KpiFrequency,
  type KpiAssignmentStatus,
  type KpiChangeType,
  type WorkerType,
  type PayBasis,
  type WorkSessionSource,
  type WorkSessionStatus,
  type BroadcastPriority,
  type BroadcastCategory,
  type BroadcastStatus,
  type BroadcastAckMode,
  type BroadcastAuthorIdentity,
  type BroadcastRecipientStatus,
  type BroadcastRecurrence,
  type TaskPriority,
} from "./enums";
import type { DocKind, SignatureStatus } from "@/lib/documents/signing";

export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const employeeRoleEnum = pgEnum("employee_role", EMPLOYEE_ROLES);
export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUSES);
export const approvalLevelEnum = pgEnum("approval_level", APPROVAL_LEVELS);

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
    /**
     * Where the uploaded avatar lives in the `avatars` bucket. The URL is
     * signed from this on demand; a signed URL is never stored, because it
     * expires and would leave a permanently broken image behind.
     */
    avatarPath: text("avatar_path"),
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
  // Performance criteria — "how we measure it" (mig 0061) — and KRA — "what we
  // measure" (mig 0065). Admin-editable free text, read by Profile >
  // Performance and the Weekly Goals board; both feed Star of the Month.
  performanceCriteria: text("performance_criteria"),
  kra: text("kra"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // M2.0 additions:
  firebaseUid: text("firebase_uid").unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  // Candidate guest-account (mig 0183). A "candidate" row is a job applicant's
  // limited login (fills only their own interview form). Always is_active=false
  // (excluded from every roster); login-gated on candidateActive instead. The
  // link is one-directional — a real employee never carries candidateIntakeId.
  accountType: text("account_type").notNull().default("employee").$type<AccountType>(),
  candidateIntakeId: uuid("candidate_intake_id").references((): AnyPgColumn => candidateIntake.id, {
    onDelete: "set null",
  }),
  candidateActive: boolean("candidate_active").notNull().default(false),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  // Post-joining workflow (migration 0174). `officialEmail` is the logged
  // firstname.lastname@<domain> company address; `personalEmail` is where the
  // welcome/credentials mail is sent. The two provisioning timestamps gate the
  // HR control-panel steps (email creation / asset allocation stay locked until
  // onboarding is submitted, then get stamped when HR completes them).
  officialEmail: text("official_email"),
  personalEmail: text("personal_email"),
  emailProvisionedAt: timestamp("email_provisioned_at", { withTimezone: true }),
  assetsAllocatedAt: timestamp("assets_allocated_at", { withTimezone: true }),
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
  // The number you CALL (0204). Distinct from `whatsappPhone` on purpose: the
  // two are frequently different people-facing numbers, and before this the
  // Admin Panel had to show the WhatsApp number under both labels.
  phone: text("phone"),
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
  density: text("density").notNull().default("cozy").$type<"cozy" | "compact" | "dense">(),
  accent: text("accent").notNull().default("#E10600"),
  oooStart: date("ooo_start"),
  oooEnd: date("ooo_end"),
  oooDelegateId: uuid("ooo_delegate_id").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
  managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
  /**
   * OFFBOARDING (migration 0212). A second axis alongside `isActive`.
   *
   * `isActive` answers "can they sign in" and remains the login gate.
   * `employmentStatus` answers "do they still work here" — a suspended
   * employee is inactive but current, and a former employee must stay former
   * even if someone re-enables their login by accident.
   *
   * 'anonymised' is the terminal state: the row survives so history and audit
   * chains stay intact, but name/email have been replaced with placeholders.
   */
  employmentStatus: text("employment_status")
    .notNull()
    .default("active")
    .$type<EmploymentStatus>(),
  lastWorkingDay: date("last_working_day"),
  /**
   * Exempts this person from every retention purge and from anonymisation.
   * Set it when someone leaves under investigation — destroying data on a
   * person you are investigating is spoliation, and no timer may do it.
   */
  legalHold: boolean("legal_hold").notNull().default(false),
  legalHoldReason: text("legal_hold_reason"),
  /** Non-null ⇒ name/email on this row are placeholders, not real data. */
  anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
  // #11 compulsory gates — how many tasks this person must RECEIVE from their
  // manager each working day (admin-configurable per employee; default 3).
  dailyTaskQuota: integer("daily_task_quota").notNull().default(3),
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
  // Attendance Phase A (0058) — weekly off day (0=Sun..6=Sat; default Sunday)
  // and per-employee schedule overrides. Null override => use org defaults.
  weeklyOff: integer("weekly_off").notNull().default(0),
  attOfficialStart: time("att_official_start"),
  attLateAfter: time("att_late_after"),
  attOfficialEnd: time("att_official_end"),
  attEarlyBefore: time("att_early_before"),
  // Worker types (0177) — employment archetype + per-employee grading overrides.
  // worker_type drives pay basis + grading mode (see lib/attendance/worker-type.ts);
  // full/half-day minutes let a shift (e.g. afternoon 5h) grade per-person instead
  // of org-wide; weekly_target_minutes is the part-time hours target (default 27h).
  workerType: text("worker_type").notNull().default("full_time").$type<WorkerType>(),
  attFullDayMinutes: integer("att_full_day_minutes"),
  attHalfDayMinutes: integer("att_half_day_minutes"),
  weeklyTargetMinutes: integer("weekly_target_minutes"),
  // Attendance Phase B (0060) — probation-end anchor for the paid-leave cycle.
  // Pulled forward from Phase C (salary): the leave allowance accrues from this
  // date and nothing accrues before it. Null => no anchor yet (0 paid leaves).
  probationEnd: date("probation_end"),
  // Monthly Events Master (migration 0130) — drives the personalised holiday
  // list. Nullable text; one of RELIGIONS ('hindu'|'christian'|'muslim'|
  // 'other'|'unspecified'). Admin-set in the profile / holidays admin.
  religion: text("religion").$type<ReligionCode>(),
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
 * Admin-managed VENDOR master (migration 0184) — the external parties a goal or a
 * project action can be tagged to ("Part of Project? → Yes → project + vendor").
 * Same managed-list shape as `departments`: `is_active` retires an option from
 * new pickers while existing goals/actions keep pointing at the row, so history
 * never loses the vendor's name.
 */
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vendors_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

/**
 * Admin-managed list of interview positions — the "Position Applied For" dropdown
 * in the Candidate Interview Form. Seeded with the default ladder (mig 0155);
 * authorised users add/remove options live. Never hard-deleted from records —
 * `is_active` hides an option from new pickers while old records keep their text.
 */
export const interviewPositions = pgTable(
  "interview_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("interview_positions_active_sort_idx").on(t.isActive, t.sortOrder, t.label)],
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

/* ──────────────────────────────────────────────────────────────────────────
 * PEOPLE GIVES — a referral / introduction database ("who can introduce us to
 * whom"). Lives in the Sales workspace. Four admin-managed lookup lists back
 * the form's dropdowns; soft-deleted lookup rows (is_active=false) stay joinable
 * so historical introductions never break. One introducer can appear on many
 * introductions over time (free-text introducer fields, not an FK).
 * ────────────────────────────────────────────────────────────────────────── */

export const pgReferenceSources = pgTable(
  "pg_reference_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pg_reference_sources_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const pgDesignations = pgTable(
  "pg_designations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pg_designations_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const pgBusinessCategories = pgTable(
  "pg_business_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pg_business_categories_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const pgSalesPeople = pgTable(
  "pg_sales_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pg_sales_people_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const pgIntroductions = pgTable(
  "pg_introductions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "Received On" — auto-populated on creation, read-only in the UI.
    receivedOn: date("received_on").notNull().default(sql`CURRENT_DATE`),
    referenceSourceId: uuid("reference_source_id").references(
      () => pgReferenceSources.id,
      { onDelete: "set null" },
    ),
    introducerFirstName: text("introducer_first_name").notNull(),
    introducerLastName: text("introducer_last_name").notNull(),
    introducerCell: text("introducer_cell"),
    prospectCompany: text("prospect_company").notNull(),
    prospectFirstName: text("prospect_first_name").notNull(),
    prospectLastName: text("prospect_last_name").notNull(),
    designationId: uuid("designation_id").references(() => pgDesignations.id, {
      onDelete: "set null",
    }),
    businessCategoryId: uuid("business_category_id").references(
      () => pgBusinessCategories.id,
      { onDelete: "set null" },
    ),
    natureOfBusiness: text("nature_of_business").notNull(),
    notes: text("notes"),
    nextReminderDate: date("next_reminder_date"),
    salesPersonId: uuid("sales_person_id").references(() => pgSalesPeople.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pg_introductions_created_idx").on(t.createdAt),
    index("pg_introductions_company_idx").on(t.prospectCompany),
    index("pg_introductions_reminder_idx").on(t.nextReminderDate),
  ],
);

export type PgIntroduction = typeof pgIntroductions.$inferSelect;
export type PgLookupRow = typeof pgReferenceSources.$inferSelect;

/* ──────────────────────────────────────────────────────────────────────────
 * TRAINING CENTRE — material library + test engine + induction + feedback CRM.
 * Open to all employees (watch + take tests); managers/admins author + review.
 * Lives in the Training workspace. Lookups soft-delete via is_active so removed
 * options stay joinable on historical rows. Multi-employee/department links use
 * uuid[] arrays (resolved to names in-app from the already-loaded roster).
 * ────────────────────────────────────────────────────────────────────────── */

export const tcSubjects = pgTable(
  "tc_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tc_subjects_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const tcServices = pgTable(
  "tc_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tc_services_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const tcMaterials = pgTable(
  "tc_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addedOn: date("added_on").notNull().default(sql`CURRENT_DATE`),
    subjectId: uuid("subject_id").references(() => tcSubjects.id, { onDelete: "set null" }),
    los: text("los"), // List of Subjects — the grouping/classification
    // Either an uploaded file (PDF / xls / short video) OR an external video URL.
    filePath: text("file_path"),
    fileName: text("file_name"),
    fileType: text("file_type"), // video | pdf | xls
    videoUrl: text("video_url"),
    notes: text("notes"),
    version: text("version"),
    versionNotes: text("version_notes"),
    createdByIds: uuid("created_by_ids").array().notNull().default(sql`'{}'::uuid[]`),
    assistedByIds: uuid("assisted_by_ids").array().notNull().default(sql`'{}'::uuid[]`),
    partOfInduction: boolean("part_of_induction").notNull().default(false),
    inductionDeptIds: uuid("induction_dept_ids").array().notNull().default(sql`'{}'::uuid[]`),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tc_materials_subject_idx").on(t.subjectId),
    index("tc_materials_induction_idx").on(t.partOfInduction),
    index("tc_materials_archived_idx").on(t.archived),
    index("tc_materials_created_idx").on(t.createdAt),
  ],
);

// Each material has up to two tests: kind 1 (pass ≥80%) and kind 2 (pass ≥75%).
export const tcTests = pgTable(
  "tc_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id").notNull().references(() => tcMaterials.id, { onDelete: "cascade" }),
    kind: integer("kind").notNull(), // 1 = primary (80%), 2 = harder (75%)
    title: text("title"),
    passMark: integer("pass_mark").notNull(), // percentage
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tc_tests_material_kind_uq").on(t.materialId, t.kind)],
);

export const tcQuestions = pgTable(
  "tc_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id").notNull().references(() => tcTests.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // mcq | fill_blank
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default(sql`'[]'::jsonb`), // mcq choices
    // mcq: indices of correct option(s); fill_blank: array of acceptable answers
    correctAnswers: jsonb("correct_answers").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    marks: integer("marks").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tc_questions_test_idx").on(t.testId, t.position)],
);

export const tcAttempts = pgTable(
  "tc_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id").notNull().references(() => tcTests.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    score: integer("score").notNull(), // percentage 0-100
    passed: boolean("passed").notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tc_attempts_emp_test_idx").on(t.employeeId, t.testId, t.takenAt)],
);

// One row per (employee, material) recording when they watched it.
export const tcWatchProgress = pgTable(
  "tc_watch_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id").notNull().references(() => tcMaterials.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tc_watch_material_emp_uq").on(t.materialId, t.employeeId)],
);

export const tcFeedback = pgTable(
  "tc_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedbackDate: date("feedback_date").notNull().default(sql`CURRENT_DATE`),
    // The person being rated — a staff member (FK) and/or a free-text name.
    ratedEmployeeId: uuid("rated_employee_id").references(() => employees.id, { onDelete: "set null" }),
    ratedName: text("rated_name"),
    clientName: text("client_name"),
    serviceId: uuid("service_id").references(() => tcServices.id, { onDelete: "set null" }),
    type: text("type").notNull(), // consultant | trainer | in_call
    rating: integer("rating"), // 1-5
    q1: text("q1"),
    q2: text("q2"),
    voiceNotePath: text("voice_note_path"),
    voiceTranscript: text("voice_transcript"),
    picturePath: text("picture_path"),
    escalate: boolean("escalate").notNull().default(false),
    escalatedToId: uuid("escalated_to_id").references(() => employees.id, { onDelete: "set null" }),
    resolution: boolean("resolution").notNull().default(false),
    resolutionHow: text("resolution_how"),
    signedOff: boolean("signed_off").notNull().default(false),
    signedOffById: uuid("signed_off_by_id").references(() => employees.id, { onDelete: "set null" }),
    signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    status: text("status").notNull().default("open"), // open|escalated|resolved|signed_off|archived
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tc_feedback_status_idx").on(t.status),
    index("tc_feedback_created_idx").on(t.createdAt),
    index("tc_feedback_service_idx").on(t.serviceId),
  ],
);

export type TcMaterial = typeof tcMaterials.$inferSelect;
export type TcQuestion = typeof tcQuestions.$inferSelect;
export type TcFeedback = typeof tcFeedback.$inferSelect;

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
    // 'sub_sub_action' added by migration 0203 (Project Plan). `kind` is plain
    // text with no check constraint, so widening this union needed no DDL.
    kind: text("kind")
      .$type<
        | "project"
        | "milestone"
        | "result"
        | "action"
        | "sub_action"
        | "sub_sub_action"
      >()
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
    // The external party doing / supplying this piece of work (migration 0184).
    // Set mainly on kind='action'; the PERSON side is already covered by
    // owner_id + project_members. ON DELETE SET NULL — retiring a vendor must
    // never delete project work.
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    // ── Project Plan hierarchy columns (migration 0203) ──────────────────────
    // The plan of record for the hierarchy table. On an executable row
    // (action / sub_action / sub_sub_action) these are mirrored onto the linked
    // task (tasks.project_node_id) on every write, so WMS and Google Calendar
    // read ONE task record rather than a second copy of the work.
    category: text("category"),
    purpose: text("purpose"),
    /** Whole minutes ("2 h 30 m" → 150) — same unit as tasks.estimatedMinutes. */
    durationMinutes: integer("duration_minutes"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    // ── Project status + partial progress (migration 0204) ───────────────────
    // ⚠ Migration 0204 may be UNAPPLIED in prod. Reads of these three go
    // through `loadPlanMeta()` in lib/queries/project-plan.ts, which catches an
    // undefined-column error and degrades to defaults — never add them to an
    // unguarded `.select()` or a bare `.returning()`, which would 500 the whole
    // Project screen against a database without 0204.
    //
    // These describe CONTAINER rows (project / milestone / result). An
    // executable row's status of record stays on its linked task
    // (tasks.status): that row IS one shared record with WMS and the calendar,
    // and a second status here would be a copy free to disagree with it.
    /** Working flow — the same six values as DOER_TASK_STATUSES. */
    status: text("status").$type<
      "dont_know" | "not_started" | "initiated" | "follow_up" | "need_info" | "done"
    >(),
    /** Restricted flow — an owner/admin verdict layered on top of `status`. */
    approvalStatus: text("approval_status").$type<
      "not_approved" | "approved" | "on_hold" | "cancelled"
    >(),
    /** Recorded partial completion 0–100. NULL = derive it from the work below. */
    progressPercent: integer("progress_percent"),
    // ── Container intake fields (migration 0213) ─────────────────────────────
    // ⚠ Migration 0213 may be UNAPPLIED in prod. These five are written only by
    // `createPlanContainer`, which retries without them when Postgres reports an
    // undefined column — never add them to an unguarded `.select()` or a bare
    // `.returning()`, which would 500 the whole Project screen against a
    // database without 0213. Same rule as the 0204 columns above.
    //
    // All five come from the ONE new-item form the four create buttons share —
    // the real WMS task form. On an executable row they live on the linked task
    // instead (tasks.title / .subject / .priority / .initiatorId / .tags), which
    // stays the single execution record; these columns exist because a
    // container row has no task to carry them.
    /** "Client Name" — the form's first field, mirroring tasks.title. */
    clientName: text("client_name"),
    subject: text("subject"),
    /** One of TASK_PRIORITIES (db/enums.ts). Text, like `kind` and `status`. */
    priority: text("priority").$type<TaskPriority>(),
    initiatorId: uuid("initiator_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    tags: text("tags").array(),
    /**
     * Reference links (migration 0214) — the form's Links section, kept as a
     * list rather than folded into `notes` the way the WMS task form folds
     * them, because the register renders them as a COLUMN and a column must not
     * be parsed out of prose. Same ⚠ as the columns above: read through
     * `loadPlanLinks`, never in an unguarded select.
     */
    links: text("links").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_nodes_parent_idx").on(t.parentId),
    index("project_nodes_kind_idx").on(t.kind, t.isArchived),
    index("project_nodes_vendor_idx").on(t.vendorId),
    index("project_nodes_parent_sort_idx").on(t.parentId, t.sortOrder),
    index("project_nodes_kind_sort_idx").on(t.kind, t.isArchived, t.sortOrder),
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
    // ⚠ Migration 0142 (Goals canvas Phase 7 — attachments gallery). These two
    // columns may be UNAPPLIED in prod: never reference them in an unguarded
    // select/insert outside the flag-guarded goals detail actions (a bare
    // `.select()`/`.returning()` on documents would 500 against a DB without
    // 0142 — use explicit column lists elsewhere).
    goalId: uuid("goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    weeklyGoalId: uuid("weekly_goal_id").references((): AnyPgColumn => weeklyGoals.id, {
      onDelete: "set null",
    }),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_created_idx").on(t.createdAt),
    index("documents_task_idx").on(t.taskId),
    index("documents_goal_idx").on(t.goalId),
    index("documents_weekly_goal_idx").on(t.weeklyGoalId),
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
    // Durable Google Calendar sync state (mig 0091) — drives the cron
    // reconciliation loop + retries + observable last-error.
    calendarAttempts: integer("calendar_attempts").notNull().default(0),
    calendarNextAttemptAt: timestamp("calendar_next_attempt_at", { withTimezone: true }),
    calendarLastSyncAt: timestamp("calendar_last_sync_at", { withTimezone: true }),
    calendarLastError: text("calendar_last_error"),
    archived: boolean("archived").notNull().default(false),
    // Recycle Bin (migration 0135) — "abandon" a task from the daily-loop: it
    // leaves the plan sources + task lists and sits in a manager Recycle Bin,
    // which can restore it (clear abandoned_at) or permanently delete it.
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    abandonedById: uuid("abandoned_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
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
    // Two-stage approval (migration 0185). 'none' → not signed off; 'manager' →
    // accepted by the doer's manager; 'admin' → final sign-off, which ONLY the
    // founder can give. The Kanban's two approved columns are derived from this,
    // not from new task_status values, so existing consumers are untouched.
    approvalLevel: approvalLevelEnum("approval_level").notNull().default("none"),
    managerApprovedById: uuid("manager_approved_by_id").references(() => employees.id, { onDelete: "set null" }),
    managerApprovedAt: timestamp("manager_approved_at", { withTimezone: true }),
    managerApprovalNote: text("manager_approval_note"),
    adminApprovedById: uuid("admin_approved_by_id").references(() => employees.id, { onDelete: "set null" }),
    adminApprovedAt: timestamp("admin_approved_at", { withTimezone: true }),
    adminApprovalNote: text("admin_approval_note"),
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
    // Phase 2 (Goal↔Task linkage, migration 0070) — provenance back to the
    // Weekly Goal this task was spun off from ("Add to Tasks"). Powers the
    // task→goal half of the two-way sync. NULL = an ordinary task. The FK
    // (ON DELETE SET NULL, so deleting a goal never deletes its task) lives in
    // migration 0070 — NOT declared with `.references()` here because pairing it
    // with weekly_goals.task_id's reference would create a circular type
    // (mirrors carriedFromId / recurrenceParentId, which are also FK-in-migration).
    originGoalId: uuid("origin_goal_id"),
    // Backlink to the Ambassadors referral that spawned this follow-up task
    // (mig 0092). FK-in-migration only (avoids a circular type with amb_referrals).
    ambReferralId: uuid("amb_referral_id"),
    // Task-detail redesign (mig 0176) — planned effort in minutes, shown as
    // "Estimated Time" next to the auto-computed Actual Time.
    estimatedMinutes: integer("estimated_minutes"),
  },
  (t) => [
    index("tasks_doer_created_idx").on(t.doerId, t.createdAt),
    // (doer, status) — Status-by-Doer and every "this person's open work"
    // filter. The doer/created and status/created pairs above cannot serve it:
    // neither leads with doer AND narrows by status. Migration 0186.
    index("tasks_doer_status_idx").on(t.doerId, t.status),
    index("tasks_origin_goal_idx").on(t.originGoalId),
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
    // End Time sorts/filters. Partial: a null completed_at means "still open",
    // which is most of the table and never what these queries want. Mig 0186.
    index("tasks_completed_at_idx")
      .on(t.completedAt)
      .where(sql`${t.completedAt} is not null`),
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

// ─────────────────────────────────────────────────────────────────────────────
// Task Time Intelligence (migration 0175) — measure ACTUAL active working time
// on a task across its full lifecycle (start→pause→resume→done→approve), incl.
// every rejection→revision cycle. Event-sourced: `task_time_events` is the
// append-only source of truth; `task_work_sessions` + `task_time_rollup` are
// projections rebuilt from it for fast reads. Nothing is ever overwritten.
// See docs/superpowers/specs/2026-08-03-task-time-intelligence-design.md
// ─────────────────────────────────────────────────────────────────────────────

/** The immutable event log — the single source of truth for all time actions. */
export const taskTimeEvents = pgTable(
  "task_time_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    // Who performed the action (doer or their manager acting on their behalf).
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    // Whose working time this session belongs to (always the task's doer).
    doerId: uuid("doer_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    // work_started | work_paused | work_resumed | work_done | sent_back |
    // approved | revision_started | auto_closed
    kind: text("kind").notNull(),
    revision: integer("revision").notNull().default(1),
    // Server-authoritative moment the action happened.
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    // Links the work_started/work_resumed → work_paused/work_done/auto_closed of
    // the same continuous session.
    sessionId: uuid("session_id"),
    // { endReason, comment, autoReason, ... }
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_time_events_task_at_idx").on(t.taskId, t.at),
    index("task_time_events_doer_at_idx").on(t.doerId, t.at),
    index("task_time_events_kind_idx").on(t.kind),
    index("task_time_events_session_idx").on(t.sessionId),
  ],
);
export type TaskTimeEvent = typeof taskTimeEvents.$inferSelect;

/** Session ledger (projection) — one row per continuous work session. Frozen
 *  once ended: duration_seconds is written exactly once and never changes. */
export const taskWorkSessions = pgTable(
  "task_work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    doerId: uuid("doer_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    // null = live (still running).
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    // paused | done | auto_idle | auto_daily
    endReason: text("end_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_work_sessions_task_started_idx").on(t.taskId, t.startedAt),
    index("task_work_sessions_doer_started_idx").on(t.doerId, t.startedAt),
    // Fast lookup of live sessions (for the auto-close cron + timer restore).
    index("task_work_sessions_live_idx").on(t.doerId).where(sql`${t.endedAt} is null`),
  ],
);
export type TaskWorkSession = typeof taskWorkSessions.$inferSelect;

/** Per-task rollup (projection) — recomputed inside the same transaction as each
 *  time event so task lists + reports stay fast without folding the event log. */
export const taskTimeRollup = pgTable("task_time_rollup", {
  taskId: uuid("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  totalActiveSeconds: integer("total_active_seconds").notNull().default(0),
  originalSeconds: integer("original_seconds").notNull().default(0),
  revisionSeconds: integer("revision_seconds").notNull().default(0),
  sessionCount: integer("session_count").notNull().default(0),
  pauseCount: integer("pause_count").notNull().default(0),
  rejectionCount: integer("rejection_count").notNull().default(0),
  currentRevision: integer("current_revision").notNull().default(1),
  longestSessionSec: integer("longest_session_sec").notNull().default(0),
  shortestSessionSec: integer("shortest_session_sec"),
  firstStartedAt: timestamp("first_started_at", { withTimezone: true }),
  lastDoneAt: timestamp("last_done_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  openSessionCount: integer("open_session_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
},
(t) => [
  // This projection had NOTHING but its primary key. Both columns are read
  // constantly but so far only by PK lookup or full aggregate scan; these exist
  // so a server-side Start Time sort or a rework filter does not seq-scan when
  // one is added. Partial, so they stay small. Migration 0186.
  index("task_time_rollup_first_started_idx")
    .on(t.firstStartedAt)
    .where(sql`${t.firstStartedAt} is not null`),
  index("task_time_rollup_rejections_idx")
    .on(t.rejectionCount)
    .where(sql`${t.rejectionCount} > 0`),
]);
export type TaskTimeRollup = typeof taskTimeRollup.$inferSelect;

/** Camera captures taken during a live session (private, super-admin-only). */
export const taskWorkSnapshots = pgTable(
  "task_work_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => taskWorkSessions.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    doerId: uuid("doer_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    storagePath: text("storage_path").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_work_snapshots_session_idx").on(t.sessionId, t.capturedAt),
    index("task_work_snapshots_doer_idx").on(t.doerId, t.capturedAt),
  ],
);
export type TaskWorkSnapshot = typeof taskWorkSnapshots.$inferSelect;

/** Per-employee consent to camera monitoring during work sessions. */
export const taskTimeConsent = pgTable("task_time_consent", {
  employeeId: uuid("employee_id")
    .primaryKey()
    .references(() => employees.id, { onDelete: "cascade" }),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  policyVersion: text("policy_version").notNull(),
});
export type TaskTimeConsent = typeof taskTimeConsent.$inferSelect;

// ── Task detail redesign (migration 0176) — checklist sub-items + attachments ──

/** Per-task checklist sub-items (the "2/5 completed" card). */
export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    done: boolean("done").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    doneById: uuid("done_by_id").references(() => employees.id, { onDelete: "set null" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_checklist_task_idx").on(t.taskId, t.sortOrder)],
);
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;

/** Per-task file attachments (Supabase private documents bucket). */
export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_attachments_task_idx").on(t.taskId, t.createdAt)],
);
export type TaskAttachment = typeof taskAttachments.$inferSelect;

/**
 * Attachments on a PLAN row — Milestone, Result, or any project_node
 * (migration 0212).
 *
 * Same shape and same storage as `taskAttachments` above (the private Supabase
 * `documents` bucket), deliberately: a container level has no task to hang a
 * file off, and minting a placeholder task per milestone would push phantom
 * work into WMS and onto calendars. See the migration for the full note.
 */
export const projectNodeAttachments = pgTable(
  "project_node_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_node_attachments_node_idx").on(t.nodeId, t.createdAt)],
);
export type ProjectNodeAttachment = typeof projectNodeAttachments.$inferSelect;

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
  // Task nudge — an on-demand "⚡ ping" from the initiator / doer's manager /
  // admin to the doer. In-app + push only (routed inbox-only for email in
  // lib/email/resend.ts); never sent via Slack/WhatsApp templates.
  "nudged",
  // Attendance Phase A (0058) — text column, no DB change needed.
  "attendance_late",
  "attendance_late_waived",
  "attendance_half_day",
  "attendance_device",
  // Attendance Phase B (0059) — late-deduction alert. Inbox-only until B8 wires
  // its email template; routed to the inbox-only arm in lib/email/resend.ts.
  "attendance_late_deduction",
  // Weekly Goals reminder cron — text column, no DB change needed. These are
  // sent directly by app/api/cron/weekly-goals (bypassing the matrix), so they
  // never flow through lib/notifications/dispatch.ts.
  "weekly_goals_assigned",
  "weekly_goals_fill_reminder",
  "weekly_goals_incomplete",
  // Training Centre — a test failure pings the employee + their manager.
  "training_test_failed",
  // Employees DCC — end-of-day "fill your KPIs" reminder. Text column, no DB
  // change; sent directly by app/api/cron/dcc-reminder (bypasses the matrix).
  "dcc_fill_reminder",
  // Ambassadors — a due partner reminder or a stalled referral nudge. Text
  // column, no DB change; sent directly by app/api/cron/ambassador-reminders
  // (bypasses the matrix), routed to /ambassadors.
  "ambassador_reminder",
  // Goals Cascade (migration 0131) — Saturday commit + Monday approval flow.
  // Text column, no DB change; the commit/approve reminders are sent directly by
  // app/api/cron/goals (bypasses the matrix); the committed/approved acks are
  // in-app inbox pings. Routed to /goals.
  "goals_commit_reminder",
  "goals_approval_reminder",
  "goals_committed",
  "goals_approved",
  // HR confirmations (migration 0138) — a daily nudge to super-admins that a
  // probation / free-training period is ending. Text column, no DB change; sent
  // directly by app/api/cron/hr-confirmations (bypasses the matrix).
  "hr_confirmation_due",
  // HR Support / Ticketing (migration 0145) — text column, no DB change. The
  // HR module owns its email templates (lib/email/resend.ts is edited in the
  // HR phase); until then these kinds render no email (null template) and the
  // in-app inbox row still surfaces. Confidential (grievance) tickets ALWAYS
  // use generic copy — never leak the subject line into a notification.
  "hr_ticket_created",       // → the routed assignee (+ super-admins for grievances)
  "hr_ticket_assigned",      // → the new assignee
  "hr_ticket_replied",       // → the other side of the thread (never internal notes)
  "hr_ticket_status_changed",// → the requester (employee-facing label copy)
  "hr_ticket_sla_breach",    // → assignee + super-admins, from the breach cron
  "hr_ticket_csat_request",  // → requester when the ticket resolves
  // Appraisal (migration 0146) — IN-APP ONLY by design (no email templates —
  // lib/email/resend.ts returns null for kinds it doesn't know, so these are
  // inbox/push-only without touching the email layer).
  "appraisal_cycle_opened",     // → every employee with published items
  "appraisal_self_reminder",    // → employees with pending self scores
  "appraisal_manager_pending",  // → manager when a downline self score lands
  "appraisal_management_pending",// → management when a manager score lands
  "appraisal_finalized",        // → the employee when final scores lock
  // Enterprise Communications (ECOS, migration 0179) — an official broadcast
  // delivered to a targeted employee. The in-app inbox row is created via
  // notify(); the broadcast email is sent by lib/email/resend.ts →
  // sendBroadcastEmail (notify's per-task email arm renders no template for
  // this kind, so it's inbox-only through the dispatcher). Deep-links to
  // /communications/<broadcastId>.
  "broadcast",
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
  /** Secondary Admin PIN (scrypt/bcrypt hash) required to publish policy edits. */
  adminPinHash: text("admin_pin_hash"),
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
  // 0054 — geofenced attendance. The office anchor point + how far from it
  // a punch is accepted (metres). Null lat/lng = geofence not configured,
  // punches are accepted from anywhere (location still recorded if granted).
  officeLat: doublePrecision("office_lat"),
  officeLng: doublePrecision("office_lng"),
  attendanceRadiusM: integer("attendance_radius_m").notNull().default(100),
  // 0072 — office Wi-Fi public IP allowlist. When set, attendance can only be
  // marked from one of these IPs/CIDRs (i.e. on the office network), which mock
  // GPS cannot defeat. NULL/empty = gate OFF (punches accepted from anywhere).
  officeIpAllowlist: text("office_ip_allowlist").array(),
  // Attendance Phase A (0058) — org-wide schedule defaults. Per-employee
  // overrides live on `employees`; null there => fall back to these.
  attLateAfter: time("att_late_after").default("10:50"),
  attEarlyBefore: time("att_early_before").default("19:30"),
  attFullDayHours: numeric("att_full_day_hours").default("9"),
  attHalfDayHours: numeric("att_half_day_hours").default("5"),
  // 0162 — HR "assignment owner": the employee who receives the auto-created
  // task when an HR assignment is dispatched from a candidate's Management
  // Assessment. NULL => resolve by name ("Rutvisha Mehta") at read time.
  hrAssignmentOwnerId: uuid("hr_assignment_owner_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  // 0163 — super-admin-set weighting (0..100) per Candidate-Evaluation section,
  // keyed by EVAL_CATEGORIES id (culture, behaviour, … personality). Must total
  // 100 (validated in the app). NULL => the app falls back to EQUAL weights
  // across the eight sections. Shape: { "culture": 13, "behaviour": 12, … }.
  evaluationWeights: jsonb("evaluation_weights").$type<Record<string, number>>(),
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
    /** WFH/on-site attendance (migration 0127): work mode + photo evidence.
     *  Office geofenced punches leave these null. */
    workMode: text("work_mode"), // office | wfh | client_site | field | other
    evidencePath: text("evidence_path"),
    recordedById: uuid("recorded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    // Anti-proxy Phase 2 (2026-08) — device-health attestation + spoof signals
    // captured at the punch. NULL until the app sends them / integrity is
    // provisioned (report-only by default, so old punches simply carry nulls).
    integrityVerdict: text("integrity_verdict"), // strong | device | basic | failed | unverified
    mockLocation: boolean("mock_location"), // the app reported a mocked GPS provider
    /** Which saved client site a `client_site` punch was taken at (0205).
     *  Denormalised onto the punch on purpose: the request can later be edited
     *  and the location retired, but a punch has to keep saying where it was. */
    clientLocationId: uuid("client_location_id").references((): AnyPgColumn => clientLocations.id, {
      onDelete: "set null",
    }),
    anomalyFlags: jsonb("anomaly_flags").$type<string[]>(), // ["mock_location","integrity_weak",…]
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
 * Client sites an employee can be marked present at (0205).
 *
 * STANDALONE, not hung off `clients` or `billing_clients`: this records where
 * somebody physically WAS, it needs a pin and a radius that no existing client
 * list carries, and it must not inherit a billing record's lifecycle.
 *
 * Only Manan, Rutvisha and Ruchita may write these — see
 * lib/auth/attendance-permissions.ts. Everyone else picks from them.
 */
export const clientLocations = pgTable(
  "client_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    address: text("address"),
    /** Nullable so a site can be named before anyone drops the pin. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Mirrors org_settings.attendance_radius_m — one idea, one shape. */
    radiusM: integer("radius_m").notNull().default(200),
    /** The pasted Maps link, kept verbatim for humans; lat/lng is what validates. */
    mapsUrl: text("maps_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive and only among ACTIVE rows, so a retired client's name
    // can be reused without deleting history.
    uniqueIndex("client_locations_name_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.isActive}`),
  ],
);
export type ClientLocation = typeof clientLocations.$inferSelect;
export type NewClientLocation = typeof clientLocations.$inferInsert;

/**
 * Remote-work requests — the missing middle between "I'd like to work from
 * home" and "this day counts" (0205).
 *
 * `work_mode` on a punch has existed since 0127, but nothing gated it: applying
 * for WFH and being granted it were the same act. A punch in any non-office mode
 * now requires an APPROVED row here for that employee and date, enforced by the
 * `attendance_logs_require_approved_remote` trigger rather than by each caller
 * remembering.
 *
 * Decided by Rutvisha, Manan or Om only (lib/auth/attendance-permissions.ts).
 */
export const remoteWorkRequests = pgTable(
  "remote_work_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    /**
     * The agreed hours (0209). Stored even for an all-day request rather than
     * derived from a constant: a constant that later changes would silently
     * restate what every past request meant.
     */
    allDay: boolean("all_day").notNull().default(true),
    startTime: time("start_time").notNull().default("10:30"),
    endTime: time("end_time").notNull().default("19:30"),
    workMode: text("work_mode").$type<RemoteWorkMode>().notNull(),
    clientLocationId: uuid("client_location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    /** WHO initiated the day — countable, unlike the free-text reason (0209). */
    reasonBucket: text("reason_bucket").$type<RemoteReasonBucket>(),
    /**
     * The pattern this row was GENERATED from, kept for display only (0209).
     * Recurrence expands to one row per date at submit time, so nothing reads
     * this to work out which days are covered — the rows are the answer.
     */
    recurrence: text("recurrence").$type<RecurrenceMode>().notNull().default("none"),
    /** Groups the rows one repeating request produced, so it can be shown — and
     *  removed — as one thing. */
    seriesId: uuid("series_id"),
    status: text("status").$type<RemoteWorkStatus>().notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: uuid("decided_by_id").references(() => employees.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // These MIRROR migration 0205 exactly. Drizzle never created this table, so
  // anything declared loosely here reads as drift to `drizzle-kit generate`.
  (t) => [
    uniqueIndex("remote_work_requests_emp_date_uq").on(t.employeeId, t.workDate),
    index("remote_work_requests_status_idx").on(t.status, t.workDate.desc()),
    index("remote_work_requests_pending_idx")
      .on(t.workDate.desc())
      .where(sql`${t.status} = 'pending'`),
    check("remote_work_requests_mode_chk", sql`${t.workMode} in ('wfh', 'client_site', 'field')`),
    check(
      "remote_work_requests_status_chk",
      sql`${t.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "remote_work_requests_client_chk",
      sql`${t.workMode} <> 'client_site' or ${t.clientLocationId} is not null`,
    ),
    check(
      "remote_work_requests_decided_chk",
      sql`${t.status} = 'pending' or (${t.decidedById} is not null and ${t.decidedAt} is not null)`,
    ),
    index("remote_work_requests_series_idx")
      .on(t.seriesId)
      .where(sql`${t.seriesId} is not null`),
    check("remote_work_requests_time_chk", sql`${t.endTime} > ${t.startTime}`),
    check(
      "remote_work_requests_bucket_chk",
      sql`${t.reasonBucket} is null or ${t.reasonBucket} in ('manan_approved', 'client_requested', 'manager_approved')`,
    ),
    check(
      "remote_work_requests_recurrence_chk",
      sql`${t.recurrence} in ('none', 'daily', 'weekdays', 'weekly', 'custom')`,
    ),
  ],
);
export type RemoteWorkRequest = typeof remoteWorkRequests.$inferSelect;
export type NewRemoteWorkRequest = typeof remoteWorkRequests.$inferInsert;

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
    /**
     * 'laptop' | 'phone' (0206). DESCRIPTIVE ONLY since 0214 — it names the
     * device on the admin screen and nothing else. An employee holds two device
     * slots and either kind may fill either one, so two laptops is as valid as a
     * laptop and a phone. Rows predating 0206 are phones: the table was populated
     * exclusively by the mobile app's keystore id.
     */
    kind: text("kind").notNull().default("phone").$type<DeviceKind>(),
    // Device-allowlist lifecycle (Phase 1 anti-proxy, 2026-08). A device must be
    // 'approved' to punch. New registrations land 'pending' (admin approves; at
    // most 2 approved per employee); EXISTING rows were grandfathered to
    // 'approved' by the migration default so nobody was locked out on rollout.
    // 'revoked' = a lost/replaced device an admin retired.
    status: text("status").notNull().default("approved"), // approved | pending | revoked
    approvedById: uuid("approved_by_id").references(() => employees.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Device-access control (0215) — the other half of a revocation. Revoking a
    // device removes someone's ability to work, and until 0215 it left no trace
    // of who did it or why. A revoked row is NEVER deleted: it stays as history.
    revokedById: uuid("revoked_by_id").references(() => employees.id, { onDelete: "set null" }),
    revokeReason: text("revoke_reason"),
    /** Who ENROLLED this row. NULL for the self-service paths (the app's
     *  "Register this device" button, the web punch's first-visit adoption);
     *  set when a device administrator registers one on someone's behalf. */
    registeredById: uuid("registered_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Last seen anywhere in the WMS (0215), as opposed to `lastUsedAt`, which
     *  the PUNCH path stamps. Separate because "is this laptop still in use" is
     *  now asked of the whole application: collapsing the two would make a
     *  device that browses daily but never punches look abandoned. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("mobile_devices_device_id_uq").on(t.deviceId),
    index("mobile_devices_employee_idx").on(t.employeeId),
    index("mobile_devices_kind_idx").on(t.kind),
    // ONE approved device per kind (0215) — the device-access rule is one
    // desktop/laptop AND one mobile phone, so the cardinality is expressible as
    // a partial unique index again and 0206's index is deliberately back. (0214
    // had dropped it for "two approved of any kind", which no unique index can
    // express; that rule is retired.) The `mobile_devices_cap_approved_trg`
    // trigger 0215 installs enforces the SAME rule with a readable error — the
    // index is the guarantee, the trigger is the message.
    uniqueIndex("mobile_devices_employee_kind_approved_uq")
      .on(t.employeeId, t.kind)
      .where(sql`${t.status} = 'approved'`),
    index("mobile_devices_employee_status_idx").on(t.employeeId, t.status),
    check("mobile_devices_kind_chk", sql`${t.kind} in ('laptop', 'phone')`),
  ],
);
export type MobileDevice = typeof mobileDevices.$inferSelect;

/**
 * One-time punch nonces (anti-proxy Phase 2, 2026-08). The server issues a short-
 * lived random nonce; the app requests a Play Integrity / App Attest token OVER
 * that nonce and returns it with the punch. Verifying the signed token embeds the
 * exact nonce — and burning the nonce after use — defeats REPLAY (re-sending a
 * captured punch) and RELAY (a proxy forwarding a genuine device's request). A
 * cron sweeps expired rows.
 */
export const punchNonces = pgTable(
  "punch_nonces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    nonce: text("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("punch_nonces_nonce_uq").on(t.nonce),
    index("punch_nonces_employee_idx").on(t.employeeId),
  ],
);

/**
 * ATTENDANCE AUDIT LOG (migration 0215) — the immutable trail behind every
 * privileged attendance change.
 *
 * APPEND-ONLY, AND NOT ONLY BY CONVENTION. 0215 installs BEFORE UPDATE / DELETE
 * / TRUNCATE triggers that raise unconditionally, so the application — which
 * connects as the database owner and therefore cannot be constrained by REVOKE
 * alone — cannot rewrite history either. Drizzle has no way to declare a
 * trigger, so writing `db.update(attendanceAuditLog)` compiles fine and fails at
 * runtime, by design. There is no code path in this repository that tries.
 *
 * SEPARATE FROM `employeeEvents` on purpose: that table is a generic
 * admin-activity feed with a jsonb payload, while the change-log screen filters
 * on employee, actor, attendance date, action and device — columns, not jsonb
 * extraction in a WHERE clause.
 */
export const attendanceAuditLog = pgTable(
  "attendance_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The punch row. NULLABLE + set-null on delete: a DELETE action's whole
     *  point is that the row is gone, and an audit trail that vanished with the
     *  record it describes would be worthless exactly when it matters. */
    attendanceLogId: uuid("attendance_log_id").references((): AnyPgColumn => attendanceLogs.id, {
      onDelete: "set null",
    }),
    /** WHOSE attendance changed. */
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** WHO changed it. Restrict — an actor cannot be deleted out of the trail. */
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    action: text("action").notNull().$type<AttendanceAuditAction>(),
    field: text("field"),
    /** The DAY whose attendance changed — not the day the change was made. */
    attendanceDate: date("attendance_date").notNull(),
    punchKind: text("punch_kind").$type<"in" | "out">(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    /** The device the change was made FROM. Denormalised label/kind alongside
     *  the fk so the log can still name the device after that row is revoked. */
    deviceRowId: uuid("device_row_id").references((): AnyPgColumn => mobileDevices.id, {
      onDelete: "set null",
    }),
    deviceLabel: text("device_label"),
    deviceKind: text("device_kind"),
    /** The authorization decision as the SERVER made it — which capability was
     *  used, which locks were overridden. The difference between a log that says
     *  what happened and one that can answer whether it should have. */
    authorizationContext: jsonb("authorization_context").$type<AttendanceAuthorizationContext>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attendance_audit_employee_date_idx").on(t.employeeId, t.attendanceDate),
    index("attendance_audit_actor_created_idx").on(t.actorId, t.createdAt),
    index("attendance_audit_created_idx").on(t.createdAt),
    index("attendance_audit_action_idx").on(t.action),
  ],
);
export type AttendanceAuditRow = typeof attendanceAuditLog.$inferSelect;
export type NewAttendanceAuditRow = typeof attendanceAuditLog.$inferInsert;

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
        "bss_conversion" | "sales_pitch" | "client_happiness" | "group_intro"
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
export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
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

/**
 * The admin-editable leave dropdown (0208) — Casual, Sick, Exam, Vacation…
 *
 * SEPARATE FROM `leave_requests.kind`, deliberately. `kind` is 'paid' | 'unpaid'
 * and the salary engine branches on it, so it has to stay a closed union that
 * nobody can extend from a form. The category is the human reason, it is meant
 * to grow, and it must never sit in the path of payroll.
 *
 * Rows RETIRE rather than delete: a leave taken under "Family Duties" must keep
 * saying so after someone tidies the dropdown.
 */
export const leaveCategories = pgTable(
  "leave_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Explicit, so the dropdown reads in the order the org thinks in. */
    sortOrder: integer("sort_order").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // MIRROR migration 0208 exactly — drizzle never created this table, so
  // anything declared loosely here reads as drift to `drizzle-kit generate`.
  (t) => [
    uniqueIndex("leave_categories_name_uq")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.isActive}`),
    index("leave_categories_order_idx")
      .on(t.sortOrder, t.name)
      .where(sql`${t.isActive}`),
  ],
);

export type LeaveCategory = typeof leaveCategories.$inferSelect;
export type NewLeaveCategory = typeof leaveCategories.$inferInsert;

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"paid" | "unpaid">().notNull(),
    /** The human reason, from the admin-editable list (0208). Null on every row
     *  that predates it, and on one whose category was since retired. */
    categoryId: uuid("category_id").references(() => leaveCategories.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /**
     * Half-day boundaries (0208). NOT symmetric, and the asymmetry is the point:
     * `startHalfDay` means the leave begins at MIDDAY on `startDate` (you work
     * the morning), `endHalfDay` means it ends at MIDDAY on `endDate` (you are
     * back after lunch). See lib/attendance/leave-cycle.leaveDays.
     */
    startHalfDay: boolean("start_half_day").notNull().default(false),
    endHalfDay: boolean("end_half_day").notNull().default(false),
    days: numeric("days", { precision: 5, scale: 1 }).notNull(),
    reason: text("reason"),
    /**
     * Reachability while away (0208). Nullable, NOT defaulted: every row that
     * predates the questions was never asked them, and a default would answer
     * on the employee's behalf.
     */
    availPersonalPhone: boolean("avail_personal_phone"),
    availOfficePhone: text("avail_office_phone").$type<OfficePhoneAvailability>(),
    availComputer: boolean("avail_computer"),
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
    index("leave_requests_category_idx")
      .on(t.categoryId)
      .where(sql`${t.categoryId} is not null`),
    // A one-day leave cannot be half at BOTH ends — that names the same half
    // twice and would arithmetically cancel to zero days.
    check(
      "leave_requests_half_day_chk",
      sql`${t.startDate} <> ${t.endDate} or not (${t.startHalfDay} and ${t.endHalfDay})`,
    ),
    check(
      "leave_requests_office_phone_chk",
      sql`${t.availOfficePhone} is null or ${t.availOfficePhone} in ('yes', 'no', 'na')`,
    ),
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
/**
 * THE PRODUCT MASTER (migration 0055; `code` added by 0217).
 *
 * Named `outstanding_products` because Outstanding was the module that first
 * needed it, but it is the company's ONE product roster — `/admin/products`
 * manages it and every product dropdown reads it. The physical name is kept
 * rather than renamed because `outstanding_contracts.product_id` and
 * `outstanding_collections` reference it, and a table rename buys a tidier name
 * at the cost of churning every reader of a live financial table.
 *
 * `code` is NULLABLE on purpose. A product whose name is already a code (BSS,
 * PSO) was backfilled by 0217; a multi-word one (Altus Conclave, Retainer) was
 * deliberately left blank for an admin to fill in, rather than given a code
 * invented by a migration. The IDENTIFIER is and always was `id` — neither
 * `name` nor `code` is a foreign key anywhere.
 */
export const outstandingProducts = pgTable(
  "outstanding_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    /** Short product code, e.g. "BSS" / "GP". Unique case-insensitively among
     *  the rows that have one (partial unique index in 0217). */
    code: text("code"),
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
  // Worker types (0177) — non-CTC pay bases. `pay_type` mirrors the employee's
  // worker_type resolution; the rate fields are used only for their basis:
  //  hourly → monthly_pay_at_target (₹) over weekly_target_hours; fixed_fee → monthly_fee.
  payType: text("pay_type").notNull().default("monthly_ctc").$type<PayBasis>(),
  monthlyPayAtTarget: numeric("monthly_pay_at_target", { precision: 14, scale: 2 }),
  weeklyTargetHours: numeric("weekly_target_hours", { precision: 6, scale: 2 }),
  monthlyFee: numeric("monthly_fee", { precision: 14, scale: 2 }),
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
    // Worker types (0177) — pay basis + hourly figures (null for monthly_ctc).
    payType: text("pay_type").notNull().default("monthly_ctc").$type<PayBasis>(),
    workedHours: numeric("worked_hours", { precision: 8, scale: 2 }),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
    /** The month's required hours the pay was measured against, frozen at issue
     *  time (0211) so a closed month can display its target without recomputing
     *  attendance. NULL on rows generated before the column existed. */
    targetHours: numeric("target_hours", { precision: 8, scale: 2 }),
    // Additional payable hours beyond the expected hours, frozen at issue time
    // (migration 0191). Priced at the same hourly rate — never a premium — and
    // non-zero only for the hourly shift types: a full-timer's surplus is
    // credit against the running month's targets, not cash.
    overtimeHours: numeric("overtime_hours", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    overtimeAmount: numeric("overtime_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
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

// ---------------------------------------------------------------------------
// Incentive MIS (migration 0064) — native rebuild of the "Altus Eco System
// MIS" Google Sheet incentive tabs. Three read-mostly tables imported (and
// re-imported, idempotently) from the live sheet via scripts/import-incentives.ts:
//   - incentive_catalog   ← "3.Incentive Chart"
//   - incentive_entries   ← "4.Incentive MIS"
//   - incentive_projects  ← "5. Altus Projects MIS"
// Money is numeric(14,2) rupees (house style; read as strings). Employee
// display names from the sheet are messy ("Foo Bar ( Intern - Baz )"), so we
// keep the raw text AND a best-effort employee_id FK resolved on the leading
// name. Period months ("Apr-26") are stored as the first-of-month date.
// `unpaid` is always DERIVED (approved − paid); never stored. The older
// incentive_requests table (migration 0053) is unrelated and left untouched.
// ---------------------------------------------------------------------------

export const incentiveCatalog = pgTable("incentive_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  salesEligible: boolean("sales_eligible"),
  internsEligible: boolean("interns_eligible"),
  notes: text("notes"),
  sortOrder: integer("sort_order"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incentiveEntries = pgTable(
  "incentive_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    srcSrNo: integer("src_sr_no"),
    entryDate: date("entry_date"),
    incentiveName: text("incentive_name").notNull(),
    periodMonth: date("period_month"),
    empName: text("emp_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    participantName: text("participant_name"),
    prospectGroupName: text("prospect_group_name"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    approved: boolean("approved").notNull().default(false),
    approvedAmt: numeric("approved_amt", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    paid: boolean("paid").notNull().default(false),
    paidAmt: numeric("paid_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    paidDate: date("paid_date"),
    // WS-4 Phase B1 — 3-status split (migration 0106). booked = partial client
    // payment; accrued = full client payment (backfilled from approved_amt).
    bookedAmt: numeric("booked_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    accruedAmt: numeric("accrued_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    clientStatus: text("client_status"),
    payoutRunId: uuid("payout_run_id").references(() => salaryRuns.id, { onDelete: "set null" }),
    paidById: uuid("paid_by_id").references(() => employees.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incentive_entries_period_idx").on(t.periodMonth),
    index("incentive_entries_employee_idx").on(t.employeeId),
  ],
);

export const incentiveProjects = pgTable(
  "incentive_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    srcSrNo: integer("src_sr_no"),
    subject: text("subject"),
    projectName: text("project_name"),
    initiatorName: text("initiator_name"),
    supervisorName: text("supervisor_name"),
    supervisorId: uuid("supervisor_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    internName: text("intern_name"),
    internId: uuid("intern_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    projectDetails: text("project_details"),
    periodMonth: date("period_month"),
    approved: boolean("approved").notNull().default(false),
    empAmount: numeric("emp_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    internAmount: numeric("intern_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    empApprovedAmt: numeric("emp_approved_amt", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    internApprovedAmt: numeric("intern_approved_amt", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    paid: boolean("paid").notNull().default(false),
    empPaidAmt: numeric("emp_paid_amt", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    internPaidAmt: numeric("intern_paid_amt", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    paidDate: date("paid_date"),
    // WS-4 Phase B1 — 3-status split per leg (migration 0106).
    empBookedAmt: numeric("emp_booked_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    empAccruedAmt: numeric("emp_accrued_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    internBookedAmt: numeric("intern_booked_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    internAccruedAmt: numeric("intern_accrued_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    payoutRunId: uuid("payout_run_id").references(() => salaryRuns.id, { onDelete: "set null" }),
    initiatorNotes: text("initiator_notes"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incentive_projects_period_idx").on(t.periodMonth),
    index("incentive_projects_supervisor_idx").on(t.supervisorId),
    index("incentive_projects_intern_idx").on(t.internId),
  ],
);

// WS-4 Phase B3 — generic N-way team split (migration 0107). A participant
// attaches to an entry XOR a project and carries that person's own share.
export const incentiveParticipants = pgTable(
  "incentive_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").references(() => incentiveEntries.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => incentiveProjects.id, { onDelete: "cascade" }),
    periodMonth: date("period_month"),
    empName: text("emp_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    bookedAmt: numeric("booked_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    accruedAmt: numeric("accrued_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    paidAmt: numeric("paid_amt", { precision: 14, scale: 2 }).notNull().default("0"),
    paidDate: date("paid_date"),
    payoutRunId: uuid("payout_run_id").references(() => salaryRuns.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incentive_participants_entry_idx").on(t.entryId),
    index("incentive_participants_project_idx").on(t.projectId),
    index("incentive_participants_employee_idx").on(t.employeeId),
    index("incentive_participants_period_idx").on(t.periodMonth),
  ],
);
export type IncentiveParticipant = typeof incentiveParticipants.$inferSelect;

// Incentive slice C — per-person monthly TARGET (for Target-vs-Actual). Keyed by
// emp_name + period_month (the incentive ledger keys by name, not always a FK).
export const incentiveTargets = pgTable(
  "incentive_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empName: text("emp_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    periodMonth: date("period_month").notNull(),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("incentive_targets_name_period_uq").on(t.empName, t.periodMonth)],
);
export type IncentiveTarget = typeof incentiveTargets.$inferSelect;
export type NewIncentiveTarget = typeof incentiveTargets.$inferInsert;

/* ── Accounts Totality, Compliance, Checklist & Trackers (admin/manager module) ── */

// Per-kind lookup for the module's searchable dropdowns (inline add + soft delete).
export const accountsLookups = pgTable(
  "accounts_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_lookups_kind_idx").on(t.kind)],
);

export const accountsTaskList = pgTable(
  "accounts_task_list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    srNo: integer("sr_no"),
    area: text("area"),
    taskDescription: text("task_description"),
    status: text("status").notNull().default("Pending"),
    links: text("links"),
    targetDate: date("target_date"),
    actualDate: date("actual_date"),
    gear: text("gear"),
    notes: text("notes"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_task_list_status_idx").on(t.status)],
);

export const accountsScreenshots = pgTable("accounts_screenshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  srNo: integer("sr_no"),
  projectName: text("project_name"),
  projectDetails: text("project_details"),
  frequency: text("frequency"),
  targetDate: date("target_date"),
  actualDate: date("actual_date"),
  gear: text("gear"),
  notes: text("notes"),
  sortOrder: integer("sort_order"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// CA Handover credentials — password_enc is AES-256-GCM ciphertext (never plaintext).
export const caHandoverCredentials = pgTable(
  "ca_handover_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalType: text("portal_type").notNull(),
    entityName: text("entity_name").notNull(),
    username: text("username"),
    passwordEnc: text("password_enc"),
    phone: text("phone"),
    defaultEmail: text("default_email"),
    websiteLink: text("website_link"),
    emailUpdated: boolean("email_updated").notNull().default(false),
    passwordReset: boolean("password_reset").notNull().default(false),
    primaryPhoneUpdated: boolean("primary_phone_updated").notNull().default(false),
    secondaryPhoneUpdated: boolean("secondary_phone_updated").notNull().default(false),
    note: text("note"),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ca_handover_credentials_portal_idx").on(t.portalType)],
);

export const caHandoverReturns = pgTable("ca_handover_returns", {
  id: uuid("id").primaryKey().defaultRandom(),
  fy: text("fy").notNull(),
  entityName: text("entity_name").notNull(),
  itrV: text("itr_v"),
  filedComputation: text("filed_computation"),
  filedItrForm: text("filed_itr_form"),
  balanceSheet: text("balance_sheet"),
  pnl: text("pnl"),
  taxAuditReport: text("tax_audit_report"),
  selfAssessmentChallan: text("self_assessment_challan"),
  form26as: text("form_26as"),
  ais: text("ais"),
  assessmentOrder: text("assessment_order"),
  refundAsPerReturn: text("refund_as_per_return"),
  refundReceived: text("refund_received"),
  gstr1: text("gstr_1"),
  gstr3b: text("gstr_3b"),
  gstr2b: text("gstr_2b"),
  gstWorkingExcel: text("gst_working_excel"),
  gstr9: text("gstr_9"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Section 2 — Weekly Checklist: recurring item definitions.
export const accountsWeeklyItems = pgTable(
  "accounts_weekly_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    title: text("title").notNull(),
    deadline: text("deadline"),
    category: text("category"),
    responsiblePerson: text("responsible_person"),
    accountsNotes: text("accounts_notes"),
    mananNotes: text("manan_notes"),
    fileLink: text("file_link"),
    frequency: text("frequency"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_weekly_items_sort_idx").on(t.sortOrder)],
);

// Per item, per (year, month), per week-of-month completion status.
export const accountsWeeklyChecks = pgTable(
  "accounts_weekly_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => accountsWeeklyItems.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    weekNo: integer("week_no").notNull(),
    status: text("status").notNull(),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_weekly_checks_uq").on(t.itemId, t.periodYear, t.periodMonth, t.weekNo),
    index("accounts_weekly_checks_period_idx").on(t.periodYear, t.periodMonth),
  ],
);

export type AccountsWeeklyItem = typeof accountsWeeklyItems.$inferSelect;
export type AccountsWeeklyCheck = typeof accountsWeeklyChecks.$inferSelect;

// Section 3 — Quarter / Month / Annual Checklist (mig 0081). Recurring
// monthly/quarterly/annual items tracked per calendar month across a financial
// year (Apr→Mar). Mirrors the Weekly Checklist; the completion grain is a month
// within a FY rather than a week-of-month.
export const accountsMonthlyItems = pgTable(
  "accounts_monthly_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    title: text("title").notNull(),
    responsiblePerson: text("responsible_person"),
    deadline: text("deadline"),
    type: text("type"),
    accountsNotes: text("accounts_notes"),
    mananNotes: text("manan_notes"),
    fileLink: text("file_link"),
    frequency: text("frequency"),
    dueMonth: integer("due_month"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_monthly_items_sort_idx").on(t.sortOrder)],
);

// Per item, per (financial-year-start, calendar-month) completion status.
export const accountsMonthlyChecks = pgTable(
  "accounts_monthly_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => accountsMonthlyItems.id, { onDelete: "cascade" }),
    fyStartYear: integer("fy_start_year").notNull(),
    month: integer("month").notNull(),
    status: text("status").notNull(),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_monthly_checks_uq").on(t.itemId, t.fyStartYear, t.month),
    index("accounts_monthly_checks_fy_idx").on(t.fyStartYear),
  ],
);

export type AccountsMonthlyItem = typeof accountsMonthlyItems.$inferSelect;
export type AccountsMonthlyCheck = typeof accountsMonthlyChecks.$inferSelect;

// Section 5 — Due Dates Checklist (mig 0082). Flat register of recurring bills
// grouped by Area, with frequency, statement/due dates, ECS + payment tracking.
export const accountsDueItems = pgTable(
  "accounts_due_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    area: text("area"),
    compliance: text("compliance").notNull(),
    frequency: text("frequency"),
    ecs: text("ecs"),
    ecsFrom: text("ecs_from"),
    statementPeriod: text("statement_period"),
    statementDate: text("statement_date"),
    dueDate: text("due_date"),
    softCopyAutoEmail: text("soft_copy_auto_email"),
    hardCopy: text("hard_copy"),
    softCopy: text("soft_copy"),
    tallyEntry: text("tally_entry"),
    balanceTally: text("balance_tally"),
    paidDate: text("paid_date"),
    paidAmt: text("paid_amt"),
    intFinChgs: text("int_fin_chgs"),
    chgReversed: text("chg_reversed"),
    notes: text("notes"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("accounts_due_items_sort_idx").on(t.sortOrder),
    index("accounts_due_items_area_idx").on(t.area),
  ],
);

export type AccountsDueItem = typeof accountsDueItems.$inferSelect;

// Section 4/12 — Credit Cards Master (mig 0083). FY-scoped card master + per-card
// per-month tracking record (Apr→Mar). One FY-aware section serves 25-26 + 26-27.
export const accountsCcCards = pgTable(
  "accounts_cc_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    code: text("code"),
    entityName: text("entity_name"),
    cardName: text("card_name").notNull(),
    ecs: text("ecs"),
    ecsFrom: text("ecs_from"),
    stmtPeriod: text("stmt_period"),
    stmtStartDay: text("stmt_start_day"),
    dueDay: text("due_day"),
    softCopyAutoEmail: text("soft_copy_auto_email"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_cc_cards_fy_sort_idx").on(t.fyStartYear, t.sortOrder)],
);

export const accountsCcMonths = pgTable(
  "accounts_cc_months",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => accountsCcCards.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    hardCopy: text("hard_copy"),
    googleDrive: text("google_drive"),
    tallyEntry: text("tally_entry"),
    balanceTally: text("balance_tally"),
    ccPaidDate: text("cc_paid_date"),
    ccPaidAmt: text("cc_paid_amt"),
    intFinChgs: text("int_fin_chgs"),
    chgReversed: text("chg_reversed"),
    notes: text("notes"),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_cc_months_uq").on(t.cardId, t.month)],
);

export type AccountsCcCard = typeof accountsCcCards.$inferSelect;
export type AccountsCcMonth = typeof accountsCcMonths.$inferSelect;

// Section 6 — SIP Tracker (mig 0084). FY-scoped per-fund master + per-month
// contribution amount (Apr→Mar); YTD computed client-side.
export const accountsSipItems = pgTable(
  "accounts_sip_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    code: text("code"),
    entity: text("entity"),
    fundName: text("fund_name").notNull(),
    location: text("location"),
    sipDate: text("sip_date"),
    type: text("type"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_sip_items_fy_sort_idx").on(t.fyStartYear, t.sortOrder)],
);

export const accountsSipMonths = pgTable(
  "accounts_sip_months",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => accountsSipItems.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_sip_months_uq").on(t.itemId, t.month)],
);

// Section 8 — FNO Income Master (mig 0084). FY-scoped per-agency master +
// per-month Rs income (Apr→Mar); % return derived = amount / capital.
export const accountsFnoItems = pgTable(
  "accounts_fno_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    code: text("code"),
    entity: text("entity"),
    agency: text("agency").notNull(),
    capital: numeric("capital", { precision: 16, scale: 2 }),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_fno_items_fy_sort_idx").on(t.fyStartYear, t.sortOrder)],
);

export const accountsFnoMonths = pgTable(
  "accounts_fno_months",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => accountsFnoItems.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_fno_months_uq").on(t.itemId, t.month)],
);

export type AccountsSipItem = typeof accountsSipItems.$inferSelect;
export type AccountsSipMonth = typeof accountsSipMonths.$inferSelect;
export type AccountsFnoItem = typeof accountsFnoItems.$inferSelect;
export type AccountsFnoMonth = typeof accountsFnoMonths.$inferSelect;

// Section 10 — Cash Withdrawal Tracker (mig 0085). Per-cheque withdrawals grid
// (FY Apr→Mar monthly amounts) + a per-entity annual cap (Total/Remaining derived).
export const accountsCashItems = pgTable(
  "accounts_cash_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    code: text("code"),
    entity: text("entity"),
    nameOnCheque: text("name_on_cheque"),
    chequeNo: text("cheque_no"),
    chqDate: text("chq_date"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_cash_items_fy_sort_idx").on(t.fyStartYear, t.sortOrder)],
);

export const accountsCashMonths = pgTable(
  "accounts_cash_months",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => accountsCashItems.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_cash_months_uq").on(t.itemId, t.month)],
);

export const accountsCashLimits = pgTable(
  "accounts_cash_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    code: text("code"),
    entity: text("entity").notNull(),
    maxAllowed: numeric("max_allowed", { precision: 14, scale: 2 }),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_cash_limits_fy_entity_uq").on(t.fyStartYear, t.entity)],
);

export type AccountsCashItem = typeof accountsCashItems.$inferSelect;
export type AccountsCashMonth = typeof accountsCashMonths.$inferSelect;
export type AccountsCashLimit = typeof accountsCashLimits.$inferSelect;

// Section 9 — Bank Balance Tracker (mig 0086). Per-entity target + dated weekly
// balance snapshots (dynamic week columns); difference computed live.
export const accountsBankItems = pgTable(
  "accounts_bank_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    code: text("code"),
    entity: text("entity").notNull(),
    targetBalance: numeric("target_balance", { precision: 16, scale: 2 }),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_bank_items_fy_sort_idx").on(t.fyStartYear, t.sortOrder)],
);

export const accountsBankWeeks = pgTable(
  "accounts_bank_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fyStartYear: integer("fy_start_year").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_bank_weeks_fy_sort_idx").on(t.fyStartYear, t.sortOrder)],
);

export const accountsBankBalances = pgTable(
  "accounts_bank_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => accountsBankItems.id, { onDelete: "cascade" }),
    weekId: uuid("week_id").notNull().references(() => accountsBankWeeks.id, { onDelete: "cascade" }),
    balance: numeric("balance", { precision: 16, scale: 2 }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_bank_balances_uq").on(t.itemId, t.weekId)],
);

export type AccountsBankItem = typeof accountsBankItems.$inferSelect;
export type AccountsBankWeek = typeof accountsBankWeeks.$inferSelect;
export type AccountsBankBalance = typeof accountsBankBalances.$inferSelect;

// Sections 11/13/15 — flat registers (mig 0087): Vasa Family interpersonal
// balances, Shares register, Income-Tax master-folder links.
export const accountsVasaBalances = pgTable(
  "accounts_vasa_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    party: text("party"),
    direction: text("direction"),
    counterparty: text("counterparty"),
    amount: numeric("amount", { precision: 16, scale: 2 }),
    asOn: text("as_on"),
    notes: text("notes"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_vasa_sort_idx").on(t.sortOrder)],
);

export const accountsShares = pgTable(
  "accounts_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    entity: text("entity"),
    company: text("company").notNull(),
    folioDemat: text("folio_demat"),
    qty: numeric("qty", { precision: 18, scale: 4 }),
    rate: numeric("rate", { precision: 16, scale: 4 }),
    value: numeric("value", { precision: 18, scale: 2 }),
    txnDate: text("txn_date"),
    notes: text("notes"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_shares_sort_idx").on(t.sortOrder)],
);

export const accountsItFolders = pgTable(
  "accounts_it_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity").notNull(),
    fy: text("fy"),
    folderLink: text("folder_link"),
    notes: text("notes"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_it_folders_sort_idx").on(t.sortOrder)],
);

export type AccountsVasaBalance = typeof accountsVasaBalances.$inferSelect;
export type AccountsShare = typeof accountsShares.$inferSelect;
export type AccountsItFolder = typeof accountsItFolders.$inferSelect;

// SIP Tracker → Loans sub-tables (mig 0088). Per-loan monthly EMI + loan-account
// closing balance over dynamic month columns. FY-independent.
export const accountsLoanItems = pgTable(
  "accounts_loan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code"),
    entity: text("entity"),
    loanName: text("loan_name").notNull(),
    location: text("location"),
    emiDate: text("emi_date"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_loan_items_sort_idx").on(t.sortOrder)],
);

export const accountsLoanPeriods = pgTable(
  "accounts_loan_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_loan_periods_sort_idx").on(t.sortOrder)],
);

export const accountsLoanCells = pgTable(
  "accounts_loan_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id").notNull().references(() => accountsLoanItems.id, { onDelete: "cascade" }),
    periodId: uuid("period_id").notNull().references(() => accountsLoanPeriods.id, { onDelete: "cascade" }),
    emi: numeric("emi", { precision: 16, scale: 2 }),
    closingBalance: numeric("closing_balance", { precision: 18, scale: 2 }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_loan_cells_uq").on(t.loanId, t.periodId)],
);

export type AccountsLoanItem = typeof accountsLoanItems.$inferSelect;
export type AccountsLoanPeriod = typeof accountsLoanPeriods.$inferSelect;
export type AccountsLoanCell = typeof accountsLoanCells.$inferSelect;

// ── Employees DCC (Daily Compliance Checklist / KPI) — mig 0090 ──────────────
// DCC v2 — client instancing (one section repeated per client, e.g. B = Lawrence
// & Mayo, B-2 = Soul Storii). Defined before dcc_kpi_items so its client_id ref
// is a plain backward reference.
export const dccClients = pgTable(
  "dcc_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmployeeId: uuid("owner_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    name: text("name").notNull(),
    clientRef: uuid("client_ref"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dcc_clients_owner_idx").on(t.ownerEmployeeId, t.section, t.sortOrder)],
  // owner+section+lower(name) uniqueness is an expression index → migration SQL only.
);

// DCC v2 — participant roster (external people tracked by a participant-list KPI,
// e.g. Nikunj/Parimal under D11). NOT employees. Deduped by (owner, lower(name)).
export const dccSubjects = pgTable(
  "dcc_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmployeeId: uuid("owner_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind"),
    externalRef: uuid("external_ref"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dcc_subjects_owner_idx").on(t.ownerEmployeeId, t.sortOrder)],
  // owner+lower(name) uniqueness is an expression index → migration SQL only.
);

export const dccKpiItems = pgTable(
  "dcc_kpi_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmployeeId: uuid("owner_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    section: text("section"),
    code: text("code"),
    title: text("title").notNull(),
    frequency: text("frequency"),
    weekdays: smallint("weekdays"),
    // DCC v2 additive:
    scheduleKind: text("schedule_kind").notNull().default("scheduled"),
    isParticipantList: boolean("is_participant_list").notNull().default(false),
    clientId: uuid("client_id").references(() => dccClients.id, { onDelete: "cascade" }),
    templateCode: text("template_code"),
    needsReview: boolean("needs_review").notNull().default(false),
    targetNumber: numeric("target_number", { precision: 14, scale: 2 }),
    unit: text("unit"),
    sortOrder: integer("sort_order"),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dcc_kpi_items_owner_idx").on(t.ownerEmployeeId, t.sortOrder),
    index("dcc_kpi_items_client_idx").on(t.clientId),
  ],
);

export const dccEntries = pgTable(
  "dcc_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => dccKpiItems.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    status: text("status"),
    valueNumber: numeric("value_number", { precision: 14, scale: 2 }),
    note: text("note"),
    filledById: uuid("filled_by_id").references(() => employees.id, { onDelete: "set null" }),
    // DCC v2 — participant axis. NULL for every simple/normal KPI (all history).
    subjectId: uuid("subject_id").references(() => dccSubjects.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // dcc_entries_uq is an EXPRESSION unique index
    //   (item_id, entry_date, COALESCE(subject_id, ZERO_UUID))
    // managed in migration 0103 (Drizzle can't express COALESCE). Not declared here.
    index("dcc_entries_date_idx").on(t.entryDate),
    index("dcc_entries_subject_idx").on(t.subjectId),
  ],
);

// DCC v2 — which subjects a participant-list KPI tracks, with optional per-subject
// schedule overrides (e.g. Rutvisha's Prashant = Wed & Sat).
export const dccItemSubjects = pgTable(
  "dcc_item_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => dccKpiItems.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull().references(() => dccSubjects.id, { onDelete: "cascade" }),
    scheduleKind: text("schedule_kind"),
    weekdays: smallint("weekdays"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    uniqueIndex("dcc_item_subjects_uq").on(t.itemId, t.subjectId),
    index("dcc_item_subjects_item_idx").on(t.itemId, t.sortOrder),
  ],
);

export const dccReviews = pgTable(
  "dcc_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerEmployeeId: uuid("owner_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    reviewDate: date("review_date").notNull(),
    reviewerId: uuid("reviewer_id").references(() => employees.id, { onDelete: "set null" }),
    status: text("status"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dcc_reviews_uq").on(t.ownerEmployeeId, t.reviewDate)],
);

export type DccKpiItem = typeof dccKpiItems.$inferSelect;
export type DccEntry = typeof dccEntries.$inferSelect;
export type DccReview = typeof dccReviews.$inferSelect;
export type DccClient = typeof dccClients.$inferSelect;
export type DccSubject = typeof dccSubjects.$inferSelect;
export type DccItemSubject = typeof dccItemSubjects.$inferSelect;

export type AccountsTaskRow = typeof accountsTaskList.$inferSelect;
export type AccountsScreenshot = typeof accountsScreenshots.$inferSelect;
export type CaHandoverCredential = typeof caHandoverCredentials.$inferSelect;
export type CaHandoverReturn = typeof caHandoverReturns.$inferSelect;
export type AccountsLookup = typeof accountsLookups.$inferSelect;

export type IncentiveCatalog = typeof incentiveCatalog.$inferSelect;
export type NewIncentiveCatalog = typeof incentiveCatalog.$inferInsert;
export type IncentiveEntry = typeof incentiveEntries.$inferSelect;
export type NewIncentiveEntry = typeof incentiveEntries.$inferInsert;
export type IncentiveProject = typeof incentiveProjects.$inferSelect;
export type NewIncentiveProject = typeof incentiveProjects.$inferInsert;

/* ================================================================== */
/* Weekly Goals (Manan 2026-06) — per-week priority planner.           */
/* Each row = ONE priority a team member commits to in a Mon→Sun week  */
/* (client, subject, priority, incentive flag + amount, kpi, target,   */
/* % done, explanation/link, carry-over chain). Ported from the        */
/* intern app (migration 0065 here = their 0055 + 0062 incentiveAmount)*/
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
    // Phase 4 (migration 0071) — structured incentive classification.
    //   'adhoc'   — unplanned, manual amount
    //   'onetime' — planned Regular, non-recurring, manual amount
    //   'routine' — recurring Regular, amount sourced from incentive_catalog
    // NULL = no incentive. `incentive` bool stays in sync (true when type set).
    incentiveType: text("incentive_type"),
    // Set only for 'routine' — the catalog row the amount came from. FK in mig 0071.
    incentiveCatalogId: uuid("incentive_catalog_id"),
    kpi: boolean("kpi").notNull().default(false),
    // Goal type taxonomy (migration 0168, additive) — one of GOAL_TYPES
    // ('kpi' | 'branding' | 'strategic' | 'operational' | 'essential'), see
    // db/enums.ts. Nullable so bare selects stay safe pre-migration. Supersedes
    // the legacy `kpi` boolean (kept, NOT dropped): kpi=true backfills to 'kpi'.
    goalType: text("goal_type"),
    targetDone: text("target_done"),
    pctDone: integer("pct_done").notNull().default(0),
    pctUpdatedById: uuid("pct_updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    pctUpdatedAt: timestamp("pct_updated_at", { withTimezone: true }),
    explanation: text("explanation"),
    linkUrl: text("link_url"),
    // "Part of Project?" Yes/No (migration 0184) — mirrors the same three columns
    // on `goals` so a weekly goal tags to a project + vendor identically.
    isProject: boolean("is_project").notNull().default(false),
    projectNodeId: uuid("project_node_id").references((): AnyPgColumn => projectNodes.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references((): AnyPgColumn => vendors.id, { onDelete: "set null" }),
    // --- Redesign 2026-06-18 (additive) — Planning + Review field set. ---
    // Weight: the goal's share of the weekly weighted-completion score.
    weight: integer("weight").notNull().default(100),
    // Per-goal target date, distinct from the week_start bucket.
    targetDate: date("target_date"),
    // Planning notes, distinct from the review-side `explanation`.
    notes: text("notes"),
    // Reuses the app-wide Task status enum (same default as tasks.status).
    status: taskStatusEnum("status").notNull().default("not_started"),
    // Manager-accepted % (review). NULL = not yet reviewed → effective %
    // falls back to pct_done.
    acceptPct: integer("accept_pct"),
    reviewNotes: text("review_notes"),
    // Hides the goal from the active board + weekly-score aggregates; the row
    // stays queryable.
    archived: boolean("archived").notNull().default(false),
    // Review provenance.
    reviewedById: uuid("reviewed_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // Approval stamp — presence = approved + Accept % locked.
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    carriedFromId: uuid("carried_from_id"),
    // Phase 2 (Goal↔Task linkage, migration 0070) — the real task created from
    // this goal via "Add to Tasks". One goal ⇄ one task; two-way %/done sync runs
    // through this link (lib/weekly-goals/task-sync.ts). NULL = no task yet.
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    // --- Goals Cascade (migration 0131, additive) — Weekly is the leaf layer of
    // the Y→Q→M→W cascade. `monthGoalId` links a weekly goal up to its parent
    // monthly `goals` row (null = standalone weekly). The remaining fields mirror
    // the cascade goal card (area/uom/target+actual qty & amount/team/dependency/
    // evidence) so the weekly board can show the same shape.
    monthGoalId: uuid("month_goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    area: text("area"),
    uom: text("uom"),
    targetQty: numeric("target_qty", { precision: 14, scale: 2 }),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }),
    actualQty: numeric("actual_qty", { precision: 14, scale: 2 }),
    actualAmount: numeric("actual_amount", { precision: 14, scale: 2 }),
    teamInvolved: jsonb("team_involved").$type<Array<{ employeeId?: string; name?: string; weight?: number }>>(),
    teamDependencyPct: integer("team_dependency_pct"),
    // "Delegate to team" (migration 0171) — mirrors goals.delegated_to so the
    // column is ready if weekly delegation is wired later. Additive/nullable.
    delegatedTo: jsonb("delegated_to").$type<Array<{ employeeId: string; name?: string; pct: number }>>(),
    // "Share with team" (migration 0172) — mirrors goals.share_with_team so the
    // weekly table has column parity with year/quarter/month. Additive.
    shareWithTeam: boolean("share_with_team").notNull().default(false),
    evidenceUrl: text("evidence_url"),
    // Opt-in per week (cross-out = false drops it from the committed set).
    adopted: boolean("adopted").notNull().default(true),
    // Saturday freeze stamp (Module 2 commit gate).
    committedAt: timestamp("committed_at", { withTimezone: true }),
    // Monday manager-approval stamp (Module 3 approve gate).
    approvedByManagerAt: timestamp("approved_by_manager_at", { withTimezone: true }),
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
    index("weekly_goals_task_id_idx").on(t.taskId),
    index("weekly_goals_month_goal_idx").on(t.monthGoalId),
  ],
);

export type WeeklyGoal = typeof weeklyGoals.$inferSelect;
export type NewWeeklyGoal = typeof weeklyGoals.$inferInsert;

// Daily Checklist (migration 0069) — the daily commitment ritual that replaces
// the WhatsApp "aaj main ye karunga" plan. Each row is one thing the employee
// committed to do on `plan_date`. A full table (not a view) so every day's list
// is permanent nightly history. Items come from a Weekly Goal (origin
// 'goal_related', goal_id set) or are typed ad-hoc (origin 'standalone').
// Committing today's plan + the prior day's close-out are BOTH gated (design:
// WMS_OVERHAUL_MASTER_PLAN §5.3): no one enters the app until today is planned.
export const dailyChecklist = pgTable(
  "daily_checklist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    planDate: date("plan_date").notNull(),
    // Provenance — at most one is set. goal_id ⇒ pulled from a Weekly Goal;
    // task_id ⇒ pulled from an existing Task; neither ⇒ typed ad-hoc.
    goalId: uuid("goal_id").references(() => weeklyGoals.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    // Cascade provenance (migration 0141, Goals canvas Phase 5): a Y/Q/M goal
    // (`goals` table) pulled onto the day keeps its id here — weekly stays on
    // goal_id. ⚠ POSSIBLY UNAPPLIED in prod until GOALS_CANVAS_ON ships: never
    // reference this column in an unguarded query — use explicit column lists
    // (no bare .select()/.returning() on this table) and wrap any read/write of
    // it in try/catch behind the flag (see goals/plan/actions.ts).
    cascadeGoalId: uuid("cascade_goal_id").references(() => goals.id, { onDelete: "set null" }),
    origin: text("origin").notNull().default("standalone"), // 'goal_related' | 'standalone'
    title: text("title").notNull(),
    client: text("client"),
    subject: text("subject"),
    position: integer("position").notNull().default(1),
    status: taskStatusEnum("status").notNull().default("not_started"),
    // Night close-out: done/not-done + an optional 0-100% progress (NULL + done
    // ⇒ treat as 100) + a note on what happened.
    done: boolean("done").notNull().default(false),
    donePct: integer("done_pct"),
    doneNote: text("done_note"),
    // WHEN in the day this commitment sits (migration 0185) - minutes from
    // IST midnight + block length. The row is already pinned to a day by
    // plan_date, so a wall-clock minute needs no timezone conversion and
    // survives a move to another day unchanged. NULL = "Anytime" work.
    startMin: integer("start_min"),
    durationMin: integer("duration_min"),
    // When it entered today's plan (morning commit) and when it was closed out.
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Set when this item was rolled forward from an earlier, unfinished day.
    movedFromDate: date("moved_from_date"),
    // RECYCLE BIN for commitments (migration 0186). Cancelling a card used to
    // DELETE this row outright when no WMS task backed it; now it is a soft
    // delete, so a typed commitment can be restored just like an abandoned task.
    // Every planner read must filter `abandoned_at IS NULL`.
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
    abandonedById: uuid("abandoned_by_id").references(() => employees.id, { onDelete: "set null" }),
    // Set when the END-OF-DAY sweep moved this row forward because nobody
    // reviewed it (migration 0187). Distinguishes an automatic carry from a
    // manual "→ Tomorrow", which also writes moved_from_date.
    carriedForwardAt: timestamp("carried_forward_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("daily_checklist_emp_date_idx").on(t.employeeId, t.planDate),
    index("daily_checklist_date_idx").on(t.planDate),
    // One pull of a given goal per employee per day (NULL goal_id ⇒ many ad-hoc
    // rows allowed, since NULLs are distinct in a unique index).
    uniqueIndex("daily_checklist_emp_date_goal_idx").on(t.employeeId, t.planDate, t.goalId),
    // Cascade mirror of the above (migration 0141).
    index("daily_checklist_cascade_goal_idx").on(t.cascadeGoalId),
    uniqueIndex("daily_checklist_emp_date_cascade_goal_uq").on(t.employeeId, t.planDate, t.cascadeGoalId),
  ],
);

export type DailyChecklistItem = typeof dailyChecklist.$inferSelect;
export type NewDailyChecklistItem = typeof dailyChecklist.$inferInsert;

// Per employee-day lifecycle for the unified "Plan My Day" page (migration 0134).
// started_at = "Start my day" clicked (morning commit); closed_at = end-of-day
// close-out finished. These drive which phase the single page renders:
//   no row / started_at null → PLAN · started, not closed → ACTIVE · closed → done.
export const dailyPlanDay = pgTable(
  "daily_plan_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    planDate: date("plan_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_plan_day_emp_date_uq").on(t.employeeId, t.planDate)],
);
export type DailyPlanDay = typeof dailyPlanDay.$inferSelect;

// Attendance month freeze (migration 0136) — one row per frozen month ("YYYY-MM").
// After the monthly statement's query window (the 2nd), the month freezes and its
// attendance becomes immutable (Sir's rule 7). Global per-month, not per-employee.
export const attendanceMonthFreeze = pgTable("attendance_month_freeze", {
  month: text("month").primaryKey(), // 'YYYY-MM'
  frozenAt: timestamp("frozen_at", { withTimezone: true }).notNull().defaultNow(),
  frozenById: uuid("frozen_by_id").references(() => employees.id, { onDelete: "set null" }),
  note: text("note"),
});
export type AttendanceMonthFreeze = typeof attendanceMonthFreeze.$inferSelect;

// HR confirmation reminders (migration 0138) — dedupe so HR is nudged exactly
// once that a person's probation / free-training period is ending (Sir #38/#39).
export const hrConfirmationReminders = pgTable(
  "hr_confirmation_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'probation' | 'training'
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("hr_confirmation_reminders_uq").on(t.employeeId, t.kind)],
);
export type HrConfirmationReminder = typeof hrConfirmationReminders.$inferSelect;

// Attendance discipline notes (migration 0140) — one admin note/reason per
// employee + month on the read-only analytics page. Never affects pay.
export const attendanceDisciplineNotes = pgTable(
  "attendance_discipline_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // 'YYYY-MM'
    note: text("note"),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_discipline_notes_uq").on(t.employeeId, t.month)],
);
export type AttendanceDisciplineNote = typeof attendanceDisciplineNotes.$inferSelect;

// Weekly-goal DAILY actuals (migration 0093) — one progress entry per goal per
// day, logged from the Daily Checklist "Plan Your Day" page. Builds the day-by-
// day actual-vs-target trail across the week and feeds the clock-in planning
// gate (an employee must log today's progress on each active goal). Distinct
// from `weekly_goals.pct_done` (the single cumulative %).
export const weeklyGoalActuals = pgTable(
  "weekly_goal_actuals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").notNull().references(() => weeklyGoals.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    pct: integer("pct"),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("weekly_goal_actuals_uq").on(t.goalId, t.entryDate),
    index("weekly_goal_actuals_emp_date_idx").on(t.employeeId, t.entryDate),
  ],
);
export type WeeklyGoalActual = typeof weeklyGoalActuals.$inferSelect;

/* ================================================================== */
/* Goals Cascade (migration 0131) — Year→Quarter→Month cascade tree.   */
/* One self-referential `goals` table (period per node, parent_goal_id  */
/* tree). The Weekly leaf layer stays on `weekly_goals` (extended above  */
/* with month_goal_id + cascade fields). Quarter/month keys are anchored */
/* to the financial year (Apr–Mar); Q1 = Apr–Jun. Numbers are numeric    */
/* (14,2) → returned as STRINGs by drizzle.                              */
/* ================================================================== */
// Goal Area + Measure lookups (migration 0148) — admin-extensible dropdown
// options for the goal composer. `kind` = 'area' | 'measure'; base options live
// in code (lib/goals/lookups.ts), these are the admin-added extras.
export const goalLookups = pgTable(
  "goal_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goal_lookups_kind_idx").on(t.kind)],
);

// Skills Master (migration 0162) — admin-extensible dropdown options for the
// Management Assessment skills capture. `kind` = 'technical' | 'non_technical';
// a fixed BASE set lives in code (lib/hr/skills.ts), these are the admin-added
// extras. Soft-delete via `active`. Mirrors the goal_lookups pattern.
export const skillLookups = pgTable(
  "skill_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").default(100),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("skill_lookups_kind_idx").on(t.kind)],
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // 'year' | 'quarter' | 'month' (see db/enums.ts GOAL_PERIODS)
    period: text("period").notNull(),
    // canonical bucket: year '2026' · quarter '2026-Q1' · month '2026-07'
    periodKey: text("period_key").notNull(),
    parentGoalId: uuid("parent_goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(1),
    area: text("area"),
    // Free text, like `tasks.client` — the `clients` table backs the dropdown
    // but does not constrain the column, because new clients are created by
    // typing a name. Added by migration 0212.
    client: text("client"),
    title: text("title").notNull(),
    uom: text("uom"),
    targetQty: numeric("target_qty", { precision: 14, scale: 2 }),
    actualQty: numeric("actual_qty", { precision: 14, scale: 2 }),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }),
    actualAmount: numeric("actual_amount", { precision: 14, scale: 2 }),
    notes: text("notes"),
    teamInvolved: jsonb("team_involved").$type<Array<{ employeeId?: string; name?: string; weight?: number }>>(),
    teamDependencyPct: integer("team_dependency_pct"),
    // "Share with team" Yes/No (migration 0149) — when on, the goal is shared
    // with the team_involved members (team_dependency_pct = participation %).
    shareWithTeam: boolean("share_with_team").notNull().default(false),
    // "Delegate to team" (migration 0171) — accountability hand-off, DISTINCT from
    // team_involved/share_with_team (participation). Each entry hands `pct`
    // (default 100) of the goal to a staff member; delegated goals surface on the
    // delegate's own board (getSharedGoals ORs this in). Additive/nullable.
    delegatedTo: jsonb("delegated_to").$type<Array<{ employeeId: string; name?: string; pct: number }>>(),
    // owner self-rating 0..100
    pctDone: integer("pct_done").notNull().default(0),
    // reviewer rating; null → effective % falls back to pct_done
    acceptPct: integer("accept_pct"),
    reviewNotes: text("review_notes"),
    evidenceUrl: text("evidence_url"),
    weight: integer("weight").notNull().default(100),
    // Incentive + Monthly-Master link (migration 0147 — possibly UNAPPLIED).
    // Additive/nullable so bare selects stay safe until the migration lands.
    incentiveEnabled: boolean("incentive_enabled").notNull().default(false),
    incentiveAmount: numeric("incentive_amount", { precision: 14, scale: 2 }),
    // 'one_time' | 'repetitive' | 'milestone'
    incentiveKind: text("incentive_kind"),
    // {kind,id,label} snapshot of the picked Monthly Events Master item.
    monthlyMasterRef: jsonb("monthly_master_ref").$type<{ kind: string; id: string; label: string }>(),
    // "Part of Project?" Yes/No (migration 0184). `isProject` is the answer the
    // user gives; `projectNodeId` / `vendorId` are only meaningful when it is
    // true. Both refs are ON DELETE SET NULL so removing a project or retiring a
    // vendor never deletes someone's goal.
    isProject: boolean("is_project").notNull().default(false),
    projectNodeId: uuid("project_node_id").references((): AnyPgColumn => projectNodes.id, {
      onDelete: "set null",
    }),
    vendorId: uuid("vendor_id").references((): AnyPgColumn => vendors.id, { onDelete: "set null" }),
    // Deadline for MONTHLY goals (migration 0169, additive/nullable). Only ever
    // set on month-period rows — year/quarter progress rolls up from children, so
    // they carry NO target date. Weekly goals keep their own weekly_goals.target_date.
    targetDate: date("target_date"),
    // Reuses the app-wide Task status enum (same default as weekly_goals).
    status: taskStatusEnum("status").notNull().default("not_started"),
    // opt-in per period; false = crossed-out (cascade-drops descendants).
    adopted: boolean("adopted").notNull().default(true),
    // Personal | Professional space (migration 0150). 'professional' = the shared
    // module (default → all existing rows); 'personal' = an admin's private goals.
    scope: text("scope").notNull().default("professional"),
    // 'manual' | 'cascade' (cascade = auto-generated from parent by ÷)
    source: text("source").notNull().default("manual"),
    // Goal Capture (migration 0173) — the AI-capture batch this goal came from,
    // so the board's "Undo all" banner can soft-delete (archive) exactly that
    // batch. Null for manually-created / imported goals.
    captureBatchId: uuid("capture_batch_id"),
    // Category tag (migration 0139) — 'target' | 'milestone' | 'operational' |
    // 'goal'. Colour-codes the Kanban cards; spillover is derived from clonedFromId.
    category: text("category").notNull().default("goal"),
    // Goal type taxonomy (migration 0168, additive) — one of GOAL_TYPES
    // ('kpi' | 'branding' | 'strategic' | 'operational' | 'essential'), see
    // db/enums.ts. Nullable so bare selects stay safe pre-migration. Supersedes
    // the legacy `category` tag (kept, NOT dropped): category='operational'
    // backfills to 'operational'; other scored rows default to 'operational'.
    goalType: text("goal_type"),
    // carry-over footprint / audit link to the origin row.
    clonedFromId: uuid("cloned_from_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    reviewedById: uuid("reviewed_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goals_emp_period_key_idx").on(t.employeeId, t.period, t.periodKey),
    index("goals_parent_idx").on(t.parentGoalId),
    index("goals_period_key_idx").on(t.periodKey),
    index("goals_cloned_from_idx").on(t.clonedFromId),
    index("goals_capture_batch_id_idx").on(t.captureBatchId),
  ],
);
export type GoalRow = typeof goals.$inferSelect;
export type NewGoalRow = typeof goals.$inferInsert;

// Goal Capture log (migration 0173) — one row per natural-language capture on
// any channel (in-app text/voice, WhatsApp text/voice). Audit trail + a corpus
// for debugging AI-structuring quality. Not on the goal load path.
export const goalCaptureLog = pgTable(
  "goal_capture_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id"),
    channel: text("channel").notNull(), // in_app_text | in_app_voice | whatsapp_text | whatsapp_voice
    rawText: text("raw_text"),
    transcript: text("transcript"),
    model: text("model"),
    rowCount: integer("row_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goal_capture_log_employee_idx").on(t.employeeId, t.createdAt)],
);
export type GoalCaptureLogRow = typeof goalCaptureLog.$inferSelect;

// Goal reviews (migration 0131) — append-only audit of dual-rating events at any
// level. Primary state stays on the goal / weekly_goal rows; this is a
// lightweight trail (self vs manager %, note, evidence) for history.
export const goalReviews = pgTable(
  "goal_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    weeklyGoalId: uuid("weekly_goal_id").references(() => weeklyGoals.id, {
      onDelete: "cascade",
    }),
    period: text("period"),
    selfPct: integer("self_pct"),
    managerPct: integer("manager_pct"),
    reviewerId: uuid("reviewer_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    evidenceUrl: text("evidence_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_reviews_goal_idx").on(t.goalId),
    index("goal_reviews_weekly_goal_idx").on(t.weeklyGoalId),
  ],
);
export type GoalReview = typeof goalReviews.$inferSelect;
export type NewGoalReview = typeof goalReviews.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// Goals canvas Phase 7 — collaboration tables (migration 0142, design §4.4
// items 1/2/4). ⚠ 0142 may be UNAPPLIED in prod: every read of these tables is
// guarded (try/catch → empty fallback) behind GOALS_CANVAS_ON in
// app/(app)/goals/cascade/detail-actions.ts. Do not add unguarded readers.
// All three use the goal_reviews dual-FK pattern: goal_id (cascade Y/Q/M row)
// XOR weekly_goal_id (weekly leaf) — enforced by a DB check constraint.
// ═══════════════════════════════════════════════════════════════════════════

/** Polymorphic linked entities (task/project/kpi/incentive/calendar/department).
 *  `label` is a display snapshot taken at link time so the lazy detail bundle
 *  never joins six ref tables; `refTable`+`refId` keep the real pointer. */
export const goalLinks = pgTable(
  "goal_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    weeklyGoalId: uuid("weekly_goal_id").references(() => weeklyGoals.id, {
      onDelete: "cascade",
    }),
    kind: text("kind")
      .$type<"task" | "project" | "kpi" | "incentive" | "calendar" | "department">()
      .notNull(),
    refTable: text("ref_table"),
    refId: uuid("ref_id"),
    label: text("label").notNull().default(""),
    meta: jsonb("meta").$type<{ url?: string }>().notNull().default({}),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_links_goal_idx").on(t.goalId),
    index("goal_links_weekly_idx").on(t.weeklyGoalId),
  ],
);
export type GoalLinkRow = typeof goalLinks.$inferSelect;

/** Threaded comments (one reply level via parentId). Edit trail = editedAt;
 *  the 15-min author edit window / admin override lives in the action layer
 *  (mirrors the task 'commented' event semantics). */
export const goalComments = pgTable(
  "goal_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    weeklyGoalId: uuid("weekly_goal_id").references(() => weeklyGoals.id, {
      onDelete: "cascade",
    }),
    parentId: uuid("parent_id").references((): AnyPgColumn => goalComments.id, {
      onDelete: "cascade",
    }),
    authorId: uuid("author_id").references(() => employees.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_comments_goal_idx").on(t.goalId, t.createdAt),
    index("goal_comments_weekly_idx").on(t.weeklyGoalId, t.createdAt),
  ],
);
export type GoalCommentRow = typeof goalComments.$inferSelect;

/** Goal↔goal dependency edges + first-class blockers. Source = goalId XOR
 *  weeklyGoalId; target = onGoalId/onWeeklyGoalId, or NULL for an external
 *  blocker carried as free text in `label` (which always holds the display
 *  snapshot). kind 'blocked_by' feeds health; resolvedAt closes the edge. */
export const goalDependencies = pgTable(
  "goal_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    weeklyGoalId: uuid("weekly_goal_id").references(() => weeklyGoals.id, {
      onDelete: "cascade",
    }),
    onGoalId: uuid("on_goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "cascade",
    }),
    onWeeklyGoalId: uuid("on_weekly_goal_id").references(
      (): AnyPgColumn => weeklyGoals.id,
      { onDelete: "cascade" },
    ),
    kind: text("kind").$type<"depends_on" | "blocked_by">().notNull().default("depends_on"),
    label: text("label").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goal_dependencies_goal_idx").on(t.goalId),
    index("goal_dependencies_weekly_idx").on(t.weeklyGoalId),
    index("goal_dependencies_on_goal_idx").on(t.onGoalId),
  ],
);
export type GoalDependencyRow = typeof goalDependencies.$inferSelect;

/** Goals canvas Phase 8 — cached AI insights (migration 0143, design §4.4
 *  item 7). ⚠ 0143 may be UNAPPLIED in prod: every read/write is guarded
 *  (try/catch → empty fallback) behind GOALS_CANVAS_ON — do not add unguarded
 *  readers. ONE row per node (unique goal_id / weekly_goal_id; dual-FK XOR,
 *  the goal_reviews pattern — v1 generation writes cascade rows only).
 *  Generated ASYNC + OFF the read path by lib/goals/insights.ts via the
 *  afterResponse fire-and-forget pattern; reads only ever hit this cache.
 *  `workload` rebalance amounts reuse suggestDistribution (lib/goals/derive) —
 *  deterministic math, never model-invented numbers. */
export const goalAiInsights = pgTable(
  "goal_ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
    weeklyGoalId: uuid("weekly_goal_id").references(() => weeklyGoals.id, {
      onDelete: "cascade",
    }),
    /** One-line health narrative for the LEFT panel (§2.2). */
    narrative: text("narrative").notNull().default(""),
    /** Execution suggestions for the child planners. */
    suggestions: jsonb("suggestions").$type<string[]>().notNull().default([]),
    /** Deterministic workload-balancing flags (kind + message). */
    workload: jsonb("workload")
      .$type<Array<{ kind: string; message: string }>>()
      .notNull()
      .default([]),
    /** 'ai' (Gemini, the repo's existing client) or 'heuristic' fallback. */
    source: text("source").$type<"ai" | "heuristic">().notNull().default("heuristic"),
    model: text("model"),
    /** sha1 of the deterministic facts — unchanged + fresh ⇒ skip regen. */
    inputHash: text("input_hash").notNull().default(""),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goal_ai_insights_goal_uq").on(t.goalId),
    uniqueIndex("goal_ai_insights_weekly_uq").on(t.weeklyGoalId),
  ],
);
export type GoalAiInsightRow = typeof goalAiInsights.$inferSelect;

// WhatsApp media log (migration 0131) — dedupe + audit for the goals-report
// document/image sends (Meta Cloud media API). Unique (context, ref_key) prevents
// a double-send for the same person+week.
export const whatsappMediaLog = pgTable(
  "whatsapp_media_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientPhone: text("recipient_phone").notNull(),
    // 'document' | 'image'
    mediaKind: text("media_kind").notNull(),
    templateName: text("template_name"),
    // e.g. 'goals_weekly'
    context: text("context").notNull(),
    // person+week idempotency key
    refKey: text("ref_key").notNull(),
    metaMessageId: text("meta_message_id"),
    status: text("status"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("whatsapp_media_log_context_ref_uq").on(t.context, t.refKey),
  ],
);
export type WhatsappMediaLog = typeof whatsappMediaLog.$inferSelect;
export type NewWhatsappMediaLog = typeof whatsappMediaLog.$inferInsert;

// Index hub (migration 0067) — the Altus Corp Ecosystem Index brought into the
// app as an admin-editable tab. `index_sections` are titled groups; each holds
// any number of `index_links` (hyperlink buttons). Everyone views, admins edit.
export const indexSections = pgTable("index_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export type IndexSection = typeof indexSections.$inferSelect;
export type NewIndexSection = typeof indexSections.$inferInsert;
export type IndexLink = typeof indexLinks.$inferSelect;
export type NewIndexLink = typeof indexLinks.$inferInsert;

/* -------------------------------------------------------------------------- */
/* Dynamic form modules (migration 0068):                                     */
/* Reimbursements / Record Reference / Participant Breakthrough — admin-       */
/* editable request + response forms, with a shared Product Name option list.  */
/* -------------------------------------------------------------------------- */

/** One employee submission to a dynamic module form. */
export const moduleSubmissions = pgTable(
  "module_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: text("module").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    adminFields: jsonb("admin_fields").$type<Record<string, string>>().notNull().default({}),
    status: text("status").notNull().default("pending"),
    decidedById: uuid("decided_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
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

/** Admin-saved override of a form's field list (keyed by form_key). */
export const formConfigs = pgTable("form_configs", {
  formKey: text("form_key").primaryKey(),
  fields: jsonb("fields")
    .$type<import("@/lib/forms/field-types").FormFieldDef[]>()
    .notNull()
    .default([]),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Shared, admin-extensible Product Name MCQ options. */
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

/**
 * Files attached to a module submission — reimbursement receipts, above all
 * (migration 0216).
 *
 * ── WHY THIS REPLACES A DRIVE LINK ─────────────────────────────────────────
 * The reimbursement request form used to carry `bill_url`, a free-text link to
 * something in someone's Drive. That is not a receipt the firm holds: it lives
 * in a personal account, its sharing can be revoked, and it breaks silently
 * years later when an audit needs it. These rows point at objects in the app's
 * OWN private Supabase `documents` bucket instead.
 *
 * ── NOT ON VERCEL, AND NOT IN POSTGRES EITHER ──────────────────────────────
 * `storage_path` addresses the object in Supabase Storage, exactly as
 * `task_attachments` and `project_node_attachments` already do. The bytes never
 * touch the Next.js server: the browser PUTs them straight to a signed upload
 * URL (see app/(app)/reimbursements/attachment-actions.ts), so neither Vercel's
 * request-body ceiling nor its ephemeral filesystem is in the path at all. The
 * app server only ever handles this row.
 *
 * ── GENERIC ON PURPOSE ─────────────────────────────────────────────────────
 * It hangs off `module_submissions`, which is the shared table behind
 * Reimbursements, Record Reference and Participant Breakthrough, so the column
 * is `submission_id` and the name says "module submission" rather than
 * "reimbursement". Naming it for one module would have misdescribed the foreign
 * key. Only the reimbursement UI attaches files today.
 */
export const moduleSubmissionAttachments = pgTable(
  "module_submission_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => moduleSubmissions.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    /** The name the uploader's own file had. Never overwritten — see 0216. */
    fileName: text("file_name").notNull(),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("module_submission_attachments_submission_idx").on(t.submissionId, t.createdAt),
  ],
);

export type ModuleSubmissionAttachment = typeof moduleSubmissionAttachments.$inferSelect;
export type NewModuleSubmissionAttachment =
  typeof moduleSubmissionAttachments.$inferInsert;

/**
 * Overtime entries (migration 0077) — "Parvez overtime + dashboard in WMS".
 * Any employee logs their own extra hours for a given work day; admins and the
 * employee's manager (org-chart downline, see lib/weekly-goals/hierarchy.ts)
 * can log on someone's behalf and approve/reject. Hours are stored as a decimal
 * (numeric(5,2)) so quarter/half-hours are exact. Status flows
 * pending → approved | rejected; `approvedBy/approvedAt/note` capture the verdict.
 */
export const overtimeEntries = pgTable(
  "overtime_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason"),
    status: text("status")
      .$type<"pending" | "approved" | "rejected">()
      .notNull()
      .default("pending"),
    approvedById: uuid("approved_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    note: text("note"),
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
    index("overtime_entries_employee_date_idx").on(t.employeeId, t.workDate),
    index("overtime_entries_status_idx").on(t.status),
  ],
);

export type OvertimeEntry = typeof overtimeEntries.$inferSelect;
export type NewOvertimeEntry = typeof overtimeEntries.$inferInsert;

// ── Ambassadors — Partner Relationship Intelligence (Sales) — mig 0092 ───────
// External referral partners + their referral pipeline + commission ledger +
// unified activity timeline + version-controlled documents. See
// docs/superpowers/specs/2026-06-27-ambassadors-partner-intelligence-design.md
export const ambProducts = pgTable(
  "amb_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("amb_products_active_idx").on(t.isActive, t.sortOrder, t.name)],
);

export const ambAmbassadors = pgTable(
  "amb_ambassadors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    photoUrl: text("photo_url"),
    ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"), // active | paused | archived
    tier: text("tier"), // elite | gold | silver (computed; manual override allowed)
    partnerScore: numeric("partner_score", { precision: 6, scale: 2 }),
    scoreUpdatedAt: timestamp("score_updated_at", { withTimezone: true }),
    payoutType: text("payout_type").notNull().default("percent"), // percent | flat
    payoutValue: numeric("payout_value", { precision: 14, scale: 2 }).notNull().default("0"),
    payoutTermsNotes: text("payout_terms_notes"),
    monthlyTarget: numeric("monthly_target", { precision: 14, scale: 2 }), // ₹ revenue target
    monthlyTargetCount: integer("monthly_target_count"), // optional # referrals/month
    joinedOn: date("joined_on"),
    source: text("source"),
    aiSummary: text("ai_summary"),
    aiSummaryAt: timestamp("ai_summary_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("amb_ambassadors_status_idx").on(t.archived, t.status),
    index("amb_ambassadors_owner_idx").on(t.ownerId),
  ],
);

export const ambAmbassadorProducts = pgTable(
  "amb_ambassador_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => ambAmbassadors.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => ambProducts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("amb_ambassador_products_uq").on(t.ambassadorId, t.productId)],
);

export const ambReferrals = pgTable(
  "amb_referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => ambAmbassadors.id, { onDelete: "cascade" }),
    prospectName: text("prospect_name").notNull(),
    prospectCompany: text("prospect_company"),
    prospectPhone: text("prospect_phone"),
    prospectEmail: text("prospect_email"),
    prospectNotes: text("prospect_notes"),
    receivedOn: date("received_on").notNull().defaultNow(),
    // received | assigned | qualified | meeting | proposal | negotiation |
    // won | payment | commission_generated | commission_paid | lost
    stage: text("stage").notNull().default("received"),
    assignedToId: uuid("assigned_to_id").references(() => employees.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => ambProducts.id, { onDelete: "set null" }),
    dealAmount: numeric("deal_amount", { precision: 14, scale: 2 }),
    outcome: text("outcome").notNull().default("open"), // open | converted | lost
    expectedClose: date("expected_close"),
    wonAt: timestamp("won_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    commissionAmount: numeric("commission_amount", { precision: 14, scale: 2 }),
    commissionBasis: text("commission_basis"), // snapshot e.g. "percent 10%" / "flat ₹5000"
    commissionStatus: text("commission_status").notNull().default("pending"), // pending | generated | paid
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    pgIntroductionId: uuid("pg_introduction_id").references(() => pgIntroductions.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("amb_referrals_ambassador_idx").on(t.ambassadorId),
    index("amb_referrals_stage_idx").on(t.stage),
    index("amb_referrals_outcome_idx").on(t.outcome),
    index("amb_referrals_commission_idx").on(t.commissionStatus),
    index("amb_referrals_received_idx").on(t.receivedOn),
  ],
);

export const ambPayouts = pgTable(
  "amb_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => ambAmbassadors.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paidOn: date("paid_on").notNull().defaultNow(),
    method: text("method"),
    reference: text("reference"),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("amb_payouts_ambassador_idx").on(t.ambassadorId, t.paidOn)],
);

export const ambPayoutReferrals = pgTable(
  "amb_payout_referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutId: uuid("payout_id").notNull().references(() => ambPayouts.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").notNull().references(() => ambReferrals.id, { onDelete: "cascade" }),
    amountApplied: numeric("amount_applied", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("amb_payout_referrals_uq").on(t.payoutId, t.referralId)],
);

export const ambActivities = pgTable(
  "amb_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => ambAmbassadors.id, { onDelete: "cascade" }),
    referralId: uuid("referral_id").references(() => ambReferrals.id, { onDelete: "cascade" }),
    // note | call | meeting | email | whatsapp | stage_change | commission | reminder | system
    type: text("type").notNull(),
    title: text("title"),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    remindAt: timestamp("remind_at", { withTimezone: true }), // set ⇒ this row is a reminder
    done: boolean("done").notNull().default(false),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("amb_activities_ambassador_idx").on(t.ambassadorId, t.occurredAt),
    index("amb_activities_remind_idx").on(t.remindAt),
  ],
);

export const ambDocuments = pgTable(
  "amb_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ambassadorId: uuid("ambassador_id").notNull().references(() => ambAmbassadors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    storageKey: text("storage_key").notNull(),
    mime: text("mime"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => ambDocuments.id, { onDelete: "set null" }),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("amb_documents_ambassador_idx").on(t.ambassadorId, t.name, t.version)],
);

export type AmbProduct = typeof ambProducts.$inferSelect;
export type AmbAmbassador = typeof ambAmbassadors.$inferSelect;
export type AmbAmbassadorProduct = typeof ambAmbassadorProducts.$inferSelect;
export type AmbReferral = typeof ambReferrals.$inferSelect;
export type AmbPayout = typeof ambPayouts.$inferSelect;
export type AmbPayoutReferral = typeof ambPayoutReferrals.$inferSelect;
export type AmbActivity = typeof ambActivities.$inferSelect;
export type AmbDocument = typeof ambDocuments.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// Phase B — the event spine (ARCHITECTURE.md). Migration 0094. All ADDITIVE.
// These tables back lib/events, lib/relay, lib/projections, lib/commands. The
// operational tables above remain the source of truth (Law 1); everything here
// is derived/append-only and rebuildable.
// ════════════════════════════════════════════════════════════════════════════

/** Append-only immutable business event log = transactional outbox + log in one
 *  (Laws 2,3). Written in the same txn as the operational row. NO foreign keys:
 *  events outlive aggregates. `seq` is the global total order for cursors. */
export const eventLog = pgTable(
  "event_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id").notNull().defaultRandom(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    payload: jsonb("payload").notNull().default({}),
    orgId: text("org_id"),
    correlationId: uuid("correlation_id"),
    causationId: uuid("causation_id"),
    actorId: uuid("actor_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_log_aggregate_idx").on(t.aggregateType, t.aggregateId, t.seq),
    index("event_log_type_idx").on(t.eventType, t.seq),
    index("event_log_occurred_idx").on(t.occurredAt),
    uniqueIndex("event_log_event_id_uidx").on(t.eventId),
  ],
);

/** Per-consumer cursor for at-least-once delivery (Law 7). Reset to 0 to rebuild
 *  a projection from the full history (Law 4). */
export const eventConsumers = pgTable("event_consumers", {
  consumer: text("consumer").primaryKey(),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Exactly-once external-effect ledger (Law 8). `dedupeKey` unique → a replayed
 *  event derives the same key and is rejected, so replay fires no side-effects. */
export const commandLog = pgTable(
  "command_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commandType: text("command_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    correlationId: uuid("correlation_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("command_log_dedupe_uidx").on(t.dedupeKey),
    index("command_log_pending_idx").on(t.status, t.nextAttemptAt),
  ],
);

/** First projection (Laws 4,5,10): rebuildable daily task-activity rollup keyed
 *  by (event-day, doer). Derived only from task events. */
export const taskMetricsDaily = pgTable(
  "task_metrics_daily",
  {
    day: date("day").notNull(),
    doerId: uuid("doer_id").notNull(),
    orgId: text("org_id"),
    createdCount: integer("created_count").notNull().default(0),
    doneCount: integer("done_count").notNull().default(0),
    approvedCount: integer("approved_count").notNull().default(0),
    notApprovedCount: integer("not_approved_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.doerId] }),
    index("task_metrics_daily_day_idx").on(t.day),
  ],
);

export type EventLogRow = typeof eventLog.$inferSelect;
export type NewEventLogRow = typeof eventLog.$inferInsert;
export type CommandLogRow = typeof commandLog.$inferSelect;
export type TaskMetricsDailyRow = typeof taskMetricsDaily.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────
// Revenue Department (migration 0095_revenue_department) — the agentic
// sales/marketing platform foundation. All `rev_*` tables (+ ai_usage). ADDITIVE
// only; nothing on the dashboard load path. Money columns are numeric(14,2)
// rupees. Human-in-the-loop on every outward action (everything lands in
// rev_drafts; nothing auto-sends).
// ─────────────────────────────────────────────────────────────────────────

/** The lead registry. AI-discovered/scored leads start in_review=true. */
export const revLeads = pgTable(
  "rev_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    source: text("source"),
    status: text("status").notNull().default("new"),
    ownerId: uuid("owner_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    score: numeric("score", { precision: 6, scale: 2 }),
    scoreReasons: jsonb("score_reasons").notNull().default([]),
    enrichedJson: jsonb("enriched_json").notNull().default({}),
    referralId: uuid("referral_id"),
    inReview: boolean("in_review").notNull().default(true),
    createdBy: uuid("created_by").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rev_leads_status_idx").on(t.status),
    index("rev_leads_owner_idx").on(t.ownerId),
    index("rev_leads_review_idx").on(t.inReview),
    index("rev_leads_email_idx").on(t.contactEmail),
    index("rev_leads_created_idx").on(t.createdAt),
  ],
);

/** Per-lead unified timeline (notes, stage changes, agent runs, drafts). */
export const revLeadEvents = pgTable(
  "rev_lead_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => revLeads.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rev_lead_events_lead_idx").on(t.leadId, t.createdAt)],
);

/** Events/webinars/outreach campaigns. */
export const revCampaigns = pgTable(
  "rev_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: text("type").notNull().default("outreach"),
    hostId: uuid("host_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    status: text("status").notNull().default("planned"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rev_campaigns_status_idx").on(t.status, t.scheduledAt)],
);

/** One row per agent invocation (run-as-user RBAC + audit spine). */
export const revAgentRuns = pgTable(
  "rev_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentSlug: text("agent_slug").notNull(),
    userId: uuid("user_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    surface: text("surface"),
    status: text("status").notNull().default("running"),
    inputJson: jsonb("input_json").notNull().default({}),
    outputSummary: text("output_summary"),
    tokenUsage: integer("token_usage").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("rev_agent_runs_slug_idx").on(t.agentSlug, t.startedAt),
    index("rev_agent_runs_user_idx").on(t.userId, t.startedAt),
  ],
);

/** One row per tool call inside a run (audit everything). */
export const revAgentAudit = pgTable(
  "rev_agent_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => revAgentRuns.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    tool: text("tool").notNull(),
    argsJson: jsonb("args_json").notNull().default({}),
    resultSummary: text("result_summary"),
    status: text("status").notNull().default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rev_agent_audit_run_idx").on(t.runId, t.createdAt)],
);

/** The APPROVALS QUEUE. Every outward action is a DRAFT here; nothing auto-sends. */
export const revDrafts = pgTable(
  "rev_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    leadId: uuid("lead_id").references(() => revLeads.id, { onDelete: "set null" }),
    agentSlug: text("agent_slug"),
    createdByRun: uuid("created_by_run").references(() => revAgentRuns.id, {
      onDelete: "set null",
    }),
    channel: text("channel"),
    subject: text("subject"),
    body: text("body"),
    status: text("status").notNull().default("pending"),
    suppressionStatus: text("suppression_status").notNull().default("clear"),
    approvedBy: uuid("approved_by").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rev_drafts_status_idx").on(t.status, t.createdAt),
    index("rev_drafts_lead_idx").on(t.leadId),
  ],
);

/** Per-call AI cost metering (cost guardrails). cost_estimate in rupees. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costEstimate: numeric("cost_estimate", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_user_idx").on(t.userId, t.createdAt),
    index("ai_usage_feature_idx").on(t.feature, t.createdAt),
  ],
);

/** The DPDP / opt-out gate. A contact present here MUST NOT be drafted to. */
export const revSuppression = pgTable(
  "rev_suppression",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    reason: text("reason").notNull().default("opt_out"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rev_suppression_email_idx").on(t.contactEmail),
    index("rev_suppression_phone_idx").on(t.contactPhone),
  ],
);

export type RevLead = typeof revLeads.$inferSelect;
export type NewRevLead = typeof revLeads.$inferInsert;
export type RevDraft = typeof revDrafts.$inferSelect;
export type RevAgentRun = typeof revAgentRuns.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// PMS / Employee Intelligence — mig 0095 (Layer 2). Derived, rebuildable
// projections (employee_twin, employee_score_daily — NO FK, replayable) +
// human-decision tables (config/review/recognition/promotion). See
// docs/ALTUS_AI_OPERATING_SYSTEM.md + docs/PMS_BUILD.md.
// ════════════════════════════════════════════════════════════════════════════

const twinCounters = {
  orgId: text("org_id"),
  presenceDays: integer("presence_days").notNull().default(0),
  lateCount: integer("late_count").notNull().default(0),
  punctualDays: integer("punctual_days").notNull().default(0),
  goalEffSumWeighted: numeric("goal_eff_sum_weighted", { precision: 14, scale: 2 }).notNull().default("0"),
  goalWeightSum: numeric("goal_weight_sum", { precision: 14, scale: 2 }).notNull().default("0"),
  goalsCompleted: integer("goals_completed").notNull().default(0),
  goalsFilledOnTime: integer("goals_filled_on_time").notNull().default(0),
  goalProgressEvents: integer("goal_progress_events").notNull().default(0),
  dccDueCount: integer("dcc_due_count").notNull().default(0),
  dccDoneCount: integer("dcc_done_count").notNull().default(0),
  testsPassed: integer("tests_passed").notNull().default(0),
  testsAttempted: integer("tests_attempted").notNull().default(0),
  materialsWatched: integer("materials_watched").notNull().default(0),
  feedbackCount: integer("feedback_count").notNull().default(0),
  feedbackRatingSum: numeric("feedback_rating_sum", { precision: 14, scale: 2 }).notNull().default("0"),
  feedbackResolved: integer("feedback_resolved").notNull().default(0),
  feedbackTatSum: numeric("feedback_tat_sum", { precision: 14, scale: 2 }).notNull().default("0"),
} as const;

export const employeeTwin = pgTable("employee_twin", {
  employeeId: uuid("employee_id").primaryKey(),
  ...twinCounters,
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeeScoreDaily = pgTable(
  "employee_score_daily",
  {
    day: date("day").notNull(),
    employeeId: uuid("employee_id").notNull(),
    ...twinCounters,
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.employeeId] }),
    index("employee_score_daily_emp_idx").on(t.employeeId),
    index("employee_score_daily_day_idx").on(t.day),
  ],
);

export const pmsScoreConfig = pgTable("pms_score_config", {
  id: text("id").primaryKey().default("default"),
  weights: jsonb("weights").notNull().default({}),
  thresholds: jsonb("thresholds").notNull().default({}),
  formula: jsonb("formula").notNull().default({}),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pmsReview = pgTable(
  "pms_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    reviewerId: uuid("reviewer_id").references(() => employees.id, { onDelete: "set null" }),
    rating: smallint("rating"),
    status: text("status").notNull().default("draft"),
    strengths: text("strengths"),
    improvements: text("improvements"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pms_review_employee_period_uidx").on(t.employeeId, t.period),
    index("pms_review_employee_idx").on(t.employeeId),
  ],
);

export const pmsRecognition = pgTable(
  "pms_recognition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    kind: text("kind").notNull(),
    reason: text("reason"),
    scoreSnapshot: numeric("score_snapshot", { precision: 6, scale: 2 }),
    status: text("status").notNull().default("suggested"),
    releasedById: uuid("released_by_id").references(() => employees.id, { onDelete: "set null" }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pms_recognition_employee_idx").on(t.employeeId),
    index("pms_recognition_period_idx").on(t.period),
  ],
);

export const pmsPromotionSignal = pgTable(
  "pms_promotion_signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    scoreSnapshot: numeric("score_snapshot", { precision: 6, scale: 2 }),
    eligibleSince: timestamp("eligible_since", { withTimezone: true }),
    rationale: text("rationale"),
    status: text("status").notNull().default("flagged"),
    decidedById: uuid("decided_by_id").references(() => employees.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pms_promotion_signal_employee_status_uidx").on(t.employeeId, t.status),
    index("pms_promotion_signal_employee_idx").on(t.employeeId),
  ],
);

export type EmployeeTwin = typeof employeeTwin.$inferSelect;
export type EmployeeScoreDailyRow = typeof employeeScoreDaily.$inferSelect;
export type PmsScoreConfigRow = typeof pmsScoreConfig.$inferSelect;
export type PmsReview = typeof pmsReview.$inferSelect;
export type PmsRecognition = typeof pmsRecognition.$inferSelect;
export type PmsPromotionSignal = typeof pmsPromotionSignal.$inferSelect;

/* ──────────────────────────────────────────────────────────────────────────
 * Migration 0096 — Training engine + PMS rating model v2 (see
 * db/migrations/0096_pms_training_v2.sql and docs/PMS_FULL_SPEC.md).
 * ────────────────────────────────────────────────────────────────────────── */

// The Training Calendar — one scheduled (or completed) training session.
export const tcSessions = pgTable(
  "tc_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").references(() => tcSubjects.id, { onDelete: "set null" }),
    topic: text("topic").notNull(),
    los: text("los"), // learning-outcome statements
    criticality: smallint("criticality").notNull().default(3), // 1..5 ★
    trainerId: uuid("trainer_id").references(() => employees.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(60), // ≤90 enforced in app
    mode: text("mode").notNull().default("in_person"), // in_person | online
    location: text("location"),
    meetingUrl: text("meeting_url"),
    videoPath: text("video_path"),
    pptPath: text("ppt_path"),
    status: text("status").notNull().default("scheduled"), // scheduled | done | cancelled
    inManual: boolean("in_manual").notNull().default(false), // ★ in the training manual
    materialId: uuid("material_id").references(() => tcMaterials.id, { onDelete: "set null" }),
    recordingRequested: boolean("recording_requested").notNull().default(false),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tc_sessions_scheduled_idx").on(t.scheduledAt),
    index("tc_sessions_trainer_idx").on(t.trainerId),
    index("tc_sessions_status_idx").on(t.status),
  ],
);

export const tcSessionAttendees = pgTable(
  "tc_session_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => tcSessions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("invited"), // invited | attended | left_halfway | absent
    attendedMin: integer("attended_min"), // trainer-editable actual minutes
    markedById: uuid("marked_by_id").references(() => employees.id, { onDelete: "set null" }),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tc_session_attendees_session_emp_uq").on(t.sessionId, t.employeeId),
    index("tc_session_attendees_emp_idx").on(t.employeeId),
    index("tc_session_attendees_session_idx").on(t.sessionId),
  ],
);

// An attendee's feedback on a session (the trainer-feedback loop).
export const tcSessionFeedback = pgTable(
  "tc_session_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => tcSessions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    content: smallint("content"), // 1..5
    depth: smallint("depth"),
    understanding: smallint("understanding"),
    applicability: smallint("applicability"),
    learned: text("learned"), // "What did you learn"
    improve: text("improve"), // "What can be improved"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tc_session_feedback_session_emp_uq").on(t.sessionId, t.employeeId)],
);

// Post-training assessment ("Manan's Assessment"): <pass% ⇒ fail ⇒ redo (waivable).
export const tcAssessments = pgTable(
  "tc_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => tcSessions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    score: smallint("score"), // actual % 0..100
    target: smallint("target"), // target %
    passed: boolean("passed"),
    waived: boolean("waived").notNull().default(false),
    waivedById: uuid("waived_by_id").references(() => employees.id, { onDelete: "set null" }),
    redoOfId: uuid("redo_of_id"),
    assessedById: uuid("assessed_by_id").references(() => employees.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tc_assessments_emp_idx").on(t.employeeId),
    index("tc_assessments_session_idx").on(t.sessionId),
  ],
);

export const tcSelfLearning = pgTable(
  "tc_self_learning",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    learnDate: date("learn_date").notNull(),
    kind: text("kind").notNull().default("book"), // book | video | youtube | other
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    minutes: integer("minutes").notNull().default(0),
    evidencePath: text("evidence_path"),
    evidenceUrl: text("evidence_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tc_self_learning_emp_idx").on(t.employeeId, t.learnDate)],
);

// The weekly 10-min Share + its peer feedback.
export const tcShares = pgTable(
  "tc_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(), // Monday (IST)
    topic: text("topic").notNull(),
    minutes: integer("minutes").notNull().default(10),
    videoPath: text("video_path"),
    videoUrl: text("video_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tc_shares_emp_week_uq").on(t.employeeId, t.weekStart)],
);

export const tcShareFeedback = pgTable(
  "tc_share_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: uuid("share_id").notNull().references(() => tcShares.id, { onDelete: "cascade" }),
    raterId: uuid("rater_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    rating: smallint("rating"), // 1..5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tc_share_feedback_share_rater_uq").on(t.shareId, t.raterId)],
);

// The monthly Attitude/Behaviour/Skill 360 review (manager/subordinate/peer/self).
export const pmsMonthlyReview = pgTable(
  "pms_monthly_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => employees.id, { onDelete: "set null" }),
    relation: text("relation").notNull().default("manager"), // manager | subordinate | peer | self
    period: text("period").notNull(), // 'YYYY-MM'
    attitude: smallint("attitude"), // 3..5
    behaviour: smallint("behaviour"), // 3..5
    skill: smallint("skill"), // 3..5
    changeTags: jsonb("change_tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    explanation: text("explanation"),
    scope: text("scope").notNull().default("internal"), // internal | external
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pms_monthly_review_subj_rev_rel_period_uq").on(t.subjectId, t.reviewerId, t.relation, t.period),
    index("pms_monthly_review_subject_idx").on(t.subjectId, t.period),
    index("pms_monthly_review_reviewer_idx").on(t.reviewerId),
  ],
);

export const pmsPersonalGoal = pgTable(
  "pms_personal_goal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM' or 'YYYY'
    title: text("title").notNull(),
    detail: text("detail"),
    status: text("status").notNull().default("active"), // active | done | dropped
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pms_personal_goal_emp_idx").on(t.employeeId, t.period)],
);

// Migration 0099 — the authoritative monthly salary sheet, imported as-is.
export const salaryBreakup = pgTable(
  "salary_breakup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    srNo: integer("sr_no"),
    fy: text("fy"),
    month: date("month").notNull(),
    employeeName: text("employee_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    designation: text("designation"),
    companyName: text("company_name"),
    present: numeric("present", { precision: 6, scale: 2 }).default("0"),
    holiday: numeric("holiday", { precision: 6, scale: 2 }).default("0"),
    weeklyOff: numeric("weekly_off", { precision: 6, scale: 2 }).default("0"),
    pohFull: numeric("poh_full", { precision: 6, scale: 2 }).default("0"),
    pohHalf: numeric("poh_half", { precision: 6, scale: 2 }).default("0"),
    halfDay: numeric("half_day", { precision: 6, scale: 2 }).default("0"),
    absent: numeric("absent", { precision: 6, scale: 2 }).default("0"),
    daysInMonth: numeric("days_in_month", { precision: 6, scale: 2 }).default("0"),
    totalDaysWorked: numeric("total_days_worked", { precision: 6, scale: 2 }).default("0"),
    setOff: numeric("set_off", { precision: 6, scale: 2 }),
    cf: numeric("cf", { precision: 6, scale: 2 }),
    finalWorkingDays: numeric("final_working_days", { precision: 6, scale: 2 }).default("0"),
    // Worker types (0177) — pay basis + worked hours (null/0 for monthly_ctc rows).
    payType: text("pay_type").notNull().default("monthly_ctc").$type<PayBasis>(),
    workedHours: numeric("worked_hours", { precision: 8, scale: 2 }),
    annualCtc: numeric("annual_ctc", { precision: 14, scale: 2 }).default("0"),
    monthlyCtc: numeric("monthly_ctc", { precision: 14, scale: 2 }).default("0"),
    payableAfterLeave: numeric("payable_after_leave", { precision: 14, scale: 2 }).default("0"),
    pt: numeric("pt", { precision: 14, scale: 2 }).default("0"),
    payableAfterPt: numeric("payable_after_pt", { precision: 14, scale: 2 }).default("0"),
    advance: numeric("advance", { precision: 14, scale: 2 }).default("0"),
    previousPending: numeric("previous_pending", { precision: 14, scale: 2 }).default("0"),
    finalPayment: numeric("final_payment", { precision: 14, scale: 2 }).default("0"),
    salaryGiven: numeric("salary_given", { precision: 14, scale: 2 }),
    remarks: text("remarks"),
    mananRemarks: text("manan_remarks"),
    // Salary "Paid" mark (migration 0128) — super-admin toggle; NOT touched by
    // the sheet sync, so it survives re-syncs.
    paid: boolean("paid").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidById: uuid("paid_by_id").references(() => employees.id, { onDelete: "set null" }),
    // Cumulative rupees actually disbursed against this row (another dev's
    // partial-payments work — restored after a stale-file ship dropped it) —
    // what makes PARTIAL payment expressible, which the `paid` boolean cannot say
    // on its own. Unpaid balance is DERIVED (lib/salary/payment.ts), never stored.
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    // Editable super-admin note (migration 0129) — shown in the Remarks column.
    // NOT touched by the sheet sync, so it survives re-syncs (unlike remarks /
    // manan_remarks, which the sync overwrites from the sheet).
    adminNote: text("admin_note"),
    adminNoteAt: timestamp("admin_note_at", { withTimezone: true }),
    adminNoteById: uuid("admin_note_by_id").references(() => employees.id, { onDelete: "set null" }),
    // Salary "Wave-Off" (migration 0133) — super-admin GRANT of condoned days.
    // The view adds these days back at the per-day rate (monthly_ctc / days_in_month)
    // to reduce the attendance deduction ("your money isn't deducted"). Purely
    // additive to the DISPLAYED net; the imported base amounts are never mutated.
    // NOT touched by the sheet sync, so it survives re-syncs.
    waiveOffDays: numeric("waive_off_days", { precision: 6, scale: 2 }).notNull().default("0"),
    waiveOffNote: text("waive_off_note"),
    waiveOffAt: timestamp("waive_off_at", { withTimezone: true }),
    waiveOffById: uuid("waive_off_by_id").references(() => employees.id, { onDelete: "set null" }),
    // Pre-payout manual adjustment (migration 0137, Sir #37) — a SIGNED rupee
    // amount added (+) or deducted (−) before the final take-home. Reversible
    // grant on top of the computed net; base final_payment is never mutated.
    payoutAdjustment: numeric("payout_adjustment", { precision: 14, scale: 2 }).notNull().default("0"),
    payoutAdjustmentNote: text("payout_adjustment_note"),
    payoutAdjustmentAt: timestamp("payout_adjustment_at", { withTimezone: true }),
    payoutAdjustmentById: uuid("payout_adjustment_by_id").references(() => employees.id, { onDelete: "set null" }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("salary_breakup_emp_month_uidx").on(t.employeeName, t.month),
    index("salary_breakup_month_idx").on(t.month),
    index("salary_breakup_emp_idx").on(t.employeeId),
  ],
);
export type SalaryBreakup = typeof salaryBreakup.$inferSelect;

// Migration 0098 — manager review of a team member's daily checklist (per day).
export const dailyChecklistReviews = pgTable(
  "daily_checklist_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    planDate: date("plan_date").notNull(),
    reviewerId: uuid("reviewer_id").references(() => employees.id, { onDelete: "set null" }),
    status: text("status").notNull().default("reviewed"), // reviewed | approved | needs_rework
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dcr_employee_date_uidx").on(t.employeeId, t.planDate),
    index("dcr_employee_date_idx").on(t.employeeId, t.planDate),
  ],
);
export type DailyChecklistReview = typeof dailyChecklistReviews.$inferSelect;

export type TcSession = typeof tcSessions.$inferSelect;
export type TcSessionAttendee = typeof tcSessionAttendees.$inferSelect;
export type TcSessionFeedback = typeof tcSessionFeedback.$inferSelect;
export type TcAssessment = typeof tcAssessments.$inferSelect;
export type TcSelfLearning = typeof tcSelfLearning.$inferSelect;
export type TcShare = typeof tcShares.$inferSelect;
export type TcShareFeedback = typeof tcShareFeedback.$inferSelect;
export type PmsMonthlyReview = typeof pmsMonthlyReview.$inferSelect;
export type PmsPersonalGoal = typeof pmsPersonalGoal.$inferSelect;

// Migration 0100 — per-run audit trail for external-data sync jobs (live
// salary-sheet mirror, historic attendance backfill). Counts + names ONLY,
// never row contents (salary figures are PII).
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job")
      .$type<"salary_breakup" | "attendance_backfill" | "attendance_sheet" | "paid_leave">()
      .notNull(),
    trigger: text("trigger").$type<"cron" | "admin" | "script">().notNull(),
    actorId: uuid("actor_id").references(() => employees.id, { onDelete: "set null" }),
    dryRun: boolean("dry_run").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").$type<"running" | "ok" | "error">().notNull().default("running"),
    rowsRead: integer("rows_read").notNull().default(0),
    rowsWritten: integer("rows_written").notNull().default(0),
    rowsSkipped: integer("rows_skipped").notNull().default(0),
    unmatchedNames: text("unmatched_names").array().notNull().default(sql`'{}'::text[]`),
    error: text("error"),
  },
  (t) => [index("sync_runs_job_started_idx").on(t.job, t.startedAt)],
);
export type SyncRun = typeof syncRuns.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Migration 0101 — "Attendance log" Google Sheet import (read-side mirror of
// the HR sheet's two authoritative tabs; see lib/attendance-log/*). Additive
// and provenance-preserving: never touches attendance_logs / leave tables.
// Upsert key is always the sheet's employee_name; employee_id is a nullable
// best-effort match (unmatched names surface in sync_runs.unmatched_names).
// ─────────────────────────────────────────────────────────────────────────────

/** One row per (employee_name, month): the "Attendance Sheet" tab summary. */
export const attendanceSheetMonth = pgTable(
  "attendance_sheet_month",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fy: text("fy"),
    /** Month bucket, always 'YYYY-MM-01' (parsed from "Mon-YYYY" by name). */
    month: date("month").notNull(),
    employeeName: text("employee_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    designation: text("designation"),
    companyName: text("company_name"),
    present: numeric("present", { precision: 6, scale: 2 }).notNull().default("0"),
    holiday: numeric("holiday", { precision: 6, scale: 2 }).notNull().default("0"),
    weeklyOff: numeric("weekly_off", { precision: 6, scale: 2 }).notNull().default("0"),
    pohFull: numeric("poh_full", { precision: 6, scale: 2 }).notNull().default("0"),
    pohHalf: numeric("poh_half", { precision: 6, scale: 2 }).notNull().default("0"),
    halfDay: numeric("half_day", { precision: 6, scale: 2 }).notNull().default("0"),
    absent: numeric("absent", { precision: 6, scale: 2 }).notNull().default("0"),
    daysInMonth: numeric("days_in_month", { precision: 6, scale: 2 }).notNull().default("0"),
    totalDaysWorked: numeric("total_days_worked", { precision: 6, scale: 2 }).notNull().default("0"),
    remark: text("remark"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attsm_emp_month_uidx").on(t.employeeName, t.month),
    index("attsm_month_idx").on(t.month),
    index("attsm_employee_idx").on(t.employeeId),
  ],
);
export type AttendanceSheetMonth = typeof attendanceSheetMonth.$inferSelect;

/**
 * One row per (employee_name, month, day 1..31): the raw day STATUS CODE from
 * the sheet ("P" | "A" | "W/O" | "H" | "H-P" | "H-H/D" | "H/D" | "-"), stored
 * verbatim. Per-day truth layer — NO synthetic punch times, independent of
 * attendance_logs.
 */
export const attendanceSheetDay = pgTable(
  "attendance_sheet_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeName: text("employee_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    month: date("month").notNull(),
    day: smallint("day").notNull(),
    statusCode: text("status_code").notNull(),
    /** Derived month+day; NULL when day > real length of that month. */
    date: date("date"),
    source: text("source").notNull().default("attendance_log_sheet"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attsd_emp_month_day_uidx").on(t.employeeName, t.month, t.day),
    index("attsd_employee_date_idx").on(t.employeeId, t.date),
    index("attsd_month_idx").on(t.month),
  ],
);
export type AttendanceSheetDay = typeof attendanceSheetDay.$inferSelect;

/**
 * Project-remote WORK SESSIONS (0178, worker types Phase 2). One row per remote
 * working session — either auto-logged from Google Meet join/leave (source
 * 'meet', fed by the Workspace Events webhook + reconcile) or captured by our own
 * screen-share page (source 'capture'). Used for ACCOUNTABILITY only: project
 * workers are paid a fixed fee, so sessions never feed payroll. The capture path
 * is live; the Meet path is naturally inert until Google Workspace keys land.
 */
export const workSessions = pgTable(
  "work_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    source: text("source").notNull().$type<WorkSessionSource>(),
    meetSpaceId: text("meet_space_id"),
    meetConferenceRecord: text("meet_conference_record"),
    meetParticipant: text("meet_participant"),
    totalMinutes: numeric("total_minutes", { precision: 8, scale: 2 }),
    screenshotCount: integer("screenshot_count").notNull().default(0),
    status: text("status").notNull().default("open").$type<WorkSessionStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ws_emp_started_idx").on(t.employeeId, t.startedAt),
    index("ws_status_idx").on(t.status),
  ],
);
export type WorkSession = typeof workSessions.$inferSelect;

/** Periodic screen-share screenshots proving a `capture` session was active. */
export const workSessionShots = pgTable(
  "work_session_shots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workSessions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wss_session_idx").on(t.sessionId)],
);
export type WorkSessionShot = typeof workSessionShots.$inferSelect;

/**
 * ENTERPRISE COMMUNICATIONS (ECOS, migration 0179). A `broadcasts` row is one
 * official communication (announcement, policy/compliance notice, emergency
 * alert, recognition, …). On PUBLISH its audience rule is resolved to a snapshot
 * of `broadcast_recipients` (one row per targeted employee) that tracks
 * delivery + read + acknowledge. Delivery reuses the existing notification
 * fan-out (in-app + email); Critical/Emergency + acknowledge-required messages
 * can raise the app-lock gate until acknowledged.
 */
export const broadcasts = pgTable(
  "broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    bodyHtml: text("body_html").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    category: text("category").notNull().default("announcement").$type<BroadcastCategory>(),
    priority: text("priority").notNull().default("normal").$type<BroadcastPriority>(),
    ackMode: text("ack_mode").notNull().default("read").$type<BroadcastAckMode>(),
    // Hard app-lock (blur+freeze) until acknowledged — only for critical/emergency.
    requireLock: boolean("require_lock").notNull().default(false),
    status: text("status").notNull().default("draft").$type<BroadcastStatus>(),
    authorId: uuid("author_id").references(() => employees.id, { onDelete: "set null" }),
    authorIdentity: text("author_identity").notNull().default("hr").$type<BroadcastAuthorIdentity>(),
    senderName: text("sender_name"), // display name for a CEO/Founder identity
    attachments: jsonb("attachments").notNull().default(sql`'[]'::jsonb`), // [{path,name,mime,size}]
    audience: jsonb("audience").notNull().default(sql`'{}'::jsonb`),        // the targeting rule
    channels: jsonb("channels").notNull().default(sql`'["in_app","email"]'::jsonb`),
    recipientCount: integer("recipient_count").notNull().default(0),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    // Scheduling / recurrence (0180). recurrence: none|daily|weekly|monthly.
    recurrence: text("recurrence").notNull().default("none").$type<BroadcastRecurrence>(),
    recurrenceUntil: date("recurrence_until"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    // Reminder / escalation policy (0180). reminderAfterDays null = off.
    reminderAfterDays: integer("reminder_after_days"),
    escalateToManager: boolean("escalate_to_manager").notNull().default(false),
    // Optional inline poll / quiz (0180). See BroadcastPoll.
    poll: jsonb("poll").$type<BroadcastPoll | null>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("broadcasts_status_idx").on(t.status), index("broadcasts_published_idx").on(t.publishedAt)],
);
export type Broadcast = typeof broadcasts.$inferSelect;

/** Inline poll / quiz attached to a broadcast (stored in broadcasts.poll). */
export interface BroadcastPoll {
  question: string;
  options: string[];
  mode: "poll" | "quiz";
  correctIndex?: number; // quiz only — the right option
  anonymous?: boolean; // poll only — hide who voted from HR
}

/** Per-employee delivery + read + acknowledge for a published broadcast. */
export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id").notNull().references(() => broadcasts.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending").$type<BroadcastRecipientStatus>(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    deliveredChannels: jsonb("delivered_channels").notNull().default(sql`'[]'::jsonb`),
    // Reminder / escalation tracking (0180).
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    reminderCount: integer("reminder_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("broadcast_recipient_uq").on(t.broadcastId, t.employeeId),
    index("broadcast_recipient_emp_idx").on(t.employeeId, t.status),
  ],
);
export type BroadcastRecipient = typeof broadcastRecipients.$inferSelect;

/** Saved, reusable audience (name + AudienceRule) for the composer (0180). */
export const broadcastSegments = pgTable("broadcast_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  rule: jsonb("rule").notNull(),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type BroadcastSegment = typeof broadcastSegments.$inferSelect;

/** One employee's answer to a broadcast's inline poll / quiz (0180). */
export const broadcastPollResponses = pgTable(
  "broadcast_poll_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id").notNull().references(() => broadcasts.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    optionIndex: integer("option_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("broadcast_poll_response_uq").on(t.broadcastId, t.employeeId)],
);
export type BroadcastPollResponse = typeof broadcastPollResponses.$inferSelect;

/** Reusable broadcast template (0180). */
export const broadcastTemplates = pgTable("broadcast_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  bodyHtml: text("body_html").notNull().default(""),
  category: text("category").notNull().default("announcement").$type<BroadcastCategory>(),
  priority: text("priority").notNull().default("normal").$type<BroadcastPriority>(),
  ackMode: text("ack_mode").notNull().default("read").$type<BroadcastAckMode>(),
  channels: jsonb("channels").notNull().default(sql`'["in_app","email"]'::jsonb`),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type BroadcastTemplate = typeof broadcastTemplates.$inferSelect;

/**
 * One row per (employee_name, period) from the employee-blocked
 * "PAID LEAVE CALCULATION" tab: DOJ + each leave cycle's entitlement.
 */
export const paidLeaveCycle = pgTable(
  "paid_leave_cycle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeName: text("employee_name").notNull(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    doj: date("doj"),
    /** The cycle label exactly as written, e.g. "Mar 2019 – Aug 2019". */
    period: text("period").notNull(),
    status: text("status"),
    leaves: numeric("leaves", { precision: 6, scale: 2 }),
    remarks: text("remarks"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plc_emp_period_uidx").on(t.employeeName, t.period),
    index("plc_employee_idx").on(t.employeeId),
  ],
);
export type PaidLeaveCycle = typeof paidLeaveCycle.$inferSelect;

// ── Device push tokens (native-mobile FCM) ──────────────────────────────────
// One row per FCM registration token. A token is globally unique and belongs to
// whichever employee last registered it (re-login on a shared phone reassigns).
export const devicePushTokens = pgTable(
  "device_push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("android"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("device_push_tokens_token_uq").on(t.token),
    index("device_push_tokens_employee_idx").on(t.employeeId),
  ],
);
export type DevicePushToken = typeof devicePushTokens.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// MEGA-OVERHAUL — Phase A foundations (migrations 0105 / 0109 / 0121).
// Config singletons + approval-token spine. All additive & inert on landing;
// consumed by later phases behind kill-switches. See
// ALTUS-MEGA-CHANGES-MASTER-PROMPT.md and ALTUS-MEGA-IMPLEMENTATION-PLAN.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Migration 0105 — incentive config singleton (id='default'). */
export const incentiveConfig = pgTable("incentive_config", {
  id: text("id").primaryKey().default("default"),
  pmsBasis: text("pms_basis").notNull().default("paid"),
  excludedNames: jsonb("excluded_names").notNull().default(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]),
  attainGreenPct: numeric("attain_green_pct", { precision: 6, scale: 2 }).notNull().default("100"),
  attainAmberPct: numeric("attain_amber_pct", { precision: 6, scale: 2 }).notNull().default("60"),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type IncentiveConfig = typeof incentiveConfig.$inferSelect;

/** Migration 0109 — salary config singleton (id='default'). */
export const salaryConfig = pgTable("salary_config", {
  id: text("id").primaryKey().default("default"),
  divisorPolicy: text("divisor_policy").notNull().default("actual"),
  fixedDivisor: integer("fixed_divisor").notNull().default(31),
  freeTrainingDays: integer("free_training_days").notNull().default(7),
  defaultPt: numeric("default_pt", { precision: 14, scale: 2 }).notNull().default("200"),
  salaryDayOfMonth: integer("salary_day_of_month").notNull().default(10),
  joinerLeaveAccrual: jsonb("joiner_leave_accrual").notNull().default([3, 4, 3, 4, 3, 4]),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SalaryConfig = typeof salaryConfig.$inferSelect;

/** Migration 0121 — generic signed single-use approval tokens (store hash only). */
export const approvalTokens = pgTable(
  "approval_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    action: text("action").notNull(),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approval_tokens_kind_target_idx").on(t.kind, t.targetId)],
);
export type ApprovalToken = typeof approvalTokens.$inferSelect;

/** Migration 0108 — incentive payout audit spine (WS-4 Phase B4). */
export const incentivePayoutEvents = pgTable(
  "incentive_payout_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    empName: text("emp_name"),
    source: text("source").notNull(), // 'entry' | 'project' | 'participant'
    sourceId: uuid("source_id"),
    salaryRunId: uuid("salary_run_id").references(() => salaryRuns.id, { onDelete: "set null" }),
    periodMonth: date("period_month"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    paidDate: date("paid_date"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("incentive_payout_events_employee_idx").on(t.employeeId),
    index("incentive_payout_events_run_idx").on(t.salaryRunId),
    index("incentive_payout_events_period_idx").on(t.periodMonth),
  ],
);
export type IncentivePayoutEvent = typeof incentivePayoutEvents.$inferSelect;

/** Migration 0115 — salary/incentive partial-payment ledger (WS-3 B4/C6). */
export const salaryPayments = pgTable(
  "salary_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    salaryRunId: uuid("salary_run_id").references(() => salaryRuns.id, { onDelete: "set null" }),
    month: text("month"),
    kind: text("kind").notNull().default("salary"), // 'salary' | 'incentive'
    incentiveEntryId: uuid("incentive_entry_id").references(() => incentiveEntries.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    paidDate: date("paid_date"),
    method: text("method"),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("salary_payments_run_idx").on(t.salaryRunId),
    index("salary_payments_employee_idx").on(t.employeeId),
    index("salary_payments_month_idx").on(t.month),
  ],
);
export type SalaryPayment = typeof salaryPayments.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// Employee Dossier (migration 0125) — the per-person HR document vault.
// One row per uploaded file; the file itself lives in the Supabase `documents`
// bucket (storagePath). Categorised by docType. Access gated in app code
// (each employee sees their own; admins see everyone's). Archived, never
// hard-deleted, so a mis-file is recoverable.
// ════════════════════════════════════════════════════════════════════════════
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** appointment | probation_end | ctc_breakup | increment | confidentiality_1
     *  | confidentiality_2 | onboarding | other */
    docType: text("doc_type").notNull(),
    title: text("title").notNull(),
    /** Letter/increment date — sorts a series (e.g. increment history). */
    effectiveDate: date("effective_date"),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("empdoc_employee_idx").on(t.employeeId, t.docType),
    index("empdoc_type_idx").on(t.docType),
    index("empdoc_archived_idx").on(t.archived),
  ],
);
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;

/** Onboarding form (migration 0126) — one structured submission per employee.
 *  Text/select answers in `fields`; file attachments in `files` (storage keys
 *  in the documents bucket). One row per employee (unique), upserted. */
export const onboardingSubmissions = pgTable(
  "onboarding_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    fields: jsonb("fields").notNull().default({}),
    files: jsonb("files").notNull().default({}),
    status: text("status").notNull().default("submitted"), // draft | submitted
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("onb_employee_uidx").on(t.employeeId)],
);
export type OnboardingSubmission = typeof onboardingSubmissions.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Agreements (migration 0132) — full-lifecycle HR agreements: HR generates from a
// template (auto-filled), sends, the employee e-signs (typed name + timestamp),
// stored in the Supabase `documents` bucket + tracked. ADDITIVE, load-neutral.
// ─────────────────────────────────────────────────────────────────────────────
export const agreements = pgTable(
  "agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // 'appointment' | 'employment' | 'nda' | 'ctc' (db/enums AGREEMENT_TYPES)
    type: text("type").notNull().$type<AgreementType>(),
    // 'draft' | 'sent' | 'signed' (db/enums AGREEMENT_STATUSES)
    status: text("status").notNull().default("draft").$type<AgreementStatus>(),
    title: text("title").notNull(),
    // paying entity whose signatory closes the letter
    entity: text("entity"),
    // the filled template fields (recipient, dates, ctc, clauses, particulars…)
    fieldValues: jsonb("field_values").notNull().default({}).$type<Record<string, string>>(),
    pdfPath: text("pdf_path"),
    signedPdfPath: text("signed_pdf_path"),
    // e-signature acceptance stamp
    signedName: text("signed_name"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedIp: text("signed_ip"),
    // unguessable token for the employee's sign link
    signToken: text("sign_token").notNull(),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agreements_employee_idx").on(t.employeeId),
    index("agreements_status_idx").on(t.status),
    uniqueIndex("agreements_sign_token_uq").on(t.signToken),
  ],
);
export type Agreement = typeof agreements.$inferSelect;
export type NewAgreement = typeof agreements.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Document Signatures (migration 0151) — DigiLocker-VERIFIED e-signing for HR
// documents (Letters, Agreements, Exit docs). The signer proves identity via
// DigiLocker OAuth, we store the VERIFIED identity (name/DOB/gender/address/
// photo) + a MASKED Aadhaar (last-4 only — NEVER a full 12-digit number, per the
// Aadhaar Act) + DigiLocker's ref/txn id, then archive a signed PDF. NEW table
// only — additive, load-neutral. Files live in the private `documents` bucket.
// ─────────────────────────────────────────────────────────────────────────────
export const documentSignatures = pgTable(
  "document_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'letter' | 'agreement' | 'exit_doc' (see lib/documents/signing.ts DOC_KINDS) */
    docKind: text("doc_kind").notNull().$type<DocKind>(),
    /** source document row id (employee_documents.id / agreements.id / exit doc id) */
    docId: uuid("doc_id").notNull(),
    signerEmployeeId: uuid("signer_employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    /** 'pending' | 'verified' | 'signed' */
    status: text("status").notNull().default("pending").$type<SignatureStatus>(),
    method: text("method").notNull().default("digilocker"),
    // verified identity (from DigiLocker; PII, MASKED aadhaar only)
    verifiedName: text("verified_name"),
    verifiedDob: text("verified_dob"),
    verifiedGender: text("verified_gender"),
    verifiedAddress: text("verified_address"),
    /** last-4 only, e.g. 'XXXXXXXX1234' — NEVER a full 12-digit Aadhaar */
    maskedAadhaar: text("masked_aadhaar"),
    /** storage path of the DigiLocker photo (documents bucket), or null */
    photoPath: text("photo_path"),
    /** provider txn/ref id */
    digilockerRef: text("digilocker_ref"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // signature
    /** 'drawn' | 'typed' | null */
    signatureKind: text("signature_kind").$type<"drawn" | "typed">(),
    signatureText: text("signature_text"),
    signatureImagePath: text("signature_image_path"),
    consentText: text("consent_text"),
    /** archived signed PDF storage path (documents bucket) */
    signedPdfPath: text("signed_pdf_path"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_signatures_doc_idx").on(t.docKind, t.docId),
    index("document_signatures_signer_idx").on(t.signerEmployeeId),
  ],
);
export type DocumentSignature = typeof documentSignatures.$inferSelect;
export type NewDocumentSignature = typeof documentSignatures.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Events Master (migration 0130). NEW tables only — load-neutral.
// Columns are `text` where the house norm keeps unions in db/enums.ts (status,
// source, applies_to). Money-free module. Every table carries the standard
// created/updated audit stamps + created_by_id/updated_by_id → employees.
// ─────────────────────────────────────────────────────────────────────────────

/** User-defined category masters (the colour legend). */
export const eventCategories = pgTable("event_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type EventCategoryRow = typeof eventCategories.$inferSelect;

/** Master list of batch/section types that auto-block the calendar. */
export const eventBatchTypes = pgTable("event_batch_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  defaultCategoryId: uuid("default_category_id").references(() => eventCategories.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type EventBatchTypeRow = typeof eventBatchTypes.$inferSelect;

/** A scheduled batch/section instance → generates locked calendar events. */
export const eventBatchSchedules = pgTable(
  "event_batch_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchTypeId: uuid("batch_type_id")
      .notNull()
      .references(() => eventBatchTypes.id, { onDelete: "cascade" }),
    name: text("name"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    startMin: integer("start_min"),
    endMin: integer("end_min"),
    // 0=Mon … 6=Sun; empty/null = every day in the range.
    daysOfWeek: integer("days_of_week").array(),
    categoryId: uuid("category_id").references(() => eventCategories.id, { onDelete: "set null" }),
    status: text("status").notNull().default("confirmed").$type<EventStatus>(),
    location: text("location"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("event_batch_schedules_type_idx").on(t.batchTypeId),
    index("event_batch_schedules_range_idx").on(t.startDate, t.endDate),
  ],
);
export type EventBatchScheduleRow = typeof eventBatchSchedules.$inferSelect;

/** Recurring monthly obligations ("compulsory sessions"). Declared before
 *  calendarEvents because calendar_events.obligation_id references it. */
export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  counterparty: text("counterparty"),
  cadence: text("cadence").notNull().default("monthly"),
  targetCount: integer("target_count").notNull().default(1),
  isCompulsory: boolean("is_compulsory").notNull().default(true),
  penaltyNote: text("penalty_note"),
  categoryId: uuid("category_id").references(() => eventCategories.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ObligationRow = typeof obligations.$inferSelect;

/** Company holiday master for the Monthly Events Master module, per financial
 *  year. day_of_week is derived at render time (date-fns), never stored.
 *
 *  NOTE: the physical table is `event_holidays` (and the Drizzle export is
 *  `eventHolidays`) — the plain `holidays` name is already taken by the
 *  Attendance Phase B table (migration 0059) with a completely different shape.
 *  The module's public row type is still exported as `Holiday` from
 *  `lib/monthly-events/types.ts`, so slices reference the contract type, not this
 *  name. Any slice that touches the schema table directly must import
 *  `eventHolidays`. */
export const eventHolidays = pgTable(
  "event_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    fyStartYear: integer("fy_start_year").notNull(),
    holidayDate: date("holiday_date").notNull(),
    appliesTo: text("applies_to").notNull().default("all").$type<HolidayAppliesTo>(),
    isOptional: boolean("is_optional").notNull().default(false),
    isOfficeClosed: boolean("is_office_closed").notNull().default(true),
    isFestivalMarker: boolean("is_festival_marker").notNull().default(false),
    isExamMarker: boolean("is_exam_marker").notNull().default(false),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_holidays_name_fy_date_uidx").on(t.name, t.fyStartYear, t.holidayDate),
    index("event_holidays_fy_idx").on(t.fyStartYear, t.holidayDate),
  ],
);
export type EventHolidayRow = typeof eventHolidays.$inferSelect;

/** The core event rows (free-text label + colour + slot). */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    categoryId: uuid("category_id").references(() => eventCategories.id, { onDelete: "set null" }),
    colorOverride: text("color_override"),
    eventDate: date("event_date").notNull(),
    startMin: integer("start_min"),
    endMin: integer("end_min"),
    allDay: boolean("all_day").notNull().default(false),
    status: text("status").notNull().default("confirmed").$type<EventStatus>(),
    location: text("location"),
    notes: text("notes"),
    source: text("source").notNull().default("manual").$type<EventSource>(),
    sourceRefId: uuid("source_ref_id"),
    isLocked: boolean("is_locked").notNull().default(false),
    obligationId: uuid("obligation_id").references(() => obligations.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_events_date_idx").on(t.eventDate),
    index("calendar_events_source_idx").on(t.source, t.sourceRefId),
    index("calendar_events_obligation_idx").on(t.obligationId),
  ],
);
export type CalendarEventRow = typeof calendarEvents.$inferSelect;

/** Per-month completion count for an obligation (manual override; the auto-count
 *  comes from calendar_events.obligation_id). */
export const obligationCompletions = pgTable(
  "obligation_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligations.id, { onDelete: "cascade" }),
    fyStartYear: integer("fy_start_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    completedCount: integer("completed_count").notNull().default(0),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("obligation_completions_uidx").on(
      t.obligationId,
      t.fyStartYear,
      t.periodMonth,
    ),
  ],
);
export type ObligationCompletionRow = typeof obligationCompletions.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// HR Support / Ticketing (migration 0145 — WRITTEN, NOT APPLIED). Behind
// HR_SUPPORT_OFF (lib/hr/flag.ts). ONE table, TWO doors: /support (full form)
// and /queries "Ask HR" both create hr_tickets rows — the door is recorded in
// `source`. Audit trail = event_log (aggregate "hr_ticket"), NOT a bespoke
// table. Enums live in db/enums.ts (text columns, house norm).
//
// CONFIDENTIALITY (the grievance wall): a `confidential` ticket's read set is
// requester + CURRENT assignee + super-admins ONLY — enforced by the single
// visibleTicketsFilter predicate in the HR module (NOT is_admin, NEVER the
// manager downline). Notification copy for confidential tickets is generic.
// ─────────────────────────────────────────────────────────────────────────────

/** The ticket head. `ticket_no` is a friendly serial (#2000+ via the
 *  hr_ticket_no_seq sequence — see migration 0145). SLA due-dates are STAMPED
 *  at create/priority-change time from HR_TICKET_SLA; one breach cron compares
 *  stamps vs now(). */
export const hrTickets = pgTable(
  "hr_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Friendly serial (#2000+). DB default nextval('hr_ticket_no_seq'). */
    ticketNo: integer("ticket_no")
      .notNull()
      .default(sql`nextval('hr_ticket_no_seq')`),
    /** The requester. */
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    category: text("category").notNull().$type<HrTicketCategory>(),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("new").$type<HrTicketStatus>(),
    priority: text("priority").notNull().default("normal").$type<HrTicketPriority>(),
    /** Current owner (auto-routed from hr_ticket_routes at create). */
    assigneeId: uuid("assignee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    /** Grievance wall — see the module's visibleTicketsFilter choke point. */
    confidential: boolean("confidential").notNull().default(false),
    /** Which door: 'support' (full form) | 'query' (Ask HR). */
    source: text("source").notNull().default("support").$type<HrTicketSource>(),
    // ── SLA stamps (computed once per create/priority change, IST Mon–Sat) ──
    firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }),
    resolutionDueAt: timestamp("resolution_due_at", { withTimezone: true }),
    firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
    /** Stamped by the breach cron so each breach notifies exactly once. */
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reopenedCount: integer("reopened_count").notNull().default(0),
    // ── CSAT (phase 4) — requester-only, after resolve ──
    csatScore: smallint("csat_score"), // 1..5
    csatComment: text("csat_comment"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hr_tickets_ticket_no_uq").on(t.ticketNo),
    index("hr_tickets_employee_idx").on(t.employeeId, t.status),
    index("hr_tickets_assignee_idx").on(t.assigneeId, t.status),
    index("hr_tickets_status_idx").on(t.status, t.priority),
    index("hr_tickets_category_idx").on(t.category),
  ],
);
export type HrTicket = typeof hrTickets.$inferSelect;
export type NewHrTicket = typeof hrTickets.$inferInsert;

/** Thread messages. `internal = true` is an HR-only note — NEVER shown to the
 *  requester and NEVER triggers a requester notification (the Reply/Note fork
 *  exists from day 1). */
export const hrTicketMessages = pgTable(
  "hr_ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => hrTickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hr_ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);
export type HrTicketMessage = typeof hrTicketMessages.$inferSelect;

/** Attachments (Supabase `documents` bucket — dossier upload pattern).
 *  `message_id` NULL = attached to the ticket itself (the raise form). */
export const hrTicketAttachments = pgTable(
  "hr_ticket_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => hrTickets.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => hrTicketMessages.id, {
      onDelete: "set null",
    }),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hr_ticket_attachments_ticket_idx").on(t.ticketId)],
);
export type HrTicketAttachment = typeof hrTicketAttachments.$inferSelect;

/** category → owner routing (9 rows seeded in migration 0145 with NULL owner —
 *  admin assigns real owners in the UI; NULL falls back to super-admins so no
 *  ticket is ever born unowned). */
export const hrTicketRoutes = pgTable(
  "hr_ticket_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull().unique().$type<HrTicketCategory>(),
    ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
export type HrTicketRoute = typeof hrTicketRoutes.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Appraisal (migration 0146 — WRITTEN, NOT APPLIED). Behind APPRAISAL_OFF
// (lib/pms/appraisal-flag.ts) — when off, /appraisal redirects to /pms and the
// old Performance/360/Signals pages stand untouched. Consolidates /pms +
// /pms/review + /pms/signals into ONE multi-dimension scoring engine.
//
// Scoring law (every hand-scored item): Self (+justification, optional
// attachment) → Manager (+MANDATORY explanation) → Management (+explanation)
// → Final. Weight order is ALWAYS dimension weight → sub-weight; relative max
// score = sub_weight% × dimension weight (e.g. 20% of 30% = 6%).
// Culture reuses the pms_constitution_para pool (lib/pms/v3/schema.ts) via
// appraisal_culture_assignments (paraId is FK'd in SQL only — the drizzle def
// lives in a different file, so no .references() here). Notifications are
// IN-APP ONLY (no email templates). Enums live in db/enums.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** One appraisal cycle per period ('YYYY-MM' — monthly, matching the 3-items-
 *  per-month Culture cadence). */
export const appraisalCycles = pgTable(
  "appraisal_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'YYYY-MM'. */
    period: text("period").notNull(),
    label: text("label"),
    status: text("status").notNull().default("draft").$type<AppraisalCycleStatus>(),
    opensOn: date("opens_on"),
    closesOn: date("closes_on"),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("appraisal_cycles_period_uq").on(t.period)],
);
export type AppraisalCycle = typeof appraisalCycles.$inferSelect;

/** Singleton config row (id 'default') — dimension weights (Record<dimension,
 *  number>, sums to 100; seeded from DEFAULT_APPRAISAL_DIMENSION_WEIGHTS) +
 *  rating-term bands ("recognition" labels, [{min,label}] desc) + the auto-
 *  dimension knobs. ADMIN-EDITABLE; the score engine reads ONLY this. */
export const appraisalConfig = pgTable("appraisal_config", {
  id: text("id").primaryKey().default("default"),
  /** dimension → weight %. Non-managers drop the manager-only dimensions and
   *  the engine renormalises the rest. */
  dimensionWeights: jsonb("dimension_weights")
    .notNull()
    .default({})
    .$type<Partial<Record<AppraisalDimension, number>>>(),
  /** Rating-term bands, highest min first: [{min: 90, label: "Outstanding"}…]. */
  ratingTerms: jsonb("rating_terms")
    .notNull()
    .default([])
    .$type<Array<{ min: number; label: string }>>(),
  /** Default incentive target % of base salary (per-employee override lives on
   *  the incentive item's meta). score% = min(100, (earned/base)/target). */
  incentiveTargetPct: numeric("incentive_target_pct", { precision: 6, scale: 2 })
    .notNull()
    .default("20"),
  /** Knowledge-sharing rule from Training: attend `do` sessions, deliver `give`. */
  knowledgeSharingRule: jsonb("knowledge_sharing_rule")
    .notNull()
    .default({ do: 6, give: 4 })
    .$type<{ do: number; give: number }>(),
  /** How many Constitution items are auto-assigned per month (serial-wise). */
  culturePerMonth: integer("culture_per_month").notNull().default(3),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AppraisalConfigRow = typeof appraisalConfig.$inferSelect;

/** One scorable line per (cycle, employee, dimension) — a KPI row, one of the
 *  ≤3 skills, one of the ≤3 attitude items, the single incentive line, the
 *  month's Culture trio (rated as ONE item; the 3 para ids live in meta), the
 *  knowledge-sharing line, or a manager-only Y/N one-liner. */
export const appraisalItems = pgTable(
  "appraisal_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => appraisalCycles.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    dimension: text("dimension").notNull().$type<AppraisalDimension>(),
    /** Sr — display order within the dimension. */
    sortOrder: integer("sort_order").notNull().default(100),
    /** Area column (KPI/Skill/Attitude tables). */
    area: text("area"),
    /** The KPI / skill / attitude / question text ("title" column). */
    title: text("title").notNull(),
    /** How it's measured (e.g. "Send to DCC" → "Seats"). */
    measure: text("measure"),
    /** Sub-weight % WITHIN the dimension — the N items' sub-weights sum to 100.
     *  Relative max score = subWeight% × dimension weight. */
    subWeight: numeric("sub_weight", { precision: 6, scale: 2 }).notNull().default("0"),
    /** Skill dimension only: technical vs non-technical. NULL elsewhere. */
    isTechnical: boolean("is_technical"),
    /** True for the manager-only subjective one-liners (problem_solving /
     *  growth_mindset / ability) — hidden for non-managers. */
    isManagerOnly: boolean("is_manager_only").notNull().default(false),
    /** True for computed dimensions (incentive / knowledge_sharing) — no
     *  self/manager/management scoring; the engine writes the score row. */
    isAuto: boolean("is_auto").notNull().default(false),
    status: text("status").notNull().default("draft").$type<AppraisalItemStatus>(),
    // ── KPI-dimension columns (admin fills + approves before publish) ──
    /** Actual achieved value (free text/number as entered). */
    actualValue: text("actual_value"),
    evidence: text("evidence"),
    adminApproved: boolean("admin_approved"),
    /** Mandatory when adminApproved === false. */
    adminRemarks: text("admin_remarks"),
    /** Dimension-specific extras: culture → {paraIds: string[], serials:
     *  number[]}; incentive → {targetPct, baseSalary, earned} overrides;
     *  knowledge_sharing → {done, given}. */
    meta: jsonb("meta").notNull().default({}).$type<Record<string, unknown>>(),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appraisal_items_cycle_emp_idx").on(t.cycleId, t.employeeId),
    index("appraisal_items_emp_dim_idx").on(t.employeeId, t.dimension),
    index("appraisal_items_status_idx").on(t.status),
  ],
);
export type AppraisalItem = typeof appraisalItems.$inferSelect;
export type NewAppraisalItem = typeof appraisalItems.$inferInsert;

/** ONE score row per item, carrying all three stages + the computed final.
 *  Scores are 0..10 (house pms convention); the engine converts to % of the
 *  item's relative max. Manager explanation is MANDATORY (enforced in the
 *  action, not the DB). */
export const appraisalScores = pgTable(
  "appraisal_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appraisalItems.id, { onDelete: "cascade" }),
    // ── Self ──
    selfScore: numeric("self_score", { precision: 6, scale: 2 }),
    selfJustification: text("self_justification"),
    selfSubmittedAt: timestamp("self_submitted_at", { withTimezone: true }),
    // ── Manager ──
    managerId: uuid("manager_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    managerScore: numeric("manager_score", { precision: 6, scale: 2 }),
    managerExplanation: text("manager_explanation"),
    managerSubmittedAt: timestamp("manager_submitted_at", { withTimezone: true }),
    // ── Management (the owner / "sir") ──
    managementId: uuid("management_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    managementScore: numeric("management_score", { precision: 6, scale: 2 }),
    managementExplanation: text("management_explanation"),
    managementSubmittedAt: timestamp("management_submitted_at", { withTimezone: true }),
    // ── Final ──
    /** Relative max = subWeight% × dimension weight, denormalised at publish. */
    maxScore: numeric("max_score", { precision: 6, scale: 2 }),
    finalScore: numeric("final_score", { precision: 6, scale: 2 }),
    finalizedById: uuid("finalized_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("appraisal_scores_item_uq").on(t.itemId)],
);
export type AppraisalScore = typeof appraisalScores.$inferSelect;

/** Evidence attachments per item + stage (Supabase `documents` bucket, dossier
 *  upload pattern). Optional everywhere by design. */
export const appraisalAttachments = pgTable(
  "appraisal_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => appraisalItems.id, { onDelete: "cascade" }),
    /** Which stage attached it: 'self' | 'manager' | 'management'. */
    stage: text("stage").notNull().default("self").$type<AppraisalScoreStage>(),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appraisal_attachments_item_idx").on(t.itemId)],
);
export type AppraisalAttachment = typeof appraisalAttachments.$inferSelect;

/** Culture rotation — which Constitution paragraphs are assigned to which
 *  month, SERIAL-WISE (in pool order, not random). `paraId` points at
 *  pms_constitution_para (FK in SQL migration 0146 only — that table's drizzle
 *  def lives in lib/pms/v3/schema.ts and can't be referenced here without a
 *  circular import). `serial` = 1..culturePerMonth slot within the month;
 *  the admin menu-card manages the pool/order via pms_constitution_para. */
export const appraisalCultureAssignments = pgTable(
  "appraisal_culture_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'YYYY-MM'. */
    period: text("period").notNull(),
    /** FK → pms_constitution_para(id) (SQL-level, migration 0146). */
    paraId: uuid("para_id").notNull(),
    /** Slot 1..N within the month (serial order). */
    serial: integer("serial").notNull(),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("appraisal_culture_period_para_uq").on(t.period, t.paraId),
    uniqueIndex("appraisal_culture_period_serial_uq").on(t.period, t.serial),
    index("appraisal_culture_period_idx").on(t.period),
  ],
);
export type AppraisalCultureAssignment = typeof appraisalCultureAssignments.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// HR Letters / Documents engine (migration 0152) — the 26-type letter program.
// THREE NEW tables only — additive, load-neutral. HYBRID template model: a fixed
// Altus letterhead/frame + signature block in code, with an ADMIN-EDITABLE body
// (`body_md`) carrying {{mergeFields}} auto-filled per employee. Rendered PDFs +
// any archived artefacts live in the private `documents` bucket. Signature state
// for e-sign docs comes from `document_signatures` (doc_kind 'letter', doc_id =
// document_instances.id) — not duplicated here.
// ─────────────────────────────────────────────────────────────────────────────
export const letterTemplates = pgTable(
  "letter_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** letter family (see lib/hr/letters/types.ts HR_CATEGORIES) */
    category: text("category").notNull(),
    /** stable identity, e.g. 'appointment_letter' — one row per DOC_TYPES key */
    typeKey: text("type_key").notNull(),
    title: text("title").notNull(),
    /** admin-editable body with {{mergeFields}} (the fixed frame lives in code) */
    bodyMd: text("body_md").notNull().default(""),
    /** 'issued' | 'email' | 'request' */
    trigger: text("trigger").notNull().default("issued"),
    /** 'none' | 'acknowledge' | 'esign' */
    signature: text("signature").notNull().default("none"),
    /** 'text' | 'structured' | 'certificate' */
    content: text("content").notNull().default("text"),
    active: boolean("active").notNull().default(true),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("letter_templates_type_key_uq").on(t.typeKey)],
);
export type LetterTemplate = typeof letterTemplates.$inferSelect;
export type NewLetterTemplate = typeof letterTemplates.$inferInsert;

export const documentInstances = pgTable(
  "document_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** which template/type this instance was composed from */
    typeKey: text("type_key").notNull(),
    /** signer/recipient; NULL for pre-hire candidates (use candidate_* instead) */
    employeeId: uuid("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    candidateName: text("candidate_name"),
    candidateEmail: text("candidate_email"),
    /** 'draft' | 'sent' | 'acknowledged' | 'signed' */
    status: text("status").notNull().default("draft"),
    /** the filled {{merge}} field values at compose time */
    mergeValues: jsonb("merge_values").notNull().default({}).$type<Record<string, string>>(),
    /** frozen body_md at issue (the source of truth for the rendered PDF) */
    bodySnapshotMd: text("body_snapshot_md"),
    /** rich-editor structured snapshot (TipTap JSON) when composed in "Edit freely" mode (mig 0161) */
    bodyRich: jsonb("body_rich").$type<Record<string, unknown>>(),
    /** rich-editor HTML body — the source of truth for the headless-Chromium PDF (mig 0161) */
    bodyHtml: text("body_html"),
    /** which editor produced the body: 'structured' (template + merge_values) | 'rich' (body_html) (mig 0161) */
    contentKind: text("content_kind").notNull().default("structured"),
    /** archived rendered PDF storage path (private `documents` bucket) */
    renderedPdfPath: text("rendered_pdf_path"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    issuedById: uuid("issued_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_instances_employee_idx").on(t.employeeId),
    index("document_instances_type_idx").on(t.typeKey),
    index("document_instances_status_idx").on(t.status),
  ],
);
export type DocumentInstance = typeof documentInstances.$inferSelect;
export type NewDocumentInstance = typeof documentInstances.$inferInsert;

export const ctcBreakups = pgTable(
  "ctc_breakups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    /** 'initial' | 'promotion' | 'appraisal' */
    reason: text("reason").notNull().default("initial"),
    effectiveDate: date("effective_date"),
    /** the structured CTC fields (the CTC workbench engine — future batch) */
    fields: jsonb("fields").notNull().default({}),
    /** [{ id, date, title, detail }] growth-journey timeline */
    growthJourney: jsonb("growth_journey").notNull().default([]),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ctc_breakups_employee_version_uq").on(t.employeeId, t.version),
    index("ctc_breakups_employee_idx").on(t.employeeId),
  ],
);
export type CtcBreakup = typeof ctcBreakups.$inferSelect;
export type NewCtcBreakup = typeof ctcBreakups.$inferInsert;

// ─── Appraisal v2 (migration 0153) — fresh module, appr_* prefix ────────────
// ONE live rolling scorecard per employee (no cycles). Management is FINAL:
// each item carries Self (advisory) + Manager (advisory) + Management (final)
// scores, all 0-100 %. 6 dimensions with admin-adjustable weights summing 100.

/** Per-employee standing config: assignees, dimension weights, knowledge rule. */
export const apprConfig = pgTable("appr_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .unique()
    .references(() => employees.id, { onDelete: "cascade" }),
  managerId: uuid("manager_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  managementId: uuid("management_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  // 'manager' | 'non-manager' — selects the dimension set + weights (MACRO_BUCKETS).
  roleClass: text("role_class").notNull().default("non-manager"),
  // Role-based bucket weights (kpi/goals/culture/…); default = non-manager framework.
  dimensionWeights: jsonb("dimension_weights").notNull().default({
    kpi: 20,
    goals: 30,
    culture: 15,
    problemSolving: 10,
    growthMindset: 10,
    attendTraining: 5,
    skillUpgrade: 5,
    teamPlayer: 5,
  }),
  incentiveTarget: numeric("incentive_target", { precision: 14, scale: 2 }),
  knowledgeDo: integer("knowledge_do").notNull().default(1),
  knowledgeGive: integer("knowledge_give").notNull().default(1),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ApprConfig = typeof apprConfig.$inferSelect;
export type NewApprConfig = typeof apprConfig.$inferInsert;

/** KPI rows (<=5 / employee). */
export const apprKpi = pgTable(
  "appr_kpi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    srNo: integer("sr_no"),
    area: text("area"),
    measure: text("measure"),
    subWeight: integer("sub_weight").notNull().default(20),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appr_kpi_employee_idx").on(t.employeeId)],
);
export type ApprKpi = typeof apprKpi.$inferSelect;
export type NewApprKpi = typeof apprKpi.$inferInsert;

/** Skills-to-learn (<=3 / employee). */
export const apprSkill = pgTable(
  "appr_skill",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    name: text("name"),
    technical: boolean("technical").notNull().default(false),
    subWeight: integer("sub_weight").notNull().default(33),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appr_skill_employee_idx").on(t.employeeId)],
);
export type ApprSkill = typeof apprSkill.$inferSelect;
export type NewApprSkill = typeof apprSkill.$inferInsert;

/** The 4 fixed Attitude & Mindset items (ensure-seeded per employee). */
export const apprAttitude = pgTable(
  "appr_attitude",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // 'problem_solving' | 'growth_mindset' | 'get_things_done' | 'empower_work'
    key: text("key").notNull(),
    label: text("label"),
    weight: integer("weight").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("appr_attitude_employee_idx").on(t.employeeId)],
);
export type ApprAttitude = typeof apprAttitude.$inferSelect;
export type NewApprAttitude = typeof apprAttitude.$inferInsert;

/** ONE live scorecard row / employee (incentive + culture direct scores). */
export const apprScorecard = pgTable("appr_scorecard", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .unique()
    .references(() => employees.id, { onDelete: "cascade" }),
  // Legacy direct scores (preserved; unused by the role-based engine).
  incentiveScore: integer("incentive_score"),
  incentiveNote: text("incentive_note"),
  cultureScore: integer("culture_score"),
  // KPI-dictionary line actuals — { lineId: actual } — Management-entered; the
  // internal KPI % computed from these = the Final Incentive Authorization %.
  kpiActuals: jsonb("kpi_actuals").notNull().default({}),
  // 'in_progress' | 'finalized'
  status: text("status").notNull().default("in_progress"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ApprScorecard = typeof apprScorecard.$inferSelect;
export type NewApprScorecard = typeof apprScorecard.$inferInsert;

/** One row per scored item (kpi|skill|attitude) — Self/Manager/Management. */
export const apprItemScore = pgTable(
  "appr_item_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // 'kpi' | 'skill' | 'attitude'
    itemKind: text("item_kind").notNull(),
    itemId: uuid("item_id").notNull(),
    actual: text("actual"),
    evidenceUrl: text("evidence_url"),
    approved: boolean("approved"),
    remarks: text("remarks"),
    selfScore: integer("self_score"),
    selfNote: text("self_note"),
    managerScore: integer("manager_score"),
    managerNote: text("manager_note"),
    managementScore: integer("management_score"),
    managementNote: text("management_note"),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appr_item_score_employee_idx").on(t.employeeId),
    uniqueIndex("appr_item_score_item_uq").on(t.itemKind, t.itemId),
  ],
);
export type ApprItemScore = typeof apprItemScore.$inferSelect;
export type NewApprItemScore = typeof apprItemScore.$inferInsert;

/**
 * Migration 0167 — one Self/Manager/Management (0..100) score per ROLE dimension
 * (goals, culture, skillUpgrade, knowledgeSharing, problemSolving, growthMindset,
 * mih, teamNurture, attendTraining, teamPlayer). Management is FINAL. The KPI
 * dimension is NOT stored here — it computes from appr_scorecard.kpi_actuals.
 */
export const apprDimensionScore = pgTable(
  "appr_dimension_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    dimensionKey: text("dimension_key").notNull(),
    selfScore: integer("self_score"),
    selfNote: text("self_note"),
    managerScore: integer("manager_score"),
    managerNote: text("manager_note"),
    managementScore: integer("management_score"),
    managementNote: text("management_note"),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("appr_dimension_score_uq").on(t.employeeId, t.dimensionKey),
    index("appr_dimension_score_employee_idx").on(t.employeeId),
  ],
);
export type ApprDimensionScore = typeof apprDimensionScore.$inferSelect;
export type NewApprDimensionScore = typeof apprDimensionScore.$inferInsert;

/** Candidate Intake (Pre-Interview → Basic Details) — the 108-field walk-in
 *  interview form. Full answers in `data` jsonb; hot columns lifted for listing. */
export const candidateIntake = pgTable(
  "candidate_intake",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionApplied: text("position_applied"),
    fullName: text("full_name").notNull().default(""),
    mobile: text("mobile"),
    email: text("email"),
    // 'new' | 'shortlisted' | 'rejected' | 'hired'
    status: text("status").notNull().default("new"),
    data: jsonb("data").notNull().default({}),
    // Repeater structure for resuming a draft: { [sectionId]: string[] } (uids).
    instances: jsonb("instances"),
    // null = in-progress draft; set = the form was completed/submitted.
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Candidate Evaluation Checklist state: { checked: string[] } (criterion ids).
    evaluation: jsonb("evaluation"),
    // Candidate Evaluation v2 — structured, two-instance blob:
    // { interviewer?: EvaluationInstance, management?: EvaluationInstance }
    // (see lib/hr/candidate/evaluation-v2.ts). The old `evaluation` stays intact.
    evaluationV2: jsonb("evaluation_v2"),
    photoPath: text("photo_path"),
    signaturePath: text("signature_path"),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("candidate_intake_created_at_idx").on(t.createdAt),
    index("candidate_intake_status_idx").on(t.status),
  ],
);
export type CandidateIntake = typeof candidateIntake.$inferSelect;

/**
 * Per-designation weight profiles for Candidate Evaluation v2. One row per
 * designation (Intern → Sr VP) plus a `default` pseudo-row that seeds the base
 * profile. `weights` = { [sectionId]: number } (relative macro weights).
 */
export const evaluationWeightProfiles = pgTable("evaluation_weight_profiles", {
  designation: text("designation").primaryKey(),
  weights: jsonb("weights").notNull().default({}).$type<Record<string, number>>(),
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type EvaluationWeightProfile = typeof evaluationWeightProfiles.$inferSelect;

/**
 * Monthly Performance & Incentive scorecards (the Altus HR Intelligence Engine).
 * One row per (person_key, period_month). `computed` caches the deterministic
 * breakdown for the Dossier. See lib/performance/*.
 */
export const performanceScorecards = pgTable(
  "performance_scorecards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    /** KPI-dictionary key (e.g. "rohan"). */
    personKey: text("person_key").notNull(),
    personName: text("person_name").notNull().default(""),
    /** YYYY-MM. */
    periodMonth: text("period_month").notNull(),
    roleClass: text("role_class").notNull().default("non-manager"),
    kpiActuals: jsonb("kpi_actuals").notNull().default({}).$type<Record<string, number>>(),
    bucketScores: jsonb("bucket_scores").notNull().default({}).$type<Record<string, number>>(),
    computed: jsonb("computed"),
    totalScore: numeric("total_score", { precision: 6, scale: 2 }),
    incentivePct: numeric("incentive_pct", { precision: 6, scale: 2 }),
    narrative: text("narrative"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("perf_scorecard_person_month_uk").on(t.personKey, t.periodMonth)],
);
export type PerformanceScorecard = typeof performanceScorecards.$inferSelect;

/* ── Policy CMS (admin-editable policies + versioning + compliance) ────── */

/** The living policy record (one per policy key). Points at the current version. */
export const policyDocuments = pgTable("policy_documents", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  docCode: text("doc_code").notNull().default(""),
  category: text("category").notNull().default("policy"),
  badge: text("badge").notNull().default(""),
  blurb: text("blurb").notNull().default(""),
  summary: text("summary").notNull().default(""),
  owner: text("owner").notNull().default(""),
  registeredOffice: text("registered_office").notNull().default(""),
  hrEmail: text("hr_email").notNull().default(""),
  entityDefault: text("entity_default").notNull().default("altus-corp"),
  currentVersion: integer("current_version").notNull().default(1),
  status: text("status").notNull().default("published"), // draft | published | archived
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PolicyDocumentRow = typeof policyDocuments.$inferSelect;

/** Immutable version history — `sections` is the declarative PolicyDoc.sections. */
export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyKey: text("policy_key").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    docCode: text("doc_code").notNull().default(""),
    effectiveDate: text("effective_date").notNull().default(""),
    summary: text("summary").notNull().default(""),
    sections: jsonb("sections").notNull().default([]),
    publishedById: uuid("published_by_id").references(() => employees.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policy_versions_key_version_uk").on(t.policyKey, t.version)],
);
export type PolicyVersionRow = typeof policyVersions.$inferSelect;

/** Per-employee compliance for a policy's CURRENT version. Publishing a new
 *  version resets everyone to 'pending' (the re-signing request). */
export const policyCompliance = pgTable(
  "policy_compliance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyKey: text("policy_key").notNull(),
    version: integer("version").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | signed
    signedAt: timestamp("signed_at", { withTimezone: true }),
    docInstanceId: uuid("doc_instance_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policy_compliance_key_emp_uk").on(t.policyKey, t.employeeId)],
);
export type PolicyComplianceRow = typeof policyCompliance.$inferSelect;
export type NewCandidateIntake = typeof candidateIntake.$inferInsert;

// ─── KPI Management (migration 0170) — HR-staff-only ─────────────────────────
// Per-person KPI assignments that REFERENCE the appraisal KPI dictionary
// (lib/performance/kpi-dictionary.ts) as the catalog. State columns are `text`
// with $type overlays from db/enums.ts (house norm — not pgEnums).
export const kpiAssignments = pgTable(
  "kpi_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** KPI-dictionary line/target key when picked from the catalog; null for a
     *  manually-entered KPI. */
    kpiKey: text("kpi_key"),
    kpiName: text("kpi_name").notNull(),
    category: text("category").notNull().default(""),
    frequency: text("frequency").notNull().default("monthly").$type<KpiFrequency>(),
    weightage: integer("weightage").notNull().default(0),
    /** e.g. "2026-Q2". */
    effectiveQuarter: text("effective_quarter").notNull().default(""),
    /** text so numeric OR descriptive targets both fit; achievement % parses
     *  the numeric prefix. current_value nullable (may be computed later). */
    targetValue: text("target_value").notNull().default(""),
    currentValue: text("current_value"),
    /** the "Applicable this quarter" toggle. */
    applicable: boolean("applicable").notNull().default(true),
    status: text("status").notNull().default("active").$type<KpiAssignmentStatus>(),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    index("kpi_assignments_employee_idx").on(t.employeeId),
    index("kpi_assignments_employee_quarter_idx").on(t.employeeId, t.effectiveQuarter),
  ],
);
export type KpiAssignment = typeof kpiAssignments.$inferSelect;
export type NewKpiAssignment = typeof kpiAssignments.$inferInsert;

/** APPEND-ONLY audit log — one row per KPI change; NEVER updated or deleted. */
export const kpiAssignmentHistory = pgTable(
  "kpi_assignment_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => kpiAssignments.id, { onDelete: "cascade" }),
    changeType: text("change_type").notNull().$type<KpiChangeType>(),
    previous: jsonb("previous"),
    updated: jsonb("updated"),
    changedById: uuid("changed_by_id").references(() => employees.id, { onDelete: "set null" }),
    changedOn: timestamp("changed_on", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
  },
  (t) => [
    index("kpi_assignment_history_assignment_idx").on(t.assignmentId),
    index("kpi_assignment_history_changed_on_idx").on(t.changedOn),
  ],
);
export type KpiAssignmentHistoryRow = typeof kpiAssignmentHistory.$inferSelect;
export type NewKpiAssignmentHistoryRow = typeof kpiAssignmentHistory.$inferInsert;

/* ------------------------------------------------------------------ */
/* Task Reminder Settings (migration 0185)                             */
/* ------------------------------------------------------------------ */

/** Whose tasks a reminder rule collects. */
export type TaskReminderScope = "all" | "selected";

/**
 * A rule's status filter holds real `task_status` values PLUS the pseudo-token
 * `"overdue"`, which is not a status but a derived condition (due_at < now).
 * They share one array because that is how an admin reads the setting: a single
 * checklist of "what should be chased".
 */
export type TaskReminderStatusToken = TaskStatus | "overdue";

/**
 * Admin-authored daily task reminders. Each rule owns its recipients, its
 * employee scope, its statuses and its own send time; the dispatcher
 * (app/api/cron/task-reminders) sends ONE consolidated email per recipient,
 * grouped by employee. See db/migrations/0185_task_reminder_rules.sql for why
 * the list columns are jsonb and the time is an IST "HH:MM" string.
 */
export const taskReminderRules = pgTable(
  "task_reminder_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    recipientIds: jsonb("recipient_ids").notNull().default([]).$type<string[]>(),
    scope: text("scope").notNull().default("all").$type<TaskReminderScope>(),
    employeeIds: jsonb("employee_ids").notNull().default([]).$type<string[]>(),
    statuses: jsonb("statuses")
      .notNull()
      .default(["dont_know", "not_started", "initiated", "overdue"])
      .$type<TaskReminderStatusToken[]>(),
    /** "HH:MM", IST. */
    sendTimeIst: text("send_time_ist").notNull().default("09:30"),
    /** "YYYY-MM-DD" IST — the idempotency guard for the 15-minute dispatcher. */
    lastSentOn: text("last_sent_on"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_reminder_rules_enabled_idx").on(t.isEnabled, t.sendTimeIst)],
);
export type TaskReminderRule = typeof taskReminderRules.$inferSelect;
export type NewTaskReminderRule = typeof taskReminderRules.$inferInsert;

// Migration 0189 — the Monday "what last week cost you" acknowledgement.
//
// On the first punch of a new week an employee is shown last week's ATTENDANCE
// LOST + MONEY LOST report and must dismiss it before they can clock IN. A row
// here is the proof they read it, one per person per reported week.
//
// `weekStart` is the MONDAY of the week being REPORTED — the week that had just
// ended when the dialog was shown, never the current week.
//
// `daysLost` / `moneyLost` are FROZEN copies of the figures actually shown, not
// pointers to be re-derived. Attendance is editable after the fact (punch-edit,
// backfill, a leave approved late), so re-deriving would silently rewrite what
// somebody acknowledged — and this row exists precisely to say what was on the
// screen at the moment they clicked.
export const attendanceWeekAck = pgTable(
  "attendance_week_ack",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
    daysLost: numeric("days_lost", { precision: 6, scale: 2 }).notNull().default("0"),
    moneyLost: numeric("money_lost", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One acknowledgement per person per reported week — also what makes the
    // acknowledge action idempotent under a double-click or two racing tabs.
    uniqueIndex("attendance_week_ack_emp_week_uq").on(t.employeeId, t.weekStart),
    index("attendance_week_ack_week_idx").on(t.weekStart),
  ],
);

export type AttendanceWeekAck = typeof attendanceWeekAck.$inferSelect;
export type NewAttendanceWeekAck = typeof attendanceWeekAck.$inferInsert;

// ── People Allocation (rebuilt, migration 0191) ────────────────────────────
//
// Deliberately independent of the Billing tables that used to back this
// section: the question changed from "which teams staff this client" to "which
// clients does this person carry", and bending the old shape to fit would have
// left money columns and team columns that nothing reads.

export const paClients = pgTable(
  "pa_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** One of ALLOCATION_CATEGORIES: ps | bss | retainer | ecosystem. */
    category: text("category").notNull(),
    /** Retainer clients only — the term they are engaged for. */
    startDate: date("start_date"),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pa_clients_category_idx").on(t.category, t.name)],
);

export const paPeople = pgTable("pa_people", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** employee | intern — interns exist only for Ecosystem / App Development. */
  kind: text("kind").notNull().default("employee"),
  /** Always the display name, whether picked from the roster or typed in. */
  name: text("name").notNull(),
  /** Set when the person came from the employee roster; null when typed. */
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paAllocations = pgTable(
  "pa_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => paPeople.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => paClients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pa_allocations_person_idx").on(t.personId)],
);

/** Ambassadors — their own list, never mixed into the four client categories. */
export const paAmbassadors = pgTable("pa_ambassadors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  /** Multi-select — an ambassador may carry more than one product. */
  products: text("products").array().notNull().default([]),
  batchNo: text("batch_no"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  onHold: boolean("on_hold").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Hand-holding entries — one row per person per section (migration 0193). */
export const paEntries = pgTable(
  "pa_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => paPeople.id, { onDelete: "cascade" }),
    /** ps | bss | retainer | ecosystem, or null until a Product is chosen. */
    section: text("section"),
    name: text("name").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** PS / BSS only — the batch this participant belongs to. */
    batchNo: text("batch_no"),
    /** On hold: excluded from participant counts and weekly hours. */
    onHold: boolean("on_hold").notNull().default(false),
    /** Which weekday this participant sits on (mon..sun). Null until chosen. */
    day: text("day"),
    /** Which call this participant sits on (HH_CALL_TYPES). Null until chosen. */
    callType: text("call_type"),
    /** That call's length in MINUTES. Shown as HH:MM; stored as a quantity. */
    durationMin: integer("duration_min"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pa_entries_person_idx").on(t.personId, t.section, t.name)],
);

/** Weekly calls on a Hand-holding entry (migration 0195). */
/**
 * HAND-HOLDING · ACCESS — grants written down in the Access / Permissions
 * dialog. The role matrix itself lives in db/enums (HH_ACCESS_ROLES); a row
 * here records a specific module/section/action, and can never exceed what the
 * role allows because the dialog only offers that role's actions.
 */
/**
 * HAND-HOLDING · ACCESS ACTIVITY — the log listed in the Access / Permissions
 * dialog: who was added, edited or deleted, in which section, and when.
 */
export const hhAccessActivity = pgTable(
  "hh_access_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    module: text("module").notNull(),
    section: text("section").notNull(),
    personName: text("person_name").notNull(),
    /** add | edit | delete | view */
    action: text("action").notNull(),
    occurredOn: date("occurred_on").notNull(),
    /** mon..sun, as chosen in the Day field */
    day: text("day").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hh_access_activity_role_idx").on(t.role)],
);

export const hhAccessGrants = pgTable(
  "hh_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** admin | hr | ruchita */
    role: text("role").notNull(),
    /** handholding | ambassadors | development */
    module: text("module").notNull(),
    section: text("section").notNull(),
    /** add | edit | delete | view */
    action: text("action").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hh_access_grants_role_idx").on(t.role)],
);

export const paCalls = pgTable(
  "pa_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Exactly one of entryId / ambassadorId is set (DB CHECK enforces it). */
    entryId: uuid("entry_id").references(() => paEntries.id, { onDelete: "cascade" }),
    ambassadorId: uuid("ambassador_id").references(() => paAmbassadors.id, { onDelete: "cascade" }),
    /** Weekly Call 1, 2, 3… */
    seq: integer("seq").notNull(),
    /** hh | tool | checkin */
    callType: text("call_type").notNull(),
    /** mon..sun */
    day: text("day").notNull(),
    durationMin: integer("duration_min").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pa_calls_entry_idx").on(t.entryId)],
);
/**
 * EXIT RECORD (migration 0212) — one row per departure.
 *
 * Separate from `employees` rather than more columns on it: written once, read
 * rarely, and the access rules differ — the exit interview is superadmin-only
 * while the employees row is read app-wide.
 *
 * Nothing here is destroyed when someone leaves. This table is what makes the
 * old hard-delete unnecessary: it records why they left and where their work
 * went, so the audit trail no longer has to be erased to remove a login.
 */
export const employeeExits = pgTable(
  "employee_exits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .unique()
      .references(() => employees.id, { onDelete: "cascade" }),

    /** Closed taxonomy; `other` carries its description in exitReasonOther. */
    exitReason: text("exit_reason").notNull().$type<ExitReason>(),
    exitReasonOther: text("exit_reason_other"),

    rehireEligibility: text("rehire_eligibility")
      .notNull()
      .default("with_review")
      .$type<RehireEligibility>(),
    rehireNote: text("rehire_note"),

    /**
     * COPIED from employees at archive time, not read live. An exit record is
     * a statement about the employment that ended; it must not change if the
     * live row is corrected later. The admin may amend the DOJ during the exit
     * flow, and this is what they amended it to.
     */
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    resignationDate: date("resignation_date"),
    lastWorkingDay: date("last_working_day"),

    noticeServed: boolean("notice_served"),
    noticeDays: integer("notice_days"),
    paidInLieu: boolean("paid_in_lieu").notNull().default(false),

    /** Who inherited the open work. SET NULL — a successor may leave too. */
    successorId: uuid("successor_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    /** Counts of what moved, by kind — {tasks: 12, goals: 3, …}. */
    reassigned: jsonb("reassigned").notNull().default({}),

    handover: jsonb("handover").notNull().default({}),
    exitInterview: jsonb("exit_interview"),

    /**
     * What the irreversible half actually did. A Firebase outage must not
     * leave the record asserting the login is gone when it is not.
     */
    firebaseDeleted: boolean("firebase_deleted").notNull().default(false),
    firebaseError: text("firebase_error"),
    avatarPurged: boolean("avatar_purged").notNull().default(false),

    notes: text("notes"),
    archivedById: uuid("archived_by_id")
      .notNull()
      .references((): AnyPgColumn => employees.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("employee_exits_archived_at_idx").on(t.archivedAt),
    index("employee_exits_reason_idx").on(t.exitReason),
    index("employee_exits_successor_idx").on(t.successorId),
  ],
);

export type EmployeeExit = typeof employeeExits.$inferSelect;

/**
 * RETENTION SCHEDULE AS DATA (migration 0212).
 *
 * The periods are set by law, not by engineering, and an auditor asking "what
 * is your retention policy" needs an answer that is not a code review. Holding
 * them in a table also means changing one is a data edit rather than a deploy.
 *
 * `purgeEnabled` defaults FALSE for every class. A retention table that starts
 * deleting the moment it is created is a data-loss incident wearing a policy
 * costume; each class is switched on consciously once its purge path is proven.
 */
export const dataRetentionPolicies = pgTable("data_retention_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordClass: text("record_class").notNull().unique(),
  retentionDays: integer("retention_days").notNull(),
  legalBasis: text("legal_basis").notNull(),
  purgeEnabled: boolean("purge_enabled").notNull().default(false),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DataRetentionPolicy = typeof dataRetentionPolicies.$inferSelect;

/* ──────────────────────────────────────────────────────────────────────────
 * TEMPORARY DELEGATED ACCESS (migration 0218)
 *
 * "Rudra needs to test Rutvisha's account." One opaque token, hashed here,
 * carried in its own cookie beside the delegate's REAL session. While it
 * resolves to a live row the server answers "who is the current employee" with
 * the target's row — see lib/auth/delegated-access.ts and lib/auth/current.ts.
 *
 * No credential of any kind is stored, copied or changed by any of this.
 * ────────────────────────────────────────────────────────────────────────── */

export const delegatedAccessGrants = pgTable(
  "delegated_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Whose account is being accessed. */
    targetEmployeeId: uuid("target_employee_id")
      .notNull()
      .references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
    /** Who receives the access. Must be signed in as themselves for the token
     *  to resolve, so a leaked token is useless to anybody else. */
    delegateEmployeeId: uuid("delegate_employee_id")
      .notNull()
      .references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    /** What the manager PICKED — kept beside the computed expiry so the audit
     *  screen can show that the 20:30 floor extended a 1-hour grant. */
    durationMinutes: integer("duration_minutes").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * THE ONE AUTHORITY ON EXPIRY: `max(startsAt + duration, 20:30 IST)`,
     * computed server-side at grant time by `delegatedExpiry`. Stored rather
     * than recomputed so a later change to the rule cannot extend a grant that
     * is already running.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    /** SHA-256 (hex) of the opaque token. The token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    firstUsedAt: timestamp("first_used_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
    /** Recorded for the audit trail, NOT used as an authorization input — the
     *  device restriction is applied to the delegate's own identity before the
     *  swap, so a grant can never lend out the target's registered devices. */
    deviceId: text("device_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("delegated_access_token_idx").on(t.tokenHash),
    index("delegated_access_target_idx").on(t.targetEmployeeId, t.startsAt),
    index("delegated_access_delegate_idx").on(t.delegateEmployeeId, t.startsAt),
  ],
);

export const delegatedAccessEvents = pgTable(
  "delegated_access_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SET NULL, not cascade: an audit row outlives what it describes. */
    grantId: uuid("grant_id").references((): AnyPgColumn => delegatedAccessGrants.id, {
      onDelete: "set null",
    }),
    kind: text("kind")
      .$type<
        | "granted"
        | "started"
        | "expired"
        | "revoked"
        | "denied_after_expiry"
        | "denied"
      >()
      .notNull(),
    /** Denormalised so the row still reads after an employee is anonymised. */
    targetEmployeeId: uuid("target_employee_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    delegateEmployeeId: uuid("delegate_employee_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    actorEmployeeId: uuid("actor_employee_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    detail: text("detail"),
    deviceId: text("device_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("delegated_access_events_grant_idx").on(t.grantId, t.occurredAt),
    index("delegated_access_events_recent_idx").on(t.occurredAt),
    index("delegated_access_events_target_idx").on(t.targetEmployeeId, t.occurredAt),
  ],
);

export type DelegatedAccessGrant = typeof delegatedAccessGrants.$inferSelect;
export type NewDelegatedAccessGrant = typeof delegatedAccessGrants.$inferInsert;
export type DelegatedAccessEvent = typeof delegatedAccessEvents.$inferSelect;

/* ──────────────────────────────────────────────────────────────────────────
 * THE PERMISSION MATRIX (migration 0219)
 *
 * Only the GRANTS are stored. The module → sub-module → sub-sub-module TREE is
 * code (lib/permissions/catalog.ts), derived from the real routes, because a
 * node is only meaningful if something enforces it and what enforces it is
 * code. See the migration header for the full reasoning.
 *
 * A missing row means "fall back to the authorization the app already has", not
 * "denied" — and an override can only NARROW that, never widen it.
 * ────────────────────────────────────────────────────────────────────────── */

export const modulePermissions = pgTable(
  "module_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
    /** Dotted catalogue path: "wms", "wms.tasks", "wms.tasks.report". */
    nodeKey: text("node_key").notNull(),
    canShow: boolean("can_show").notNull().default(true),
    canView: boolean("can_view").notNull().default(true),
    canEdit: boolean("can_edit").notNull().default(true),
    updatedById: uuid("updated_by_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("module_permissions_employee_node_uniq").on(t.employeeId, t.nodeKey),
    index("module_permissions_employee_idx").on(t.employeeId),
    index("module_permissions_node_idx").on(t.nodeKey),
  ],
);

export const modulePermissionEvents = pgTable(
  "module_permission_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    nodeKey: text("node_key").notNull(),
    /** NULL = there was no override before/after. Distinct from false, which is
     *  an explicit deny — that distinction IS the default-open rule. */
    prevShow: boolean("prev_show"),
    prevView: boolean("prev_view"),
    prevEdit: boolean("prev_edit"),
    nextShow: boolean("next_show"),
    nextView: boolean("next_view"),
    nextEdit: boolean("next_edit"),
    actorEmployeeId: uuid("actor_employee_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("module_permission_events_employee_idx").on(t.employeeId, t.occurredAt),
    index("module_permission_events_recent_idx").on(t.occurredAt),
  ],
);

export type ModulePermission = typeof modulePermissions.$inferSelect;
export type NewModulePermission = typeof modulePermissions.$inferInsert;
export type ModulePermissionEvent = typeof modulePermissionEvents.$inferSelect;

/* ──────────────────────────────────────────────────────────────────────────
 * REPORTING-MANAGER HISTORY (migration 0220)
 *
 * `employees.managerId` stays THE reporting relationship — ~20 modules resolve
 * it live from that column, so a change already propagates everywhere with no
 * fan-out writes. This table remembers what it USED to be, so a report about
 * August does not silently re-read September's manager.
 *
 * Intervals, not events: "who managed X on date D" is the only question anyone
 * asks, and this stores the answer directly. Exactly one open row per employee.
 * ────────────────────────────────────────────────────────────────────────── */

export const employeeManagerHistory = pgTable(
  "employee_manager_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references((): AnyPgColumn => employees.id, { onDelete: "cascade" }),
    /** Null is MEANINGFUL: a period during which they reported to nobody. */
    managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    /** Dates, not timestamps — every consumer works in whole days or months. */
    effectiveFrom: date("effective_from").notNull(),
    /** Null = the CURRENT period, and the one that must agree with
     *  `employees.managerId`. */
    effectiveTo: date("effective_to"),
    changedById: uuid("changed_by_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("employee_manager_history_lookup_idx").on(t.employeeId, t.effectiveFrom),
    index("employee_manager_history_manager_idx").on(t.managerId, t.effectiveFrom),
  ],
);

export type EmployeeManagerHistory = typeof employeeManagerHistory.$inferSelect;
export type NewEmployeeManagerHistory = typeof employeeManagerHistory.$inferInsert;

/* ── Operations · Event Checklist (migration 0221) ───────────────────────────
 * Dates are driven by an OFFSET from the event, and that one decision shapes
 * everything: an offset means nothing without an event date, so "is this an
 * event checklist?" belongs to the CHECKLIST, not to each row.
 *
 * Two levels. A TEMPLATE is a reusable named list — offsets, no event, no
 * dates. A RUN is one template applied to one event on one date, and it is the
 * run that carries the ticks. That split is what makes "duplicate onto the next
 * conference" a row copy instead of an hour of re-typing.
 */

/** A reusable master checklist. Offsets only — no event, no dates. */
export const opsChecklistTemplates = pgTable(
  "ops_checklist_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    /** true → offsets + an event anchor. false → a standing operational list. */
    isEvent: boolean("is_event").notNull().default(true),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ops_checklist_templates_active_idx").on(t.isActive, t.name)],
);
export type OpsChecklistTemplate = typeof opsChecklistTemplates.$inferSelect;
export type NewOpsChecklistTemplate = typeof opsChecklistTemplates.$inferInsert;

/**
 * One checklist, for one event.
 *
 * `eventDate` is COPIED from calendar_events, not joined. Joining would look
 * tidier and would mean that moving an event silently rewrote every target date
 * and every variance figure on checklists people had already worked against —
 * closed ones included. The run owns its date; the UI offers "the event moved —
 * recalculate?" as a decision rather than a side effect.
 */
export const opsChecklistRuns = pgTable(
  "ops_checklist_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").references((): AnyPgColumn => opsChecklistTemplates.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    isEvent: boolean("is_event").notNull().default(true),
    /** SET NULL, not CASCADE: deleting an event must not delete the work record. */
    eventId: uuid("event_id").references(() => calendarEvents.id, { onDelete: "set null" }),
    eventDate: date("event_date"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ops_checklist_runs_event_idx").on(t.eventId),
    index("ops_checklist_runs_status_date_idx").on(t.status, t.eventDate),
  ],
);
export type OpsChecklistRun = typeof opsChecklistRuns.$inferSelect;
export type NewOpsChecklistRun = typeof opsChecklistRuns.$inferInsert;

/**
 * The rows of the grid. Belongs to EXACTLY ONE of a template or a run —
 * the template's items are the pattern, the run's are the worked copy.
 *
 * `offsetDays` NULL is not the same as 0: an imported row nobody has scheduled
 * yet sorts into its own Undated group rather than silently claiming event day.
 */
export const opsChecklistItems = pgTable(
  "ops_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").references((): AnyPgColumn => opsChecklistTemplates.id, {
      onDelete: "cascade",
    }),
    runId: uuid("run_id").references((): AnyPgColumn => opsChecklistRuns.id, {
      onDelete: "cascade",
    }),
    code: text("code"),
    /** The Activity column. */
    title: text("title").notNull(),
    category: text("category"),
    /** Days relative to the event. -3 = three days before, 0 = event day. */
    offsetDays: integer("offset_days"),
    /** Non-event runs only — the date typed directly, since there is no anchor. */
    targetDate: date("target_date"),
    doerId: uuid("doer_id").references(() => employees.id, { onDelete: "set null" }),
    backupId: uuid("backup_id").references(() => employees.id, { onDelete: "set null" }),
    instructions: text("instructions"),
    fileLink: text("file_link"),
    /** Provenance for a row pulled from the JD Bank. FK added when 0222 lands. */
    jdEntryId: uuid("jd_entry_id"),
    sortOrder: integer("sort_order").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ops_checklist_items_template_idx").on(t.templateId, t.sortOrder),
    index("ops_checklist_items_run_idx").on(t.runId, t.offsetDays, t.sortOrder),
    index("ops_checklist_items_doer_idx").on(t.doerId),
  ],
);
export type OpsChecklistItem = typeof opsChecklistItems.$inferSelect;
export type NewOpsChecklistItem = typeof opsChecklistItems.$inferInsert;

/**
 * One tick per item per run.
 *
 * Four states rather than a boolean, matching the Accounts weekly checklist
 * (0080): "Not Applicable" is what stops people ticking Done on work that never
 * needed doing. `doneAt` is the Actual Date; variance derives from it and the
 * target and is never stored, since a third copy could disagree with both.
 */
export const opsChecklistChecks = pgTable(
  "ops_checklist_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references((): AnyPgColumn => opsChecklistRuns.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references((): AnyPgColumn => opsChecklistItems.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("Pending"),
    notes: text("notes"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ops_checklist_checks_uq").on(t.runId, t.itemId),
    index("ops_checklist_checks_run_idx").on(t.runId),
  ],
);
export type OpsChecklistCheck = typeof opsChecklistChecks.$inferSelect;
export type NewOpsChecklistCheck = typeof opsChecklistChecks.$inferInsert;

/* ── HR · Job Description (migration 0222) ───────────────────────────────────
 * A Job Description belongs to a POSITION, never to a person. People come and
 * go; the tea still needs making. The Bank is keyed on a seat, assignment to a
 * human is a separate join, and a vacant seat escalates up the ladder rather
 * than losing its work.
 */

/**
 * The rank ladder. `rankOrder` IS BEHAVIOUR — the vacancy resolver walks it
 * upward, so changing a number reroutes live work. Unique, and seeded in steps
 * of ten so a rank can be inserted later without renumbering its neighbours.
 *
 * NOT to be confused with `pgDesignations` (Prospect Generation — a sales
 * prospect's job title) or `designations` (the payroll-facing title).
 */
export const jdRanks = pgTable("jd_ranks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  rankOrder: integer("rank_order").notNull().unique(),
  band: text("band"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type JdRank = typeof jdRanks.$inferSelect;
export type NewJdRank = typeof jdRanks.$inferInsert;

/** A seat: function × rank, plus an optional variant for genuine exceptions. */
export const jdPositions = pgTable(
  "jd_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A STABLE key from lib/org/functions.ts, never the display label. */
    functionKey: text("function_key").notNull(),
    rankId: uuid("rank_id")
      .notNull()
      .references(() => jdRanks.id, { onDelete: "restrict" }),
    variant: text("variant"),
    title: text("title").notNull(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // jd_positions_uq is an EXPRESSION unique index on
    //   (function_key, rank_id, COALESCE(variant, ''))
    // managed in the migration — a plain UNIQUE over a nullable `variant` would
    // let unlimited duplicate NULL rows through. Not declarable here.
    index("jd_positions_active_idx").on(t.isActive, t.functionKey),
  ],
);
export type JdPosition = typeof jdPositions.$inferSelect;
export type NewJdPosition = typeof jdPositions.$inferInsert;

/**
 * The JD Bank — one row per recurring task, owned by a position.
 *
 * `serialNo` is defaulted by a Postgres SEQUENCE, not by application code: two
 * people saving at once would collide on a max()+1 read. Gaps are expected — a
 * serial identifies a JD, it does not count them.
 */
export const jdEntries = pgTable(
  "jd_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Defaulted by a Postgres SEQUENCE (see the migration). Declared here so
    // Drizzle treats it as optional on insert — application code must never
    // compute it, because two concurrent saves would collide on a max()+1 read.
    serialNo: text("serial_no")
      .notNull()
      .unique()
      .default(sql`'JD-' || lpad(nextval('jd_entries_serial_seq')::text, 4, '0')`),
    positionId: uuid("position_id")
      .notNull()
      .references(() => jdPositions.id, { onDelete: "restrict" }),
    /** Denormalised from the position so the Bank filters without a join. */
    functionKey: text("function_key").notNull(),
    task: text("task").notNull(),
    notesHtml: text("notes_html"),
    /** Structured, never a label string. Shape in lib/jd/recurrence.ts. */
    recurrence: jsonb("recurrence").notNull().default({ kind: "daily" }),
    estimatedMinutes: integer("estimated_minutes").notNull().default(15),
    videoUrl: text("video_url"),
    guidelinesUrl: text("guidelines_url"),
    templateUrl: text("template_url"),
    pushDcc: boolean("push_dcc").notNull().default(false),
    pushWms: boolean("push_wms").notNull().default(false),
    pushEvent: boolean("push_event").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jd_entries_position_idx").on(t.positionId, t.isActive),
    index("jd_entries_function_idx").on(t.functionKey, t.isActive),
  ],
);
export type JdEntry = typeof jdEntries.$inferSelect;
export type NewJdEntry = typeof jdEntries.$inferInsert;

/**
 * WHO OCCUPIES WHICH SEAT.
 *
 * A JOIN TABLE, and NOT a column on `employees` — that distinction is the whole
 * reason this exists. Adding `jd_position_id` to `employees` makes every bare
 * `.select()` on that table (there are hundreds, including the sign-in lookup)
 * request a column that does not exist until 0222 has been applied by hand in
 * Supabase. The symptom is not a broken JD page: it is nobody being able to log
 * in, presenting as "Email or password didn't match" — the exact outage this
 * project had on 9 September.
 *
 * A separate table is only read by code that already requires 0222, so the
 * window between deploy and migration costs nothing. It also leaves room for
 * seat history later, which a scalar column never had.
 */
export const jdPositionHolders = pgTable(
  "jd_position_holders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => jdPositions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // jd_position_holders_active_uq — partial unique on (employee_id) WHERE
    // is_active, declared in the migration: one live seat per person.
    index("jd_position_holders_position_idx").on(t.positionId, t.isActive),
  ],
);
export type JdPositionHolder = typeof jdPositionHolders.$inferSelect;
export type NewJdPositionHolder = typeof jdPositionHolders.$inferInsert;

/** SOP files. Same shape as module_submission_attachments (0216). */
export const jdAttachments = pgTable(
  "jd_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jdId: uuid("jd_id")
      .notNull()
      .references(() => jdEntries.id, { onDelete: "cascade" }),
    /** video | guidelines | template — the three render as separate groups. */
    kind: text("kind").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jd_attachments_jd_idx").on(t.jdId, t.createdAt)],
);
export type JdAttachment = typeof jdAttachments.$inferSelect;
export type NewJdAttachment = typeof jdAttachments.$inferInsert;

/** Which people hold which JD. `source` decides whether a holder change revokes it. */
export const jdAssignments = pgTable(
  "jd_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jdId: uuid("jd_id")
      .notNull()
      .references(() => jdEntries.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("position"),
    assignedById: uuid("assigned_by_id").references(() => employees.id, { onDelete: "set null" }),
    effectiveFrom: date("effective_from").notNull().default(sql`CURRENT_DATE`),
    effectiveTo: date("effective_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // jd_assignments_active_uq is a PARTIAL unique index on (jd_id, employee_id)
    // WHERE is_active — managed in the migration so a revoked assignment can sit
    // alongside a fresh one without deleting the history.
    index("jd_assignments_employee_idx").on(t.employeeId, t.isActive),
  ],
);
export type JdAssignment = typeof jdAssignments.$inferSelect;
export type NewJdAssignment = typeof jdAssignments.$inferInsert;

/** Leave handover. Outranks every other routing rule — it is a dated human decision. */
export const jdDelegations = pgTable(
  "jd_delegations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jdId: uuid("jd_id")
      .notNull()
      .references(() => jdEntries.id, { onDelete: "cascade" }),
    fromEmployeeId: uuid("from_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    toEmployeeId: uuid("to_employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** Nullable — a same-day absence has no approved leave row to point at. */
    leaveRequestId: uuid("leave_request_id").references(() => leaveRequests.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("active"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jd_delegations_to_idx").on(t.toEmployeeId, t.status, t.startDate),
    index("jd_delegations_from_idx").on(t.fromEmployeeId, t.status, t.startDate),
  ],
);
export type JdDelegation = typeof jdDelegations.$inferSelect;
export type NewJdDelegation = typeof jdDelegations.$inferInsert;

/**
 * Idempotency for the auto-push. Without it the nightly job re-writes every
 * task it has already written. The push inserts ON CONFLICT DO NOTHING and
 * reads a zero row count as "already pushed", which makes it safe to re-run and
 * safe to run twice at once — both of which will happen.
 */
export const jdPushLog = pgTable(
  "jd_push_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jdId: uuid("jd_id")
      .notNull()
      .references(() => jdEntries.id, { onDelete: "cascade" }),
    target: text("target").notNull(), // dcc | wms | event
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** '2026-09-11' daily, '2026-09' monthly, or the event id. */
    periodKey: text("period_key").notNull(),
    externalId: uuid("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // jd_push_log_uq — unique on (jd_id, target, employee_id, period_key),
    // declared in the migration.
    index("jd_push_log_jd_idx").on(t.jdId, t.target),
  ],
);
export type JdPushLog = typeof jdPushLog.$inferSelect;
export type NewJdPushLog = typeof jdPushLog.$inferInsert;
