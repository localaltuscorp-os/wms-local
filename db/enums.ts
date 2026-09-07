// Tier-3 (2026-05-20) — additive expansion. Manan asked for need_info +
// follow_up_1/2/3 (granular follow-up tracking) and split the four terminal
// "approved/not_approved/cancelled/transferred" values into a *separate*
// admin-only `approval_status` column. The legacy four values stay in this
// enum so 240 imported tasks keep rendering; new code should write the new
// statuses + approval_status independently.
export const TASK_STATUSES = [
  "dont_know",      // Manan 2026-05 — "I haven't assessed this yet" (light grey)
  "not_started",
  "initiated",
  "follow_up",
  "need_help",
  "on_hold",
  "need_info",      // NEW
  "follow_up_1",    // NEW
  "follow_up_2",    // NEW
  "follow_up_3",    // NEW
  "done",
  // Legacy terminal values — kept for backward compat with imported data.
  // New code should use the `approval_status` column instead.
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses available to non-admin users in the in-app status picker.
 *  The legacy four (approved / not_approved / cancelled / transferred) are
 *  excluded — those are admin-only via the separate approval_status column.
 *  2026-06-08 (sir's changes #2): the granular follow_up_1/2/3 collapsed back
 *  into the single `follow_up`; cancelled is gone (use Archive instead). */
export const USER_TASK_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "on_hold",
  "need_info",
  "done",
] as const satisfies readonly TaskStatus[];

/**
 * The DOER's operational lifecycle — the ONLY values offered in the primary
 * Status control (the row's inline status chip and the bulk "Status" dropdown).
 * Labels come from `status_settings` / STATUS_LABELS_FALLBACK:
 *
 *   dont_know → "Not Read" · not_started · initiated · follow_up · need_info · done
 *
 * `on_hold` is deliberately ABSENT even though it is a live status. Putting a
 * task on hold is a MANAGER's ruling, not a worker's progress report, so it
 * moved to the "Mark Status" dropdown as "Mark Hold On" (see
 * components/tasks/bulk-action-bar.tsx). The approval verdicts — approved /
 * not_approved / cancelled — were never doer statuses at all: they live in the
 * separate `approval_status` column.
 *
 * Deliberately NOT a redefinition of USER_TASK_STATUSES: that list still drives
 * the kanban columns, filter dropdowns and importers, where `on_hold` must stay
 * selectable. This is the status PICKER's list, nothing more.
 */
export const DOER_TASK_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "need_info",
  "done",
] as const satisfies readonly TaskStatus[];

export const PENDING_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "on_hold",
  "need_info",
] as const satisfies readonly TaskStatus[];

/** Statuses retired on 2026-06-08 (sir's changes #2/#4/#6) and 2026-06-10
 *  (need_help). The physical pgEnum keeps them so already-imported rows still
 *  render, but nothing user-facing should offer them: filter them out of every
 *  picker, filter dropdown and kanban column. The follow_up_* rows migrate to
 *  `follow_up`; cancelled/transferred rows migrate to Archived; need_help rows
 *  migrate to `need_info` (see db/migrations/0051_retire_need_help.sql). */
export const DEPRECATED_TASK_STATUSES = [
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "cancelled",
  "transferred",
  "need_help",
] as const satisfies readonly TaskStatus[];

const DEPRECATED_STATUS_SET: ReadonlySet<TaskStatus> = new Set(
  DEPRECATED_TASK_STATUSES,
);

/** True for statuses retired on 2026-06-08 — use to drop them from any
 *  dynamically-built status list (filter options, kanban columns, …). */
export function isDeprecatedStatus(status: TaskStatus): boolean {
  return DEPRECATED_STATUS_SET.has(status);
}

/** What admins see in the in-app status pickers: every live status (incl.
 *  the approval verdicts, so they can force a state) minus retired values. */
export const ADMIN_TASK_STATUSES: readonly TaskStatus[] = TASK_STATUSES.filter(
  (s) => !DEPRECATED_STATUS_SET.has(s),
);

// New admin-only column. Defaults to NULL (no approval verdict yet); the
// terminal verdict moves the task out of "pending" without touching status.
export const APPROVAL_STATUSES = [
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// 28 canonical subject categories the New Task form constrains to. Free
// text remains valid in the DB (the column is `text`) — older tasks may
// hold values outside this list; the dropdown adds "Other…" as an escape
// hatch when needed.
// Tier-4 (2026-05-20) — recurrence options for the GCal-style scheduling
// block on each task. Stored as text on tasks.recurrence; null/'none'
// mean a one-off. Not wired to any real calendar (no Google API yet).
export const TASK_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none:    "Does not repeat",
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

export const TASK_SUBJECTS = [
  "Marketing",
  "Exhibition",
  "CP Sign Up",
  "Mandate",
  "Invoicing",
  "MIS",
  "Admin",
  "Recruitment",
  "Accounts",
  "PR",
  "Customer Visit",
  "Documentation",
  "Liasoning",
  "Sales",
  "Systems",
  "KPI",
  "Assessment",
  "Basic Checklist",
  "CF Checklist",
  "Follow Up Basic Docs",
  "Call Client to complete File",
  "Call CP to complete File",
  "Reimbursement",
  "Collection",
  "Lead Management",
  "Agreement Signing",
  "Bank Follow Up",
] as const;
export type TaskSubject = (typeof TASK_SUBJECTS)[number];

export const EMPLOYEE_ROLES = ["doer", "initiator", "both"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

/**
 * Account archetype on `employees`. "candidate" = a job applicant's limited
 * guest login that can ONLY fill their own interview form (never a real
 * employee). Candidates are always `is_active=false` (excluded from every
 * roster for free) and login-gated on `candidate_active` instead.
 */
/**
 * Account archetypes.
 *  · employee  — a real member of staff; the ONLY type that appears in rosters,
 *                pickers and the admin Employees list (see isStaffAccount).
 *  · candidate — a job applicant's limited guest login (forked to their form).
 *  · system    — a working login that is deliberately NOT part of the roster:
 *                test/demo accounts. It authenticates and behaves exactly like
 *                an employee (isLoginLive falls through to is_active, and
 *                requireUser only forks candidates), but every staff listing
 *                filters it out, so it never shows up in a demo or a headcount.
 */
export const ACCOUNT_TYPES = ["employee", "candidate", "system"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * OFFBOARDING (migration 0212).
 *
 * Employment status is a SECOND axis, orthogonal to `is_active`:
 *  · is_active         — can they sign in right now
 *  · employment_status — do they still work here
 *
 * Both are needed. A suspended employee is inactive but current; a former
 * employee must remain former even if their login is re-enabled by mistake.
 *
 *  · active     — current staff, whatever their login state.
 *  · former     — offboarded. Identity destroyed (Firebase + avatar), record
 *                 retained in full. This is the terminal state for the person;
 *                 nothing about them is deleted on reaching it.
 *  · anonymised — retention has expired and the PII has been replaced with
 *                 placeholders. The row and every FK survive so history,
 *                 headcount and audit chains do not develop holes.
 */
export const EMPLOYMENT_STATUSES = ["active", "former", "anonymised"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/**
 * Why someone left. A CLOSED list, because free text cannot be filtered,
 * grouped or reported on — and attrition analysis is the reason to capture a
 * reason at all.
 *
 * `other` is the deliberate escape hatch. Without it, an admin facing a case
 * the list does not cover picks the nearest wrong bucket and quietly poisons
 * every report built on this column. With it, the odd case is recorded
 * honestly in `exit_reason_other` and the filter still works, because `other`
 * is itself a filterable value.
 */
export const EXIT_REASONS = [
  "resigned",
  "terminated_for_cause",
  "redundancy",
  "contract_ended",
  "abandonment",
  "retirement",
  "deceased",
  "other",
] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  resigned: "Resigned",
  terminated_for_cause: "Terminated for cause",
  redundancy: "Redundancy",
  contract_ended: "Contract ended",
  abandonment: "Abandonment",
  retirement: "Retirement",
  deceased: "Deceased",
  other: "Other",
};

/**
 * Rehire eligibility — the single most-read field on an exit record when
 * someone reapplies two years later. `with_review` is the default because
 * "nobody decided" and "yes" are different answers, and defaulting to yes
 * would silently assert a judgement no one made.
 */
export const REHIRE_ELIGIBILITIES = ["yes", "no", "with_review"] as const;
export type RehireEligibility = (typeof REHIRE_ELIGIBILITIES)[number];

export const REHIRE_LABELS: Record<RehireEligibility, string> = {
  yes: "Eligible for rehire",
  no: "Not eligible",
  with_review: "Eligible with review",
};

// Worker type — the employment archetype that drives BOTH attendance grading
// and pay. Source of truth for `employees.worker_type`. `full_time` is the
// back-compat default (every existing employee = full-time, no behaviour change).
// Employee Type (0204). `second_half` and `hybrid` are renames of the former
// `afternoon_shift` / `part_time` and carry their pay and grading rules
// unchanged; `first_half` is the new morning mirror of `second_half`.
// `project_remote` has no employees but is NOT offered in the picker and NOT
// removed — the Work Sessions feature still grades by it.
export const WORKER_TYPES = [
  "full_time",
  "first_half",
  "second_half",
  "hybrid",
  "project_remote",
] as const;
export type WorkerType = (typeof WORKER_TYPES)[number];
// Pay basis — how salary is computed for a worker type.
export const PAY_BASES = ["monthly_ctc", "hourly", "fixed_fee"] as const;
export type PayBasis = (typeof PAY_BASES)[number];
// Grading mode — how attendance is measured for a worker type.
export const GRADING_MODES = ["day", "hours", "session"] as const;
export type GradingMode = (typeof GRADING_MODES)[number];

// Project-remote work sessions (0178). Source = where the session was captured:
//  'meet' → Google Meet join/leave (Workspace Events API); 'capture' → our own
//  getDisplayMedia screen-share page. Status tracks the ingest lifecycle.
export const WORK_SESSION_SOURCES = ["meet", "capture"] as const;
export type WorkSessionSource = (typeof WORK_SESSION_SOURCES)[number];
export const WORK_SESSION_STATUSES = ["open", "closed", "reconciled"] as const;
export type WorkSessionStatus = (typeof WORK_SESSION_STATUSES)[number];

// Enterprise Communications (ECOS, 0179) — broadcast domain.
export const BROADCAST_PRIORITIES = ["normal", "important", "high", "critical", "emergency"] as const;
export type BroadcastPriority = (typeof BROADCAST_PRIORITIES)[number];
export const BROADCAST_CATEGORIES = [
  "announcement", "ceo", "policy", "compliance", "emergency",
  "department", "event", "holiday", "recognition", "it", "payroll", "other",
] as const;
export type BroadcastCategory = (typeof BROADCAST_CATEGORIES)[number];
export const BROADCAST_STATUSES = ["draft", "scheduled", "published", "paused", "archived"] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];
// none → informational; read → auto read-receipt only; acknowledge → explicit "I acknowledge".
export const BROADCAST_ACK_MODES = ["none", "read", "acknowledge"] as const;
export type BroadcastAckMode = (typeof BROADCAST_ACK_MODES)[number];
export const BROADCAST_AUTHOR_IDENTITIES = ["hr", "ceo", "founder"] as const;
export type BroadcastAuthorIdentity = (typeof BROADCAST_AUTHOR_IDENTITIES)[number];
export const BROADCAST_RECIPIENT_STATUSES = ["pending", "read", "acknowledged"] as const;
export type BroadcastRecipientStatus = (typeof BROADCAST_RECIPIENT_STATUSES)[number];
export const BROADCAST_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
export type BroadcastRecurrence = (typeof BROADCAST_RECURRENCES)[number];

export const TASK_PRIORITIES = [
  "imp_urgent",
  "imp_not_urgent",
  "not_imp_urgent",
  "not_imp_not_urgent",
] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Manan 2026-05-30 — priorities renamed to a simple 1-4 scale. The
// underlying Eisenhower enum values are unchanged (no data migration); only
// the user-facing labels change, system-wide via this single map.
//   Critical  = Important & Urgent
//   Important = Important, Not Urgent
//   Urgent    = Not Important, Urgent
//   Normal    = Not Important, Not Urgent
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  imp_urgent:         "Critical",
  imp_not_urgent:     "Important",
  not_imp_urgent:     "Urgent",
  not_imp_not_urgent: "Normal",
};

export const DEPARTMENTS = [
  "Founder Office",
  "Handholding",
  "Apps",
  "Sales",
  "Marketing",
  "Social Media",
  "Accounts",
  "Admin",
  "HR",
  "Consulting",
  "CRM",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const AGE_BUCKETS = [
  { id: "0-3", label: "0-3 days", min: 0, max: 3 },
  { id: "4-7", label: "4-7 days", min: 4, max: 7 },
  { id: "8-14", label: "8-14 days", min: 8, max: 14 },
  { id: "15-20", label: "15-20 days", min: 15, max: 20 },
  { id: "21-30", label: "21-30 days", min: 21, max: 30 },
  { id: "31-45", label: "31-45 days", min: 31, max: 45 },
  { id: "46-60", label: "46-60 days", min: 46, max: 60 },
  { id: "60+", label: "60+ days", min: 61, max: Infinity },
] as const;

export type AgeBucketId = (typeof AGE_BUCKETS)[number]["id"];

// ── Attendance / Incentive / Outstanding (migration 0053) ──────────────────
// Ported from the Altus Ecosystem static forms (2026-06-10). The DB columns
// are `text` (not pgEnums) so these unions are the canonical source of truth.

export const ATTENDANCE_KINDS = ["in", "out"] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

// Attendance codes. Phase A: P / H/D / A / W/O / incomplete. Phase B (0059)
// adds holiday (H / HP / H-H/D), leave (PL paid, LWP unpaid) and comp-off (CO).
export const ATTENDANCE_CODES = ["P","H/D","A","W/O","incomplete","H","HP","H-H/D","PL","LWP","CO"] as const;
export type AttendanceCode = (typeof ATTENDANCE_CODES)[number];
export const ATTENDANCE_CODE_VALUES: Record<AttendanceCode, number> = {
  "P":1, "H/D":0.5, "A":0, "W/O":1, "incomplete":0,
  "H":1, "HP":2, "H-H/D":1.5, "PL":1, "LWP":0, "CO":1,
};
export const ATTENDANCE_CODE_LABELS: Record<AttendanceCode, string> = {
  "P":"Present", "H/D":"Half Day", "A":"Absent", "W/O":"Weekly Off", "incomplete":"No Check-out",
  "H":"Holiday", "HP":"Holiday Present", "H-H/D":"Holiday Half-Day",
  "PL":"Paid Leave", "LWP":"Unpaid Leave", "CO":"Comp Off",
};

// Phase B (0059) — leave_requests / comp_off_credits enums. The DB columns are
// `text` (not pgEnums) so these unions are the canonical source of truth.
export const LEAVE_KINDS = ["paid","unpaid"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  paid:   "Paid Leave",
  unpaid: "Unpaid Leave",
};

export const LEAVE_STATUS = ["pending","approved","rejected","cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUS)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending:   "Pending",
  approved:  "Approved",
  rejected:  "Rejected",
  cancelled: "Cancelled",
};

export const COMP_OFF_STATUS = ["open","redeemed"] as const;
export type CompOffStatus = (typeof COMP_OFF_STATUS)[number];
export const PUNCH_SOURCES = ["self","admin"] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];
export const PUNCH_REASONS = ["client_visit","wfh","forgot","correction"] as const;

/**
 * Remote work modes that REQUIRE an approved request (0205).
 *
 * A strict subset of `attendance_logs.work_mode`, which also carries 'office'
 * and 'other'. Those two are not requestable: 'office' is the default and needs
 * no permission, and 'other' predates this and would let any punch opt out of
 * the gate simply by naming itself something else.
 */
export const REMOTE_WORK_MODES = ["wfh", "client_site", "field"] as const;
export type RemoteWorkMode = (typeof REMOTE_WORK_MODES)[number];

/**
 * Human labels for the picker and the review queue.
 *
 * "Client SITE", not "Client Side" — the old label read as a side of something
 * rather than a place you travel to. The stored value `client_site` was always
 * right; only the display string was wrong, so this is a label fix and not a
 * data change.
 */
export const REMOTE_WORK_MODE_LABELS: Record<RemoteWorkMode, string> = {
  wfh: "WFH",
  client_site: "Client Site",
  field: "On Field",
};

/** WFH Requested → Pending → Approved / Rejected. */
export const REMOTE_WORK_STATUSES = ["pending", "approved", "rejected"] as const;
export type RemoteWorkStatus = (typeof REMOTE_WORK_STATUSES)[number];

/**
 * WHY a day away from the office was agreed (0209).
 *
 * A free-text reason is what someone types; a bucket is what the org can COUNT.
 * "Manan Sir approved" and "Client requested" are different facts about who
 * initiated the day, and that difference matters when reviewing a month of
 * remote work — but it is invisible once both are prose. The free-text reason
 * survives alongside this and carries the detail; the bucket carries the class.
 */
export const REMOTE_REASON_BUCKETS = [
  "manan_approved",
  "client_requested",
  "manager_approved",
] as const;
export type RemoteReasonBucket = (typeof REMOTE_REASON_BUCKETS)[number];
export const REMOTE_REASON_BUCKET_LABELS: Record<RemoteReasonBucket, string> = {
  manan_approved: "Manan Sir Approved",
  client_requested: "Client Requested",
  manager_approved: "Manager Approved",
};

/**
 * Repeat patterns for a remote-work request (0209), mirroring the set a Google
 * Calendar event offers.
 *
 * These describe how the form EXPANDS, not what gets stored: every pattern
 * produces one ordinary row per date, all sharing a series id. One row per day
 * is what the approval model and the `attendance_logs` trigger already
 * understand — storing the rule instead would make every reader re-derive which
 * days it covers, and they would not all agree.
 */
export const RECURRENCE_MODES = ["none", "daily", "weekdays", "weekly", "custom"] as const;
export type RecurrenceMode = (typeof RECURRENCE_MODES)[number];
export const RECURRENCE_MODE_LABELS: Record<RecurrenceMode, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Weekly on this day",
  custom: "Custom…",
};

/**
 * Reachability during leave (0208) — the three questions HR asks before
 * approving one.
 *
 * The office phone is a THREE-way answer, not a checkbox: someone who has no
 * office line is not the same as someone who has one and will not be answering
 * it, and a boolean forces those two to share a value.
 */
export const OFFICE_PHONE_AVAILABILITY = ["yes", "no", "na"] as const;
export type OfficePhoneAvailability = (typeof OFFICE_PHONE_AVAILABILITY)[number];
export const OFFICE_PHONE_AVAILABILITY_LABELS: Record<OfficePhoneAvailability, string> = {
  yes: "Yes",
  no: "No",
  na: "Not applicable",
};

export type PunchReason = (typeof PUNCH_REASONS)[number];

export const INCENTIVE_TYPES = [
  "bss_conversion",
  "sales_pitch",
  "client_happiness",
  "group_intro",
] as const;
export type IncentiveType = (typeof INCENTIVE_TYPES)[number];

export const INCENTIVE_TYPE_LABELS: Record<IncentiveType, string> = {
  bss_conversion:   "BSS Conversion",
  sales_pitch:      "Sales Pitch",
  client_happiness: "Client Happiness",
  group_intro:      "Group Introduction",
};

export const INCENTIVE_STATUSES = ["pending", "approved", "rejected"] as const;
export type IncentiveStatus = (typeof INCENTIVE_STATUSES)[number];

export const INCENTIVE_STATUS_LABELS: Record<IncentiveStatus, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const OUTSTANDING_STATUSES = [
  "open",
  "partial",
  "paid",
  "written_off",
] as const;
export type OutstandingStatus = (typeof OUTSTANDING_STATUSES)[number];

export const OUTSTANDING_STATUS_LABELS: Record<OutstandingStatus, string> = {
  open:        "Open",
  partial:     "Partially Paid",
  paid:        "Paid",
  written_off: "Written Off",
};

// M5.1 — palette tokens used by status_settings.color_token and accepted by the
// admin ColorPicker. The 6 names map to canonical pill backgrounds; admins can
// also store a raw hex string (validated by lib/validators/color-token.ts).
export const STATUS_COLOR_TOKENS = [
  "blue",
  "green",
  "amber",
  "red",
  "rose",
  "purple",
  // Extended palette for Manan's status colour scheme.
  "yellow",
  "orange",
  "slate",
  "brown",
  "stone",  // light grey (Dont Know)
] as const;
export type StatusColorToken = (typeof STATUS_COLOR_TOKENS)[number];

// ── Outstanding tracker (native rebuild) ───────────────────────────────────
export const OUTSTANDING_CYCLES = [
  "subscription",
  "monthly_bill",
  "full_payment",
  "partial_payment",
  "slabs",
] as const;
export type OutstandingCycle = (typeof OUTSTANDING_CYCLES)[number];
export const OUTSTANDING_CYCLE_LABELS: Record<OutstandingCycle, string> = {
  subscription:    "Subscription",
  monthly_bill:    "Monthly Bill",
  full_payment:    "Full Payment",
  partial_payment: "Partial Payment",
  slabs:           "Slabs",
};

// Subscription billing cadence (iter-2). Stored as text on
// outstanding_contracts.frequency; only meaningful for the subscription cycle.
export const SUBSCRIPTION_FREQUENCIES = [
  "10_days",
  "15_days",
  "30_days",
  "weekly",
] as const;
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];
export const SUBSCRIPTION_FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  "10_days": "10 Days",
  "15_days": "15 Days",
  "30_days": "30 Days",
  weekly:    "Weekly",
};

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

// iter-2: the New Contract form offers only 0% / 18% GST (the source sheet
// never used the other slabs). The wider GST_RATES list stays for any legacy
// data / other callers.
export const GST_FORM_RATES = [0, 18] as const;

export const OUTSTANDING_CONTRACT_STATUS = [
  "active",
  "closed",
  "written_off",
] as const;
export type OutstandingContractStatus = (typeof OUTSTANDING_CONTRACT_STATUS)[number];

// Derived per-installment state (never stored).
export const INSTALLMENT_STATES = ["not_due", "due_soon", "overdue", "paid"] as const;
export type InstallmentState = (typeof INSTALLMENT_STATES)[number];

// Overdue-by-days buckets — boundaries match the source dashboard.
export const OUTSTANDING_OVERDUE_BUCKETS = [
  { id: "0-3",   label: "0–3 Days Overdue",   min: 0,  max: 3 },
  { id: "4-7",   label: "4–7 Days Overdue",   min: 4,  max: 7 },
  { id: "8-15",  label: "8–15 Days Overdue",  min: 8,  max: 15 },
  { id: "16-30", label: "16–30 Days Overdue", min: 16, max: 30 },
  { id: "31-45", label: "31–45 Days Overdue", min: 31, max: 45 },
  { id: "46-60", label: "46–60 Days Overdue", min: 46, max: 60 },
  { id: "60+",   label: "60+ Days Overdue",   min: 61, max: Infinity },
] as const;
export type OverdueBucketId = (typeof OUTSTANDING_OVERDUE_BUCKETS)[number]["id"];

// Seed roster values (admin-editable after seeding). Updated for iter-2 to
// match the source sheet's master lists. BSU is intentionally dropped from the
// fresh-seed product list (it stays in the DB for any already-imported rows).
export const SEED_RESPONSIBLES = [
  "Anand Singh",
  "Dhanashree Solkar",
  "Jeevan Bharambe",
  "Kiran Bhosale",
  "Manan Vasa",
  "Mishtie Kanani",
  "Rohan Choudhary",
  "Ruchita Ambre",
  "Rutvisha Mehta",
  "Sanket Thorat",
  "Satish Sonawane",
  "Siddesh Walve",
] as const;
export const SEED_ENTITIES = [
  "Altus Corp",
  "Unleashed",
  "IGV",
  "Khushboo",
  "MJV HUF",
  "JSV HUF",
  "Dharav Enterprises",
  "Colour Graphics",
  "Smita Raut",
  "Sunil Raut",
] as const;
export const SEED_PRODUCTS = [
  "BSS",
  "Billing",
  "Commission",
  "Consulting",
  "PS",
  "Rent",
  "Retainer",
] as const;
export const SEED_PAYMENT_MODES = [
  "Kotak - Altus",
  "Pay U",
  "Jodo",
  "IGV",
  "Kotak - Unleashed",
  "Kotak - Khushboo",
  "Kotak - MJV HUF",
  "Kotak - JSV HUF",
  "Gpay - JSV HUF",
  "Gpay - MJV",
  "Gpay - CMV",
  "PDC",
  "Barter",
] as const;

// ── Monthly Events Master (migration 0130) ─────────────────────────────────
// All DB columns are `text` (house norm — not pgEnums), so these unions are the
// canonical source of truth for the Monthly Events Master module.

/** Event / batch-schedule confirmation state. Tentative = hatched + dashed +
 *  "TENT" chip; Confirmed = solid fill (see design §3/§5). */
export const EVENT_STATUSES = ["tentative", "confirmed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
};

/** Where a calendar_events row came from. Non-`manual` rows are reconciled from
 *  their source (holiday / batch schedule / obligation) and are usually locked. */
export const EVENT_SOURCES = ["manual", "holiday", "batch", "obligation"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** employees.religion — drives the personalised holiday list (design §7). */
export const RELIGIONS = ["hindu", "christian", "muslim", "other", "unspecified"] as const;
export type ReligionCode = (typeof RELIGIONS)[number];
export const RELIGION_LABELS: Record<ReligionCode, string> = {
  hindu: "Hindu",
  christian: "Christian",
  muslim: "Muslim",
  other: "Other",
  unspecified: "Unspecified",
};

/** holidays.applies_to — audience tag. `all` = everyone; `hindu_only` is dropped
 *  for non-Hindus; christian/muslim are religion add-ons; custom = manual set. */
export const HOLIDAY_APPLIES_TO = ["all", "hindu_only", "christian", "muslim", "custom"] as const;
export type HolidayAppliesTo = (typeof HOLIDAY_APPLIES_TO)[number];
export const HOLIDAY_APPLIES_TO_LABELS: Record<HolidayAppliesTo, string> = {
  all: "Everyone",
  hindu_only: "Hindu only",
  christian: "Christian add-on",
  muslim: "Muslim add-on",
  custom: "Custom",
};

// ── Goals Cascade (migration 0131) ──────────────────────────────────────────
// The Y→Q→M cascade tree. DB columns are `text` (house norm), so these unions
// are the canonical source of truth for `goals.period` and `goals.source`.

/** A cascade goal's level. Week lives on the existing weekly_goals table. */
export const GOAL_PERIODS = ["year", "quarter", "month", "week", "day"] as const;
export type GoalPeriodCode = (typeof GOAL_PERIODS)[number];
export const GOAL_PERIOD_LABELS: Record<GoalPeriodCode, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};

/** How a goal came to exist: hand-added vs auto-generated from a parent by ÷. */
export const GOAL_SOURCES = ["manual", "cascade"] as const;
export type GoalSource = (typeof GOAL_SOURCES)[number];

// ── Goal type taxonomy (migration 0168) ─────────────────────────────────────
// The single `goal_type` taxonomy that replaces the fuzzy `goals.category` +
// `weekly_goals.kpi` fields. Lives on BOTH `goals` and `weekly_goals` as a
// nullable `text` column (house norm — not a pgEnum), so these unions are the
// canonical source of truth. Spec:
// docs/superpowers/specs/2026-07-27-goals-module-design.md §2.
//
// The type decides how a goal is scored (see lib/goals/scoring.ts):
//   • 'kpi'         — Incentive class. Feeds the appraisal KPI bucket → incentive %.
//                     Intra-KPI line weights sum to 100. Every KPI line is
//                     incentive-linked (adhoc incentives are paid on top, outside).
//   • 'branding'    — Non-KPI performance. Feeds the appraisal Monthly Goals bucket.
//   • 'strategic'   — Non-KPI performance. Feeds the appraisal Monthly Goals bucket.
//   • 'operational' — Non-KPI performance. Feeds the appraisal Monthly Goals bucket.
//   • 'essential'   — Org/admin must-do. Shown on the scorecard but NEVER scored
//                     (target-vs-actual date + days-delayed tracked only).
//
// Non-KPI = branding | strategic | operational; their weights across a person's
// month sum to 100 and roll up into the Monthly Goals dimension score.
//
// LEGACY MAPPING (backfilled by 0168; legacy columns are KEPT, not dropped):
//   old weekly_goals.kpi = true            → goal_type 'kpi'
//   old goals.category   = 'operational'   → goal_type 'operational'
//   everything else scored                 → default 'operational'
//                                            (rows may also be left NULL pre-fill).
// "Branding" was moved to the Area taxonomy (BASE_AREAS) — it is no longer a
// Goal Type. Existing goals typed 'branding' render a blank Type (handled via
// GOAL_TYPE_LABELS[…] ?? "") and no longer score in the Non-KPI stream.
export const GOAL_TYPES = ["kpi", "strategic", "operational", "essential"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  kpi: "KPI",
  strategic: "Strategic",
  operational: "Operational",
  essential: "Essential",
};

/** The Non-KPI performance types — scored as weighted goals (Σ weights = 100)
 *  that roll up into the appraisal Monthly Goals bucket. */
export const NON_KPI_GOAL_TYPES = [
  "strategic",
  "operational",
] as const satisfies readonly GoalType[];

// ── Agreements module (migration 0132) ──────────────────────────────────────
/** The four HR agreement templates. */
export const AGREEMENT_TYPES = [
  "appointment",
  "employment",
  "nda",
  "ctc",
  "probation_confirmation",
  "training_completion",
] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];
export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  appointment: "Appointment Letter",
  employment: "Employment Agreement",
  nda: "NDA / Confidentiality",
  ctc: "CTC / Salary Letter",
  probation_confirmation: "Confirmation of Appointment (Post-Probation)",
  training_completion: "Confirmation — End of Free Training",
};
/** Lifecycle: drafted by HR → sent to the employee → e-signed. */
export const AGREEMENT_STATUSES = ["draft", "sent", "signed"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
};

// ── HR Support / Ticketing (migration 0145) ─────────────────────────────────
// One table, two doors: /support (full ticket) and /queries "Ask HR" both write
// hr_tickets — /queries rows carry source="query". DB columns are `text` (house
// norm — not pgEnums), so these unions are the canonical source of truth.

/** Ticket lifecycle. Employees NEVER touch a status dropdown — transitions are
 *  driven by HR actions + auto rules (employee reply flips waiting_on_employee
 *  back to in_progress; resolved auto-closes after 72h or on employee confirm;
 *  a closed ticket may be reopened ≤7 days after close → status "reopened",
 *  which behaves like in_progress with reopened_count bumped). */
export const HR_TICKET_STATUSES = [
  "new",
  "in_progress",
  "waiting_on_employee",
  "resolved",
  "closed",
  "reopened",
] as const;
export type HrTicketStatus = (typeof HR_TICKET_STATUSES)[number];

/** HR-side labels. */
export const HR_TICKET_STATUS_LABELS: Record<HrTicketStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  waiting_on_employee: "Waiting on Employee",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

/** Employee-side labels differ by design ("With HR" / "Waiting on you"). */
export const HR_TICKET_STATUS_EMPLOYEE_LABELS: Record<HrTicketStatus, string> = {
  new: "With HR",
  in_progress: "With HR",
  waiting_on_employee: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "With HR",
};

/** Statuses that count as "open" for queues, badges + the SLA breach cron. */
export const HR_TICKET_OPEN_STATUSES = [
  "new",
  "in_progress",
  "waiting_on_employee",
  "reopened",
] as const satisfies readonly HrTicketStatus[];

export const HR_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type HrTicketPriority = (typeof HR_TICKET_PRIORITIES)[number];
export const HR_TICKET_PRIORITY_LABELS: Record<HrTicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** SLA policy per priority — STAMPED onto the ticket at create/priority-change
 *  time (first_response_due_at / resolution_due_at); ONE breach cron compares
 *  now() vs the stamps. Not an engine. Business days = IST Mon–Sat. */
export const HR_TICKET_SLA: Record<
  HrTicketPriority,
  { firstResponseHours: number; resolutionBusinessDays: number }
> = {
  urgent: { firstResponseHours: 2, resolutionBusinessDays: 1 },
  high: { firstResponseHours: 4, resolutionBusinessDays: 2 },
  normal: { firstResponseHours: 8, resolutionBusinessDays: 3 },
  low: { firstResponseHours: 24, resolutionBusinessDays: 5 },
};

/** Categories drive routing (hr_ticket_routes category→owner) AND visibility:
 *  `grievance` is CONFIDENTIAL (requester + current assignee + super-admins
 *  ONLY — see the single visibleTicketsFilter choke point) and is born at
 *  priority ≥ high. */
export const HR_TICKET_CATEGORIES = [
  "payroll",
  "leave_attendance",
  "reimbursement",
  "it_access",
  "facilities",
  "documents_letters",
  "policy_question",
  "grievance",
  "other",
] as const;
export type HrTicketCategory = (typeof HR_TICKET_CATEGORIES)[number];
export const HR_TICKET_CATEGORY_LABELS: Record<HrTicketCategory, string> = {
  payroll: "Payroll & Salary",
  leave_attendance: "Leave & Attendance",
  reimbursement: "Reimbursement",
  it_access: "IT & Access",
  facilities: "Facilities",
  documents_letters: "Documents & Letters",
  policy_question: "Policy Question",
  grievance: "Grievance (Confidential)",
  other: "Other",
};

/** Which door created the ticket: /support full form vs /queries "Ask HR". */
export const HR_TICKET_SOURCES = ["support", "query"] as const;
export type HrTicketSource = (typeof HR_TICKET_SOURCES)[number];

// ── Appraisal (migration 0146) ──────────────────────────────────────────────
// Consolidates Performance (/pms) + 360 Review + Signals into ONE /appraisal
// surface with a multi-dimension scoring engine. DB columns are `text` (house
// norm), so these unions are the canonical source of truth.

/** The 9 scoring dimensions. Weights are ADMIN-CONFIGURABLE via
 *  appraisal_config.dimension_weights (seeded to
 *  DEFAULT_APPRAISAL_DIMENSION_WEIGHTS below, which sums to 100). */
export const APPRAISAL_DIMENSIONS = [
  "kpi",              // admin fills + approves, then visible to the employee
  "skill",            // max 3 per person, technical/non-technical
  "attitude",         // same shape as skill, max 3
  "incentive",        // AUTO: min(100%, (earned/base)/target%) × weight
  "culture",          // 3 Constitution items / month, serial-wise, rated as ONE item
  "knowledge_sharing",// AUTO from Training (do-6 / give-4 rule)
  "problem_solving",  // manager-only Yes/No one-liner
  "growth_mindset",   // manager-only Yes/No one-liner
  "ability",          // "Ability to get things done" — manager-only Y/N one-liner
] as const;
export type AppraisalDimension = (typeof APPRAISAL_DIMENSIONS)[number];
export const APPRAISAL_DIMENSION_LABELS: Record<AppraisalDimension, string> = {
  kpi: "KPI",
  skill: "Skill",
  attitude: "Attitude & Mindset",
  incentive: "Incentive",
  culture: "Culture (Constitution)",
  knowledge_sharing: "Knowledge Sharing",
  problem_solving: "Problem Solving Ability",
  growth_mindset: "Growth Mindset",
  ability: "Ability to Get Things Done",
};

/** Dimensions dropped for NON-managers (the subjective manager-only
 *  one-liners). The score engine renormalises the remaining weights. */
export const APPRAISAL_MANAGER_ONLY_DIMENSIONS = [
  "problem_solving",
  "growth_mindset",
  "ability",
] as const satisfies readonly AppraisalDimension[];

/** Dimensions whose score is COMPUTED, never hand-scored (no self/mgr/mgmt). */
export const APPRAISAL_AUTO_DIMENSIONS = [
  "incentive",
  "knowledge_sharing",
] as const satisfies readonly AppraisalDimension[];

/** Default dimension weights — sums to 100. Reconciles sir's table (KPI 30 ·
 *  Skill 30 · Culture 10 · KS 5 · PS 5 · GM 5 · Ability 5 = 90, no Incentive/
 *  Attitude) with the verbal "Incentive 30" by scaling into a 100-sum whole.
 *  ADMIN-EDITABLE at runtime via appraisal_config — this is only the seed. */
export const DEFAULT_APPRAISAL_DIMENSION_WEIGHTS: Record<AppraisalDimension, number> = {
  kpi: 25,
  skill: 15,
  attitude: 10,
  incentive: 20,
  culture: 10,
  knowledge_sharing: 5,
  problem_solving: 5,
  growth_mindset: 5,
  ability: 5,
};

/** Appraisal cycle lifecycle (one row per period in appraisal_cycles). */
export const APPRAISAL_CYCLE_STATUSES = [
  "draft",       // admin building KPI/skill/attitude items — invisible to employees
  "open",        // published — self-scoring window
  "review",      // manager + management scoring window
  "finalized",   // final scores locked
  "archived",
] as const;
export type AppraisalCycleStatus = (typeof APPRAISAL_CYCLE_STATUSES)[number];
export const APPRAISAL_CYCLE_STATUS_LABELS: Record<AppraisalCycleStatus, string> = {
  draft: "Draft",
  open: "Self-Scoring Open",
  review: "In Review",
  finalized: "Finalized",
  archived: "Archived",
};

/** Per-item scoring progress (the self → manager → management → final flow). */
export const APPRAISAL_ITEM_STATUSES = [
  "draft",               // admin still filling (KPI rows before approval)
  "awaiting_self",       // published, employee's self score pending
  "awaiting_manager",    // self done, manager score + MANDATORY explanation pending
  "awaiting_management", // manager done, management score pending
  "finalized",           // final score computed + locked
] as const;
export type AppraisalItemStatus = (typeof APPRAISAL_ITEM_STATUSES)[number];
export const APPRAISAL_ITEM_STATUS_LABELS: Record<AppraisalItemStatus, string> = {
  draft: "Draft",
  awaiting_self: "Awaiting Self Score",
  awaiting_manager: "Awaiting Manager",
  awaiting_management: "Awaiting Management",
  finalized: "Final",
};

/** The 3 human scoring stages + the computed final. Order is LAW:
 *  Self (+justification, optional attachment) → Manager (+MANDATORY
 *  explanation) → Management (+explanation) → Final. */
export const APPRAISAL_SCORE_STAGES = ["self", "manager", "management", "final"] as const;
export type AppraisalScoreStage = (typeof APPRAISAL_SCORE_STAGES)[number];

// ── KPI Management (migration 0170) ──────────────────────────────────────────
// HR-staff-only per-person KPI assignments that REFERENCE the appraisal KPI
// dictionary (lib/performance/kpi-dictionary.ts) as the catalog. DB columns are
// `text` (house norm — not pgEnums), so these unions are the canonical source
// of truth for kpi_assignments.frequency / .status and
// kpi_assignment_history.change_type.

/** How often the KPI is measured. */
export const KPI_FREQUENCIES = ["weekly", "monthly", "quarterly", "annual"] as const;
export type KpiFrequency = (typeof KPI_FREQUENCIES)[number];
export const KPI_FREQUENCY_LABELS: Record<KpiFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

/** Assignment lifecycle. `inactive` = deactivated but retained for history. */
export const KPI_ASSIGNMENT_STATUSES = ["active", "inactive"] as const;
export type KpiAssignmentStatus = (typeof KPI_ASSIGNMENT_STATUSES)[number];
export const KPI_ASSIGNMENT_STATUS_LABELS: Record<KpiAssignmentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

/** The change events recorded on the APPEND-ONLY kpi_assignment_history log.
 *  A historical row is NEVER overwritten — every mutation appends one. */
export const KPI_CHANGE_TYPES = [
  "assigned",          // newly created
  "updated",           // a general field edit
  "activated",         // status → active
  "deactivated",       // status → inactive
  "removed",           // archived (soft-removed)
  "weightage_changed", // weightage edited
  "target_changed",    // target_value edited
] as const;
export type KpiChangeType = (typeof KPI_CHANGE_TYPES)[number];
export const KPI_CHANGE_TYPE_LABELS: Record<KpiChangeType, string> = {
  assigned: "Newly assigned",
  updated: "Modified",
  activated: "Activated",
  deactivated: "Deactivated",
  removed: "Removed",
  weightage_changed: "Weightage changed",
  target_changed: "Target changed",
};

/** Default rating-term bands ("recognition/rate" labels) — ADMIN-EDITABLE via
 *  appraisal_config.rating_terms. `min` = inclusive lower bound of final %. */
export const DEFAULT_APPRAISAL_RATING_TERMS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 90, label: "Outstanding" },
  { min: 75, label: "Exceeds Expectations" },
  { min: 60, label: "Meets Expectations" },
  { min: 40, label: "Needs Improvement" },
  { min: 0, label: "Unsatisfactory" },
];

/**
 * Two-stage approval (migration 0185). Layered OVER `tasks.status='approved'`
 * rather than added to TASK_STATUSES, so every existing consumer of approved-ness
 * keeps working untouched. See lib/tasks/approval-permissions.ts.
 */
export const APPROVAL_LEVELS = ["none", "manager", "admin"] as const;
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

// ── People Allocation categories (migration 0191) ──────────────────────────

/**
 * The four client categories, with the client count the business expects in
 * each. The expected counts are configuration, not a query result: the page
 * must always present the 17-client structure even before the client roster has
 * been filled in, so the header can show target vs actual side by side.
 */
export const ALLOCATION_CATEGORIES = [
  // `short` is what the Add form's Product Name dropdown offers; `full` is the
  // section heading. Two names for one thing, so neither surface compromises.
  { code: "ps", short: "PS", label: "PS Participants", full: "PS Participants", expected: 6 },
  { code: "bss", short: "BSS", label: "BSS Participants", full: "BSS Participants", expected: 8 },
  { code: "retainer", short: "Retainer", label: "Retainer Clients", full: "Retainer Clients", expected: 1 },
  {
    code: "ecosystem",
    short: "Eco System",
    label: "Ecosystem Clients (Apps)",
    full: "Ecosystem Clients (Apps)",
    expected: 2,
  },
] as const;

/**
 * Interns carry every section, same as employees — they are no longer limited
 * to App Development.
 *
 * The Intern form lists products in THIS order, which is not the employee one:
 * Retainer and Eco System first, because that is where interns mostly sit.
 */
export const INTERN_SECTIONS: readonly string[] = ["retainer", "ecosystem", "ps", "bss"];

/** ALLOCATION_CATEGORIES in the Intern form's order. */
export const INTERN_PRODUCTS = INTERN_SECTIONS.map(
  (code) => ALLOCATION_CATEGORIES.find((c) => c.code === code)!,
).filter(Boolean);

export type AllocationCategory = (typeof ALLOCATION_CATEGORIES)[number]["code"];
export const ALLOCATION_CATEGORY_CODES: readonly string[] = ALLOCATION_CATEGORIES.map((c) => c.code);

/** 17 — the total the section must always show. Derived, never hard-typed. */
export const ALLOCATION_EXPECTED_TOTAL = ALLOCATION_CATEGORIES.reduce((n, c) => n + c.expected, 0);

export function allocationCategoryLabel(code: string): string {
  return ALLOCATION_CATEGORIES.find((c) => c.code === code)?.full ?? code;
}

// ── Hand-holding weekly calls (migration 0195) ─────────────────────────────

export const HH_CALL_TYPES = [
  { code: "hh", label: "HH Call" },
  { code: "tool", label: "Tool Call" },
  { code: "checkin", label: "Check-in Call" },
] as const;

export const HH_DAYS = [
  // `label` is the short form the narrow weekly-call row needs; `full` is the
  // spelled-out day the Access dialog shows, where there is room for it.
  { code: "mon", label: "Mon", full: "Monday" },
  { code: "tue", label: "Tue", full: "Tuesday" },
  { code: "wed", label: "Wed", full: "Wednesday" },
  { code: "thu", label: "Thu", full: "Thursday" },
  { code: "fri", label: "Fri", full: "Friday" },
  { code: "sat", label: "Sat", full: "Saturday" },
  { code: "sun", label: "Sun", full: "Sunday" },
] as const;

/**
 * The two kinds the Add form's toggle offers, and the roster behind each.
 *
 * Two SEPARATE lists, not one roster with a flag: an intern is never offered
 * where an employee is expected, so picking the kind first is what makes the
 * name field unambiguous — there is no "either/or" left to resolve.
 *
 * Fixed lists for now, not a managed roster. When a real one lands this becomes
 * a query, with these values already in place to map from.
 */
export const HH_PERSON_KINDS = [
  { code: "employee", label: "Employee" },
  { code: "intern", label: "Intern" },
] as const;

export const HH_EMPLOYEE_NAMES: readonly string[] = [
  "Dattaram",
  "Jeevan",
  "Mishtie",
  "Mitul",
  "Namrata",
  "Parvez",
  "Prakash",
  "Raj",
  "Rohan",
  "Ruchita",
  "Rutvisha",
];

export const HH_INTERN_NAMES: readonly string[] = [
  "Danyal",
  "Hardik",
  "Krish",
  "Nandini",
  "Om",
  "Proveeka",
  "Shreya Randhe",
  "Shreya Shukla",
  "Suresh",
  "Vinal",
];

/** The roster a kind draws from — the form asks for this, never for a table. */
export const hhNamesFor = (kind: string): readonly string[] =>
  kind === "intern" ? HH_INTERN_NAMES : HH_EMPLOYEE_NAMES;

/**
 * The Module column on ALL PARTICIPANTS.
 *
 * A superset of ALLOCATION_CATEGORIES: the four products a person's sections
 * are built from, plus Tool and Follow Up, which are kinds of work a
 * participant can sit under but are not sections anyone is allocated to. Kept
 * as its own list precisely so adding one here cannot add a section card to the
 * Hand-holding tabs.
 */
export const HH_PARTICIPANT_MODULES = [
  { code: "ps", label: "PS" },
  { code: "bss", label: "BSS" },
  { code: "retainer", label: "Retainer" },
  { code: "ecosystem", label: "Eco System" },
  { code: "tool", label: "Tool" },
  { code: "follow_up", label: "Follow Up" },
] as const;

export const HH_PARTICIPANT_MODULE_CODES: readonly string[] = HH_PARTICIPANT_MODULES.map((m) => m.code);

/** "None" while nothing is chosen — a guess here would be a lie. */
export const hhParticipantModuleLabel = (code: string | null | undefined) =>
  code ? (HH_PARTICIPANT_MODULES.find((m) => m.code === code)?.label ?? code) : "None";

/**
 * The Call column on ALL PARTICIPANTS — which of the week's calls a row is,
 * numbered 1–4. Not HH_CALL_TYPES: that names a KIND of call (HH, Tool,
 * Check-in), and this column answers "which one", not "what sort".
 */
export const HH_PARTICIPANT_CALLS = ["1", "2", "3", "4"] as const;
export const HH_PARTICIPANT_CALL_CODES: readonly string[] = HH_PARTICIPANT_CALLS;

/** Every name the Participant Name picker offers: both rosters, one list. */
export const HH_ALL_PERSON_NAMES: readonly string[] = [...HH_EMPLOYEE_NAMES, ...HH_INTERN_NAMES];

/** Batch No. applies to these products only. */
export const HH_BATCHED_SECTIONS: readonly string[] = ["ps", "bss"];

export const hhCallTypeLabel = (c: string) => HH_CALL_TYPES.find((t) => t.code === c)?.label ?? c;
export const hhDayLabel = (d: string) => HH_DAYS.find((x) => x.code === d)?.label ?? d;
export const hhDayFull = (d: string) => HH_DAYS.find((x) => x.code === d)?.full ?? d;

// ── Hand-holding · Access / Permissions ────────────────────────────────────

/**
 * The three roles the Access dialog manages, and what each may do.
 *
 * The matrix is FIXED, not stored: only Admin may edit or delete a person, and
 * HR and Ruchita may add. Making it data would invite a save that quietly hands
 * HR the delete button, so the allowed actions are constants and the Action
 * dropdown is built from them.
 */
export const HH_ACCESS_ROLES = [
  {
    code: "admin",
    label: "Admin",
    actions: ["add", "edit", "delete"] as readonly string[],
    note: "Give option to delete an employee - Admin and Ruchita can edit or delete a person.",
    summary: [
      "Admin and Ruchita can edit or delete.",
      "Admin has access to add, edit and delete employees / interns.",
    ],
  },
  {
    code: "hr",
    label: "HR",
    actions: ["add"] as readonly string[],
    note: "HR has permission to add employees / interns. Edit and delete stay with Admin and Ruchita.",
    summary: [
      "Only Admin and Ruchita can edit or delete.",
      "HR has access to add and view employees / interns.",
    ],
  },
  {
    code: "ruchita",
    label: "Ruchita",
    actions: ["add", "edit", "delete"] as readonly string[],
    note: "Ruchita has permission to add, edit and delete employees / interns.",
    summary: [
      "Admin and Ruchita can edit or delete.",
      "Ruchita has access to add, edit and delete employees / interns.",
    ],
  },
] as const;

/** The Module dropdown, and the Section options each module carries. */
export const HH_ACCESS_MODULES = [
  {
    code: "handholding",
    label: "Hand-holding",
    sections: [
      { code: "employees", label: "Employees" },
      { code: "interns", label: "App Development (Interns)" },
    ],
  },
  { code: "ambassadors", label: "Ambassadors", sections: [{ code: "ambassadors", label: "Ambassadors" }] },
  { code: "development", label: "Development", sections: [{ code: "development", label: "Development" }] },
] as const;

/** Every action the summary table has a column for, in column order. */
/**
 * The actions the Access dialog can log. "view" is deliberately ABSENT: looking
 * at a page is not an action anyone performs on a person, and offering it made
 * the log fill with "Viewed" rows that recorded nothing.
 *
 * Rows already stored as "view" still render — see ACTION_PAST in the dialog —
 * they simply cannot be created any more.
 */
export const HH_ACCESS_ACTIONS = [
  { code: "add", label: "Add" },
  { code: "edit", label: "Edit" },
  { code: "delete", label: "Delete" },
] as const;

export const hhAccessRole = (code: string) => HH_ACCESS_ROLES.find((r) => r.code === code) ?? HH_ACCESS_ROLES[0];

/** The actions a role may be granted — the Action dropdown is exactly this. */
export const hhActionsFor = (role: string): readonly { code: string; label: string }[] => {
  const allowed = hhAccessRole(role).actions;
  return HH_ACCESS_ACTIONS.filter((a) => allowed.includes(a.code));
};

/**
 * The Section choice in the Access dialog — a FIXED pair, independent of the
 * Module. Picking a module never rewrites the section: the two are separate
 * questions, and having one reset the other loses the answer already given.
 */
export const HH_ACCESS_SECTIONS = [
  { code: "employees", label: "Employees" },
  { code: "interns", label: "App Development (Interns)" },
] as const;

export const hhAccessSectionLabel = (code: string) =>
  HH_ACCESS_SECTIONS.find((s) => s.code === code)?.label ?? code;

export const hhAccessModule = (code: string) => HH_ACCESS_MODULES.find((m) => m.code === code);
export const hhAccessSections = (moduleCode: string) => hhAccessModule(moduleCode)?.sections ?? [];

/**
 * A registered attendance device is a LAPTOP or a PHONE (migration 0206).
 *
 * Each employee designates one of each and may punch from EITHER — the rule is
 * "at most one approved device per kind", never "both are required", so a
 * machine away for repair never blocks attendance.
 */
export const DEVICE_KINDS = ["laptop", "phone"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  laptop: "Laptop",
  phone: "Phone",
};
