"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccEntries, dccKpiItems, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { guardItemWrite } from "@/lib/dcc/item-guard";
import { scheduleDccCalendarSync } from "@/lib/dcc/calendar-sync";
import { checkFillWindow, kindOf, periodFor } from "@/lib/compliance/schedule";
import { localDateString } from "@/lib/format";
import { MAX_QUANTITY, quantityTargetOf } from "@/lib/compliance/quantity";
import { MAX_MINUTES, MINUTES_WORDS } from "@/lib/compliance/minutes";
import { MCC_FREQUENCIES, mccColumns, normalizeMccSchedule } from "@/lib/compliance/mcc-frequency";
import { COMPLIANCE_BULK_MAX, normTitle } from "@/lib/compliance/bulk";
import { isMissingColumn } from "@/lib/queries/compliance";
import {
  DOER_STATUSES,
  approverStatusOf,
  isComplianceApproverChoice,
  doerStatusOf,
  legacyStatusFor,
  type DoerStatus,
} from "@/lib/compliance/status";
import {
  approverStored,
  canRuleOn,
  canSetApproverStatus,
  type ApproverActor,
} from "@/lib/status/approver-status";

/**
 * WCC / MCC WRITES (account holder, 2026-09-18).
 *
 * ── LATE IS RECORDED, THEN THE ROW LAPSES ───────────────────────────────
 * WCC and MCC measure +/- DAYS against a deadline, so a row does not close at
 * its deadline: not Done, it is CARRIED FORWARD and can still be marked, the
 * server stamping the actual date so the lateness is on record. It closes when
 * it lapses (see CARRIED FORWARD, THEN LAPSED below) — for a daily one, at the
 * end of its own day, as DCC closed a day at 11:59 pm.
 *
 * ── WHO WRITES WHAT ──────────────────────────────────────────────────────
 *   Doer Status, Doer Notes    — the person it belongs to (or a super-admin,
 *                                or the past-entry editor, as in DCC)
 *   Approver Status and Notes  — the WMS rule: the doer's manager (anyone above
 *                                them), whoever gave them the compliance, or an
 *                                admin; never the doer on their own. WCC / MCC
 *                                rule four ways: Approved, Not Approved, On
 *                                Hold, Archive (lib/compliance/status.ts)
 *   Adding / editing / removing a compliance — DCC's own rule
 *                                (lib/dcc/item-guard.ts)
 *
 * ── HOW MANY (migration 0239) ────────────────────────────────────────────
 * A compliance with a target above one (lib/compliance/quantity.ts) cannot be
 * marked Done without the count completed — 18 of 25 — which is kept while it
 * stays Done and cleared when it leaves. A compliance without one takes no
 * count at all. The count is also written to value_number, DCC's own value, so
 * the 10 pm DCC report and the Android app read the same number.
 *
 * ── CARRIED FORWARD, THEN LAPSED ─────────────────────────────────────────
 * The doer's side of a row — status, notes, count — is written only while the
 * row is open (lib/compliance/schedule.ts `checkFillWindow`): never before its
 * period starts, and not after it lapses — a daily one after its own day, one
 * on chosen days by the next chosen day or Sunday, an MCC one by its next
 * deadline or month-end. The DCC past-entry editor may still correct a lapsed
 * row. The approver's side is never locked.
 *
 * ── MCC FREQUENCIES (migration 0240) ─────────────────────────────────────
 * Monthly, 2 times/month, 3 times/month, Alternate Month, Quarterly, Half
 * Yearly, Annually (lib/compliance/mcc-frequency.ts). A deadline the browser
 * sends is checked against the compliance's own schedule; a date that is not
 * one of its deadlines is refused rather than filed somewhere it will never show.
 *
 * ── BULK (Excel) ─────────────────────────────────────────────────────────
 * `bulkAddCompliances` takes the rows lib/compliance/bulk.ts read from the
 * template and runs each through the same checks as the pop-up — who may add
 * for whom, the schedule, the Target, the Mins — plus one the pop-up does not
 * need: a compliance already on that person's checklist is not added twice.
 *
 * ── MINS (migration 0242) ────────────────────────────────────────────────
 * How many minutes a WCC compliance takes each time (lib/compliance/minutes).
 * Set with the compliance, or on its own from the table's Mins cell
 * (`setComplianceMinutes`) by whoever manages that person's compliances — a
 * master-given one included, as the DCC Master has no Mins to govern.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optNote = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000).nullable().optional())
  .transform((v) => (v ? v : null));

function revalidateCompliance() {
  revalidatePath("/dcc/wcc");
  revalidatePath("/dcc/mcc");
}

type Item = {
  owner: string;
  createdById: string | null;
  scheduleKind: string;
  weekdays: number | null;
  title: string;
  targetNumber: string | null;
  unit: string | null;
  monthDay: number | null;
  mccFrequency: string | null;
  mccDays: number[] | null;
  mccStartMonth: number | null;
};

async function loadItem(itemId: string): Promise<Item | null> {
  const base = {
    owner: dccKpiItems.ownerEmployeeId,
    createdById: dccKpiItems.createdById,
    scheduleKind: dccKpiItems.scheduleKind,
    weekdays: dccKpiItems.weekdays,
    title: dccKpiItems.title,
    targetNumber: dccKpiItems.targetNumber,
    unit: dccKpiItems.unit,
  };
  const read = (fields: typeof base) =>
    db
      .select(fields)
      .from(dccKpiItems)
      .where(and(eq(dccKpiItems.id, itemId), eq(dccKpiItems.archived, false)))
      .limit(1);
  // The schedule columns 0238 and 0240 add, stepping back when a database is
  // behind: without them an MCC compliance is Monthly, by month-end.
  const attempts = [
    {
      ...base,
      monthDay: dccKpiItems.monthDay,
      mccFrequency: dccKpiItems.mccFrequency,
      mccDays: dccKpiItems.mccDays,
      mccStartMonth: dccKpiItems.mccStartMonth,
    },
    { ...base, monthDay: dccKpiItems.monthDay },
    base,
  ];
  for (const [i, fields] of attempts.entries()) {
    try {
      const [row] = (await read(fields as typeof base)) as (Awaited<ReturnType<typeof read>>[number] & Partial<Item>)[];
      if (!row) return null;
      return {
        ...row,
        monthDay: row.monthDay ?? null,
        mccFrequency: row.mccFrequency ?? null,
        mccDays: row.mccDays ?? null,
        mccStartMonth: row.mccStartMonth ?? null,
      };
    } catch (e) {
      if (!isMissingColumn(e) || i === attempts.length - 1) throw e;
    }
  }
  return null;
}

const NOT_A_DEADLINE = "That date is not one of this compliance's deadlines — refresh the page and try again.";

/** The fill inside this deadline's period — the latest, as the tables read it. */
async function findFill(
  itemId: string,
  period: NonNullable<ReturnType<typeof periodFor>>,
  deadline: string,
) {
  const [row] = await db
    .select({
      id: dccEntries.id,
      entryDate: dccEntries.entryDate,
      status: dccEntries.status,
      doerStatus: dccEntries.doerStatus,
      doneAt: dccEntries.doneAt,
      approverStatus: dccEntries.approverStatus,
    })
    .from(dccEntries)
    .where(
      and(
        eq(dccEntries.itemId, itemId),
        period.mode === "day" ? eq(dccEntries.entryDate, deadline) : gte(dccEntries.entryDate, period.start),
        lte(dccEntries.entryDate, period.end),
        isNull(dccEntries.subjectId),
      ),
    )
    .orderBy(desc(dccEntries.entryDate))
    .limit(1);
  return row ?? null;
}

/* ── The doer's side ──────────────────────────────────────────────────────── */

const QUANTITY_WORDS = "Enter how many were completed, as a whole number — 0 or more.";

const DoerInput = z.object({
  itemId: z.string().uuid(),
  deadline: ymd,
  doerStatus: z.enum(DOER_STATUSES).optional(),
  notes: optNote.optional(),
  /** How many were completed — for a compliance that counts, with (or after) Done. */
  completedQuantity: z
    .number({ message: QUANTITY_WORDS })
    .int(QUANTITY_WORDS)
    .min(0, QUANTITY_WORDS)
    .max(MAX_QUANTITY, `That is more than ${MAX_QUANTITY.toLocaleString("en-IN")}.`)
    .optional(),
});

/**
 * Set the Doer Status and/or Doer Notes of one compliance for one deadline.
 *
 * `done_at` IS THE ACTUAL DATE. The server stamps it on the way INTO Done and
 * keeps the first stamp if Done is picked again; leaving Done clears it and
 * lifts an Approved / Not Approved ruling, which judged finished work that is
 * no longer finished (the WMS task rule).
 *
 * `completedQuantity` is the count for a compliance that counts: required on
 * the way into Done, accepted on its own to correct a Done row's count, and
 * refused for a compliance with nothing to count or a row that is not Done.
 */
export async function setComplianceDoer(raw: z.input<typeof DoerInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DoerInput.safeParse(raw);
  if (!parsed.success) {
    const quantityIssue = parsed.error.issues.find((i) => i.path[0] === "completedQuantity");
    return fail(quantityIssue?.message ?? "That didn't look like a compliance update.");
  }
  const v = parsed.data;
  if (v.doerStatus === undefined && v.notes === undefined && v.completedQuantity === undefined) return { ok: true };

  const item = await loadItem(v.itemId);
  if (!item) return fail("That compliance no longer exists.");
  if (!(item.owner === me.id || isSuperAdmin(me.email) || canEditPastDccEntries(me.email))) {
    return fail("Only the person it belongs to can update their Doer Status.");
  }
  const quantity = quantityTargetOf(item);
  if (v.completedQuantity !== undefined && !quantity) {
    return fail("This compliance has no quantity to count — just mark it Done.");
  }
  const period = periodFor(item, v.deadline);
  if (!period) return fail(NOT_A_DEADLINE);
  // Carried forward until it lapses, then frozen — a daily one after its own
  // day — except for the DCC past-entry editor, exactly as on DCC.
  const window = checkFillWindow({
    opensOn: period.start,
    openUntil: period.openUntil,
    today: localDateString("Asia/Kolkata"),
    canEditPast: canEditPastDccEntries(me.email),
  });
  if (!window.ok) return fail(window.error);

  const now = new Date();
  try {
    const fill = await findFill(v.itemId, period, v.deadline);
    const prevDoer = doerStatusOf(fill);
    const prevApprover = approverStatusOf(fill);
    const doer: DoerStatus | null = v.doerStatus ?? prevDoer;
    const leavingDone = v.doerStatus !== undefined && v.doerStatus !== "done" && prevDoer === "done";
    if (quantity) {
      if (v.completedQuantity !== undefined && doer !== "done") {
        return fail("Mark it Done first, then record how many were completed.");
      }
      if (doer === "done" && prevDoer !== "done" && v.completedQuantity === undefined) {
        return fail(`Enter how many were completed out of ${quantity.target}${quantity.unit ? ` ${quantity.unit}` : ""}.`);
      }
    }
    // The count moves with Done: set when given, cleared on the way out, and
    // otherwise left exactly as it is. value_number carries it for DCC's readers.
    const count =
      quantity && v.completedQuantity !== undefined
        ? { completedQuantity: v.completedQuantity, valueNumber: String(v.completedQuantity) }
        : quantity && leavingDone
          ? { completedQuantity: null, valueNumber: null }
          : null;
    const approver =
      leavingDone && (prevApprover === "approved" || prevApprover === "not_approved") ? null : prevApprover;
    // A notes-only save leaves the actual date alone; a repeat Done keeps the
    // first stamp; a new Done stamps now; anything else clears it.
    const doneAt =
      v.doerStatus === undefined
        ? (fill?.doneAt ?? null)
        : doer === "done"
          ? prevDoer === "done"
            ? (fill?.doneAt ?? now)
            : now
          : null;

    const set = {
      doerStatus: doer,
      doneAt,
      approverStatus: approver,
      status: legacyStatusFor(doer, approver),
      ...(v.notes !== undefined ? { note: v.notes } : {}),
      ...(count ?? {}),
      filledById: me.id,
      updatedAt: now,
    };

    if (fill) {
      await db.update(dccEntries).set(set).where(eq(dccEntries.id, fill.id));
    } else {
      // The count's columns only when there is a count, so a compliance that
      // does not count still saves on a database 0239 has not reached.
      await db.execute(sql`
        INSERT INTO dcc_entries
          (item_id, entry_date, status, doer_status, done_at, approver_status, note, filled_by_id
           ${count ? sql`, completed_quantity, value_number` : sql``})
        VALUES (${v.itemId}, ${v.deadline}, ${set.status}, ${doer}, ${doneAt ? doneAt.toISOString() : null},
                ${approver}, ${v.notes ?? null}, ${me.id}
                ${count ? sql`, ${count.completedQuantity}, ${count.valueNumber}` : sql``})
        ON CONFLICT (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET status = EXCLUDED.status, doer_status = EXCLUDED.doer_status,
                      done_at = EXCLUDED.done_at, note = COALESCE(EXCLUDED.note, dcc_entries.note),
                      ${count ? sql`completed_quantity = EXCLUDED.completed_quantity, value_number = EXCLUDED.value_number,` : sql``}
                      filled_by_id = EXCLUDED.filled_by_id, updated_at = now()
      `);
    }
  } catch {
    return fail(
      `Could not save that. If this keeps happening, migration ${
        v.doerStatus === "abandoned" ? "0241" : quantity ? "0239" : "0238"
      } may not have been run.`,
    );
  }

  scheduleDccCalendarSync(item.owner, v.deadline);
  revalidateCompliance();
  return { ok: true };
}

/* ── The approver's side ──────────────────────────────────────────────────── */

const ApproverInput = z.object({
  itemId: z.string().uuid(),
  deadline: ymd,
  /** WCC / MCC's four rulings — Approved · Not Approved · On Hold · Archive. */
  status: z.string().refine(isComplianceApproverChoice, "Pick Approved, Not Approved, On Hold or Archive.").optional(),
  notes: optNote.optional(),
});

/**
 * The actor, for one compliance. A compliance someone wrote for themselves
 * still has an approver — their Team Lead — so there is no "self-raised, not
 * applicable" case here as there is on a task: the manager chain always rules.
 */
async function actorFor(me: Awaited<ReturnType<typeof requireUser>>, item: Item): Promise<ApproverActor> {
  const scope = await loadDccScope(me);
  const isDoer = item.owner === me.id;
  return {
    isAdmin: me.isAdmin || isSuperAdmin(me.email),
    isInitiator: !isDoer && item.createdById === me.id,
    isDoersManager: !isDoer && scope.visibleIds.has(item.owner),
    isDoer,
    isSelfRaised: false,
  };
}

export async function setComplianceApprover(raw: z.input<typeof ApproverInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ApproverInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid ruling.");
  const v = parsed.data;
  if (v.status === undefined && v.notes === undefined) return { ok: true };

  const item = await loadItem(v.itemId);
  if (!item) return fail("That compliance no longer exists.");
  const period = periodFor(item, v.deadline);
  if (!period) return fail(NOT_A_DEADLINE);
  const actor = await actorFor(me, item);

  const now = new Date();
  try {
    const fill = await findFill(v.itemId, period, v.deadline);
    const doer = doerStatusOf(fill);
    if (v.status !== undefined) {
      const verdict = canSetApproverStatus(actor, v.status, doer);
      if (!verdict.ok) return fail(verdict.reason);
    } else if (!canRuleOn(actor)) {
      return fail("Only the doer's manager, whoever gave the compliance, or an admin can write the Approver Notes.");
    }

    const approver =
      v.status !== undefined && isComplianceApproverChoice(v.status) ? approverStored(v.status) : approverStatusOf(fill);
    const set = {
      approverStatus: approver,
      status: legacyStatusFor(doer, approver),
      // The doer's side, written out as it reads now: a fill from the old DCC
      // board has only `status`, and a ruling rewrites that ("NA" for Archive) —
      // without this, an archived Done would read back as Not Started.
      doerStatus: doer,
      ...(v.status !== undefined ? { approverId: me.id, approverAt: now } : {}),
      ...(v.notes !== undefined ? { approverNotes: v.notes } : {}),
      updatedAt: now,
    };

    if (fill) {
      await db.update(dccEntries).set(set).where(eq(dccEntries.id, fill.id));
    } else {
      // Ruling on a compliance nobody has filled — Cancelled, say — still needs a row to hold it.
      await db.execute(sql`
        INSERT INTO dcc_entries
          (item_id, entry_date, status, approver_status, approver_notes, approver_id, approver_at, filled_by_id)
        VALUES (${v.itemId}, ${v.deadline}, ${set.status}, ${approver}, ${v.notes ?? null},
                ${v.status !== undefined ? me.id : null}, ${v.status !== undefined ? now.toISOString() : null}, ${me.id})
        ON CONFLICT (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET approver_status = EXCLUDED.approver_status,
                      approver_notes = COALESCE(EXCLUDED.approver_notes, dcc_entries.approver_notes),
                      approver_id = EXCLUDED.approver_id, approver_at = EXCLUDED.approver_at, updated_at = now()
      `);
    }
  } catch {
    return fail("Could not save that. If this keeps happening, migration 0238 may not have been run.");
  }

  revalidateCompliance();
  return { ok: true };
}

/* ── The compliances themselves ───────────────────────────────────────────── */

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ItemInput = z.object({
  itemId: z.string().uuid().optional(),
  ownerEmployeeId: z.string().uuid(),
  kind: z.enum(["wcc", "mcc"]),
  title: z.string().trim().min(1, "Give the compliance a title.").max(300),
  section: z.string().trim().max(120).nullable().optional(),
  /** WCC: "days" = due on each chosen day; "weekly" = once a week on any chosen day. */
  wccMode: z.enum(["days", "weekly"]).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  /** MCC: the day of the month it is due; null = the month's last day. */
  monthDay: z.number().int().min(1).max(31).nullable().optional(),
  /** MCC: how often (lib/compliance/mcc-frequency). Left out = Monthly, by `monthDay`. */
  mccFrequency: z.enum(MCC_FREQUENCIES).optional(),
  /** MCC: every deadline day, in order — null = month-end. Left out = [monthDay]. */
  mccDays: z.array(z.number().int().min(1).max(31).nullable()).min(1).max(3).optional(),
  /** MCC: a month it is due in, for Alternate Month, Quarterly, Half Yearly, Annually. */
  mccStartMonth: z.number().int().min(1).max(12).nullable().optional(),
  /**
   * The Target — how many it asks for (lib/compliance/quantity). Null = none,
   * so the title's number is read; 1 = simply Done. Left out = unchanged, so an
   * edit never wipes a Target the DCC Masters set.
   */
  targetQuantity: z
    .number()
    .int("The target must be a whole number.")
    .min(1, "The target must be 1 or more — leave it blank for none.")
    .max(MAX_QUANTITY, `The target must be ${MAX_QUANTITY.toLocaleString("en-IN")} or less.`)
    .nullable()
    .optional(),
  /** What is counted — "emails", "calls". */
  unit: z.string().trim().max(40, "Keep the unit to 40 characters.").nullable().optional(),
  /** WCC's Mins — minutes it takes each time. Null = not set; left out = unchanged. */
  minutes: z.number().int(MINUTES_WORDS).min(1, MINUTES_WORDS).max(MAX_MINUTES, MINUTES_WORDS).nullable().optional(),
});

type McColumns = { mccFrequency: string; mccDays: number[] | null; mccStartMonth: number | null };

/**
 * The schedule columns together — `frequency` is the text people (and the DCC
 * importer) read, `weekdays` / `schedule_kind` / `month_day` / the 0240 MCC
 * columns are what the checklists obey. On WCC the text is chosen so
 * lib/dcc/util's parseFrequency reads it back as the same kind; on MCC it is
 * the frequency's own label ("Quarterly"), and schedule_kind stays 'monthly'.
 */
function scheduleColumns(v: Omit<z.infer<typeof ItemInput>, "itemId">):
  | { ok: true; frequency: string; weekdays: number; scheduleKind: string; monthDay: number | null; mcc: McColumns | null }
  | { ok: false; error: string } {
  if (v.kind === "mcc") {
    const s = normalizeMccSchedule({
      frequency: v.mccFrequency ?? "monthly",
      days: v.mccDays ?? [v.monthDay ?? null],
      startMonth: v.mccStartMonth ?? null,
    });
    if (!s.ok) return s;
    const c = mccColumns(s.schedule);
    return {
      ok: true,
      frequency: c.frequency,
      weekdays: 0,
      scheduleKind: "monthly",
      monthDay: c.monthDay,
      mcc: { mccFrequency: c.mccFrequency, mccDays: c.mccDays, mccStartMonth: c.mccStartMonth },
    };
  }
  const days = [...new Set(v.weekdays)].sort();
  const mask = days.reduce((m, b) => m | (1 << b), 0);
  if ((v.wccMode ?? "days") === "weekly") {
    const frequency =
      days.length === 0 ? "Weekly" : days.length === 1 ? `Every ${WEEKDAY_LONG[days[0]!]}` : days.map((b) => WEEKDAY_SHORT[b]).join(" or ");
    return { ok: true, frequency, weekdays: mask, scheduleKind: "weekly", monthDay: null, mcc: null };
  }
  if (mask === 0) return { ok: false, error: "Pick at least one day, or the compliance will never be due." };
  const frequency =
    mask === 0b0111111 ? "Daily" : days.map((b) => WEEKDAY_SHORT[b]).join(", ").replace(/, ([^,]*)$/, " & $1");
  return { ok: true, frequency, weekdays: mask, scheduleKind: "scheduled", monthDay: null, mcc: null };
}

/** Is that a live employee a WCC/MCC compliance may be assigned to? */
async function isActiveEmployee(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.isActive, true)))
    .limit(1);
  return Boolean(row);
}

/** Add a compliance to someone's WCC or MCC, or change one. */
export async function saveComplianceItem(raw: z.input<typeof ItemInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ItemInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid compliance.");
  const v = parsed.data;
  const sched = scheduleColumns(v);
  if (!sched.ok) return fail(sched.error);
  // target_number is numeric; Drizzle takes numerics as strings.
  const target = {
    ...(v.targetQuantity !== undefined ? { targetNumber: v.targetQuantity === null ? null : String(v.targetQuantity) } : {}),
    ...(v.unit !== undefined ? { unit: v.unit || null } : {}),
  };
  // Only named when given, so an edit that leaves Mins alone still saves on a
  // database 0242 has not reached.
  const minutes = v.minutes !== undefined ? { minutes: v.minutes } : {};

  try {
    if (v.itemId) {
      const guard = await guardItemWrite(v.itemId, me);
      if (!guard.ok) return guard;
      await db
        .update(dccKpiItems)
        .set({
          title: v.title,
          section: v.section || null,
          frequency: sched.frequency,
          weekdays: sched.weekdays,
          scheduleKind: sched.scheduleKind,
          monthDay: sched.monthDay,
          // Only an MCC save names the 0240 columns, so a WCC edit still saves
          // on a database that has not had it.
          ...(sched.mcc ?? {}),
          ...target,
          ...minutes,
          needsReview: false,
          updatedAt: new Date(),
        })
        .where(and(eq(dccKpiItems.id, v.itemId), eq(dccKpiItems.archived, false)));
      scheduleDccCalendarSync(guard.owner);
    } else {
      /* ANY ACTIVE EMPLOYEE MAY BE GIVEN A WCC OR MCC COMPLIANCE (2026-09-23).
         The two checklists are administrative: the person setting them up is
         whoever is preparing the roster — an HR admin, a coordinator, an intern
         handed the job — and not necessarily the person's manager. The
         manager-downline rule (`canManageItemsFor`) belongs to the DAILY
         checklist and is still applied there, in addDccItem.

         Checked instead: that the target is a live employee, so a stale id
         answers with a sentence rather than tripping the foreign key. */
      if (!(await isActiveEmployee(v.ownerEmployeeId))) {
        return fail("That employee is no longer active.");
      }
      await db.insert(dccKpiItems).values({
        ownerEmployeeId: v.ownerEmployeeId,
        title: v.title,
        section: v.section || null,
        frequency: sched.frequency,
        weekdays: sched.weekdays,
        scheduleKind: sched.scheduleKind,
        monthDay: sched.monthDay,
        ...(sched.mcc ?? {}),
        ...target,
        ...minutes,
        needsReview: false,
        createdById: me.id,
      });
      scheduleDccCalendarSync(v.ownerEmployeeId);
    }
  } catch {
    return fail("Could not save the compliance. If this keeps happening, migrations 0238, 0240 and 0242 may not have been run.");
  }

  revalidateCompliance();
  revalidatePath("/dcc/masters");
  return { ok: true };
}

const MinutesInput = z.object({
  itemId: z.string().uuid(),
  /** Null clears it. */
  minutes: z.number().int(MINUTES_WORDS).min(1, MINUTES_WORDS).max(MAX_MINUTES, MINUTES_WORDS).nullable(),
});

/**
 * Set a compliance's Mins from the table — every day it is due carries it.
 * Whoever manages that person's compliances may, including on one a DCC
 * Master gave: the master decides what is done and when, not how long it takes.
 */
export async function setComplianceMinutes(raw: z.input<typeof MinutesInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MinutesInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? MINUTES_WORDS);
  const v = parsed.data;

  const [item] = await db
    .select({ owner: dccKpiItems.ownerEmployeeId })
    .from(dccKpiItems)
    .where(and(eq(dccKpiItems.id, v.itemId), eq(dccKpiItems.archived, false)))
    .limit(1);
  if (!item) return fail("That compliance no longer exists.");
  const scope = await loadDccScope(me);
  if (!canManageItemsFor(scope, item.owner)) {
    return fail("You can set the Mins of your own compliances and your team's only.");
  }

  try {
    await db
      .update(dccKpiItems)
      .set({ minutes: v.minutes, updatedAt: new Date() })
      .where(and(eq(dccKpiItems.id, v.itemId), eq(dccKpiItems.archived, false)));
  } catch {
    return fail("Could not save the Mins. If this keeps happening, migration 0242 may not have been run.");
  }

  revalidateCompliance();
  return { ok: true };
}

/** Remove a compliance. Archived, never deleted — its fills are the record. */
export async function archiveComplianceItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(itemId).success) return fail("Unknown compliance.");

  const guard = await guardItemWrite(itemId, me);
  if (!guard.ok) return guard;

  await db
    .update(dccKpiItems)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(dccKpiItems.id, itemId), eq(dccKpiItems.archived, false)));
  scheduleDccCalendarSync(guard.owner);
  revalidateCompliance();
  revalidatePath("/dcc/masters");
  return { ok: true };
}

/* ── Bulk, from the Excel template ────────────────────────────────────────── */

const BulkRow = ItemInput.omit({ itemId: true, kind: true }).extend({
  /** The sheet row it came from, for the messages. */
  line: z.number().int().min(1),
});

const BulkInput = z.object({
  kind: z.enum(["wcc", "mcc"]),
  rows: z
    .array(BulkRow)
    .min(1, "There are no rows to add.")
    .max(COMPLIANCE_BULK_MAX, `Upload at most ${COMPLIANCE_BULK_MAX} rows at a time.`),
  /** Check only — report each row's problems and add nothing. */
  dryRun: z.boolean().optional(),
});

export type BulkProblem = { line: number; error: string };
export type BulkResult =
  | { ok: true; dryRun: true; problems: BulkProblem[] }
  | { ok: true; dryRun: false; created: number }
  | { ok: false; error: string; problems?: BulkProblem[] };

/**
 * Add many compliances from the Excel template, or (`dryRun`) say what is
 * wrong with each row first. All or nothing: rows with problems are sent back
 * and nothing is added, so a sheet never lands half in.
 */
export async function bulkAddCompliances(raw: z.input<typeof BulkInput>): Promise<BulkResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = BulkInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const line = issue && issue.path[0] === "rows" && typeof issue.path[1] === "number" ? raw.rows?.[issue.path[1]]?.line : undefined;
    return { ok: false, error: line ? `Row ${line}: ${issue!.message}` : (issue?.message ?? "Those rows could not be read.") };
  }
  const { kind, rows, dryRun } = parsed.data;
  const checklist = kind.toUpperCase();

  const ownerIds = [...new Set(rows.map((r) => r.ownerEmployeeId))];
  const [people, existing] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(inArray(employees.id, ownerIds), eq(employees.isActive, true))),
    db
      .select({
        owner: dccKpiItems.ownerEmployeeId,
        title: dccKpiItems.title,
        scheduleKind: dccKpiItems.scheduleKind,
        isParticipantList: dccKpiItems.isParticipantList,
      })
      .from(dccKpiItems)
      .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), eq(dccKpiItems.archived, false))),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const onChecklist = new Set(existing.filter((e) => kindOf(e) === kind).map((e) => `${e.owner}|${normTitle(e.title)}`));

  const problems: BulkProblem[] = [];
  const firstLine = new Map<string, number>();
  const values: (typeof dccKpiItems.$inferInsert)[] = [];
  for (const r of rows) {
    /* The same rule as saveComplianceItem: any ACTIVE employee may be given a
       compliance. `nameOf` is built from an is-active lookup over the sheet's
       owner ids, so a miss means that id is not a live employee. */
    const who = nameOf.get(r.ownerEmployeeId);
    if (!who) {
      problems.push({ line: r.line, error: "That employee is not on the active list." });
      continue;
    }
    const sched = scheduleColumns({ ...r, kind });
    if (!sched.ok) {
      problems.push({ line: r.line, error: sched.error });
      continue;
    }
    const key = `${r.ownerEmployeeId}|${normTitle(r.title)}`;
    if (onChecklist.has(key)) {
      problems.push({ line: r.line, error: `Already on ${who}'s ${checklist}.` });
      continue;
    }
    const seen = firstLine.get(key);
    if (seen !== undefined) {
      problems.push({ line: r.line, error: `The same compliance for ${who} as row ${seen}.` });
      continue;
    }
    firstLine.set(key, r.line);
    values.push({
      ownerEmployeeId: r.ownerEmployeeId,
      title: r.title,
      section: r.section || null,
      frequency: sched.frequency,
      weekdays: sched.weekdays,
      scheduleKind: sched.scheduleKind,
      monthDay: sched.monthDay,
      ...(sched.mcc ?? {}),
      targetNumber: r.targetQuantity == null ? null : String(r.targetQuantity),
      unit: r.unit || null,
      minutes: r.minutes ?? null,
      needsReview: false,
      createdById: me.id,
    });
  }

  if (dryRun) return { ok: true, dryRun: true, problems };
  if (problems.length > 0) {
    return {
      ok: false,
      error: `${problems.length} row${problems.length === 1 ? " needs" : "s need"} fixing — nothing was added.`,
      problems,
    };
  }

  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < values.length; i += 100) await tx.insert(dccKpiItems).values(values.slice(i, i + 100));
    });
  } catch {
    return {
      ok: false,
      error: `Could not add the compliances. If this keeps happening, migrations 0238, 0240 and 0242 may not have been run.`,
    };
  }

  for (const owner of new Set(values.map((v) => v.ownerEmployeeId))) scheduleDccCalendarSync(owner);
  revalidateCompliance();
  revalidatePath("/dcc/masters");
  return { ok: true, dryRun: false, created: values.length };
}
