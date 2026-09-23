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
  type ApproverActor,
  type ApproverChoice,
  type ApproverShown,
} from "@/lib/status/approver-status";
import type { ComplianceItem, ComplianceKind, Occurrence, OccurrenceMode } from "./schedule";
import { scheduleDetail, scheduleText } from "./schedule";
import { mccScheduleOf, type MccSchedule } from "./mcc-frequency";
import {
  approverStatusOf,
  complianceApproverChoices,
  doerStatusOf,
  isClosed,
  isRuledOut,
  type DoerStatus,
} from "./status";
import { completedQuantityOf, quantityTargetOf, type QuantityTarget } from "./quantity";

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
  /** How many were completed (0239), and DCC's own value (lib/compliance/quantity). */
  completedQuantity?: number | null;
  valueNumber?: string | null;
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
  /** How often — "Mon to Sat", "Mon & Thu", or MCC's "Quarterly", "2 times/month"… */
  schedule: string;
  /** MCC: when, under it — "by the 15th · Jun, Sep, Dec, Mar". Null on WCC. */
  scheduleDetail: string | null;
  /** Raw schedule, for the edit form. */
  scheduleKind: string;
  weekdays: number;
  monthDay: number | null;
  /** MCC's schedule, for the edit form; null on WCC. */
  mcc: MccSchedule | null;
  deadline: string;
  /** Null = the doer has not filled it. */
  doerStatus: DoerStatus | null;
  /** ISO instant the doer marked it Done, or null. */
  doneAt: string | null;
  /** The actual date as a calendar day in IST. */
  actual: string | null;
  /** +/- days against the deadline: positive is late. Null when not yet due, or lapsed. */
  variance: number | null;
  /** True when still open and already late — the figure is still growing. */
  running: boolean;
  /* ── Carry forward and lapse (lib/compliance/schedule.ts) ── */
  /** The day it opens, and the last day it may be filled or changed. */
  opensOn: string;
  openUntil: string;
  /** Past its last open day — the doer's side is frozen, whatever was filled. */
  locked: boolean;
  /** Locked without being Done: it lapsed. */
  lapsed: boolean;
  /** Past its deadline, not Done, still open — carried forward. */
  carried: boolean;
  /** Its period has not begun. */
  notYetOpen: boolean;
  /** The count it is done against — null for a compliance that is simply Done. */
  quantity: QuantityTarget | null;
  /** How many were completed; only ever set on a Done row that counts. */
  completedQuantity: number | null;
  /** The compliance's own Target and unit as stored, for the edit form. */
  targetNumber: string | null;
  unit: string | null;
  /** WCC's Mins — how many minutes it takes each time; null = not set (lib/compliance/minutes). */
  minutes: number | null;
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
  /** May set its Mins from the Mins cell — WCC, and whoever manages this
   *  person's compliances, a master-given one included (the master has no Mins). */
  canSetMinutes: boolean;
}

export interface Viewer {
  id: string;
  isAdmin: boolean;
  /** Super-admin or the DCC past-entry editor — may fill for anyone. */
  fillsForAnyone: boolean;
  /** The DCC past-entry editor — may still change a row after it lapses. */
  editsPast?: boolean;
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
    const locked = today > o.openUntil;
    // Abandoned is accounted for: given up, not missed — so never "lapsed".
    const lapsed = locked && !isClosed(doer);
    const notYetOpen = today < o.periodStart;
    // A lapsed row stops counting its lateness: it was never done, and never will be.
    const v =
      isRuledOut(approverStored) || lapsed || doer === "abandoned"
        ? { days: null, running: false }
        : varianceOf(o.deadline, actual, today);

    const isDoer = o.ownerId === viewer.id;
    const actor: ApproverActor = {
      isAdmin: viewer.isAdmin,
      isInitiator: !isDoer && item.createdById === viewer.id,
      isDoersManager: !isDoer && viewer.visibleIds.has(o.ownerId),
      isDoer,
      isSelfRaised: false,
    };
    const fromMaster = args.masters.get(o.itemId) ?? null;
    const quantity = quantityTargetOf(item);

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
      scheduleDetail: scheduleDetail(item),
      scheduleKind: item.scheduleKind ?? "scheduled",
      weekdays: item.weekdays ?? 0,
      monthDay: item.monthDay,
      mcc: o.kind === "mcc" ? mccScheduleOf(item) : null,
      deadline: o.deadline,
      doerStatus: doer,
      doneAt,
      actual,
      variance: v.days,
      running: v.running,
      opensOn: o.periodStart,
      openUntil: o.openUntil,
      locked,
      lapsed,
      carried: !locked && !notYetOpen && o.deadline < today && !isClosed(doer),
      notYetOpen,
      quantity,
      // A count belongs to finished work: an open row shows the target alone.
      completedQuantity: quantity && doer === "done" ? completedQuantityOf(fill) : null,
      targetNumber: item.targetNumber ?? null,
      unit: item.unit ?? null,
      minutes: item.minutes ?? null,
      doerNotes: fill?.note ?? null,
      approver: approverDisplay(approverStored, false),
      approverNotes: fill?.approverNotes ?? null,
      fromMaster,
      // Their own, or anyone's for a super-admin or the past-entry editor —
      // and only while it is open, unless they are the past-entry editor.
      canFill: (isDoer || viewer.fillsForAnyone) && !notYetOpen && (!locked || Boolean(viewer.editsPast)),
      approverChoices: complianceApproverChoices(actor, doer),
      canApproverNotes: canRuleOn(actor),
      canManage: !fromMaster && viewer.canManageFor(o.ownerId),
      canSetMinutes: o.kind === "wcc" && viewer.canManageFor(o.ownerId),
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
  /** Past their deadline and not Done, still open — and those whose time ran out. */
  carried: number;
  lapsed: number;
  /** Given up by the doer. */
  abandoned: number;
  /* ── The compliances that count (lib/compliance/quantity), due so far ── */
  /** How many of them are due. */
  quantityDue: number;
  /** Their targets added up, and what was completed against them. */
  quantityTarget: number;
  quantityCompleted: number;
  /** Done, but fewer completed than the target. */
  shortOfTarget: number;
}

/** The +/- days report over a set of rows. Rows already ruled out are left aside. */
export function summarise(rows: readonly ComplianceRow[], today: string): ComplianceSummary {
  const live = rows.filter((r) => r.approver !== "cancelled" && r.approver !== "archived");
  const dueSoFar = live.filter((r) => r.deadline <= today || r.doerStatus !== null);
  const done = live.filter((r) => r.doerStatus === "done");
  const lateRows = done.filter((r) => (r.variance ?? 0) > 0);
  const lateDays = lateRows.reduce((s, r) => s + (r.variance ?? 0), 0);
  const counting = dueSoFar.filter((r) => r.quantity !== null);
  return {
    due: dueSoFar.length,
    filled: dueSoFar.filter((r) => r.doerStatus !== null).length,
    notFilled: dueSoFar.filter((r) => r.doerStatus === null).length,
    done: done.length,
    onTime: done.length - lateRows.length,
    late: lateRows.length,
    avgLate: lateRows.length ? Math.round((lateDays / lateRows.length) * 10) / 10 : null,
    ruledOut: rows.length - live.length,
    carried: live.filter((r) => r.carried).length,
    lapsed: live.filter((r) => r.lapsed).length,
    abandoned: live.filter((r) => r.doerStatus === "abandoned").length,
    quantityDue: counting.length,
    quantityTarget: counting.reduce((s, r) => s + r.quantity!.target, 0),
    quantityCompleted: counting.reduce((s, r) => s + (r.completedQuantity ?? 0), 0),
    shortOfTarget: counting.filter((r) => r.completedQuantity !== null && r.completedQuantity < r.quantity!.target).length,
  };
}

/**
 * WCC: the rows a window of days shows — every row due in it, plus the rows
 * from before it that were still open at its start: carried forward and not
 * yet Done, or Done within the window (so a row marked Done today stays in
 * view instead of vanishing). `rows` must include those earlier days.
 */
export function withCarryForward(rows: readonly ComplianceRow[], from: string): ComplianceRow[] {
  return rows.filter(
    (r) => r.deadline >= from || (r.openUntil >= from && (r.doerStatus !== "done" || (r.actual ?? "") >= from)),
  );
}
