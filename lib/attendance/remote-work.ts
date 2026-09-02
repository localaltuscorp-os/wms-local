import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, clientLocations, employees, remoteWorkRequests } from "@/db/schema";
import {
  REMOTE_WORK_MODE_LABELS,
  type RecurrenceMode,
  type RemoteReasonBucket,
  type RemoteWorkMode,
  type RemoteWorkStatus,
} from "@/db/enums";
import { canApproveRemoteWork } from "@/lib/auth/attendance-permissions";
import {
  expandRecurrence,
  type MonthlyPattern,
  type RecurrenceEnd,
  type RecurrenceUnit,
} from "./recurrence";
import { ALL_DAY_END, ALL_DAY_START } from "./remote-work-constants";

// Re-exported so server callers have one import for the whole feature. The
// definitions live in a client-safe module because the request form needs them
// too — see remote-work-constants.ts.
export { ALL_DAY_START, ALL_DAY_END };

/**
 * REMOTE WORK — the middle step between asking to work away from the office and
 * that day counting as attendance.
 *
 * `attendance_logs.work_mode` has existed since migration 0127, but nothing ever
 * gated it: a punch could name itself `wfh` and grade exactly as if it had been
 * agreed. Applying and being granted were the same act. This module is the
 * approval that was missing, and the ONE place the "is this allowed?" question
 * is answered.
 *
 * ── DEFENCE IN DEPTH, ON PURPOSE ───────────────────────────────────────────
 * `assertRemoteWorkApproved` is not the only guard. Migration 0205 installs a
 * trigger on `attendance_logs` that refuses the same insert. That is deliberate
 * duplication: the table has four writers today, and a check that lives only in
 * the two which currently set a remote mode would be correct now and silently
 * incomplete the moment a fifth appears — which is precisely how the ungated
 * hole in 0127 lasted this long. This module exists to produce a READABLE
 * refusal; the trigger exists to make the rule true regardless.
 *
 * ── 0209: A REQUEST IS NOW A CALENDAR ENTRY ────────────────────────────────
 * It carries hours, a repeat pattern and a reason you can count. The repeat
 * EXPANDS here into one row per date (see ./recurrence for why), so everything
 * below — approval, the gate, the trigger — keeps working on exactly the shape
 * it always did: one employee, one day.
 */

/** An approved request, reduced to what a punch needs to know. */
export interface ApprovedRemoteWork {
  id: string;
  workMode: RemoteWorkMode;
  /** Non-null exactly when `workMode === "client_site"` (0205 CHECK). */
  clientLocationId: string | null;
}

/**
 * The approved remote-work request covering this employee on this date, if any.
 *
 * `workDate` is a plain 'YYYY-MM-DD' local date string, matching
 * `attendance_logs.log_date` — NOT a timestamp. Attendance in this app is keyed
 * to the local day throughout, and comparing an instant here would put a late
 * evening punch on the wrong side of midnight in the wrong timezone.
 */
export async function approvedRemoteWorkFor(
  employeeId: string,
  workDate: string,
): Promise<ApprovedRemoteWork | null> {
  const [row] = await db
    .select({
      id: remoteWorkRequests.id,
      workMode: remoteWorkRequests.workMode,
      clientLocationId: remoteWorkRequests.clientLocationId,
    })
    .from(remoteWorkRequests)
    .where(
      and(
        eq(remoteWorkRequests.employeeId, employeeId),
        eq(remoteWorkRequests.workDate, workDate),
        eq(remoteWorkRequests.status, "approved"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type RemoteWorkGate =
  | { ok: true; clientLocationId: string | null }
  | { ok: false; error: string };

/**
 * May this employee punch in this work mode, on this date?
 *
 * Call BEFORE writing the punch. Returns a verdict rather than throwing so each
 * caller can answer in its own idiom — the web action returns a form error, the
 * mobile route a 403 — and so the message can name what is wrong rather than
 * surfacing a Postgres constraint name from the trigger.
 *
 * `office` and `other` are not gated: `office` is the default and needs no
 * permission, and `other` predates all of this. Note the trigger takes the same
 * view, so the two cannot disagree about which modes are free.
 *
 * THE AGREED HOURS ARE NOT ENFORCED HERE (0209). A request now carries a start
 * and an end time, but refusing a punch outside them would turn "you agreed to
 * be at the client from 2pm" into "your 1:55pm arrival is not attendance". The
 * times are what was agreed and what an approver reviews; the grader still
 * measures the day against the employee's schedule, exactly as in the office.
 */
export async function assertRemoteWorkApproved(
  employeeId: string,
  workDate: string,
  workMode: string | null | undefined,
): Promise<RemoteWorkGate> {
  if (!workMode || workMode === "office" || workMode === "other") {
    return { ok: true, clientLocationId: null };
  }

  const approved = await approvedRemoteWorkFor(employeeId, workDate);
  if (!approved) {
    return {
      ok: false,
      error: `No approved ${label(workMode)} request for ${workDate}. Ask Rutvisha, Manan or Om to approve it first.`,
    };
  }
  if (approved.workMode !== workMode) {
    // An approval is for a SPECIFIC mode. Approving a client visit is not
    // approving a day at home, and silently accepting the mismatch would make
    // the approval mean "away from the office, somehow".
    return {
      ok: false,
      error: `Your approval for ${workDate} is for ${label(approved.workMode)}, not ${label(workMode)}.`,
    };
  }
  return { ok: true, clientLocationId: approved.clientLocationId };
}

function label(mode: string): string {
  return REMOTE_WORK_MODE_LABELS[mode as RemoteWorkMode] ?? mode;
}

/** "HH:MM", 24-hour. Deliberately strict — a half-typed time must not store. */
function isClock(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/**
 * Resolve the agreed hours. All-day FORCES the standard day rather than trusting
 * whatever the form last had in its time inputs — otherwise ticking "All day"
 * after typing 14:00 would store a contradiction.
 */
function resolveHours(
  allDay: boolean,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): { ok: true; startTime: string; endTime: string } | { ok: false; error: string } {
  if (allDay) return { ok: true, startTime: ALL_DAY_START, endTime: ALL_DAY_END };
  const s = startTime ?? "";
  const e = endTime ?? "";
  if (!isClock(s) || !isClock(e)) {
    return { ok: false, error: "Set a start and an end time, or choose All day." };
  }
  // "HH:MM" strings compare correctly as text, which is why they are never
  // parsed here. The 0209 CHECK says the same thing in SQL.
  if (e <= s) return { ok: false, error: "The end time has to be after the start time." };
  return { ok: true, startTime: s, endTime: e };
}

export interface RemoteWorkInput {
  employeeId: string;
  /** First date of the series — always requested, whatever the pattern says. */
  workDate: string;
  workMode: RemoteWorkMode;
  clientLocationId?: string | null;
  reason?: string | null;
  reasonBucket?: RemoteReasonBucket | null;
  /** True ⇒ the hours are forced to the standard day, whatever was posted. */
  allDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  recurrence?: RecurrenceMode;
  repeatUntil?: string | null;
  /** Weekdays 0–6, for `recurrence: "custom"`. */
  weekdays?: readonly number[] | null;
  /** The calendar-style pattern extensions — see lib/attendance/recurrence. All
   *  optional; a caller that omits them gets the original 0209 behavior. */
  interval?: number | null;
  unit?: RecurrenceUnit | null;
  monthly?: MonthlyPattern | null;
  end?: RecurrenceEnd | null;
  count?: number | null;
}

export interface RemoteWorkRequestResult {
  ok: true;
  ids: string[];
  /** Dates the series could NOT claim, and why. See below. */
  skipped: { date: string; reason: string }[];
}

/**
 * Raise a request, expanding any repeat into one row per date.
 *
 * Idempotent per (employee, date): re-requesting a day whose request is still
 * PENDING replaces it, because a person changing their mind about tomorrow is
 * ordinary.
 *
 * A day that has already been DECIDED is never silently overwritten — that would
 * let someone re-open a rejection by asking again. Inside a SERIES those days are
 * SKIPPED AND REPORTED rather than failing the whole submission: "Mondays for
 * the next two months" should not be refused outright because one Monday in the
 * middle was already approved. Refusing everything teaches people to submit one
 * day at a time, which is the thing recurrence exists to avoid.
 *
 * A single-date request still refuses outright — there is nothing else in it to
 * succeed, and a silent "0 days requested" would read as having worked.
 */
export async function requestRemoteWork(
  input: RemoteWorkInput,
): Promise<RemoteWorkRequestResult | { ok: false; error: string }> {
  if (input.workMode === "client_site" && !input.clientLocationId) {
    return { ok: false, error: "Pick the client site you'll be working from." };
  }

  const allDay = input.allDay !== false;
  const hours = resolveHours(allDay, input.startTime, input.endTime);
  if (!hours.ok) return hours;

  const mode: RecurrenceMode = input.recurrence ?? "none";
  const expanded = expandRecurrence({
    anchor: input.workDate,
    mode,
    repeatUntil: input.repeatUntil ?? null,
    weekdays: input.weekdays ?? null,
    interval: input.interval ?? null,
    unit: input.unit ?? null,
    monthly: input.monthly ?? null,
    end: input.end ?? null,
    count: input.count ?? null,
  });
  if (!expanded.ok) return expanded;
  const dates = expanded.dates;

  // ONE query for the whole series rather than one per date: a sixty-day repeat
  // would otherwise be sixty round-trips before a single row is written.
  const existing = await db
    .select({
      id: remoteWorkRequests.id,
      workDate: remoteWorkRequests.workDate,
      status: remoteWorkRequests.status,
    })
    .from(remoteWorkRequests)
    .where(
      and(
        eq(remoteWorkRequests.employeeId, input.employeeId),
        inArray(remoteWorkRequests.workDate, dates),
      ),
    );
  const priorByDate = new Map(existing.map((r) => [r.workDate, r]));

  const skipped: { date: string; reason: string }[] = [];
  const claimable: string[] = [];
  for (const d of dates) {
    const prior = priorByDate.get(d);
    if (prior && prior.status !== "pending") {
      skipped.push({
        date: d,
        reason: prior.status === "approved" ? "already approved" : "already rejected",
      });
      continue;
    }
    claimable.push(d);
  }

  if (claimable.length === 0) {
    const only = skipped[0];
    return {
      ok: false,
      error:
        dates.length === 1 && only
          ? only.reason === "already approved"
            ? `You already have an approved request for ${only.date}.`
            : `Your request for ${only.date} was rejected — ask Rutvisha, Manan or Om directly.`
          : "Every day in that repeat has already been decided.",
    };
  }

  // One id for the whole submission, so the rows can be shown — and removed — as
  // the single thing the person actually asked for. A one-off stays null: it is
  // not a series of one.
  const seriesId = mode === "none" ? null : crypto.randomUUID();

  const base = {
    employeeId: input.employeeId,
    workMode: input.workMode,
    clientLocationId: input.workMode === "client_site" ? (input.clientLocationId ?? null) : null,
    reason: input.reason?.trim() || null,
    reasonBucket: input.reasonBucket ?? null,
    allDay,
    startTime: hours.startTime,
    endTime: hours.endTime,
    recurrence: mode,
    seriesId,
    status: "pending" as RemoteWorkStatus,
    updatedAt: new Date(),
  };

  try {
    const ids: string[] = [];
    for (const d of claimable) {
      const prior = priorByDate.get(d);
      if (prior) {
        await db
          .update(remoteWorkRequests)
          .set({ ...base, workDate: d })
          .where(eq(remoteWorkRequests.id, prior.id));
        ids.push(prior.id);
        continue;
      }
      const [row] = await db
        .insert(remoteWorkRequests)
        .values({ ...base, workDate: d })
        .returning({ id: remoteWorkRequests.id });
      if (row) ids.push(row.id);
    }
    if (ids.length === 0) return { ok: false, error: "Could not save the request." };
    return { ok: true, ids, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the request." };
  }
}

/**
 * Approve or reject. Only Rutvisha, Manan or Om — checked HERE, not merely in the
 * page that renders the buttons, because hiding a control is presentation and
 * this is authorization.
 */
export async function decideRemoteWork(input: {
  requestId: string;
  decidedBy: { id: string; email: string };
  decision: Exclude<RemoteWorkStatus, "pending">;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canApproveRemoteWork(input.decidedBy.email)) {
    return { ok: false, error: "Only Rutvisha, Manan or Om can decide a remote-work request." };
  }

  const [prior] = await db
    .select({ status: remoteWorkRequests.status })
    .from(remoteWorkRequests)
    .where(eq(remoteWorkRequests.id, input.requestId))
    .limit(1);
  if (!prior) return { ok: false, error: "That request no longer exists." };
  if (prior.status !== "pending") {
    // Not an error worth hiding: two approvers opening the queue at once is
    // normal, and the second should be told what happened rather than silently
    // overwriting the first one's decision.
    return { ok: false, error: `This request was already ${prior.status}.` };
  }

  try {
    await db
      .update(remoteWorkRequests)
      .set({
        status: input.decision,
        decidedById: input.decidedBy.id,
        decidedAt: new Date(),
        decisionNote: input.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(remoteWorkRequests.id, input.requestId), eq(remoteWorkRequests.status, "pending")));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the decision." };
  }
}

/**
 * AMEND a request in place (0209) — the approver's edit.
 *
 * WHO: the same two people who may decide one. Not "any admin", deliberately.
 * Editing somebody's approved Client Site day carries the same authority as
 * granting it, and an admin who could rewrite an approval they did not give
 * would be a wider power than this feature was built around.
 *
 * THE DATE IS NOT EDITABLE. Moving a request to another day is not an edit — it
 * is a different request, and doing it here would have to reckon with whatever
 * already sits on the target date under the (employee, date) unique index. The
 * approver removes and re-raises: one more click, and no ambiguity.
 *
 * A DECIDED REQUEST KEEPS ITS DECISION. Amending 10:30–19:30 to 14:00–19:30 on
 * an approved day is a correction, not a fresh application; forcing it back to
 * pending would silently withdraw permission for a day that may already have
 * been worked.
 */
export async function amendRemoteWork(input: {
  requestId: string;
  actor: { id: string; email: string };
  workMode: RemoteWorkMode;
  clientLocationId?: string | null;
  allDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
  reasonBucket?: RemoteReasonBucket | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canApproveRemoteWork(input.actor.email)) {
    return { ok: false, error: "Only Rutvisha, Manan or Om can change a remote-work request." };
  }
  if (input.workMode === "client_site" && !input.clientLocationId) {
    return { ok: false, error: "Pick the client site for this day." };
  }

  const hours = resolveHours(input.allDay, input.startTime, input.endTime);
  if (!hours.ok) return hours;

  try {
    const [row] = await db
      .update(remoteWorkRequests)
      .set({
        workMode: input.workMode,
        clientLocationId:
          input.workMode === "client_site" ? (input.clientLocationId ?? null) : null,
        allDay: input.allDay,
        startTime: hours.startTime,
        endTime: hours.endTime,
        reason: input.reason?.trim() || null,
        reasonBucket: input.reasonBucket ?? null,
        updatedAt: new Date(),
      })
      .where(eq(remoteWorkRequests.id, input.requestId))
      .returning({ id: remoteWorkRequests.id });
    if (!row) return { ok: false, error: "That request no longer exists." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the change." };
  }
}

/**
 * REMOVE a request (0209) — one day, or the whole repeat it belongs to.
 *
 * A HARD DELETE, unlike a client location, which retires. A remote-work request
 * is a permission for one day, not a reference record: leaving a withdrawn one
 * behind in some "removed" state would put a row in the table that the approval
 * lookup then has to know to ignore, and that lookup is what decides whether a
 * punch is legal.
 *
 * ── THE ONE CASE IT REFUSES ────────────────────────────────────────────────
 * An APPROVED request a matching punch already relies on. `attendance_logs`
 * carries the work_mode but not the approval id, so deleting the approval leaves
 * a punch whose legality can no longer be demonstrated — and the 0205 trigger
 * fires on write, not on read, so nothing would ever notice. The approver is
 * told to correct the punch first, which is the order that leaves no orphan.
 */
export async function removeRemoteWork(input: {
  requestId: string;
  actor: { id: string; email: string };
  /** Remove every row of the same repeat, not only this date. */
  wholeSeries?: boolean;
}): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  if (!canApproveRemoteWork(input.actor.email)) {
    return { ok: false, error: "Only Rutvisha, Manan or Om can remove a remote-work request." };
  }

  const cols = {
    id: remoteWorkRequests.id,
    employeeId: remoteWorkRequests.employeeId,
    workDate: remoteWorkRequests.workDate,
    workMode: remoteWorkRequests.workMode,
    status: remoteWorkRequests.status,
    seriesId: remoteWorkRequests.seriesId,
  };

  const [row] = await db
    .select(cols)
    .from(remoteWorkRequests)
    .where(eq(remoteWorkRequests.id, input.requestId))
    .limit(1);
  if (!row) return { ok: false, error: "That request no longer exists." };

  const targets =
    input.wholeSeries && row.seriesId
      ? await db.select(cols).from(remoteWorkRequests).where(eq(remoteWorkRequests.seriesId, row.seriesId))
      : [row];

  for (const t of targets) {
    if (t.status !== "approved") continue;
    const [punch] = await db
      .select({ id: attendanceLogs.id })
      .from(attendanceLogs)
      .where(
        and(
          eq(attendanceLogs.employeeId, t.employeeId),
          eq(attendanceLogs.logDate, t.workDate),
          eq(attendanceLogs.workMode, t.workMode),
        ),
      )
      .limit(1);
    if (punch) {
      return {
        ok: false,
        error: `${t.workDate} has already been punched as ${label(t.workMode)} — correct the attendance for that day before removing its approval.`,
      };
    }
  }

  try {
    await db.delete(remoteWorkRequests).where(
      inArray(
        remoteWorkRequests.id,
        targets.map((t) => t.id),
      ),
    );
    return { ok: true, removed: targets.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove the request." };
  }
}

/** One row of the review queue. */
export interface RemoteWorkRow {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  workMode: RemoteWorkMode;
  status: RemoteWorkStatus;
  allDay: boolean;
  /** Postgres returns `time` as "HH:MM:SS" — render through `clockLabel`. */
  startTime: string;
  endTime: string;
  reason: string | null;
  reasonBucket: RemoteReasonBucket | null;
  recurrence: RecurrenceMode;
  seriesId: string | null;
  clientName: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
}

/** Pending requests, oldest date first — the queue Rutvisha and Manan work through. */
export async function listPendingRemoteWork(): Promise<RemoteWorkRow[]> {
  return listRemoteWork({ status: "pending" });
}

/** One employee's own history, newest first. */
export async function listMyRemoteWork(employeeId: string): Promise<RemoteWorkRow[]> {
  return listRemoteWork({ employeeId });
}

async function listRemoteWork(filter: {
  status?: RemoteWorkStatus;
  employeeId?: string;
}): Promise<RemoteWorkRow[]> {
  const where = [
    filter.status ? eq(remoteWorkRequests.status, filter.status) : undefined,
    filter.employeeId ? eq(remoteWorkRequests.employeeId, filter.employeeId) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: remoteWorkRequests.id,
      employeeId: remoteWorkRequests.employeeId,
      employeeName: employees.name,
      workDate: remoteWorkRequests.workDate,
      workMode: remoteWorkRequests.workMode,
      status: remoteWorkRequests.status,
      allDay: remoteWorkRequests.allDay,
      startTime: remoteWorkRequests.startTime,
      endTime: remoteWorkRequests.endTime,
      reason: remoteWorkRequests.reason,
      reasonBucket: remoteWorkRequests.reasonBucket,
      recurrence: remoteWorkRequests.recurrence,
      seriesId: remoteWorkRequests.seriesId,
      clientName: clientLocations.name,
      decidedAt: remoteWorkRequests.decidedAt,
      decisionNote: remoteWorkRequests.decisionNote,
      decidedById: remoteWorkRequests.decidedById,
    })
    .from(remoteWorkRequests)
    .innerJoin(employees, eq(remoteWorkRequests.employeeId, employees.id))
    .leftJoin(clientLocations, eq(remoteWorkRequests.clientLocationId, clientLocations.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(remoteWorkRequests.workDate));

  // The decider's name needs a SECOND join to `employees`, which drizzle needs
  // aliased. Resolved in a small follow-up query instead: the queue is a handful
  // of rows, and an alias here buys nothing but noise.
  const deciderIds = [...new Set(rows.map((r) => r.decidedById).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (deciderIds.length) {
    for (const e of await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)) {
      names.set(e.id, e.name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    workDate: r.workDate,
    workMode: r.workMode,
    status: r.status,
    allDay: r.allDay,
    startTime: r.startTime,
    endTime: r.endTime,
    reason: r.reason,
    reasonBucket: r.reasonBucket,
    recurrence: r.recurrence,
    seriesId: r.seriesId,
    clientName: r.clientName ?? null,
    decidedByName: r.decidedById ? (names.get(r.decidedById) ?? null) : null,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
  }));
}

/** "10:30" from whatever shape Postgres hands back for a `time` column. */
export function clockLabel(t: string): string {
  return t.slice(0, 5);
}

/** "All day" or "14:00 – 19:30" — the one place the two are worded. */
export function hoursLabel(row: Pick<RemoteWorkRow, "allDay" | "startTime" | "endTime">): string {
  return row.allDay
    ? `All day · ${clockLabel(row.startTime)} – ${clockLabel(row.endTime)}`
    : `${clockLabel(row.startTime)} – ${clockLabel(row.endTime)}`;
}
