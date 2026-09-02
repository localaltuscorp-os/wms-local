import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, dccEntries, dccKpiItems, dccReviews, employees, type Employee } from "@/db/schema";
import { listOwnerItems, listItemsForOwners, type DccItemRow, type DccEntryRow } from "@/lib/queries/dcc";
import { loadDccScope } from "@/lib/dcc/access";
import { scheduledDueOn } from "@/lib/dcc/util";
import { localDateString } from "@/lib/format";

const TZ = "Asia/Kolkata"; // org timezone — attendance log_date is stored in IST

/** Add `delta` calendar days to a YYYY-MM-DD string (pure, no tz drift). */
function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * DCC compliance gate. Two enforcement points share one rule:
 *   • Morning layout gate  — fill the most recent present working day's DCC.
 *   • Evening punch-out     — today's DCC must be filled before clocking out.
 *
 * "Present working day" = the employee has an in-punch that date (so absent,
 * holiday, weekly-off and on-leave days — which carry no in-punch — are skipped
 * automatically; "fetch from attendance"). All reads are cheap + day-scoped;
 * callers wrap in `.catch()` so a DB hiccup never gates/blocks (fail-open).
 */

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Items DUE on `ymd` (by weekday mask) + that day's entries. */
async function dueForDay(employeeId: string, ymd: string): Promise<{ due: DccItemRow[]; entries: DccEntryRow[] }> {
  const items = await listOwnerItems(employeeId);
  const day = ymdToDate(ymd);
  const due = items.filter((it) => scheduledDueOn(it, day));
  if (due.length === 0) return { due: [], entries: [] };
  const ids = due.map((i) => i.id);
  const entries = (await db
    .select({ itemId: dccEntries.itemId, entryDate: dccEntries.entryDate, status: dccEntries.status, valueNumber: dccEntries.valueNumber, note: dccEntries.note })
    .from(dccEntries)
    .where(and(inArray(dccEntries.itemId, ids), eq(dccEntries.entryDate, ymd)))) as DccEntryRow[];
  return { due, entries };
}

function unfilledCount(due: DccItemRow[], entries: DccEntryRow[]): number {
  const filled = new Set(entries.filter((e) => (e.status ?? "").trim()).map((e) => e.itemId));
  return due.filter((i) => !filled.has(i.id)).length;
}

export interface DccGateTarget {
  date: string;
  items: DccItemRow[];
  entries: DccEntryRow[];
}

/**
 * The day whose DCC must be filled before the app opens, or null to pass.
 * Walks back from yesterday up to 7 days to the FIRST present working day; if
 * its due items aren't all filled, that day is the target. Only ever requires
 * the single most recent present working day (no backlog wall).
 */
export async function dccGateTarget(employeeId: string, now: Date = new Date()): Promise<DccGateTarget | null> {
  const today = localDateString(TZ, now);
  const candidates: string[] = []; // most-recent-first
  for (let back = 1; back <= 7; back++) candidates.push(addDaysYmd(today, -back));

  // ONE query for the whole 7-day window (no per-day round-trips).
  const punches = (await db
    .select({ logDate: attendanceLogs.logDate })
    .from(attendanceLogs)
    .where(and(eq(attendanceLogs.employeeId, employeeId), inArray(attendanceLogs.logDate, candidates), eq(attendanceLogs.kind, "in")))) as Array<{ logDate: string }>;
  const present = new Set(punches.map((p) => p.logDate));
  const target = candidates.find((d) => present.has(d)); // most recent present working day
  if (!target) return null; // absent/holiday/off the whole window → nothing to gate

  const { due, entries } = await dueForDay(employeeId, target);
  if (due.length === 0) return null;
  return unfilledCount(due, entries) > 0 ? { date: target, items: due, entries } : null;
}

/** Is `ymd`'s DCC fully filled for this employee? (Punch-out block.) */
export async function isDccFilledFor(employeeId: string, ymd: string): Promise<boolean> {
  const { due, entries } = await dueForDay(employeeId, ymd);
  return due.length === 0 || unfilledCount(due, entries) === 0;
}

// ── Manager morning review gate ───────────────────────────────────────────────

export interface DccReviewReport {
  id: string;
  name: string;
  avatarUrl: string | null;
  date: string;
  due: number;
  done: number;
  reviewed: boolean;
}
export interface DccManagerReviewState {
  satisfied: boolean;
  date: string;
  reports: DccReviewReport[];
}

/**
 * Managers must review each present report's yesterday DCC before the app
 * opens. Review date = yesterday; reports absent yesterday (no in-punch) are
 * exempt. Satisfied once every present report has a dcc_reviews row.
 */
export async function dccManagerReviewState(me: Employee, now: Date = new Date()): Promise<DccManagerReviewState> {
  // Review sign-off is scoped to DIRECT reports (employees.manager_id === me),
  // for EVERYONE incl. super-admins — a manager signs off only their own team,
  // not the whole company (the old super-admin scope showed all 16). The DCC
  // module (viewing) can still see wider via loadDccScope; this is just the gate.
  const directReports = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.managerId, me.id), eq(employees.isActive, true)));
  const reportIds = directReports.map((r) => r.id);
  const date = addDaysYmd(localDateString(TZ, now), -1);
  if (reportIds.length === 0) return { satisfied: true, date, reports: [] };

  // Five BATCHED queries in parallel — NO per-report loop (was the N+1 that made
  // the gate render take seconds for a super-admin and choke the pool).
  const [punchRows, reviewRows, people, items, entryRows] = await Promise.all([
    db.select({ employeeId: attendanceLogs.employeeId }).from(attendanceLogs).where(and(inArray(attendanceLogs.employeeId, reportIds), eq(attendanceLogs.logDate, date), eq(attendanceLogs.kind, "in"))) as Promise<Array<{ employeeId: string }>>,
    db.select({ owner: dccReviews.ownerEmployeeId }).from(dccReviews).where(and(inArray(dccReviews.ownerEmployeeId, reportIds), eq(dccReviews.reviewDate, date))) as Promise<Array<{ owner: string }>>,
    db.select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl }).from(employees).where(inArray(employees.id, reportIds)) as Promise<Array<{ id: string; name: string; avatarUrl: string | null }>>,
    listItemsForOwners(reportIds),
    db.select({ owner: dccKpiItems.ownerEmployeeId, itemId: dccEntries.itemId, status: dccEntries.status }).from(dccEntries).innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id)).where(and(inArray(dccKpiItems.ownerEmployeeId, reportIds), eq(dccEntries.entryDate, date))) as Promise<Array<{ owner: string; itemId: string; status: string | null }>>,
  ]);

  const presentIds = new Set(punchRows.map((p) => p.employeeId));
  if (presentIds.size === 0) return { satisfied: true, date, reports: [] };
  const reviewed = new Set(reviewRows.map((r) => r.owner));

  const day = ymdToDate(date);
  const itemsByOwner = new Map<string, typeof items>();
  for (const it of items) { const l = itemsByOwner.get(it.ownerEmployeeId); if (l) l.push(it); else itemsByOwner.set(it.ownerEmployeeId, [it]); }
  const doneByOwner = new Map<string, Set<string>>();
  for (const e of entryRows) {
    if ((e.status ?? "").toLowerCase() !== "done") continue;
    const s = doneByOwner.get(e.owner); if (s) s.add(e.itemId); else doneByOwner.set(e.owner, new Set([e.itemId]));
  }

  const reports: DccReviewReport[] = people
    .filter((p) => presentIds.has(p.id))
    .map((p) => {
      const own = itemsByOwner.get(p.id) ?? [];
      const due = own.filter((it) => scheduledDueOn(it, day));
      const doneSet = doneByOwner.get(p.id) ?? new Set<string>();
      return { id: p.id, name: p.name, avatarUrl: p.avatarUrl, date, due: due.length, done: due.filter((it) => doneSet.has(it.id)).length, reviewed: reviewed.has(p.id) };
    });
  reports.sort((a, b) => a.name.localeCompare(b.name));
  return { satisfied: reports.every((r) => r.reviewed), date, reports };
}
