"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccEntries, dccKpiItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { guardItemWrite } from "@/lib/dcc/item-guard";
import { scheduleDccCalendarSync } from "@/lib/dcc/calendar-sync";
import { periodFor } from "@/lib/compliance/schedule";
import {
  DOER_STATUSES,
  approverStatusOf,
  doerStatusOf,
  legacyStatusFor,
  type DoerStatus,
} from "@/lib/compliance/status";
import {
  approverStored,
  canRuleOn,
  canSetApproverStatus,
  isApproverChoice,
  type ApproverActor,
} from "@/lib/status/approver-status";

/**
 * WCC / MCC WRITES (account holder, 2026-09-18).
 *
 * ── NO MIDNIGHT LOCK HERE ────────────────────────────────────────────────
 * DCC closed a day at 11:59 pm. WCC and MCC measure +/- DAYS against a
 * deadline, and a checklist that refused a late tick could only ever report
 * "on time" — the lateness the report exists to show would be unrecordable.
 * So the doer may mark a compliance on any day; the server stamps the actual
 * date when it becomes Done, and the difference is the report.
 *
 * ── WHO WRITES WHAT ──────────────────────────────────────────────────────
 *   Doer Status, Doer Notes    — the person it belongs to (or a super-admin,
 *                                or the past-entry editor, as in DCC)
 *   Approver Status and Notes  — the WMS rule: the doer's manager (anyone above
 *                                them), whoever gave them the compliance, or an
 *                                admin; never the doer on their own
 *   Adding / editing / removing a compliance — DCC's own rule
 *                                (lib/dcc/item-guard.ts)
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
};

async function loadItem(itemId: string): Promise<Item | null> {
  const [item] = await db
    .select({
      owner: dccKpiItems.ownerEmployeeId,
      createdById: dccKpiItems.createdById,
      scheduleKind: dccKpiItems.scheduleKind,
    })
    .from(dccKpiItems)
    .where(and(eq(dccKpiItems.id, itemId), eq(dccKpiItems.archived, false)))
    .limit(1);
  return item ?? null;
}

/** The fill inside this deadline's period — the latest, as the tables read it. */
async function findFill(itemId: string, item: Item, deadline: string) {
  const period = periodFor(item, deadline);
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

const DoerInput = z.object({
  itemId: z.string().uuid(),
  deadline: ymd,
  doerStatus: z.enum(DOER_STATUSES).optional(),
  notes: optNote.optional(),
});

/**
 * Set the Doer Status and/or Doer Notes of one compliance for one deadline.
 *
 * `done_at` IS THE ACTUAL DATE. The server stamps it on the way INTO Done and
 * keeps the first stamp if Done is picked again; leaving Done clears it and
 * lifts an Approved / Not Approved ruling, which judged finished work that is
 * no longer finished (the WMS task rule).
 */
export async function setComplianceDoer(raw: z.input<typeof DoerInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DoerInput.safeParse(raw);
  if (!parsed.success) return fail("That didn't look like a compliance update.");
  const v = parsed.data;
  if (v.doerStatus === undefined && v.notes === undefined) return { ok: true };

  const item = await loadItem(v.itemId);
  if (!item) return fail("That compliance no longer exists.");
  if (!(item.owner === me.id || isSuperAdmin(me.email) || canEditPastDccEntries(me.email))) {
    return fail("Only the person it belongs to can update their Doer Status.");
  }

  const now = new Date();
  try {
    const fill = await findFill(v.itemId, item, v.deadline);
    const prevDoer = doerStatusOf(fill);
    const prevApprover = approverStatusOf(fill);
    const doer: DoerStatus | null = v.doerStatus ?? prevDoer;
    const leavingDone = v.doerStatus !== undefined && v.doerStatus !== "done" && prevDoer === "done";
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
      filledById: me.id,
      updatedAt: now,
    };

    if (fill) {
      await db.update(dccEntries).set(set).where(eq(dccEntries.id, fill.id));
    } else {
      await db.execute(sql`
        INSERT INTO dcc_entries
          (item_id, entry_date, status, doer_status, done_at, approver_status, note, filled_by_id)
        VALUES (${v.itemId}, ${v.deadline}, ${set.status}, ${doer}, ${doneAt ? doneAt.toISOString() : null},
                ${approver}, ${v.notes ?? null}, ${me.id})
        ON CONFLICT (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET status = EXCLUDED.status, doer_status = EXCLUDED.doer_status,
                      done_at = EXCLUDED.done_at, note = COALESCE(EXCLUDED.note, dcc_entries.note),
                      filled_by_id = EXCLUDED.filled_by_id, updated_at = now()
      `);
    }
  } catch {
    return fail("Could not save that. If this keeps happening, migration 0238 may not have been run.");
  }

  scheduleDccCalendarSync(item.owner, v.deadline);
  revalidateCompliance();
  return { ok: true };
}

/* ── The approver's side ──────────────────────────────────────────────────── */

const ApproverInput = z.object({
  itemId: z.string().uuid(),
  deadline: ymd,
  status: z.string().refine(isApproverChoice, "Unknown Approver Status.").optional(),
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
  const actor = await actorFor(me, item);

  const now = new Date();
  try {
    const fill = await findFill(v.itemId, item, v.deadline);
    const doer = doerStatusOf(fill);
    if (v.status !== undefined) {
      const verdict = canSetApproverStatus(actor, v.status, doer);
      if (!verdict.ok) return fail(verdict.reason);
    } else if (!canRuleOn(actor)) {
      return fail("Only the doer's manager, whoever gave the compliance, or an admin can write the Approver Notes.");
    }

    const approver =
      v.status !== undefined && isApproverChoice(v.status) ? approverStored(v.status) : approverStatusOf(fill);
    const set = {
      approverStatus: approver,
      status: legacyStatusFor(doer, approver),
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
});

/**
 * The three schedule columns together — `frequency` is the text people (and
 * the DCC importer) read, `weekdays` / `schedule_kind` / `month_day` are what
 * the checklists obey. The text is chosen so lib/dcc/util's parseFrequency
 * reads it back as the same kind.
 */
function scheduleColumns(v: z.infer<typeof ItemInput>):
  | { ok: true; frequency: string; weekdays: number; scheduleKind: string; monthDay: number | null }
  | { ok: false; error: string } {
  if (v.kind === "mcc") {
    return {
      ok: true,
      frequency: "Monthly",
      weekdays: 0,
      scheduleKind: "monthly",
      monthDay: v.monthDay ?? null,
    };
  }
  const days = [...new Set(v.weekdays)].sort();
  const mask = days.reduce((m, b) => m | (1 << b), 0);
  if ((v.wccMode ?? "days") === "weekly") {
    const frequency =
      days.length === 0 ? "Weekly" : days.length === 1 ? `Every ${WEEKDAY_LONG[days[0]!]}` : days.map((b) => WEEKDAY_SHORT[b]).join(" or ");
    return { ok: true, frequency, weekdays: mask, scheduleKind: "weekly", monthDay: null };
  }
  if (mask === 0) return { ok: false, error: "Pick at least one day, or the compliance will never be due." };
  const frequency =
    mask === 0b0111111 ? "Daily" : days.map((b) => WEEKDAY_SHORT[b]).join(", ").replace(/, ([^,]*)$/, " & $1");
  return { ok: true, frequency, weekdays: mask, scheduleKind: "scheduled", monthDay: null };
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
          needsReview: false,
          updatedAt: new Date(),
        })
        .where(and(eq(dccKpiItems.id, v.itemId), eq(dccKpiItems.archived, false)));
      scheduleDccCalendarSync(guard.owner);
    } else {
      const scope = await loadDccScope(me);
      if (!canManageItemsFor(scope, v.ownerEmployeeId)) {
        return fail("You can add compliances for yourself and your team only.");
      }
      await db.insert(dccKpiItems).values({
        ownerEmployeeId: v.ownerEmployeeId,
        title: v.title,
        section: v.section || null,
        frequency: sched.frequency,
        weekdays: sched.weekdays,
        scheduleKind: sched.scheduleKind,
        monthDay: sched.monthDay,
        needsReview: false,
        createdById: me.id,
      });
      scheduleDccCalendarSync(v.ownerEmployeeId);
    }
  } catch {
    return fail("Could not save the compliance. If this keeps happening, migration 0238 may not have been run.");
  }

  revalidateCompliance();
  revalidatePath("/dcc/masters");
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
