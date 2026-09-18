/**
 * DCC IN GOOGLE CALENDAR — what one person's day looks like as an event
 * (account holder, 2026-09-15).
 *
 * Every employee's Daily Compliance sits in their own Altus Google Calendar as
 * ONE ALL-DAY EVENT PER DAY: the title carries the score, the description lists
 * every KPI of the day with its status, value and note. It is rebuilt whenever
 * the day changes, so the calendar always shows the current record.
 *
 * The day's rows are the 10 PM report's rows (`buildPersonReports`): the KPIs
 * due that day, plus any other KPI filled that day. One definition of "the day",
 * so the calendar and the email can never disagree.
 *
 * Pure: no DB, no Google. lib/dcc/calendar-sync.ts loads, calls and records.
 */
import { addDaysYmd, type SlotOutcome } from "./dashboard";
import { OUTCOME_LABEL, reportDateLabel, type PersonReport, type ReportRow } from "./daily-report";

export const DCC_EVENT_KIND = "dcc-day";

/** Google caps an event description; keep well inside it. */
export const DESCRIPTION_MAX = 7_500;
const NOTE_MAX = 300;

const MARK: Record<SlotOutcome, string> = {
  done: "✅",
  notDone: "❌",
  na: "➖",
  pending: "⏳",
  noted: "📝",
  unfilled: "⬜",
};

/** The Calendar API event body. */
export interface DccCalendarEvent {
  summary: string;
  description: string;
  start: { date: string };
  /** Google's all-day end date is EXCLUSIVE — the day after. */
  end: { date: string };
  /** Shows the day as free: a checklist, not a meeting. */
  transparency: "transparent";
  /** Restores an event the person deleted in Google, instead of patching a cancelled one. */
  status: "confirmed";
  source: { title: string; url: string };
  extendedProperties: { private: { wmsKind: string; day: string } };
  /** No pop-ups: a backfill of months of days must not ring hundreds of alarms. */
  reminders: { useDefault: false; overrides: [] };
}

export function dccEventSummary(r: PersonReport): string {
  if (r.due === 0) return `DCC · ${r.rows.length} filled`;
  const parts = [`DCC · ${r.done}/${r.due} done`];
  if (r.notDone > 0) parts.push(`${r.notDone} not done`);
  if (r.notFilled > 0) parts.push(`${r.notFilled} not filled`);
  return parts.join(" · ");
}

function rowLine(row: ReportRow): string {
  const note = row.note && row.note.length > NOTE_MAX ? `${row.note.slice(0, NOTE_MAX - 1)}…` : row.note;
  return [
    `${MARK[row.outcome]} ${row.code ? `${row.code} · ` : ""}${row.title} — ${OUTCOME_LABEL[row.outcome]}`,
    row.value !== null ? ` · ${row.value}` : "",
    note ? ` · "${note}"` : "",
    row.due ? "" : " (not due today)",
  ].join("");
}

export function dccEventDescription(r: PersonReport, day: string, link: string): string {
  const out: string[] = [`Daily Compliance · ${reportDateLabel(day)}`];
  if (r.due > 0) {
    out.push(`Compliance ${r.compliance ?? 0}% · Filled ${r.filled ?? 0}% · ${r.done} done of ${r.due} due`);
  }
  const footer = ["", `Open in WMS: ${link}`];
  let size = out.join("\n").length + footer.join("\n").length + 80;

  let section: string | null = null;
  let shown = 0;
  for (const row of r.rows) {
    const lines = row.section !== section ? ["", row.section.toUpperCase(), rowLine(row)] : [rowLine(row)];
    const add = lines.join("\n").length + 1;
    if (size + add > DESCRIPTION_MAX) {
      const more = r.rows.length - shown;
      out.push("", `…and ${more} more KPI${more === 1 ? "" : "s"}. Open WMS for the full list.`);
      break;
    }
    out.push(...lines);
    size += add;
    section = row.section;
    shown++;
  }
  return [...out, ...footer].join("\n");
}

export function buildDccCalendarEvent(report: PersonReport, day: string, appUrl: string): DccCalendarEvent {
  const link = `${appUrl.replace(/\/+$/u, "")}/dcc`;
  return {
    summary: dccEventSummary(report),
    description: dccEventDescription(report, day, link),
    start: { date: day },
    end: { date: addDaysYmd(day, 1) },
    transparency: "transparent",
    status: "confirmed",
    source: { title: "Altus WMS · Daily Compliance", url: link },
    extendedProperties: { private: { wmsKind: DCC_EVENT_KIND, day } },
    reminders: { useDefault: false, overrides: [] },
  };
}

/** Stable fingerprint of an event body (FNV-1a + length) — an unchanged day costs no API call. */
export function dccEventHash(ev: DccCalendarEvent): string {
  const s = JSON.stringify(ev);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}${s.length.toString(16)}`;
}

/* ── What to do with one person-day ─────────────────────────────────────── */

export interface SyncedDay {
  googleEventId: string | null;
  syncedHash: string | null;
  /** When the data behind the last successful sync was read. */
  snapshotAt: Date | null;
}

export type DccCalendarAction =
  | { kind: "skip" }
  | { kind: "create"; event: DccCalendarEvent; hash: string }
  | { kind: "update"; eventId: string; event: DccCalendarEvent; hash: string }
  | { kind: "delete"; eventId: string };

/**
 * `desired` is null when the day has nothing to show (no KPI due, nothing
 * filled). `snapshotAt` is when THIS run read the data: a day already synced
 * from a LATER read is left alone, so a slow sync can never overwrite a newer
 * one with older data.
 */
export function planDccCalendarAction(
  desired: { event: DccCalendarEvent; hash: string } | null,
  existing: SyncedDay | null,
  snapshotAt: Date,
): DccCalendarAction {
  if (existing?.snapshotAt && existing.snapshotAt.getTime() > snapshotAt.getTime()) return { kind: "skip" };
  const eventId = existing?.googleEventId ?? null;
  if (!desired) return eventId ? { kind: "delete", eventId } : { kind: "skip" };
  if (eventId && existing?.syncedHash === desired.hash) return { kind: "skip" };
  if (eventId) return { kind: "update", eventId, ...desired };
  return { kind: "create", ...desired };
}
