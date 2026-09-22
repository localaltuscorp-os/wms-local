/**
 * WCC / MCC — one table row per compliance per deadline, with everything the
 * table shows already worked out: the Doer Status, the actual date, the +/-
 * days against the deadline, the Approver Status, and what THIS viewer may do.
 *
 * PURE. The pages build rows on the server so the browser receives a plain
 * list; the reminders read the same `isFilled` so an email and the screen can
 * never disagree about who has filled what.
 */

import { daysBetween } from "@/lib/operations/checklist-dates";
import {
  approverDisplay,
  canRuleOn,
  selectableApproverChoices,
  type ApproverActor,
  type ApproverChoice,
  type ApproverShown,
} from "@/lib/status/approver-status";
import type { ComplianceItem, ComplianceKind, Occurrence, OccurrenceMode } from "./schedule";
import { scheduleText } from "./schedule";
import { approverStatusOf, doerStatusOf, isRuledOut, type DoerStatus } from "./status";

export interface FillLike {
  itemId: string;
  entryDate: string;
  status: string | null;
  doerStatus: string | null;
  doneAt: string | null;
  note: string | null;
  approverStatus: string | null;
  approverNotes: string | null;
  updatedAt: string | null;
}

export interface ComplianceRow {
  key: string;
  itemId: string;
  ownerId: string;
  ownerName: string;
  kind: ComplianceKind;
  mode: OccurrenceMode;
  title: string;
  section: string | null;
  schedule: string;
  /** Raw schedule, for the edit form. */
  scheduleKind: string;
  weekdays: number;
  monthDay: number | null;
  deadline: string;
  /** Null = the doer has not filled it. */
  doerStatus: DoerStatus | null;
  /** ISO instant the doer marked it Done, or null. */
  doneAt: string | null;
  /** The actual date as a calendar day in IST. */
  actual: string | null;
  /** +/- days against the deadline: positive is late. Null when not yet due. */
  variance: number | null;
  /** True when still open and already late — the figure is still growing. */
  running: boolean;
  doerNotes: string | null;
  approver: ApproverShown;
  approverNotes: string | null;
  /** The position master a row belongs to — then only the master changes it. */
  fromMaster: string | null;
  /* ── what this viewer may do ── */
  canFill: boolean;
  approverChoices: ApproverChoice[];
  canApproverNotes: boolean;
  canManage: boolean;
}

export interface Viewer {
  id: string;
  isAdmin: boolean;
  /** Super-admin or the DCC past-entry editor — may fill for anyone. */
  fillsForAnyone: boolean;
  /** Everyone the viewer may see, themself included. */
  visibleIds: ReadonlySet<string>;
  /** May add / edit / remove compliances for this owner. */
  canManageFor: (ownerId: string) => boolean;
}

/** YYYY-MM-DD of an instant, in IST — the day it happened for the company. */
export function istDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/** Has the doer filled this compliance at all? What the 10 pm reminder checks. */
export function isFilled(fill: FillLike | null | undefined): boolean {
  return doerStatusOf(fill) !== null;
}

/**
 * +/- DAYS, actual minus deadline — positive is late. A compliance still open
 * after its deadline reports its running lateness against today, so a row
 * three days overdue never looks the same as one not yet due.
 */
export function varianceOf(
  deadline: string,
  actual: string | null,
  today: string,
): { days: number | null; running: boolean } {
  if (actual) return { days: daysBetween(deadline, actual), running: false };
  const late = daysBetween(deadline, today);
  return late !== null && late > 0 ? { days: late, running: true } : { days: null, running: false };
}

export function buildComplianceRows(args: {
  occurrences: readonly Occurrence[];
  fills: ReadonlyMap<string, FillLike>;
  items: ReadonlyMap<string, ComplianceItem>;
  names: ReadonlyMap<string, string>;
  masters: ReadonlyMap<string, string>;
  viewer: Viewer;
  today: string;
}): ComplianceRow[] {
  const { viewer, today } = args;
  const out: ComplianceRow[] = [];
  for (const o of args.occurrences) {
    const item = args.items.get(o.itemId);
    if (!item) continue;
    const fill = args.fills.get(o.key) ?? null;
    const doer = doerStatusOf(fill);
    const approverStored = approverStatusOf(fill);
    // A Done from before the actual date was captured falls back to when it was saved.
    const doneAt = doer === "done" ? (fill?.doneAt ?? fill?.updatedAt ?? null) : null;
    const actual = istDay(doneAt);
    const v = isRuledOut(approverStored) ? { days: null, running: false } : varianceOf(o.deadline, actual, today);

    const isDoer = o.ownerId === viewer.id;
    const actor: ApproverActor = {
      isAdmin: viewer.isAdmin,
      isInitiator: !isDoer && item.createdById === viewer.id,
      isDoersManager: !isDoer && viewer.visibleIds.has(o.ownerId),
      isDoer,
      isSelfRaised: false,
    };
    const fromMaster = args.masters.get(o.itemId) ?? null;

    out.push({
      key: o.key,
      itemId: o.itemId,
      ownerId: o.ownerId,
      ownerName: args.names.get(o.ownerId) ?? "—",
      kind: o.kind,
      mode: o.mode,
      title: item.title,
      section: item.section,
      schedule: scheduleText(item),
      scheduleKind: item.scheduleKind ?? "scheduled",
      weekdays: item.weekdays ?? 0,
      monthDay: item.monthDay,
      deadline: o.deadline,
      doerStatus: doer,
      doneAt,
      actual,
      variance: v.days,
      running: v.running,
      doerNotes: fill?.note ?? null,
      approver: approverDisplay(approverStored, false),
      approverNotes: fill?.approverNotes ?? null,
      fromMaster,
      canFill: isDoer || viewer.fillsForAnyone,
      approverChoices: selectableApproverChoices(actor, doer),
      canApproverNotes: canRuleOn(actor),
      canManage: !fromMaster && viewer.canManageFor(o.ownerId),
    });
  }
  return out;
}

export interface ComplianceSummary {
  due: number;
  filled: number;
  notFilled: number;
  done: number;
  onTime: number;
  late: number;
  /** Mean days late across the late ones, one decimal. */
  avgLate: number | null;
  ruledOut: number;
}

/** The +/- days report over a set of rows. Rows already ruled out are left aside. */
export function summarise(rows: readonly ComplianceRow[], today: string): ComplianceSummary {
  const live = rows.filter((r) => r.approver !== "cancelled" && r.approver !== "archived");
  const dueSoFar = live.filter((r) => r.deadline <= today || r.doerStatus !== null);
  const done = live.filter((r) => r.doerStatus === "done");
  const lateRows = done.filter((r) => (r.variance ?? 0) > 0);
  const lateDays = lateRows.reduce((s, r) => s + (r.variance ?? 0), 0);
  return {
    due: dueSoFar.length,
    filled: dueSoFar.filter((r) => r.doerStatus !== null).length,
    notFilled: dueSoFar.filter((r) => r.doerStatus === null).length,
    done: done.length,
    onTime: done.length - lateRows.length,
    late: lateRows.length,
    avgLate: lateRows.length ? Math.round((lateDays / lateRows.length) * 10) / 10 : null,
    ruledOut: rows.length - live.length,
  };
}
