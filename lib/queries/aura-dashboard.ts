import "server-only";
import { and, eq, gte, inArray, isNotNull, lt, lte, ne, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, employees, holidays, leaveRequests, tasks } from "@/db/schema";
import { PENDING_STATUSES, PRIORITY_LABELS, TASK_PRIORITIES } from "@/db/enums";
import type { TaskPriority, TaskStatus } from "@/db/enums";
import { withRetry } from "@/lib/db/with-timeout";

/**
 * Every number the Aura dashboard draws, in one module.
 *
 * The reference screen (`.claude/skills/aura/reference/altus-home-heros.html`)
 * carries an attendance block, two donuts, a work-shape bloom and a table of
 * open items. None of those existed as queries — so this file is them.
 *
 * THE RULE THE WHOLE FILE IS BUILT ON: no panel invents a number. Where the
 * mock's dimension does not exist in this schema, the panel is re-cut onto one
 * that does, rather than filled with something plausible:
 *
 *   mock "where your week went, by workspace"  →  your OPEN WORK BY PRIORITY.
 *     Nothing in this codebase tags a record with a WorkspaceId and the
 *     task-time rollup has no module dimension, so hours-per-workspace cannot
 *     be computed at all.
 *   mock "hours logged from a timer"           →  ATTENDANCE PUNCHES.
 *     `attendance_logs` is the one place a real worked minute is recorded for
 *     everyone; the task timer is opt-in and mostly empty.
 *
 * PERMISSIONS. The company-wide attendance counters are ADMIN-ONLY — the same
 * rule /attendance/live-status enforces, because those counts span the whole
 * roster. `loadAuraDashboard` takes `isAdmin` and simply does not run that
 * query for anyone else. Everything else on the dashboard is the signed-in
 * employee's own data.
 *
 * FAILURE. This feeds the post-login landing, so every section is caught
 * INDIVIDUALLY and resolves to null on error. A dead panel costs a panel; a
 * thrown one costs the front door.
 */

const READ_BUDGET = [6000, 12000] as const;

/* ────────────────────────────── time helpers ────────────────────────────── */

/** `YYYY-MM-DD` for an instant, in the given IANA zone. */
function ymd(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Minutes past local midnight for an instant, in the given zone. */
function minutesOfDay(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

/** "2:04 PM" in the given zone. */
function clockLabel(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/** Day-of-week 0=Sun…6=Sat for an instant, in the given zone. */
function weekdayIndex(at: Date, tz: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Shift a `YYYY-MM-DD` label by whole days without touching timezones. */
function addDays(day: string, n: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/** The Monday of the local week containing `now`. */
function weekStartYmd(now: Date, tz: string): string {
  const today = ymd(now, tz);
  const dow = weekdayIndex(now, tz); // 0=Sun
  // Sunday belongs to the week that just ended, so it is day 7, not day 0.
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back);
}

/** First and last `YYYY-MM-DD` of the local month containing `now`. */
function monthBounds(now: Date, tz: string): { from: string; to: string } {
  const today = ymd(now, tz);
  const from = `${today.slice(0, 7)}-01`;
  const at = new Date(`${from}T00:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + 1);
  return { from, to: at.toISOString().slice(0, 10) }; // `to` is exclusive
}

/* ─────────────────────────── 1. the work shape ──────────────────────────── */

export interface WorkDay {
  /** `YYYY-MM-DD`. */
  ymd: string;
  /** Single-letter column head — M T W T F S. */
  letter: string;
  minutes: number;
  /** Punched in and not yet out. Only ever true for today. */
  open: boolean;
}

export interface MyWorkShape {
  /** Monday → Saturday of the current local week. Always six entries. */
  days: WorkDay[];
  totalMinutes: number;
  /** Every minute punched since the 1st of the local month. */
  monthMinutes: number;
  /** Days this month with at least one closed punch pair. */
  monthDaysPresent: number;
  /** The employee's own weekly target, or a derived one. Minutes. */
  weeklyTargetMinutes: number;
  /** Fourteen buckets, 7 AM → 8 PM, each 0…1 — the intensity strip. */
  hourLoad: number[];
  /** Today's first punch-in, last punch-out and minutes so far. */
  today: { inLabel: string | null; outLabel: string | null; minutes: number } | null;
  /** A one-line read of the shape, e.g. "Front-loaded, early starter". */
  tagline: string;
  /** Two sentences describing it, built from the same numbers. */
  description: string;
}

/** 7 AM … 8 PM, the strip's span. Punches outside it clamp to the ends. */
const STRIP_FROM_HOUR = 7;
const STRIP_HOURS = 14;

/**
 * The bloom and the strip: how long you actually worked on each day of this
 * week, and which hours of the day you worked them.
 *
 * Built from raw punches rather than the graded attendance analytics, which
 * load a whole month of org data to answer a question about one person's week.
 * One indexed read on `(employee_id, log_date)`.
 *
 * PAIRING. Punches are walked in time order and `in`/`out` are matched as a
 * stack of one: a second `in` before an `out` is ignored (a double-tap), and an
 * `out` with nothing open is ignored (a correction). A day that is still open
 * is counted up to `now`, but ONLY if it is today — an unclosed punch on an
 * earlier day is a missed punch-out, not a 40-hour shift.
 */
export async function myWorkShape(
  employeeId: string,
  tz: string,
  now: Date = new Date(),
  target?: { weeklyTargetMinutes: number | null; fullDayMinutes: number | null; workingDays: number[] | null },
): Promise<MyWorkShape> {
  const from = weekStartYmd(now, tz);
  const to = addDays(from, 6); // exclusive — Monday…Saturday
  const today = ymd(now, tz);

  /* ONE READ COVERS BOTH the bloom and the hours ledger. The span is the whole
     local month OR this week, whichever starts earlier — on the 1st of a month
     that falls mid-week, the week reaches back into the previous one. */
  const monthFrom = `${today.slice(0, 7)}-01`;
  const spanFrom = monthFrom < from ? monthFrom : from;
  const spanTo = addDays(today, 1) > to ? addDays(today, 1) : to;

  const rows = await withRetry(
    () =>
      db
        .select({
          logDate: attendanceLogs.logDate,
          kind: attendanceLogs.kind,
          loggedAt: attendanceLogs.loggedAt,
        })
        .from(attendanceLogs)
        .where(
          and(
            eq(attendanceLogs.employeeId, employeeId),
            gte(attendanceLogs.logDate, spanFrom),
            lt(attendanceLogs.logDate, spanTo),
          ),
        )
        .orderBy(attendanceLogs.loggedAt),
    { timeoutMs: [...READ_BUDGET], label: "aura.myWorkShape" },
  );

  const byDay = new Map<string, { kind: "in" | "out"; at: Date }[]>();
  for (const r of rows) {
    const list = byDay.get(r.logDate) ?? [];
    list.push({ kind: r.kind, at: r.loggedAt });
    byDay.set(r.logDate, list);
  }

  const hourLoad = new Array<number>(STRIP_HOURS).fill(0);
  const letters = ["M", "T", "W", "T", "F", "S"];
  const days: WorkDay[] = [];
  let totalMinutes = 0;
  let todayIn: Date | null = null;
  let todayOut: Date | null = null;
  let todayMinutes = 0;

  for (let i = 0; i < 6; i++) {
    const day = addDays(from, i);
    const punches = byDay.get(day) ?? [];
    const isToday = day === today;

    let minutes = 0;
    let open: Date | null = null;
    let stillOpen = false;
    let firstIn: Date | null = null;
    let lastOut: Date | null = null;

    for (const p of punches) {
      if (p.kind === "in") {
        if (!open) open = p.at;
        if (!firstIn) firstIn = p.at;
      } else if (open) {
        minutes += Math.max(0, (p.at.getTime() - open.getTime()) / 60000);
        spreadOverHours(hourLoad, open, p.at, tz);
        lastOut = p.at;
        open = null;
      }
    }
    // An interval still running counts only on the day it is running.
    if (open && isToday) {
      minutes += Math.max(0, (now.getTime() - open.getTime()) / 60000);
      spreadOverHours(hourLoad, open, now, tz);
      stillOpen = true;
    }

    minutes = Math.round(minutes);
    totalMinutes += minutes;
    days.push({ ymd: day, letter: letters[i] ?? "?", minutes, open: stillOpen });

    if (isToday) {
      todayIn = firstIn;
      todayOut = stillOpen ? null : lastOut;
      todayMinutes = minutes;
    }
  }

  /* THE MONTH, from the same rows. Days are walked independently of the week
     above because a month and a week are different slices of one query, and
     double-counting the overlap would inflate both. */
  let monthMinutes = 0;
  let monthDaysPresent = 0;
  for (const [day, punches] of byDay) {
    if (day < monthFrom || day > today) continue;
    let minutes = 0;
    let open: Date | null = null;
    for (const p of punches) {
      if (p.kind === "in") {
        if (!open) open = p.at;
      } else if (open) {
        minutes += Math.max(0, (p.at.getTime() - open.getTime()) / 60000);
        open = null;
      }
    }
    if (open && day === today) minutes += Math.max(0, (now.getTime() - open.getTime()) / 60000);
    if (minutes > 0) {
      monthMinutes += minutes;
      monthDaysPresent++;
    }
  }

  /* The weekly target: the employee's own figure when they have one, otherwise
     their working days times their full-day length. Both columns are nullable,
     so the last fallback is a six-day 8-hour week — this company's default. */
  const fullDay = target?.fullDayMinutes ?? 480;
  const workDays = target?.workingDays?.length ?? 6;
  const weeklyTargetMinutes = target?.weeklyTargetMinutes ?? fullDay * workDays;

  // Normalise the strip to its own peak — it reads "when", not "how much".
  const peak = Math.max(...hourLoad, 1);
  const normalised = hourLoad.map((v) => v / peak);

  return {
    days,
    totalMinutes,
    monthMinutes: Math.round(monthMinutes),
    monthDaysPresent,
    weeklyTargetMinutes,
    hourLoad: normalised,
    today:
      todayIn || todayMinutes > 0
        ? {
            inLabel: todayIn ? clockLabel(todayIn, tz) : null,
            outLabel: todayOut ? clockLabel(todayOut, tz) : null,
            minutes: todayMinutes,
          }
        : null,
    ...readShape(days, normalised),
  };
}

/** Add a worked interval's minutes into the 7 AM–8 PM hour buckets. */
function spreadOverHours(into: number[], start: Date, end: Date, tz: string): void {
  const startMin = minutesOfDay(start, tz);
  // An interval that crosses local midnight would wrap to a smaller number;
  // extend past 24h rather than looping backwards through the day.
  const rawEnd = minutesOfDay(end, tz);
  const endMin = rawEnd >= startMin ? rawEnd : rawEnd + 24 * 60;

  for (let b = 0; b < STRIP_HOURS; b++) {
    const bucketFrom = (STRIP_FROM_HOUR + b) * 60;
    const bucketTo = bucketFrom + 60;
    const overlap = Math.min(endMin, bucketTo) - Math.max(startMin, bucketFrom);
    if (overlap > 0) into[b] = (into[b] ?? 0) + overlap;
  }
}

/**
 * Turn the week's numbers into the two lines the bloom is read by.
 *
 * Deliberately mechanical — every claim is a comparison of numbers already on
 * the page, so the sentence can never say something the chart contradicts.
 */
function readShape(days: WorkDay[], hourLoad: number[]): { tagline: string; description: string } {
  const worked = days.filter((d) => d.minutes > 0);
  if (worked.length === 0) {
    return {
      tagline: "No punches yet this week",
      description:
        "Your shape is drawn from attendance punches. Clock in and this fills as the week goes.",
    };
  }

  const total = worked.reduce((s, d) => s + d.minutes, 0);
  const firstHalf = days.slice(0, 3).reduce((s, d) => s + d.minutes, 0);
  const share = total > 0 ? firstHalf / total : 0;

  const busiest = worked.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const thinnest = worked.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nameOf = (d: WorkDay) => names[days.indexOf(d)] ?? "that day";

  // The first bucket carrying real load says when the day tends to start.
  const startBucket = hourLoad.findIndex((v) => v > 0.15);
  const startHour = STRIP_FROM_HOUR + (startBucket < 0 ? 3 : startBucket);
  const early = startHour <= 9;

  const tagline =
    share >= 0.6
      ? early
        ? "Front-loaded, early starter"
        : "Front-loaded week"
      : share <= 0.4
        ? "Back-loaded week"
        : early
          ? "Even week, early starter"
          : "Evenly spread";

  const hrs = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
  const description =
    `${Math.round(share * 100)}% of your ${hrs(total)} landed Monday to Wednesday, and your day ` +
    `tends to open around ${startHour > 12 ? startHour - 12 : startHour} ${startHour >= 12 ? "PM" : "AM"}. ` +
    (worked.length > 1
      ? `${nameOf(busiest)} is your heaviest day at ${hrs(busiest.minutes)}; ${nameOf(thinnest)} is your thinnest.`
      : `So far that is all on ${nameOf(busiest)}.`);

  return { tagline, description };
}

/* ──────────────────────── 2. attendance — company ───────────────────────── */

export interface AttendanceToday {
  present: number;
  late: number;
  onLeave: number;
  /** On the roster, not on leave, and with no punch at all today. */
  unmarked: number;
  total: number;
}

/**
 * The company-wide counters. ADMIN ONLY — these span the whole roster, which is
 * exactly why /attendance/live-status guards itself with `requireAdmin`. The
 * caller decides; this function does not check, so do not call it for a
 * non-admin.
 *
 * `lateAfter` is minutes past local midnight (the org's threshold, e.g. 10:50 →
 * 650); anyone whose first punch is after it counts late, and late people are
 * still present.
 */
export async function attendanceToday(
  tz: string,
  lateAfterMinutes: number,
  now: Date = new Date(),
): Promise<AttendanceToday> {
  const day = ymd(now, tz);

  const [roster, punches, leaves] = await withRetry(
    () =>
      Promise.all([
        db.select({ id: employees.id }).from(employees).where(eq(employees.isActive, true)),
        db
          .select({
            employeeId: attendanceLogs.employeeId,
            kind: attendanceLogs.kind,
            loggedAt: attendanceLogs.loggedAt,
          })
          .from(attendanceLogs)
          .where(eq(attendanceLogs.logDate, day)),
        db
          .select({ employeeId: leaveRequests.employeeId })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.status, "approved"),
              lte(leaveRequests.startDate, day),
              gte(leaveRequests.endDate, day),
            ),
          ),
      ]),
    { timeoutMs: [...READ_BUDGET], label: "aura.attendanceToday" },
  );

  const firstIn = new Map<string, Date>();
  for (const p of punches) {
    if (p.kind !== "in") continue;
    const seen = firstIn.get(p.employeeId);
    if (!seen || p.loggedAt < seen) firstIn.set(p.employeeId, p.loggedAt);
  }

  const onLeaveIds = new Set(leaves.map((l) => l.employeeId));
  let late = 0;
  for (const [, at] of firstIn) {
    if (minutesOfDay(at, tz) > lateAfterMinutes) late++;
  }

  const present = firstIn.size;
  const total = roster.length;
  // Someone on approved leave is accounted for, so they are not "unmarked".
  const unmarked = Math.max(
    0,
    roster.filter((r) => !firstIn.has(r.id) && !onLeaveIds.has(r.id)).length,
  );

  return { present, late, onLeave: onLeaveIds.size, unmarked, total };
}

/* ─────────────────────────────── 3. donuts ──────────────────────────────── */

export interface Slice {
  key: string;
  value: number;
  colour: string;
  /** Shown in the legend instead of the raw value when set. */
  label?: string;
}

export interface Donut {
  slices: Slice[];
  total: number;
  centre: { big: string; small: string };
  note: string;
}

/** The Eisenhower ramp, hottest first — one red, then warm to cool. */
const PRIORITY_COLOURS: Record<TaskPriority, string> = {
  imp_urgent: "#d81f12",
  imp_not_urgent: "#f0a52b",
  not_imp_urgent: "#4f7cf7",
  not_imp_not_urgent: "#9aa3c4",
};

/**
 * Donut 1 — YOUR OPEN WORK, by priority.
 *
 * This is the panel the mock spends on "where your week went, by workspace",
 * which cannot be computed here at all (see the file header). Priority is the
 * dimension the tasks table actually carries, and on a launcher it answers the
 * more useful question anyway: of everything still on you, how much is on fire.
 */
export async function openWorkByPriority(employeeId: string): Promise<Donut> {
  const rows = await withRetry(
    () =>
      db
        .select({ priority: tasks.priority })
        .from(tasks)
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.archived, false),
            inArray(tasks.status, [...PENDING_STATUSES]),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "aura.openWorkByPriority" },
  );

  const counts = new Map<TaskPriority, number>();
  for (const r of rows) counts.set(r.priority, (counts.get(r.priority) ?? 0) + 1);

  const slices: Slice[] = TASK_PRIORITIES.filter((p) => (counts.get(p) ?? 0) > 0).map((p) => ({
    key: PRIORITY_LABELS[p],
    value: counts.get(p) ?? 0,
    colour: PRIORITY_COLOURS[p],
  }));

  return {
    slices,
    total: rows.length,
    centre: { big: String(rows.length), small: rows.length === 1 ? "task open" : "tasks open" },
    note: "Everything still assigned to you, by priority",
  };
}

/**
 * Donut 2 — THIS MONTH'S OUTCOMES.
 *
 * Scoped by due date rather than creation date: "what was on me this month" is
 * the question a month-end review asks. Overdue is carved out of the pending
 * set so the one red slice means something — a pending task that is merely not
 * due yet is "in progress", not a problem.
 */
export async function monthOutcomes(
  employeeId: string,
  tz: string,
  now: Date = new Date(),
): Promise<Donut> {
  const { from, to } = monthBounds(now, tz);
  const fromAt = new Date(`${from}T00:00:00+05:30`);
  const toAt = new Date(`${to}T00:00:00+05:30`);

  const rows = await withRetry(
    () =>
      db
        .select({ status: tasks.status, dueAt: tasks.dueAt })
        .from(tasks)
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.archived, false),
            gte(tasks.dueAt, fromAt),
            lt(tasks.dueAt, toAt),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "aura.monthOutcomes" },
  );

  const pending = new Set<TaskStatus>(PENDING_STATUSES);
  let delivered = 0;
  let overdue = 0;
  let inProgress = 0;
  let notStarted = 0;

  for (const r of rows) {
    if (!pending.has(r.status)) {
      // done / approved and the legacy terminal values all landed somewhere.
      if (r.status === "done" || r.status === "approved") delivered++;
      continue;
    }
    if (r.dueAt && r.dueAt.getTime() < now.getTime()) overdue++;
    else if (r.status === "not_started" || r.status === "dont_know") notStarted++;
    else inProgress++;
  }

  const slices: Slice[] = [
    { key: "Delivered", value: delivered, colour: "#2fa36b" },
    { key: "In progress", value: inProgress, colour: "#4f7cf7" },
    { key: "Not started", value: notStarted, colour: "#9aa3c4" },
    { key: "Overdue", value: overdue, colour: "#d81f12" },
  ].filter((s) => s.value > 0);

  const total = rows.length;
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const monthName = new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "long" }).format(now);

  return {
    slices,
    total,
    centre: { big: `${pct}%`, small: "delivered" },
    note: `${total} due in ${monthName}`,
  };
}

/* ──────────────────────────── 4. the open table ─────────────────────────── */

export interface OpenItem {
  id: string;
  title: string;
  taskNo: number | null;
  client: string | null;
  priority: TaskPriority;
  priorityLabel: string;
  status: TaskStatus;
  dueAt: Date | null;
  overdue: boolean;
  /** Who gave you the task. */
  assigner: string | null;
}

/**
 * The table: what is open on you right now, soonest first, overdue at the top.
 *
 * The mock's columns are item / workspace / owner / due / value / status. There
 * is no workspace tag on any record and no monetary value on a task, so the
 * two that cannot be filled are replaced by the two the row genuinely has:
 * WHO GAVE IT TO YOU, and how urgent it is.
 */
export async function openItems(employeeId: string, limit = 6): Promise<OpenItem[]> {
  const rows = await withRetry(
    () =>
      db
        .select({
          id: tasks.id,
          taskNo: tasks.taskNo,
          title: tasks.title,
          subject: tasks.subject,
          client: tasks.client,
          priority: tasks.priority,
          status: tasks.status,
          dueAt: tasks.dueAt,
          assigner: employees.name,
        })
        .from(tasks)
        .leftJoin(employees, eq(employees.id, tasks.initiatorId))
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.archived, false),
            inArray(tasks.status, [...PENDING_STATUSES]),
            ne(tasks.initiatorId, employeeId),
          ),
        )
        // Nulls sort last on `desc` in Postgres, which is what we want: a task
        // with no due date is not urgent, it is unscheduled.
        .orderBy(desc(tasks.dueAt))
        .limit(200),
    { timeoutMs: [...READ_BUDGET], label: "aura.openItems" },
  );

  const now = Date.now();
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title || r.subject || r.client || `Task ${r.taskNo ?? ""}`.trim() || "Untitled task",
      taskNo: r.taskNo,
      client: r.client,
      priority: r.priority,
      priorityLabel: PRIORITY_LABELS[r.priority] ?? r.priority,
      status: r.status,
      dueAt: r.dueAt,
      overdue: r.dueAt != null && r.dueAt.getTime() < now,
      assigner: r.assigner,
    }))
    // Soonest first; anything undated goes to the back.
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity))
    .slice(0, limit);
}

/* ───────────────────────────── 5. what's next ───────────────────────────── */

export interface UpcomingDay {
  ymd: string;
  label: string;
  /** "in 3 days", "tomorrow", "today". */
  when: string;
}

/**
 * The next few company holidays.
 *
 * `holidays` is the one calendar every employee shares, it is admin-maintained,
 * and it is the thing people actually plan around — so it is the honest
 * "what's coming" widget. One indexed read on `holidays_date_idx`.
 */
export async function upcomingHolidays(
  tz: string,
  now: Date = new Date(),
  limit = 4,
): Promise<UpcomingDay[]> {
  const today = ymd(now, tz);
  const rows = await withRetry(
    () =>
      db
        .select({ holidayDate: holidays.holidayDate, label: holidays.label })
        .from(holidays)
        .where(and(eq(holidays.isActive, true), gte(holidays.holidayDate, today)))
        .orderBy(holidays.holidayDate)
        .limit(limit),
    { timeoutMs: [...READ_BUDGET], label: "aura.upcomingHolidays" },
  );

  return rows.map((r) => {
    const days = Math.round(
      (Date.parse(`${r.holidayDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
    );
    return {
      ymd: r.holidayDate,
      label: r.label,
      when: days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`,
    };
  });
}

/* ──────────────────────────── 6. your reports ───────────────────────────── */

export interface TeamMemberLoad {
  id: string;
  name: string;
  open: number;
  overdue: number;
}

/**
 * What is on each of your direct reports right now.
 *
 * MANAGERS ONLY, and scoped to `manager_id = you` — this is not a roster view,
 * it is the handful of people you are answerable for. Two indexed reads: the
 * reports, then their pending tasks in one pass.
 */
export async function teamLoad(managerId: string, now: Date = new Date()): Promise<TeamMemberLoad[]> {
  const reports = await withRetry(
    () =>
      db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(and(eq(employees.managerId, managerId), eq(employees.isActive, true)))
        .orderBy(employees.name),
    { timeoutMs: [...READ_BUDGET], label: "aura.teamLoad.reports" },
  );
  if (reports.length === 0) return [];

  const ids = reports.map((r) => r.id);
  const rows = await withRetry(
    () =>
      db
        .select({ doerId: tasks.doerId, dueAt: tasks.dueAt })
        .from(tasks)
        .where(
          and(
            inArray(tasks.doerId, ids),
            eq(tasks.archived, false),
            inArray(tasks.status, [...PENDING_STATUSES]),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "aura.teamLoad.tasks" },
  );

  const byDoer = new Map<string, { open: number; overdue: number }>();
  for (const r of rows) {
    const slot = byDoer.get(r.doerId) ?? { open: 0, overdue: 0 };
    slot.open++;
    if (r.dueAt && r.dueAt.getTime() < now.getTime()) slot.overdue++;
    byDoer.set(r.doerId, slot);
  }

  return reports
    .map((r) => ({ id: r.id, name: r.name, ...(byDoer.get(r.id) ?? { open: 0, overdue: 0 }) }))
    // Heaviest first: a manager scanning this wants the person in trouble, not
    // the alphabet.
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}


/* ─────────────────────────── 7. work anniversaries ─────────────────────── */

export interface Anniversary {
  id: string;
  name: string;
  /** "12 Sep". */
  dayLabel: string;
  /** Completed years on this anniversary. 0 means they joined this month. */
  years: number;
  /** Sorts the list; days from today, negative for already-passed this month. */
  offset: number;
}

/**
 * Who joined Altus in this calendar month, and how many years ago.
 *
 * `joined_at` is the only date on the employee row that marks an occasion — the
 * schema carries no date of birth, so this is work anniversaries only and the
 * widget says so rather than implying birthdays it cannot know.
 */
export async function anniversariesThisMonth(
  tz: string,
  now: Date = new Date(),
  limit = 6,
): Promise<Anniversary[]> {
  const today = ymd(now, tz);
  const month = Number(today.slice(5, 7));
  const dayOfMonth = Number(today.slice(8, 10));
  const thisYear = Number(today.slice(0, 4));

  const rows = await withRetry(
    () =>
      db
        .select({ id: employees.id, name: employees.name, joinedAt: employees.joinedAt })
        .from(employees)
        .where(and(eq(employees.isActive, true), isNotNull(employees.joinedAt))),
    { timeoutMs: [...READ_BUDGET], label: "aura.anniversaries" },
  );

  const out: Anniversary[] = [];
  for (const r of rows) {
    if (!r.joinedAt) continue;
    // Read the join date IN THE VIEWER'S ZONE. A timestamp stored at UTC
    // midnight is the previous day in a negative offset and the same day in
    // IST — the anniversary has to be the date the person experienced.
    const joined = ymd(r.joinedAt, tz);
    if (Number(joined.slice(5, 7)) !== month) continue;
    const day = Number(joined.slice(8, 10));
    out.push({
      id: r.id,
      name: r.name,
      dayLabel: new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" })
        .format(r.joinedAt),
      years: Math.max(0, thisYear - Number(joined.slice(0, 4))),
      offset: day - dayOfMonth,
    });
  }

  // Upcoming first, then the ones already past this month.
  return out
    .sort((a, b) => (a.offset >= 0 ? a.offset : 1000 - a.offset) - (b.offset >= 0 ? b.offset : 1000 - b.offset))
    .slice(0, limit);
}

/* ─────────────────────────── 8. what you gave out ──────────────────────── */

export interface DelegatedLoad {
  id: string;
  name: string;
  open: number;
  overdue: number;
}

/**
 * Tasks YOU handed to other people and that are still open, by person.
 *
 * The mirror of "Open on you": the other half of a manager's day is what they
 * are waiting on. Distinct from the team widget — this is anyone you assigned
 * to, reports or not.
 */
export async function delegatedLoad(
  employeeId: string,
  now: Date = new Date(),
  limit = 6,
): Promise<DelegatedLoad[]> {
  const rows = await withRetry(
    () =>
      db
        .select({ doerId: tasks.doerId, name: employees.name, dueAt: tasks.dueAt })
        .from(tasks)
        .leftJoin(employees, eq(employees.id, tasks.doerId))
        .where(
          and(
            eq(tasks.initiatorId, employeeId),
            ne(tasks.doerId, employeeId),
            eq(tasks.archived, false),
            inArray(tasks.status, [...PENDING_STATUSES]),
          ),
        ),
    { timeoutMs: [...READ_BUDGET], label: "aura.delegatedLoad" },
  );

  const by = new Map<string, DelegatedLoad>();
  for (const r of rows) {
    const slot = by.get(r.doerId) ?? { id: r.doerId, name: r.name ?? "Unknown", open: 0, overdue: 0 };
    slot.open++;
    if (r.dueAt && r.dueAt.getTime() < now.getTime()) slot.overdue++;
    by.set(r.doerId, slot);
  }

  return [...by.values()]
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
    .slice(0, limit);
}


/* ───────────────────────────── the one entry ────────────────────────────── */

export interface AuraDashboard {
  shape: MyWorkShape | null;
  attendance: AttendanceToday | null;
  openWork: Donut | null;
  outcomes: Donut | null;
  items: OpenItem[];
  upcoming: UpcomingDay[];
  team: TeamMemberLoad[];
  anniversaries: Anniversary[];
  delegated: DelegatedLoad[];
}

/**
 * Everything the dashboard draws, in one round of parallel reads.
 *
 * Each section is caught on its own so one failure costs one panel. `isAdmin`
 * gates the roster-wide attendance counters — see `attendanceToday`.
 */
export async function loadAuraDashboard(opts: {
  employeeId: string;
  isAdmin: boolean;
  /** Only a manager with reports gets the team widget's two queries run at all. */
  isManager: boolean;
  tz: string;
  lateAfterMinutes: number;
  /** The employee's own attendance targets, for the hours ledger. */
  target?: {
    weeklyTargetMinutes: number | null;
    fullDayMinutes: number | null;
    workingDays: number[] | null;
  };
  now?: Date;
}): Promise<AuraDashboard> {
  const now = opts.now ?? new Date();
  const [shape, attendance, openWork, outcomes, items, upcoming, team, anniversaries, delegated] =
    await Promise.all([
      myWorkShape(opts.employeeId, opts.tz, now, opts.target).catch(() => null),
      opts.isAdmin
        ? attendanceToday(opts.tz, opts.lateAfterMinutes, now).catch(() => null)
        : Promise.resolve(null),
      openWorkByPriority(opts.employeeId).catch(() => null),
      monthOutcomes(opts.employeeId, opts.tz, now).catch(() => null),
      openItems(opts.employeeId).catch((): OpenItem[] => []),
      upcomingHolidays(opts.tz, now).catch((): UpcomingDay[] => []),
      opts.isManager
        ? teamLoad(opts.employeeId, now).catch((): TeamMemberLoad[] => [])
        : Promise.resolve<TeamMemberLoad[]>([]),
      anniversariesThisMonth(opts.tz, now).catch((): Anniversary[] => []),
      delegatedLoad(opts.employeeId, now).catch((): DelegatedLoad[] => []),
    ]);
  return { shape, attendance, openWork, outcomes, items, upcoming, team, anniversaries, delegated };
}

/** "10:50" → 650. Exported so the page can turn the org threshold into minutes. */
export function hhmmToMinutes(hhmm: string | null | undefined, fallback = 650): number {
  if (!hhmm) return fallback;
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || Number.isNaN(h)) return fallback;
  return h * 60 + (Number.isNaN(m) ? 0 : (m ?? 0));
}
