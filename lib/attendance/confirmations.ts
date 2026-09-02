import "server-only";
import { createHash } from "node:crypto";
import { and, between, eq, inArray, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, approvalTokens, employees, type Employee } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import { loadDccScope } from "@/lib/dcc/access";
import { localDateString } from "@/lib/format";

/**
 * WS-5 — Monday attendance confirmations.
 *
 * Every Monday two confirmations must happen for the PRIOR week:
 *   • Each MANAGER confirms the attendance of their reports who work OUTSIDE
 *     the office (field staff whose punches a manager must vouch for).
 *   • The ACCOUNTANT confirms the MANAGERS' own outside-office attendance.
 *
 * This module exposes the queue data + a confirm action. Confirmation is
 * recorded on the existing `approval_tokens` spine (migration 0121) so the
 * sibling dispatch agent's emailed one-click token flow writes to the SAME
 * ledger. Notifications/email are OUT of scope here — see the TODO hook in
 * `confirmWeekAttendance`.
 *
 * SAFETY: gated behind `MONDAY_CONFIRM_UI` (default OFF). This slice records an
 * approval; it does NOT itself change any attendance number. "Outside office"
 * is read via raw SQL and FAILS OPEN (empty) until its column exists.
 */

const TZ = "Asia/Kolkata";
export const CONFIRM_KIND = "attendance_week_confirm" as const;
export const CONFIRM_ACTION = "confirm" as const;

/** Default ON (Sir 2026-07-09 — reveal the confirmation queue). Confirmations are
 *  an audit sign-off; they do NOT change pay (that's SALARY_V2, off) or mark
 *  anyone absent (that's DCC_ABSENT, off). Killable in prod via MONDAY_CONFIRM_UI=false. */
export function mondayConfirmUiEnabled(): boolean {
  return process.env.MONDAY_CONFIRM_UI !== "false";
}

// ── date helpers (IST, pure YYYY-MM-DD math) ─────────────────────────────────

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
/** Weekday 0=Sun..6=Sat of a calendar date. */
function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export interface WeekRange {
  /** Monday YYYY-MM-DD (the confirmation key anchor). */
  start: string;
  /** Sunday YYYY-MM-DD. */
  end: string;
  /** All 7 YYYY-MM-DD days Mon→Sun. */
  days: string[];
  /** Human label, e.g. "30 Jun – 6 Jul 2026". */
  label: string;
}

/** The prior calendar week (Mon–Sun) relative to `now` in IST. */
export function priorWeekRange(now: Date = new Date()): WeekRange {
  const today = localDateString(TZ, now);
  const dow = weekdayOf(today); // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7; // days since this week's Monday
  const thisMonday = addDaysYmd(today, -backToMonday);
  const start = addDaysYmd(thisMonday, -7);
  const end = addDaysYmd(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(start, i));
  return { start, end, days, label: labelRange(start, end) };
}

function labelRange(start: string, end: string): string {
  const fmt = (ymd: string, withYear: boolean) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });
  };
  return `${fmt(start, false)} – ${fmt(end, true)}`;
}

// ── "outside office" roster (fail-open until the column lands) ────────────────

/**
 * Ids of employees flagged as working OUTSIDE the office. Read via raw SQL so
 * this compiles before the `works_outside_office` column exists; any error
 * (missing column, DB hiccup) FAILS OPEN to an empty set → an empty queue,
 * never a crash. See the integration note for the additive DDL.
 */
export async function outsideOfficeIds(): Promise<Set<string>> {
  try {
    const res = await db.execute(
      sql`select id from employees where works_outside_office = true and is_active = true`,
    );
    const rows = (res as unknown as { rows?: Array<{ id: string }> }).rows ?? (res as unknown as Array<{ id: string }>);
    return new Set((rows ?? []).map((r) => r.id));
  } catch {
    return new Set<string>();
  }
}

// ── queue model ──────────────────────────────────────────────────────────────

export type ConfirmMode = "manager" | "accountant" | "none";

export interface DayCell {
  date: string;
  weekday: number; // 0=Sun..6=Sat
  weeklyOff: boolean;
  present: boolean;
}
export interface ConfirmRow {
  employeeId: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  cells: DayCell[];
  presentDays: number;
  absentDays: number; // working (non weekly-off) days with no in-punch
  confirmed: boolean;
  confirmedAt: string | null;
}
export interface MondayConfirmQueue {
  mode: ConfirmMode;
  week: WeekRange;
  rows: ConfirmRow[];
  /** How many still need confirming. */
  pending: number;
}

/** Deterministic in-app token hash → idempotent re-confirm (one row per
 *  owner+week). Emailed one-click tokens use their own random hashes. */
export function inAppTokenHash(ownerEmployeeId: string, weekStart: string): string {
  return createHash("sha256").update(`inapp:${CONFIRM_KIND}:${ownerEmployeeId}:${weekStart}`).digest("hex");
}
/** Target key stored on the approval row. */
export function confirmTargetId(ownerEmployeeId: string, weekStart: string): string {
  return `${ownerEmployeeId}:${weekStart}`;
}

/**
 * Resolve the confirmation queue for the signed-in viewer.
 *
 * Manager (has downline): their reports who work outside the office.
 * Accountant (Accounts dept or super-admin): managers who work outside the
 * office. Super-admins fall into the accountant lane. Everyone else: mode
 * "none", empty rows.
 */
export async function getMondayConfirmQueue(me: Employee, now: Date = new Date()): Promise<MondayConfirmQueue> {
  const week = priorWeekRange(now);
  const empty: MondayConfirmQueue = { mode: "none", week, rows: [], pending: 0 };

  try {
    const outside = await outsideOfficeIds();

    const superAdmin = isSuperAdmin(me.email);
    let isAccountant = superAdmin;
    if (!isAccountant) {
      const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
      const depts = me.department ? [...structured, me.department] : structured;
      isAccountant = matchesDepartment(depts, ACCOUNTS_DEPARTMENT);
    }

    // Active roster (id, name, avatar, dept, weeklyOff, managerId) once.
    const roster = await db
      .select({
        id: employees.id,
        name: employees.name,
        avatarUrl: employees.avatarUrl,
        department: employees.department,
        weeklyOff: employees.weeklyOff,
        managerId: employees.managerId,
      })
      .from(employees)
      .where(eq(employees.isActive, true));

    // Set of people who ARE a manager (someone reports to them).
    const managerIds = new Set<string>();
    for (const r of roster) if (r.managerId) managerIds.add(r.managerId);

    let mode: ConfirmMode = "none";
    let targetIds: string[] = [];

    if (isAccountant) {
      mode = "accountant";
      // Managers who work outside the office.
      targetIds = roster.filter((r) => managerIds.has(r.id) && outside.has(r.id)).map((r) => r.id);
    } else {
      // Manager lane: my downline (via DCC scope hierarchy) who work outside.
      const scope = await loadDccScope(me);
      const downline = [...scope.visibleIds].filter((id) => id !== me.id);
      if (downline.length > 0) {
        mode = "manager";
        const outsideDownline = new Set(downline.filter((id) => outside.has(id)));
        targetIds = roster.filter((r) => outsideDownline.has(r.id)).map((r) => r.id);
      }
    }

    if (mode === "none" || targetIds.length === 0) {
      return { ...empty, mode };
    }

    const byId = new Map(roster.map((r) => [r.id, r] as const));

    // Prior-week in-punches for the targets (load-light: one grouped read).
    const punches = await db
      .select({ employeeId: attendanceLogs.employeeId, logDate: attendanceLogs.logDate })
      .from(attendanceLogs)
      .where(
        and(
          inArray(attendanceLogs.employeeId, targetIds),
          between(attendanceLogs.logDate, week.start, week.end),
          eq(attendanceLogs.kind, "in"),
        ),
      );
    const presentByEmp = new Map<string, Set<string>>();
    for (const p of punches) {
      const s = presentByEmp.get(p.employeeId);
      if (s) s.add(p.logDate);
      else presentByEmp.set(p.employeeId, new Set([p.logDate]));
    }

    // Existing confirmations for this week (any row, usedAt not null).
    const targetKeys = targetIds.map((id) => confirmTargetId(id, week.start));
    const confirms = await db
      .select({ targetId: approvalTokens.targetId, usedAt: approvalTokens.usedAt })
      .from(approvalTokens)
      .where(
        and(
          eq(approvalTokens.kind, CONFIRM_KIND),
          inArray(approvalTokens.targetId, targetKeys),
          isNotNull(approvalTokens.usedAt),
        ),
      );
    const confirmedAtByTarget = new Map<string, string>();
    for (const c of confirms) {
      if (c.usedAt) confirmedAtByTarget.set(c.targetId, c.usedAt.toISOString());
    }

    const rows: ConfirmRow[] = targetIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const present = presentByEmp.get(r.id) ?? new Set<string>();
        const cells: DayCell[] = week.days.map((date) => {
          const wd = weekdayOf(date);
          return { date, weekday: wd, weeklyOff: wd === r.weeklyOff, present: present.has(date) };
        });
        const presentDays = cells.filter((c) => c.present).length;
        const absentDays = cells.filter((c) => !c.weeklyOff && !c.present).length;
        const key = confirmTargetId(r.id, week.start);
        const confirmedAt = confirmedAtByTarget.get(key) ?? null;
        return {
          employeeId: r.id,
          name: r.name,
          avatarUrl: r.avatarUrl,
          department: r.department,
          cells,
          presentDays,
          absentDays,
          confirmed: confirmedAt !== null,
          confirmedAt,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { mode, week, rows, pending: rows.filter((r) => !r.confirmed).length };
  } catch {
    // Fail-open: the queue is read-only context; never crash the page.
    return empty;
  }
}

// ── confirm write ────────────────────────────────────────────────────────────

/** Whether `me` is permitted to confirm `ownerEmployeeId`'s week (re-derives
 *  the same lanes as the queue so the action can't be forged past the UI). */
export async function canConfirmFor(me: Employee, ownerEmployeeId: string): Promise<boolean> {
  const queue = await getMondayConfirmQueue(me);
  return queue.rows.some((r) => r.employeeId === ownerEmployeeId);
}

/**
 * Record `me`'s confirmation of `ownerEmployeeId`'s attendance for `weekStart`
 * (Monday YYYY-MM-DD). Idempotent via a deterministic in-app token hash, so a
 * double-click / re-confirm is a no-op update. Returns the confirmedAt ISO.
 *
 * NOTE: dispatch (WhatsApp + email one-click) is a sibling agent's slice — this
 * only writes the ledger row. See the TODO hook below.
 */
export async function confirmWeekAttendance(
  me: Employee,
  ownerEmployeeId: string,
  weekStart: string,
): Promise<{ ok: true; confirmedAt: string } | { ok: false; error: string }> {
  if (!mondayConfirmUiEnabled()) return { ok: false, error: "Monday confirmations are not enabled." };
  const allowed = await canConfirmFor(me, ownerEmployeeId);
  if (!allowed) return { ok: false, error: "You can't confirm this person's week." };

  const now = new Date();
  // A confirmation lives for ~90 days (audit window); it is created already-used.
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  try {
    await db
      .insert(approvalTokens)
      .values({
        tokenHash: inAppTokenHash(ownerEmployeeId, weekStart),
        kind: CONFIRM_KIND,
        targetId: confirmTargetId(ownerEmployeeId, weekStart),
        action: CONFIRM_ACTION,
        createdById: me.id,
        expiresAt,
        usedAt: now,
      })
      .onConflictDoUpdate({
        target: approvalTokens.tokenHash,
        set: { usedAt: now, createdById: me.id },
      });
    // TODO(dispatch-agent): fire the "attendance confirmed" hook here so the
    //   emailed one-click token (if any) is superseded and the owner + payroll
    //   are notified. Left as a no-op in this slice.
    return { ok: true, confirmedAt: now.toISOString() };
  } catch {
    return { ok: false, error: "Couldn't save the confirmation. Try again." };
  }
}
