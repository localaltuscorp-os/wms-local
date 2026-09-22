import "server-only";
import { after } from "next/server";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccCalendarEvents, dccEntries, dccKpiItems, employees } from "@/db/schema";
import { localDateString } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import {
  accessTokenFromRefresh,
  deleteEventById,
  GoogleApiError,
  insertEventBody,
  isGoogleConfigured,
  isRevokedGrant,
  patchEventBody,
} from "@/lib/google/calendar";
import { activeFromOf, loadFirstEntryDates } from "@/lib/queries/dcc-dashboard";
import { buildPersonReports, type ReportEntry, type ReportItem } from "./daily-report";
import { addDaysYmd } from "./dashboard";
import { buildDccCalendarEvent, dccEventHash, planDccCalendarAction, type DccCalendarEvent } from "./calendar-event";

/**
 * DCC → GOOGLE CALENDAR SYNC (account holder, 2026-09-15).
 *
 * Brings each connected employee's DCC day events to the state in the WMS —
 * create, update, or remove — and records what was sent in
 * `dcc_calendar_events`. Three callers share this one worker:
 *
 *   · LIVE — every DCC fill and every KPI add / edit / delete schedules a sync
 *     of that person-day after the response (`scheduleDccCalendarSync`).
 *   · CRON — /api/cron/dcc-calendar-sync puts today's event on every calendar
 *     just after midnight and repairs anything the live path missed.
 *   · CONNECT — the Google OAuth callback backfills the person's whole history.
 *
 * ── NO DUPLICATES, NO STALE OVERWRITES ───────────────────────────────────
 * Ticking five KPIs in a row starts five syncs of the same day at once. Each
 * person-day is handled under a Postgres advisory lock, re-reading its row
 * inside the lock, so only the first creates the event and the rest update
 * it. Each run notes when it read the data (`snapshotAt`); a day already synced
 * from a later read is skipped, so a slow run never replaces newer content.
 *
 * ── NEVER IN THE WAY ─────────────────────────────────────────────────────
 * Nothing here throws to a caller: a Google failure is logged and recorded on
 * the row, and the next run retries it. A save in the WMS never waits on Google.
 * A revoked grant clears the stored token, so the connect prompt asks again.
 */

export interface DccCalendarSyncOptions {
  /** Only these employees (default: every connected active employee). */
  employeeIds?: string[];
  /** First day to check (default: when the person's DCC began). */
  from?: string;
  /** Last day to check (default and cap: today in IST). */
  to?: string;
  /** Stop starting new work after this long. */
  budgetMs?: number;
  /** Count what would change without calling Google or writing rows. */
  dryRun?: boolean;
}

export interface DccCalendarSyncStats {
  people: number;
  days: number;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  failed: number;
  disconnected: number;
  timedOut: boolean;
}

type StepOutcome = "created" | "updated" | "deleted" | "unchanged" | "failed" | "revoked";

const RETRY = { attempts: 3, timeoutMs: [8000, 12000, 16000] } as const;

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

export async function syncDccCalendar(opts: DccCalendarSyncOptions = {}): Promise<DccCalendarSyncStats> {
  const stats: DccCalendarSyncStats = {
    people: 0, days: 0, created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 0, disconnected: 0, timedOut: false,
  };
  if (!isGoogleConfigured()) return stats;
  if (opts.employeeIds && opts.employeeIds.length === 0) return stats;

  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 240_000;
  // Taken BEFORE any read: every write committed earlier is visible below.
  const snapshotAt = new Date();
  const today = localDateString("Asia/Kolkata", snapshotAt);
  const to = opts.to && opts.to < today ? opts.to : today;

  const people = await withRetry(
    () =>
      db
        .select({ id: employees.id, name: employees.name, managerId: employees.managerId, token: employees.googleRefreshToken })
        .from(employees)
        .where(
          and(
            eq(employees.isActive, true),
            isNotNull(employees.googleRefreshToken),
            opts.employeeIds ? inArray(employees.id, opts.employeeIds) : undefined,
          ),
        ),
    { ...RETRY, timeoutMs: [...RETRY.timeoutMs], label: "dcc-calendar-people" },
  );
  if (people.length === 0) return stats;
  const ids = people.map((p) => p.id);

  const [itemRows, firstEntries] = await Promise.all([
    withRetry(
      () =>
        db
          .select({
            id: dccKpiItems.id,
            ownerEmployeeId: dccKpiItems.ownerEmployeeId,
            section: dccKpiItems.section,
            code: dccKpiItems.code,
            title: dccKpiItems.title,
            frequency: dccKpiItems.frequency,
            weekdays: dccKpiItems.weekdays,
            scheduleKind: dccKpiItems.scheduleKind,
            isParticipantList: dccKpiItems.isParticipantList,
            createdAt: dccKpiItems.createdAt,
          })
          .from(dccKpiItems)
          .where(and(inArray(dccKpiItems.ownerEmployeeId, ids), eq(dccKpiItems.archived, false)))
          .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
      { ...RETRY, timeoutMs: [...RETRY.timeoutMs], label: "dcc-calendar-items" },
    ),
    loadFirstEntryDates(ids),
  ]);

  const itemsByOwner = new Map<string, ReportItem[]>();
  for (const { createdAt, ...it } of itemRows) {
    const item: ReportItem = { ...it, activeFrom: activeFromOf(createdAt, firstEntries.get(it.id)) };
    const list = itemsByOwner.get(it.ownerEmployeeId);
    if (list) list.push(item);
    else itemsByOwner.set(it.ownerEmployeeId, [item]);
  }

  const fromFor = (ownerId: string): string => {
    if (opts.from) return opts.from;
    let first: string | null = null;
    for (const it of itemsByOwner.get(ownerId) ?? []) {
      if (it.activeFrom && (!first || it.activeFrom < first)) first = it.activeFrom;
    }
    return first ?? to;
  };
  const globalFrom = ids.map(fromFor).reduce((a, b) => (b < a ? b : a), to);
  if (globalFrom > to) return stats;

  const entryRows = await withRetry(
    () =>
      db
        .select({
          itemId: dccEntries.itemId,
          entryDate: dccEntries.entryDate,
          status: dccEntries.status,
          valueNumber: dccEntries.valueNumber,
          note: dccEntries.note,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(
          and(
            inArray(dccKpiItems.ownerEmployeeId, ids),
            gte(dccEntries.entryDate, globalFrom),
            lte(dccEntries.entryDate, to),
            isNull(dccEntries.subjectId),
          ),
        ),
    { ...RETRY, timeoutMs: [...RETRY.timeoutMs], label: "dcc-calendar-entries" },
  );
  const entriesByDay = new Map<string, ReportEntry[]>();
  for (const { entryDate, ...e } of entryRows) {
    const list = entriesByDay.get(entryDate);
    if (list) list.push(e);
    else entriesByDay.set(entryDate, [e]);
  }

  const appUrl = siteUrl();

  outer: for (const p of people) {
    if (!p.token) continue;
    const token = p.token;
    const personItems = itemsByOwner.get(p.id) ?? [];
    const from = fromFor(p.id);
    const employee = { id: p.id, name: p.name, managerId: p.managerId, address: null };
    let accessToken: Promise<string> | null = null;
    const getAccessToken = () => (accessToken ??= accessTokenFromRefresh(token));
    stats.people++;

    // Newest first: if the budget runs out, today and yesterday are already done.
    for (let day = to; day >= from; day = addDaysYmd(day, -1)) {
      if (Date.now() - started > budgetMs) {
        stats.timedOut = true;
        break outer;
      }
      stats.days++;
      const report = buildPersonReports([employee], personItems, entriesByDay.get(day) ?? [], day)[0];
      const event = report ? buildDccCalendarEvent(report, day, appUrl) : null;
      const outcome = await syncPersonDay({
        employeeId: p.id,
        day,
        desired: event ? { event, hash: dccEventHash(event) } : null,
        snapshotAt,
        getAccessToken,
        dryRun: opts.dryRun ?? false,
      }).catch((err: unknown): StepOutcome => {
        console.error(`[dcc-calendar] SYNC FAILED employee=${p.id} day=${day} :: ${errorText(err)}`);
        return "failed";
      });

      if (outcome === "revoked") {
        stats.disconnected++;
        await forgetRevokedToken(p.id, token);
        continue outer;
      }
      stats[outcome]++;
    }
  }
  return stats;
}

async function syncPersonDay(args: {
  employeeId: string;
  day: string;
  desired: { event: DccCalendarEvent; hash: string } | null;
  snapshotAt: Date;
  getAccessToken: () => Promise<string>;
  dryRun: boolean;
}): Promise<StepOutcome> {
  const { employeeId, day, snapshotAt } = args;
  const lockKey = `dcc-calendar:${employeeId}:${day}`;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const [row] = await tx
      .select({
        googleEventId: dccCalendarEvents.googleEventId,
        syncedHash: dccCalendarEvents.syncedHash,
        snapshotAt: dccCalendarEvents.snapshotAt,
      })
      .from(dccCalendarEvents)
      .where(and(eq(dccCalendarEvents.employeeId, employeeId), eq(dccCalendarEvents.eventDate, day)))
      .limit(1);

    const action = planDccCalendarAction(args.desired, row ?? null, snapshotAt);
    if (action.kind === "skip") return "unchanged";
    if (args.dryRun) return action.kind === "create" ? "created" : action.kind === "update" ? "updated" : "deleted";

    try {
      const accessToken = await args.getAccessToken();
      let eventId: string | null;
      let outcome: StepOutcome;
      if (action.kind === "delete") {
        await deleteEventById(accessToken, action.eventId);
        eventId = null;
        outcome = "deleted";
      } else if (action.kind === "update") {
        try {
          await patchEventBody(accessToken, action.eventId, action.event);
          eventId = action.eventId;
          outcome = "updated";
        } catch (err) {
          // Gone from Google (another account, or purged) — put it back.
          if (!(err instanceof GoogleApiError && (err.status === 404 || err.status === 410))) throw err;
          eventId = await insertEventBody(accessToken, action.event);
          outcome = "created";
        }
      } else {
        eventId = await insertEventBody(accessToken, action.event);
        outcome = "created";
      }

      const synced = {
        googleEventId: eventId,
        syncedHash: action.kind === "delete" ? null : action.hash,
        snapshotAt,
        syncedAt: new Date(),
        lastError: null,
        attempts: 0,
        updatedAt: new Date(),
      };
      await tx
        .insert(dccCalendarEvents)
        .values({ employeeId, eventDate: day, ...synced })
        .onConflictDoUpdate({ target: [dccCalendarEvents.employeeId, dccCalendarEvents.eventDate], set: synced });
      return outcome;
    } catch (err) {
      if (isRevokedGrant(err)) return "revoked";
      const lastError = errorText(err);
      console.error(`[dcc-calendar] SYNC FAILED employee=${employeeId} day=${day} :: ${lastError}`);
      await tx
        .insert(dccCalendarEvents)
        .values({ employeeId, eventDate: day, lastError, attempts: 1 })
        .onConflictDoUpdate({
          target: [dccCalendarEvents.employeeId, dccCalendarEvents.eventDate],
          set: { lastError, attempts: sql`${dccCalendarEvents.attempts} + 1`, updatedAt: new Date() },
        });
      return "failed";
    }
  });
}

/**
 * The person revoked the WMS in their Google account. Clear the dead token —
 * only if it is still the one we used, so a reconnect in the meantime stays —
 * and the connect prompt will ask them again.
 */
async function forgetRevokedToken(employeeId: string, token: string): Promise<void> {
  await db
    .update(employees)
    .set({ googleRefreshToken: null, googleEmail: null, googleConnectedAt: null })
    .where(and(eq(employees.id, employeeId), eq(employees.googleRefreshToken, token)))
    .catch((err: unknown) => console.error(`[dcc-calendar] could not clear revoked token employee=${employeeId} :: ${errorText(err)}`));
}

/**
 * Sync one person-day after the current response — never delaying the save.
 * `day` defaults to today (IST). Outside a request (a script) it simply runs.
 */
export function scheduleDccCalendarSync(employeeId: string, day?: string): void {
  const run = async () => {
    try {
      await syncDccCalendar({ employeeIds: [employeeId], from: day, to: day ?? localDateString("Asia/Kolkata"), budgetMs: 25_000 });
    } catch (err) {
      console.error(`[dcc-calendar] live sync failed employee=${employeeId} day=${day ?? "today"} :: ${errorText(err)}`);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
