/**
 * Phase B — typed, versioned, domain-owned event contracts (ARCHITECTURE.md
 * Law 3). Each event is owned by exactly one business domain (aggregateType)
 * and carries a version so its shape can evolve through upcasters without
 * breaking consumers.
 *
 * The PAYLOAD of each event captures the facts a consumer needs WITHOUT having
 * to read the operational row (which may have changed since). Keep payloads
 * small, flat, and self-describing.
 */

/** The envelope every event carries through the log (Laws 9, 11). */
export interface EventEnvelope {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  orgId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  actorId?: string | null;
  occurredAt?: Date;
}

/** A persisted event read back from the log (includes the global order `seq`). */
export interface StoredEvent extends EventEnvelope {
  seq: number;
  eventId: string;
  eventVersion: number;
  occurredAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// TASK domain (the pilot engine). aggregateType = "task".
// ─────────────────────────────────────────────────────────────────────────

export const TASK_AGGREGATE = "task" as const;

export const TaskEventTypes = {
  Created: "TaskCreated",
  StatusChanged: "TaskStatusChanged",
  Reassigned: "TaskReassigned",
  Archived: "TaskArchived",
  Restored: "TaskRestored",
  FieldUpdated: "TaskFieldUpdated",
  ApprovalDecided: "TaskApprovalDecided",
  Deleted: "TaskDeleted",
} as const;

export type TaskEventType = (typeof TaskEventTypes)[keyof typeof TaskEventTypes];

// Payload shapes (v1). doerId is denormalised onto every payload so the
// task_metrics projection never has to look up the operational row.
export interface TaskCreatedV1 {
  doerId: string;
  initiatorId: string;
  createdById: string;
  title: string;
  subject: string | null;
  priority: string;
  status: string;
  dueAt: string | null; // ISO
}
export interface TaskStatusChangedV1 {
  doerId: string;
  fromStatus: string;
  toStatus: string;
}
export interface TaskReassignedV1 {
  fromDoerId: string;
  toDoerId: string;
  resetStatus: boolean;
}
export interface TaskArchivedV1 {
  doerId: string;
}
export interface TaskRestoredV1 {
  doerId: string;
}
export interface TaskFieldUpdatedV1 {
  doerId: string;
  field: string;
  value: unknown;
}
export interface TaskApprovalDecidedV1 {
  doerId: string;
  decision: "approved" | "not_approved";
}
export interface TaskDeletedV1 {
  doerId: string;
}

/** The current contract version for every task event type. Bump when a payload
 *  shape changes and add an upcaster (see upcasters.ts). */
export const CURRENT_VERSION: Record<TaskEventType, number> = {
  [TaskEventTypes.Created]: 1,
  [TaskEventTypes.StatusChanged]: 1,
  [TaskEventTypes.Reassigned]: 1,
  [TaskEventTypes.Archived]: 1,
  [TaskEventTypes.Restored]: 1,
  [TaskEventTypes.FieldUpdated]: 1,
  [TaskEventTypes.ApprovalDecided]: 1,
  [TaskEventTypes.Deleted]: 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// PMS / Employee Intelligence domains (mig 0095). Five employee-domain event
// families folded by the employee_twin + employee_score_daily projections.
// Payloads are flat + denormalised (every payload carries employeeId) so the
// projection never reads the operational row. All v1.
// ═══════════════════════════════════════════════════════════════════════════

export const ATTENDANCE_AGGREGATE = "attendance" as const;
export const AttendanceEventTypes = { Punched: "AttendancePunched" } as const;
export interface AttendancePunchedV1 {
  employeeId: string;
  kind: "in" | "out";
  /** true = late, false = on-time, null = ungradable (neither counter moves). */
  late: boolean | null;
  logDate?: string;
  verifyMethod?: string | null;
  source?: string;
}

export const GOAL_AGGREGATE = "goal" as const;
export const GoalEventTypes = {
  ProgressLogged: "GoalProgressLogged",
  Reviewed: "GoalReviewed",
  // ── Goals canvas Phase 7 (design §4.4 item 6) — activity-feed events emitted
  // by the cascade + collaboration actions. DELIBERATELY new names (never
  // "GoalProgressLogged") so the employee_twin projection's weekly-goal scoring
  // is untouched: its rule matches ProgressLogged only and default-ignores the
  // rest. aggregateId = goals.id (kind 'cascade') or weekly_goals.id ('weekly').
  CascadeCreated: "GoalCascadeCreated",
  CascadeEdited: "GoalCascadeEdited",
  CascadeProgressSet: "GoalCascadeProgressSet",
  CascadeAdopted: "GoalCascadeAdopted",
  CascadeArchived: "GoalCascadeArchived",
  CascadeRebalanced: "GoalCascadeRebalanced",
  Commented: "GoalCommented",
  Linked: "GoalLinked",
  Unlinked: "GoalUnlinked",
  DependencyAdded: "GoalDependencyAdded",
  DependencyResolved: "GoalDependencyResolved",
  AttachmentAdded: "GoalAttachmentAdded",
  AttachmentRemoved: "GoalAttachmentRemoved",
} as const;

/** Flat v1 payload for every Phase-7 goal ACTIVITY event (feed-rendering only —
 *  no projection consumes these; keep facts denormalised + display-ready). */
export interface GoalActivityV1 {
  employeeId: string;
  /** Which table the aggregateId points at. */
  goalKind: "cascade" | "weekly";
  /** Human fragment for the feed line (field name, link label, file name…). */
  detail?: string | null;
  from?: string | number | null;
  to?: string | number | null;
}
export interface GoalProgressLoggedV1 {
  employeeId: string;
  pctDone: number | null;
  weight: number | null;
  filledOnTime: boolean;
  goalId?: string;
  entryDate?: string;
  weekStart?: string;
}
export interface GoalReviewedV1 {
  employeeId: string;
  status: string;
  acceptPct: number | null;
}

export const DCC_AGGREGATE = "dcc" as const;
export const DccEventTypes = {
  EntryFilled: "DccEntryFilled",
  Reviewed: "DccReviewed",
} as const;
export interface DccEntryFilledV1 {
  employeeId: string;
  status: string; // "Done" | "Pending" | "Need Help" | ...
  itemId?: string;
  entryDate?: string;
  valueNumber?: number | null;
  targetNumber?: number | null;
}
export interface DccReviewedV1 {
  employeeId: string;
  satisfied: boolean;
}

export const TRAINING_AGGREGATE = "training" as const;
export const TrainingEventTypes = {
  TestAttempted: "TrainingTestAttempted",
  MaterialWatched: "TrainingMaterialWatched",
} as const;
export interface TrainingTestAttemptedV1 {
  employeeId: string;
  passed: boolean;
  score: number | null;
  testId?: string;
  takenAt?: string;
}
export interface TrainingMaterialWatchedV1 {
  employeeId: string;
  materialId?: string;
}

export const FEEDBACK_AGGREGATE = "feedback" as const;
export const FeedbackEventTypes = {
  Received: "FeedbackReceived",
  Resolved: "FeedbackResolved",
} as const;
export interface FeedbackReceivedV1 {
  /** May be null for free-text / client feedback — the projection skips those. */
  employeeId: string | null;
  rating: number | null;
  feedbackId?: string;
  type?: string | null;
}
export interface FeedbackResolvedV1 {
  employeeId: string | null;
  tatHours: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HR SUPPORT / TICKETING domain (mig 0145). aggregateType = "hr_ticket";
// aggregateId = hr_tickets.id. The event log IS the ticket's audit trail (no
// bespoke audit table). Payloads are flat + denormalised. All v1.
//
// CONFIDENTIALITY: for confidential (grievance) tickets, payloads NEVER carry
// the subject line — only ids + category, so a log reader can't leak content.
// ═══════════════════════════════════════════════════════════════════════════

export const HR_TICKET_AGGREGATE = "hr_ticket" as const;
export const HrTicketEventTypes = {
  Created: "HrTicketCreated",
  Assigned: "HrTicketAssigned",
  StatusChanged: "HrTicketStatusChanged",
  Replied: "HrTicketReplied",           // outward reply (employee or HR)
  NoteAdded: "HrTicketNoteAdded",       // internal HR-only note
  PriorityChanged: "HrTicketPriorityChanged",
  Reopened: "HrTicketReopened",
  Resolved: "HrTicketResolved",
  Closed: "HrTicketClosed",
  SlaBreached: "HrTicketSlaBreached",
  CsatSubmitted: "HrTicketCsatSubmitted",
} as const;
export type HrTicketEventType =
  (typeof HrTicketEventTypes)[keyof typeof HrTicketEventTypes];

/** Flat v1 payload shared by every hr_ticket event. Only the fields relevant
 *  to the event need be set; `employeeId` (the requester) is ALWAYS carried. */
export interface HrTicketEventV1 {
  employeeId: string;
  ticketNo: number;
  category: string;
  confidential: boolean;
  /** 'support' | 'query' — which door raised it. */
  source?: string;
  assigneeId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromPriority?: string | null;
  toPriority?: string | null;
  /** 'first_response' | 'resolution' — for SlaBreached. */
  breachKind?: string | null;
  /** 1..5 — for CsatSubmitted. */
  csatScore?: number | null;
  /** true when the message was an internal note (NoteAdded). */
  internal?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// APPRAISAL domain (mig 0146). aggregateType = "appraisal". aggregateId =
// appraisal_cycles.id for cycle-level events, appraisal_items.id for
// item/score-level events. Payloads flat + denormalised (employeeId always
// present on item-level events). All v1. Feed/audit only — no projection
// consumes these yet (the employee_twin rules default-ignore unknown types).
// ═══════════════════════════════════════════════════════════════════════════

export const APPRAISAL_AGGREGATE = "appraisal" as const;
export const AppraisalEventTypes = {
  CycleOpened: "AppraisalCycleOpened",           // aggregateId = cycleId
  CycleFinalized: "AppraisalCycleFinalized",     // aggregateId = cycleId
  ConfigUpdated: "AppraisalConfigUpdated",       // aggregateId = APPRAISAL_CONFIG_AGGREGATE_ID (sentinel)
  ItemPublished: "AppraisalItemPublished",       // aggregateId = itemId
  KpiApproved: "AppraisalKpiApproved",           // aggregateId = itemId
  SelfSubmitted: "AppraisalSelfSubmitted",       // aggregateId = itemId
  ManagerSubmitted: "AppraisalManagerSubmitted", // aggregateId = itemId
  ManagementSubmitted: "AppraisalManagementSubmitted", // aggregateId = itemId
  ItemFinalized: "AppraisalItemFinalized",       // aggregateId = itemId
  CultureAssigned: "AppraisalCultureAssigned",   // aggregateId = APPRAISAL_CULTURE_AGGREGATE_ID (sentinel); period in payload
} as const;
export type AppraisalEventType =
  (typeof AppraisalEventTypes)[keyof typeof AppraisalEventTypes];

/** Flat v1 payload shared by every appraisal event. Item-level events carry
 *  employeeId + dimension; cycle-level events carry period only. */
export interface AppraisalEventV1 {
  /** 'YYYY-MM' of the cycle. */
  period: string;
  /** The scored employee — cycle-level events omit it. */
  employeeId?: string | null;
  cycleId?: string | null;
  itemId?: string | null;
  dimension?: string | null;
  /** The stage score that was written (self/manager/management/final). */
  stage?: string | null;
  score?: number | null;
  maxScore?: number | null;
  /** KpiApproved: the admin verdict. */
  approved?: boolean | null;
  /** CultureAssigned: the constitution para ids picked for the month. */
  paraIds?: string[];
}
