/**
 * THE TWO STATUS AXES — one vocabulary for Tasks, Projects and Goals.
 *
 * Manan, 2026-09-14: every row of work in this app is described twice, by two
 * different people answering two different questions.
 *
 *   DOER STATUS       "where is this work?"  — a REPORT, by the person holding it
 *                     Not Read · Not Started · Initiated · Follow Up ·
 *                     Need Info · Done · Abandoned
 *
 *   INITIATOR STATUS  "what do we do about it?" — a RULING, by the person who
 *                     asked for it
 *                     Approved · Not Approved · On Hold · Archived
 *
 * WHY ONE MODULE FOR ALL THREE. Tasks, Projects and Goals each already had a
 * status column, and each was drifting its own way — `on_hold` was a doer value
 * in Tasks and an initiator value in Projects, and Goals had no initiator axis
 * at all. Three vocabularies for one idea means a task that is "On Hold" and a
 * project that is "On Hold" are not comparable, no cross-module board can exist,
 * and every new screen picks a list by accident. So the lists live here once and
 * the three modules import them.
 *
 * Client-SAFE on purpose (no `server-only`, no db import): the picker in the
 * browser and the server action that accepts the write must agree about which
 * values exist and who may choose them, and the way to guarantee that is one
 * copy imported by both. Hiding an option is a courtesy; `canSetInitiatorStatus`
 * re-run on the server is the control.
 *
 * WHERE EACH AXIS IS STORED
 *
 *   |          | doer                   | initiator verdict | "archived" flag  |
 *   |----------|------------------------|-------------------|------------------|
 *   | tasks    | `status`               | `approval_status` | `archived`       |
 *   | goals    | `status`               | `approval_status` | `archived_at`    |
 *   | weekly   | `status`               | `approval_status` | `archived_at`    |
 *   | project  | `status` / task.status | `approval_status` | `is_archived`    |
 *
 * ARCHIVED IS NOT A STORED VERDICT. It is the archive flag each table already
 * has, with its own filter and index. A parallel status string saying
 * "archived" next to a flag saying false is a bug waiting to happen, so
 * Archived is DERIVED for display (`effectiveInitiatorStatus`) and WRITTEN as
 * the flag (`initiatorWrite`). The four-value dropdown Manan asked for is what
 * a user sees; underneath, three values and a flag.
 *
 * MIND THE THIRD COLUMN — the flag is a different column in each module, and in
 * Goals it is NOT the one called `archived`. There, `archived` is the soft-
 * DELETE marker behind the Recycle Bin and `archived_at` is "put away"; wiring
 * this axis to the former would delete a goal when an initiator meant to file
 * it. That is why every function here takes a plain `archived: boolean` and
 * each module passes its own column, rather than this module reaching for a
 * field name.
 *
 * AND MIND `abandoned`. The doer status is a REPORT — "I am not going to do
 * this" — and has nothing to do with `tasks.abandoned_at`, the Recycle Bin
 * marker from migration 0135 that soft-deletes a task out of the daily loop.
 * Same English word, two unrelated mechanisms; setting the status never touches
 * the column.
 */

import {
  DOER_TASK_STATUSES,
  isDeprecatedApprovalStatus,
  type ApprovalStatus,
  type TaskStatus,
} from "@/db/enums";
import {
  STATUS_BADGE_STYLES,
  STATUS_TONES_FALLBACK,
  statusBadgeStyle,
  type StatusBadgeStyle,
} from "@/lib/format";

/* ───────────────────────── the doer axis ───────────────────────── */

/** The seven a doer reports against, in lifecycle order. */
export const DOER_STATUSES = DOER_TASK_STATUSES;
export type DoerStatus = (typeof DOER_STATUSES)[number];

const DOER_SET: ReadonlySet<string> = new Set(DOER_STATUSES);

export function isDoerStatus(v: string | null | undefined): v is DoerStatus {
  return !!v && DOER_SET.has(v);
}

/** Labels. `dont_know` reads "Not Read" everywhere — the internal name is a
 *  relic of the 2026-05 import and is never shown. */
export const DOER_STATUS_LABEL: Record<DoerStatus, string> = {
  dont_know: "Not Read",
  not_started: "Not Started",
  initiated: "Initiated",
  follow_up: "Follow Up",
  need_info: "Need Info",
  done: "Done",
  abandoned: "Abandoned",
};

/**
 * Chip colours — DERIVED from the badge palette, not a second hand-picked list.
 *
 * It used to be its own set of hexes, and it had drifted twice over: three of
 * the seven were greys a hair apart (#94A3B8 Not Read, #64748B Not Started,
 * #78716C Abandoned), and none of the seven matched the dot the SAME status
 * draws in a task row or on the plan board — Initiated was cyan here and amber
 * there. Manan, 2026-09-15: "give different colour to all doer status".
 *
 * So the picker now reads the one palette every badge reads (lib/format.ts):
 * grey · indigo · yellow · orange · red · green · brown, seven hues, no two
 * alike. Change a colour there and the chip, the dot and the pill move together.
 *
 * FALLBACKS, deliberately — `STATUS_TONES_FALLBACK`, not the admin overrides in
 * `status_settings`. This module is imported by the browser picker, which has
 * no database; the overrides reach the badge components through
 * `getStatusDisplayMap` on the server. An admin recolouring a status therefore
 * still moves every badge, and only this one chip keeps the built-in hue.
 */
export const DOER_STATUS_TONE: Record<DoerStatus, string> = Object.fromEntries(
  DOER_STATUSES.map((s) => [s, STATUS_BADGE_STYLES[STATUS_TONES_FALLBACK[s]].dot]),
) as Record<DoerStatus, string>;

/**
 * The FOUR colours a doer pill needs — fill, ink, hairline and dot — from the
 * same badge palette `DOER_STATUS_TONE` reads for its single hex.
 *
 * The picker used to need only the one colour because it was a native
 * `<select>`: a white box with coloured text. It is a filled pill with a dot
 * now (components/status/status-listbox.tsx), which is four colours, and taking
 * all four from `STATUS_BADGE_STYLES` is what makes the Goals and Project Plan
 * pills come out byte-identical to the Tasks ones rather than merely similar.
 */
export const DOER_STATUS_BADGE: Record<DoerStatus, StatusBadgeStyle> = Object.fromEntries(
  DOER_STATUSES.map((s) => [s, STATUS_BADGE_STYLES[STATUS_TONES_FALLBACK[s]]]),
) as Record<DoerStatus, StatusBadgeStyle>;

/** Where a row sits before anyone has touched it. */
export const DEFAULT_DOER_STATUS: DoerStatus = "not_started";

/** Terminal doer states — nothing further is owed by the doer. Used by the
 *  pending/aging counters, which must not chase abandoned work forever. */
export const TERMINAL_DOER_STATUSES = ["done", "abandoned"] as const;
const TERMINAL_DOER_SET: ReadonlySet<string> = new Set(TERMINAL_DOER_STATUSES);

export function isTerminalDoerStatus(v: string | null | undefined): boolean {
  return !!v && TERMINAL_DOER_SET.has(v);
}

/**
 * The doer status to SHOW for a row.
 *
 * Anything off the axis — a deprecated value like `on_hold` that migration 0225
 * could not reach, or one of the legacy verdicts sitting in `status` on an
 * imported row — falls back to the default rather than rendering a blank chip
 * or throwing on a missing label lookup.
 */
export function effectiveDoerStatus(status: string | null | undefined): DoerStatus {
  return isDoerStatus(status) ? status : DEFAULT_DOER_STATUS;
}

/* ─────────────────────── the initiator axis ─────────────────────── */

/**
 * The four an initiator rules with — the dropdown, in the order Manan listed
 * them. `archived` is a display value backed by the `archived` boolean; see the
 * file header.
 */
export const INITIATOR_STATUSES = [
  "approved",
  "not_approved",
  "on_hold",
  "archived",
] as const;
export type InitiatorStatus = (typeof INITIATOR_STATUSES)[number];

/** The subset that is actually stored in an `approval_status` column. */
export const STORED_INITIATOR_STATUSES = [
  "approved",
  "not_approved",
  "on_hold",
] as const satisfies readonly ApprovalStatus[];
export type StoredInitiatorStatus = (typeof STORED_INITIATOR_STATUSES)[number];

const INITIATOR_SET: ReadonlySet<string> = new Set(INITIATOR_STATUSES);
const STORED_INITIATOR_SET: ReadonlySet<string> = new Set(STORED_INITIATOR_STATUSES);

export function isInitiatorStatus(
  v: string | null | undefined,
): v is InitiatorStatus {
  return !!v && INITIATOR_SET.has(v);
}

export function isStoredInitiatorStatus(
  v: string | null | undefined,
): v is StoredInitiatorStatus {
  return !!v && STORED_INITIATOR_SET.has(v);
}

export const INITIATOR_STATUS_LABEL: Record<InitiatorStatus, string> = {
  approved: "Approved",
  not_approved: "Not Approved",
  on_hold: "On Hold",
  archived: "Archived",
};

export const INITIATOR_STATUS_TONE: Record<InitiatorStatus, string> = {
  approved: "#15803D",
  not_approved: "#DC2626",
  on_hold: "#B45309",
  archived: "#57534E",
};

/**
 * The initiator pill's four colours, DERIVED from `INITIATOR_STATUS_TONE` above
 * rather than picked again.
 *
 * These four verdicts have no entry in `STATUS_BADGE_STYLES` — that table is
 * keyed by `status_settings` colour tokens, and Archived is not a task status
 * at all — so they go through `statusBadgeStyle`'s hex path, which builds the
 * fill, ink and hairline out of the one hue each verdict already carried. The
 * colours on screen therefore do not move; only the shape of the control does.
 */
export const INITIATOR_STATUS_BADGE: Record<InitiatorStatus, StatusBadgeStyle> =
  Object.fromEntries(
    INITIATOR_STATUSES.map((s) => [s, statusBadgeStyle(INITIATOR_STATUS_TONE[s])]),
  ) as Record<InitiatorStatus, StatusBadgeStyle>;

/** The pill for "nobody has ruled yet" — a neutral, because it names an
 *  absence. Stone, the same neutral `dont_know` carries on the doer axis. */
export const NO_VERDICT_BADGE: StatusBadgeStyle = STATUS_BADGE_STYLES.stone;

/**
 * The initiator status to SHOW for a row, or null when no ruling has been made.
 *
 * NULL IS A REAL ANSWER and not the same as "Not Approved": nobody has looked
 * at this yet. The kanban gives it its own "No verdict" column for exactly that
 * reason — work awaiting a decision is the column an initiator most needs to
 * see, and folding it into Not Approved would assert a judgement no one made.
 *
 * Archived outranks a verdict: an archived row is archived whatever the last
 * ruling said. Deprecated verdicts (cancelled / transferred, from before the
 * split) read as Archived, which is what they meant.
 */
export function effectiveInitiatorStatus(
  approval: string | null | undefined,
  archived: boolean,
): InitiatorStatus | null {
  if (archived) return "archived";
  if (!approval) return null;
  if (isDeprecatedApprovalStatus(approval)) return "archived";
  return isInitiatorStatus(approval) ? approval : null;
}

/**
 * Translate a chosen initiator value into the two columns that store it.
 *
 * Picking Archived archives the row and leaves the verdict untouched — un-
 * archiving must not silently discard the fact that something was Approved.
 * Picking any verdict un-archives, because setting a live ruling on a row that
 * is filed away is how a row gets pulled back out.
 */
export function initiatorWrite(next: InitiatorStatus): {
  approvalStatus: StoredInitiatorStatus | null;
  archived: boolean;
} {
  if (next === "archived") return { approvalStatus: null, archived: true };
  return { approvalStatus: next, archived: false };
}

/* ───────────────────────── who may rule ───────────────────────── */

/**
 * The caller RELATIVE TO one row. Assembled on the server and passed in, so
 * this module stays free of db imports and unit-tests with plain objects.
 */
export interface StatusActor {
  /** Signed-in employee id. */
  id: string;
  /** `employees.is_admin`. */
  isAdmin: boolean;
  /** True when the caller raised this work (task initiator / goal or project owner). */
  isInitiator: boolean;
  /** True when the caller holds this work. */
  isDoer: boolean;
  /** True when the doer reports to the caller, directly or not. */
  isSupervisor: boolean;
}

/**
 * MAY this actor rule on this row? Admin or the initiator, nobody else — not
 * the doer who did the work, and not their supervisor. A doer marking their own
 * work "Approved" has to be impossible in the API, not merely absent from the
 * dropdown.
 *
 * Returns a reason rather than a bare false so the caller can say why.
 */
export function canSetInitiatorStatus(
  actor: StatusActor,
  next: string,
): { ok: true } | { ok: false; reason: string } {
  if (!isInitiatorStatus(next)) {
    return { ok: false, reason: `"${next}" is not an initiator status.` };
  }
  if (actor.isAdmin || actor.isInitiator) return { ok: true };
  return {
    ok: false,
    reason: `Only the initiator or an administrator can set "${INITIATOR_STATUS_LABEL[next]}".`,
  };
}

/**
 * MAY this actor report progress? The people close to the work.
 */
export function canSetDoerStatus(
  actor: StatusActor,
  next: string,
): { ok: true } | { ok: false; reason: string } {
  if (!isDoerStatus(next)) {
    return { ok: false, reason: `"${next}" is not a doer status.` };
  }
  if (actor.isAdmin || actor.isDoer || actor.isInitiator || actor.isSupervisor) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Only the doer, their supervisor or the initiator can update progress.",
  };
}

/** The initiator values this actor may pick, for building a dropdown. Never the
 *  authority on a write — `canSetInitiatorStatus` is, re-run on the server. */
export function selectableInitiatorStatuses(actor: StatusActor): InitiatorStatus[] {
  return INITIATOR_STATUSES.filter((s) => canSetInitiatorStatus(actor, s).ok);
}

/* ────────────────────────── board columns ────────────────────────── */

/** Sentinel for the initiator board's "nobody has ruled yet" column. It is not
 *  a stored value, which is the whole point of it. */
export const NO_VERDICT_COL = "__no_verdict__" as const;

export type DoerColId = DoerStatus;
export type InitiatorColId = InitiatorStatus | typeof NO_VERDICT_COL;

/** Doer board, left to right: the lifecycle, ending in the two terminals. */
export const DOER_COLUMN_ORDER: DoerColId[] = [...DOER_STATUSES];

/** Initiator board: undecided first, because that is the queue the initiator
 *  is here to clear, then the verdicts, with Archived filed away at the end. */
export const INITIATOR_COLUMN_ORDER: InitiatorColId[] = [
  NO_VERDICT_COL,
  "approved",
  "not_approved",
  "on_hold",
  "archived",
];

export const INITIATOR_COLUMN_LABEL: Record<InitiatorColId, string> = {
  [NO_VERDICT_COL]: "No Verdict",
  ...INITIATOR_STATUS_LABEL,
};

export const INITIATOR_COLUMN_TONE: Record<InitiatorColId, string> = {
  [NO_VERDICT_COL]: "#94A3B8",
  ...INITIATOR_STATUS_TONE,
};

/** Which doer column a row belongs in. */
export function doerColumnFor(row: { status: string | null | undefined }): DoerColId {
  return effectiveDoerStatus(row.status);
}

/** Which initiator column a row belongs in. */
export function initiatorColumnFor(row: {
  approvalStatus: string | null | undefined;
  archived: boolean;
}): InitiatorColId {
  return effectiveInitiatorStatus(row.approvalStatus, row.archived) ?? NO_VERDICT_COL;
}

/** The two axes, named for the board toggle. */
export const STATUS_AXES = ["doer", "initiator"] as const;
export type StatusAxis = (typeof STATUS_AXES)[number];

export const STATUS_AXIS_LABEL: Record<StatusAxis, string> = {
  doer: "Doer Status",
  initiator: "Initiator Status",
};

export function isStatusAxis(v: string | null | undefined): v is StatusAxis {
  return v === "doer" || v === "initiator";
}

/** A `TaskStatus` narrowed to the doer axis, for writes into `tasks.status`. */
export function toTaskStatus(s: DoerStatus): TaskStatus {
  return s;
}
