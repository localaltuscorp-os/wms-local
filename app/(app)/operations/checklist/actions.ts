"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  opsChecklistItems,
  opsChecklistChecks,
  opsChecklistRuns,
  opsChecklistTemplates,
  calendarEvents,
} from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CHECK_STATUSES, readCheckStatus } from "@/lib/operations/checklist";
import { parseRRule } from "@/lib/recurrence/rrule";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import {
  approverStored,
  canRuleOn,
  canSetApproverStatus,
  isApproverChoice,
  type ApproverActor,
} from "@/lib/status/approver-status";
import {
  checklistDemoActive,
  demoCreateItem,
  demoChecklistSnapshot,
  demoCreateEvent,
  demoCreateRun,
  demoFindItem,
  demoRemoveItem,
  demoSaveRunAsTemplate,
  demoSetApprover,
  demoSetCheck,
  demoUpdateItem,
  demoUpdateRun,
} from "@/lib/demo/ops-checklist-demo";
import { OFFSET_MAX, OFFSET_MIN } from "@/lib/operations/checklist-dates";

const PATH = "/operations/checklist";
/** Every page that shows these rows: the area's own page AND the Masters section. */
function revalidateChecklist() {
  revalidatePath(PATH);
  revalidatePath("/operations/masters", "layout");
}

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

/**
 * A uuid — or one of the demo dataset's readable ids while 0221 is unapplied.
 *
 * The demo store hands out `demo-run-1` rather than a uuid on purpose: an id
 * you can match by eye is worth a great deal when you are looking at a grid
 * full of sample rows. `checklistDemoActive()` cannot be true unless a read has
 * already failed with 42P01, so this can never widen what a real table accepts.
 */
const idText = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (v) => z.string().uuid().safeParse(v).success || (checklistDemoActive() && v.startsWith("demo-")),
    "Invalid id.",
  );

const optUuid = z
  .preprocess((v) => (v === "" ? null : v), idText.nullable().optional())
  .transform((v) => v ?? null);

const optOffset = z
  .preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(OFFSET_MIN).max(OFFSET_MAX).nullable(),
  )
  .transform((v) => v ?? null);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/** Google Calendar's RRULE, as the Target Date menu writes it. Blank = does not repeat. */
const optRule = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z
      .string()
      .max(500)
      .refine((r) => r === "" || parseRRule(r) !== null, "That repeat rule could not be read.")
      .nullable()
      .optional(),
  )
  .transform((r) => (r ? r : null));

/**
 * WHO MAY EDIT THE CHECKLIST vs WHO MAY TICK.
 *
 * Two different rules, deliberately. Editing rows changes the checklist for
 * everybody, so it is admin-only. TICKING is the work itself — the whole point
 * is that the person doing the job records it — so any member of the room may
 * do it. Collapsing the two would either lock people out of their own checklist
 * or let anyone rewrite the company's process.
 */
async function requireEditor() {
  const me = await requireWorkspace("operations");
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    return { me, denied: fail("Only an admin can change the checklist.") };
  }
  return { me, denied: null };
}

/* ── Runs ─────────────────────────────────────────────────────────────────── */

/* ── Events ─────────────────────────────────────────────────────── */

const CreateEvent = z.object({
  title: z.string().trim().min(1, "Give the event a name.").max(200),
  eventDate: ymd,
});

/**
 * Add an event from inside the checklist screen.
 *
 * WHY THIS WRITES TO THE COMPANY CALENDAR rather than to a private list of
 * names. The event picker reads `calendar_events`, which is the firm's single
 * record of what is happening and when; a second list owned by this screen
 * would drift from it within a week, and the checklist would start planning
 * around a date the calendar disagrees with. So "Add event" is a real event,
 * created all-day and unconfirmed of time, and the Monthly Events Master shows
 * it like any other — including the "this event moved" banner if somebody
 * later changes its date there.
 *
 * ADMIN-ONLY, via the same `requireEditor` that gates creating a checklist:
 * anyone who may build the plan may name the occasion it is built for, and
 * nobody else can write to the calendar through this door.
 *
 * A name and date that already exist RETURN THE EXISTING EVENT instead of a
 * duplicate. Two "Annual Day 2026" rows on the same date are never what
 * somebody meant, and the second one silently splits the checklists between
 * them.
 */
export async function createChecklistEvent(
  input: unknown,
): Promise<ActionResult<{ id: string; title: string; eventDate: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateEvent.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid event.");
  const v = parsed.data;

  if (checklistDemoActive()) {
    const row = demoCreateEvent(v);
    revalidateChecklist();
    return { ok: true, ...row };
  }

  try {
    const [dupe] = await db
      .select({ id: calendarEvents.id, title: calendarEvents.title, eventDate: calendarEvents.eventDate })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.title, v.title), eq(calendarEvents.eventDate, v.eventDate)))
      .limit(1);
    if (dupe) {
      revalidateChecklist();
      return { ok: true, id: dupe.id, title: dupe.title, eventDate: dupe.eventDate };
    }

    const [row] = await db
      .insert(calendarEvents)
      .values({
        title: v.title,
        eventDate: v.eventDate,
        // All-day: this door collects a name and a date, and inventing a start
        // time would put a wrong one on the company calendar.
        allDay: true,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: calendarEvents.id });

    revalidateChecklist();
    // The calendar renders this event too, and it is cached per route.
    revalidatePath("/events/calendar");
    return { ok: true, id: row!.id, title: v.title, eventDate: v.eventDate };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not add the event.");
  }
}

const CreateRun = z.object({
  title: z.string().trim().min(1, "Give the checklist a name.").max(300),
  isEvent: z.boolean(),
  eventId: optUuid,
  eventDate: ymd.nullable().optional(),
  /** Copy every row from this template. */
  templateId: optUuid,
});

/**
 * Create a checklist — blank, or duplicated from a template.
 *
 * ONE TRANSACTION. A half-created run — rows present, or rows missing — reads
 * as a working checklist and is not one, and the person who opens it has no way
 * to tell which rows never arrived.
 */
export async function createChecklistRun(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateRun.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid checklist.");
  const v = parsed.data;

  /* Demo data has its own events, and its ids are not uuids — so the
     calendar_events lookup below must not run against them. */
  if (checklistDemoActive()) {
    const ev = demoChecklistSnapshot().events.find((e) => e.id === v.eventId);
    const date = v.eventDate ?? ev?.eventDate ?? null;
    if (v.isEvent && !date) return fail("Pick the event, or set the event date.");
    const id = demoCreateRun({ ...v, eventDate: v.isEvent ? date : null });
    revalidateChecklist();
    return { ok: true, id };
  }

  // An event run needs a date: without one no target date can be computed, and
  // the grid would render a column of blanks. The DB enforces this too; failing
  // here gives a sentence instead of a constraint name.
  let eventDate = v.eventDate ?? null;
  if (v.isEvent) {
    if (v.eventId && !eventDate) {
      const ev = await db
        .select({ d: calendarEvents.eventDate })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, v.eventId))
        .limit(1);
      eventDate = ev[0]?.d ?? null;
    }
    if (!eventDate) return fail("Pick the event, or set the event date.");
  } else {
    eventDate = null;
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(opsChecklistRuns)
        .values({
          title: v.title,
          isEvent: v.isEvent,
          eventId: v.isEvent ? v.eventId : null,
          eventDate,
          createdById: me.id,
          updatedById: me.id,
        })
        .returning({ id: opsChecklistRuns.id });

      const runId = run!.id;

      if (v.templateId) {
        const rows = await tx
          .select({
            code: opsChecklistItems.code,
            title: opsChecklistItems.title,
            category: opsChecklistItems.category,
            offsetDays: opsChecklistItems.offsetDays,
            doerId: opsChecklistItems.doerId,
            backupId: opsChecklistItems.backupId,
            instructions: opsChecklistItems.instructions,
            fileLink: opsChecklistItems.fileLink,
            jdEntryId: opsChecklistItems.jdEntryId,
            client: opsChecklistItems.client,
            initiatorId: opsChecklistItems.initiatorId,
            recurrenceRule: opsChecklistItems.recurrenceRule,
            sortOrder: opsChecklistItems.sortOrder,
          })
          .from(opsChecklistItems)
          .where(
            and(
              eq(opsChecklistItems.templateId, v.templateId),
              eq(opsChecklistItems.isActive, true),
            ),
          );

        if (rows.length > 0) {
          await tx.insert(opsChecklistItems).values(
            rows.map((r) => ({
              ...r,
              runId,
              templateId: null,
              initiatorId: r.initiatorId ?? me.id,
              createdById: me.id,
              updatedById: me.id,
            })),
          );
        }
      }

      return runId;
    });

    revalidateChecklist();
    return { ok: true, id };
  } catch {
    return fail("Could not create the checklist. Nothing was saved.");
  }
}

const UpdateRun = z.object({
  id: idText,
  title: z.string().trim().min(1).max(300).optional(),
  eventDate: ymd.optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  notes: optText.optional(),
});

/**
 * Change a run. Moving `eventDate` shifts every target date with it, because
 * targets are derived rather than stored per row — which is the point of the
 * offset model, and why this needs no second write.
 */
export async function updateChecklistRun(input: unknown): Promise<ActionResult> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;

  const parsed = UpdateRun.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");
  const { id, ...rest } = parsed.data;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  if (rest.title !== undefined) patch.title = rest.title;
  if (rest.eventDate !== undefined) patch.eventDate = rest.eventDate;
  if (rest.status !== undefined) patch.status = rest.status;
  if (rest.notes !== undefined) patch.notes = rest.notes;

  if (checklistDemoActive()) {
    if (!demoUpdateRun({ id, ...rest })) return fail("That checklist is gone.");
    revalidateChecklist();
    return { ok: true };
  }

  try {
    await db.update(opsChecklistRuns).set(patch).where(eq(opsChecklistRuns.id, id));
    revalidateChecklist();
    return { ok: true };
  } catch {
    return fail("Could not save that change.");
  }
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

const ItemFields = z.object({
  title: z.string().trim().min(1, "An activity is required.").max(500),
  offsetDays: optOffset,
  targetDate: ymd.nullable().optional(),
  doerId: optUuid,
  backupId: optUuid,
  /** Shown as SUBJECT — the WMS Tasks roster (0237 relabelled the column). */
  category: optText,
  instructions: optText,
  fileLink: optText,
  client: optText,
  initiatorId: optUuid,
  recurrenceRule: optRule,
});

const CreateItem = ItemFields.extend({ runId: idText });

export async function createChecklistItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateItem.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid row.");
  const v = parsed.data;

  if (v.backupId && v.backupId === v.doerId) {
    return fail("The backup must be someone other than the doer.");
  }

  if (checklistDemoActive()) {
    const id = demoCreateItem({
      runId: v.runId,
      title: v.title,
      offsetDays: v.offsetDays,
      targetDate: v.targetDate ?? null,
      doerId: v.doerId,
      backupId: v.backupId,
    });
    if (!id) return fail("That checklist is gone.");
    revalidateChecklist();
    return { ok: true, id };
  }

  try {
    // Append: one past the current maximum, so a new row lands at the bottom of
    // its group rather than colliding with an existing sort position.
    const tail = await db
      .select({ next: sql<number>`coalesce(max(${opsChecklistItems.sortOrder}), 0) + 10` })
      .from(opsChecklistItems)
      .where(eq(opsChecklistItems.runId, v.runId));
    const next = tail[0]?.next ?? 100;

    const [row] = await db
      .insert(opsChecklistItems)
      .values({
        runId: v.runId,
        title: v.title,
        offsetDays: v.offsetDays,
        targetDate: v.targetDate ?? null,
        doerId: v.doerId,
        backupId: v.backupId,
        category: v.category,
        instructions: v.instructions,
        fileLink: v.fileLink,
        client: v.client,
        // Whoever adds the row asked for it, unless somebody else is named.
        initiatorId: v.initiatorId ?? me.id,
        recurrenceRule: v.recurrenceRule,
        sortOrder: next ?? 100,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: opsChecklistItems.id });

    revalidateChecklist();
    return { ok: true, id: row!.id };
  } catch {
    return fail("Could not add that row.");
  }
}

/**
 * BULK UPLOAD — many rows from one Excel sheet, on a checklist OR a master
 * (account holder, 2026-09-18). The dialog has already checked every row
 * (lib/operations/checklist-bulk.ts); each is validated again here with the
 * single-row schema, and they go in one transaction — a sheet lands whole or
 * not at all, so a failure half-way never leaves half a sheet to find.
 */
const BulkRows = z
  .object({
    runId: idText.optional(),
    templateId: idText.optional(),
    rows: z.array(ItemFields).min(1, "No rows to add.").max(500, "Up to 500 rows at once."),
  })
  .refine((v) => Boolean(v.runId) !== Boolean(v.templateId), "Upload to one checklist or one master.");

export async function bulkCreateChecklistRows(
  input: unknown,
): Promise<ActionResult<{ created: number }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = BulkRows.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const row = issue?.path[0] === "rows" && typeof issue.path[1] === "number" ? `Row ${issue.path[1] + 1}: ` : "";
    return fail(`${row}${issue?.message ?? "Invalid rows."}`);
  }
  const { runId, templateId, rows } = parsed.data;
  const clash = rows.findIndex((r) => r.backupId && r.backupId === r.doerId);
  if (clash >= 0) return fail(`Row ${clash + 1}: the backup must be someone other than the doer.`);

  if (checklistDemoActive()) {
    if (templateId) return fail(MASTERS_NEED_TABLES);
    for (const r of rows) {
      const id = demoCreateItem({
        runId: runId!,
        title: r.title,
        offsetDays: r.offsetDays,
        targetDate: r.targetDate ?? null,
        doerId: r.doerId,
        backupId: r.backupId,
      });
      if (!id) return fail("That checklist is gone.");
    }
    revalidateChecklist();
    return { ok: true, created: rows.length };
  }

  try {
    await db.transaction(async (tx) => {
      const owner = runId ? eq(opsChecklistItems.runId, runId) : eq(opsChecklistItems.templateId, templateId!);
      const tail = await tx
        .select({ next: sql<number>`coalesce(max(${opsChecklistItems.sortOrder}), 0) + 10` })
        .from(opsChecklistItems)
        .where(owner);
      const start = Number(tail[0]?.next ?? 100);
      await tx.insert(opsChecklistItems).values(
        rows.map((r, i) => ({
          runId: runId ?? null,
          templateId: templateId ?? null,
          title: r.title,
          offsetDays: r.offsetDays,
          // A master has no dates — only a day counted from the event.
          targetDate: runId ? (r.targetDate ?? null) : null,
          doerId: r.doerId,
          backupId: r.backupId,
          category: r.category,
          instructions: r.instructions,
          fileLink: r.fileLink,
          client: r.client,
          initiatorId: r.initiatorId ?? me.id,
          recurrenceRule: r.recurrenceRule,
          sortOrder: start + i * 10,
          createdById: me.id,
          updatedById: me.id,
        })),
      );
    });
    revalidateChecklist();
    return { ok: true, created: rows.length };
  } catch {
    return fail("Could not add those rows. Nothing was saved.");
  }
}

const UpdateItem = ItemFields.partial().extend({ id: idText });

/** Inline cell edit. Every field is optional — one cell saves one column. */
export async function updateChecklistItem(input: unknown): Promise<ActionResult> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;

  const parsed = UpdateItem.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");
  const { id, ...rest } = parsed.data;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  for (const k of [
    "title",
    "offsetDays",
    "targetDate",
    "doerId",
    "backupId",
    "category",
    "instructions",
    "fileLink",
    "client",
    "initiatorId",
    "recurrenceRule",
  ] as const) {
    if (rest[k] !== undefined) patch[k] = rest[k];
  }

  if (checklistDemoActive()) {
    if (!demoUpdateItem({ id, ...rest })) return fail("That row is gone.");
    revalidateChecklist();
    return { ok: true };
  }

  try {
    await db.update(opsChecklistItems).set(patch).where(eq(opsChecklistItems.id, id));
    revalidateChecklist();
    return { ok: true };
  } catch {
    // The backup-is-not-the-doer rule is a CHECK constraint, so it surfaces
    // here rather than in the schema above when only one of the two changed.
    return fail("Could not save that cell. A backup cannot also be the doer.");
  }
}

/** Soft delete — the row leaves the grid, its tick history stays readable. */
export async function removeChecklistItem(input: unknown): Promise<ActionResult> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;

  const parsed = z.object({ id: idText }).safeParse(input);
  if (!parsed.success) return fail("Invalid row.");

  if (checklistDemoActive()) {
    if (!demoRemoveItem(parsed.data.id)) return fail("That row is gone.");
    revalidateChecklist();
    return { ok: true };
  }

  try {
    await db
      .update(opsChecklistItems)
      .set({ isActive: false, updatedById: me.id, updatedAt: new Date() })
      .where(eq(opsChecklistItems.id, parsed.data.id));
    revalidateChecklist();
    return { ok: true };
  } catch {
    return fail("Could not remove that row.");
  }
}

/* ── Ticks ────────────────────────────────────────────────────────────────── */

const SetCheck = z.object({
  runId: idText,
  itemId: idText,
  /** The Doer Status — the WMS Tasks six. Omitted when only the notes change. */
  status: z.enum(CHECK_STATUSES).optional(),
  /** Doer Notes. */
  notes: optText.optional(),
});

/**
 * The doer's side of a row: Doer Status and Doer Notes. ANY member of the room
 * may do this — see requireEditor's note.
 *
 * `done_at` IS THE ACTUAL DATE, and it is written by the server on the
 * transition INTO Done and cleared on the way out. Trusting a client-sent
 * timestamp would let a late tick be backdated to look on time, which is
 * precisely the number variance exists to measure.
 *
 * Leaving Done also lifts an Approved / Not Approved ruling: those judge
 * finished work, and the work is no longer finished (as on a WMS task).
 */
export async function setChecklistCheck(input: unknown): Promise<ActionResult> {
  const me = await requireWorkspace("operations");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetCheck.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid tick.");
  const v = parsed.data;
  if (v.status === undefined && v.notes === undefined) return { ok: true };

  if (checklistDemoActive()) {
    if (!demoSetCheck({ itemId: v.itemId, status: v.status, notes: v.notes }))
      return fail("That row is gone.");
    revalidateChecklist();
    return { ok: true };
  }

  const now = new Date();
  const statusSet =
    v.status === undefined
      ? {}
      : {
          status: v.status,
          // Re-picking Done keeps the first actual date; leaving Done clears it.
          doneAt:
            v.status === "done"
              ? sql`coalesce(${opsChecklistChecks.doneAt}, ${now.toISOString()}::timestamptz)`
              : null,
          ...(v.status !== "done"
            ? {
                approverStatus: sql`case when ${opsChecklistChecks.approverStatus} in ('approved', 'not_approved') then null else ${opsChecklistChecks.approverStatus} end`,
              }
            : {}),
        };

  try {
    await db
      .insert(opsChecklistChecks)
      .values({
        runId: v.runId,
        itemId: v.itemId,
        status: v.status ?? "not_started",
        notes: v.notes ?? null,
        doneAt: v.status === "done" ? now : null,
        updatedById: me.id,
      })
      .onConflictDoUpdate({
        target: [opsChecklistChecks.runId, opsChecklistChecks.itemId],
        set: {
          ...statusSet,
          ...(v.notes !== undefined ? { notes: v.notes } : {}),
          updatedById: me.id,
          updatedAt: now,
        },
      });

    revalidateChecklist();
    return { ok: true };
  } catch {
    return fail("Could not save that. If this keeps happening, migration 0237 may not have been run.");
  }
}

const SetApprover = z.object({
  runId: idText,
  itemId: idText,
  /** Pending · Approved · Not Approved · On Hold · Archived · Cancelled. */
  status: z.string().refine(isApproverChoice, "Unknown Approver Status.").optional(),
  approverNotes: optText.optional(),
});

/**
 * The approver's side of a row: Approver Status and Approver Notes.
 *
 * The SAME rule as a WMS task's Initiator Status (lib/status/approver-status.ts):
 * the row's initiator, the doer's manager or an admin may rule, never the doer
 * on their own row; Approved / Not Approved wait for the Doer Status to reach
 * Done; a row whose initiator IS its doer has no approver, so only an admin
 * rules on it.
 */
export async function setChecklistApprover(input: unknown): Promise<ActionResult> {
  const me = await requireWorkspace("operations");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetApprover.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid ruling.");
  const v = parsed.data;
  if (v.status === undefined && v.approverNotes === undefined) return { ok: true };

  let row: {
    doerId: string | null;
    initiatorId: string | null;
    status: string | null;
  } | null;
  if (checklistDemoActive()) {
    const it = demoFindItem(v.itemId);
    row = it ? { doerId: it.doerId, initiatorId: it.initiatorId, status: it.status } : null;
  } else {
    const [found] = await db
      .select({
        doerId: opsChecklistItems.doerId,
        initiatorId: opsChecklistItems.initiatorId,
        status: opsChecklistChecks.status,
      })
      .from(opsChecklistItems)
      .leftJoin(
        opsChecklistChecks,
        and(eq(opsChecklistChecks.itemId, opsChecklistItems.id), eq(opsChecklistChecks.runId, v.runId)),
      )
      .where(and(eq(opsChecklistItems.id, v.itemId), eq(opsChecklistItems.runId, v.runId)))
      .limit(1);
    row = found ?? null;
  }
  if (!row) return fail("That row is gone.");

  const isDoer = !!row.doerId && row.doerId === me.id;
  const isSelfRaised = !!row.initiatorId && row.initiatorId === row.doerId;
  const actor: ApproverActor = {
    isAdmin: me.isAdmin || isSuperAdmin(me.email),
    isInitiator: row.initiatorId === me.id && !isSelfRaised,
    isDoersManager:
      !isDoer &&
      !!row.doerId &&
      (await getDownlineIds(me.id).catch(() => [] as string[])).includes(row.doerId),
    isDoer,
    isSelfRaised,
  };

  if (v.status !== undefined) {
    const verdict = canSetApproverStatus(actor, v.status, readCheckStatus(row.status));
    if (!verdict.ok) return fail(verdict.reason);
  } else if (!canRuleOn(actor)) {
    return fail("Only the initiator, the doer's manager or an admin can write the Approver Notes.");
  }

  const nextStatus =
    v.status !== undefined && isApproverChoice(v.status) ? approverStored(v.status) : undefined;

  if (checklistDemoActive()) {
    demoSetApprover({ itemId: v.itemId, approverStatus: nextStatus, approverNotes: v.approverNotes });
    revalidateChecklist();
    return { ok: true };
  }

  const now = new Date();
  const set = {
    ...(nextStatus !== undefined ? { approverStatus: nextStatus, approverId: me.id, approverAt: now } : {}),
    ...(v.approverNotes !== undefined ? { approverNotes: v.approverNotes } : {}),
    updatedAt: now,
  };
  try {
    await db
      .insert(opsChecklistChecks)
      .values({ runId: v.runId, itemId: v.itemId, status: "not_started", ...set, updatedById: me.id })
      .onConflictDoUpdate({ target: [opsChecklistChecks.runId, opsChecklistChecks.itemId], set });
    revalidateChecklist();
    return { ok: true };
  } catch {
    return fail("Could not save that. If this keeps happening, migration 0237 may not have been run.");
  }
}

/* ── Templates ────────────────────────────────────────────────────────────── */

const SaveTemplate = z.object({
  runId: idText,
  name: z.string().trim().min(1, "Give the master checklist a name.").max(200),
  description: optText.optional(),
});

/**
 * Save a run's rows as a reusable master checklist.
 *
 * Activities, offsets, doers and backups travel. Ticks, actual dates and the
 * event itself do not — they belong to the run that was worked, not to the
 * pattern. Doer and backup ARE copied deliberately: the same people run the
 * same event year after year, and re-picking twelve names is the friction that
 * stops templates being used at all.
 */
export async function saveRunAsTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;

  const parsed = SaveTemplate.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid template.");
  const v = parsed.data;

  if (checklistDemoActive()) {
    const id = demoSaveRunAsTemplate(v.runId, v.name);
    if (!id) return fail("That checklist is gone.");
    revalidateChecklist();
    return { ok: true, id };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const runs = await tx
        .select({ isEvent: opsChecklistRuns.isEvent })
        .from(opsChecklistRuns)
        .where(eq(opsChecklistRuns.id, v.runId))
        .limit(1);

      const [tpl] = await tx
        .insert(opsChecklistTemplates)
        .values({
          name: v.name,
          isEvent: runs[0]?.isEvent ?? true,
          description: v.description ?? null,
          createdById: me.id,
          updatedById: me.id,
        })
        .returning({ id: opsChecklistTemplates.id });

      const rows = await tx
        .select({
          code: opsChecklistItems.code,
          title: opsChecklistItems.title,
          category: opsChecklistItems.category,
          offsetDays: opsChecklistItems.offsetDays,
          doerId: opsChecklistItems.doerId,
          backupId: opsChecklistItems.backupId,
          instructions: opsChecklistItems.instructions,
          fileLink: opsChecklistItems.fileLink,
          jdEntryId: opsChecklistItems.jdEntryId,
          client: opsChecklistItems.client,
          initiatorId: opsChecklistItems.initiatorId,
          recurrenceRule: opsChecklistItems.recurrenceRule,
          sortOrder: opsChecklistItems.sortOrder,
        })
        .from(opsChecklistItems)
        .where(
          and(eq(opsChecklistItems.runId, v.runId), eq(opsChecklistItems.isActive, true)),
        );

      if (rows.length > 0) {
        await tx.insert(opsChecklistItems).values(
          rows.map((r) => ({
            ...r,
            templateId: tpl!.id,
            runId: null,
            createdById: me.id,
            updatedById: me.id,
          })),
        );
      }

      return tpl!.id;
    });

    revalidateChecklist();
    return { ok: true, id };
  } catch {
    return fail("Could not save the master checklist. A name must be unique.");
  }
}

/* ── Masters, edited directly (account holder, 2026-09-15) ───────────────────
 * A master used to be born only from a worked checklist ("Save as Master
 * Checklist"). The Masters section lets an admin write one from scratch, rename
 * it, change its rows, copy it and retire it. Its rows go through the same
 * updateChecklistItem / removeChecklistItem as a run's — a row is addressed by
 * id whichever parent it has. */

const MASTERS_NEED_TABLES = "Masters need the checklist tables (migration 0221).";

const CreateTemplate = z.object({
  name: z.string().trim().min(1, "Give the master checklist a name.").max(200),
  isEvent: z.boolean(),
  description: optText.optional(),
});

export async function createChecklistTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateTemplate.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid master.");
  if (checklistDemoActive()) return fail(MASTERS_NEED_TABLES);
  const v = parsed.data;

  try {
    const [row] = await db
      .insert(opsChecklistTemplates)
      .values({
        name: v.name,
        isEvent: v.isEvent,
        description: v.description ?? null,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: opsChecklistTemplates.id });
    revalidateChecklist();
    return { ok: true, id: row!.id };
  } catch {
    return fail("Could not create the master. The name must be unique, retired masters included.");
  }
}

const UpdateTemplate = z.object({
  id: idText,
  name: z.string().trim().min(1, "A master needs a name.").max(200).optional(),
  isEvent: z.boolean().optional(),
  description: optText.optional(),
  isActive: z.boolean().optional(),
});

/** Rename, re-describe, switch Event-linked / Standing, or retire (isActive false). */
export async function updateChecklistTemplate(input: unknown): Promise<ActionResult> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const parsed = UpdateTemplate.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");
  if (checklistDemoActive()) return fail(MASTERS_NEED_TABLES);
  const { id, ...rest } = parsed.data;

  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  for (const k of ["name", "isEvent", "description", "isActive"] as const) {
    if (rest[k] !== undefined) patch[k] = rest[k];
  }

  try {
    await db.update(opsChecklistTemplates).set(patch).where(eq(opsChecklistTemplates.id, id));
    revalidateChecklist();
    return { ok: true };
  } catch {
    return fail("Could not save that change. The name must be unique.");
  }
}

const DuplicateTemplate = z.object({
  id: idText,
  name: z.string().trim().min(1, "Name the copy.").max(200),
});

/** Copy a master with all its rows — the quickest way to a variant of a plan. */
export async function duplicateChecklistTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = DuplicateTemplate.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid copy.");
  if (checklistDemoActive()) return fail(MASTERS_NEED_TABLES);
  const v = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const [src] = await tx
        .select({ isEvent: opsChecklistTemplates.isEvent, description: opsChecklistTemplates.description })
        .from(opsChecklistTemplates)
        .where(eq(opsChecklistTemplates.id, v.id))
        .limit(1);
      if (!src) throw new Error("gone");

      const [tpl] = await tx
        .insert(opsChecklistTemplates)
        .values({
          name: v.name,
          isEvent: src.isEvent,
          description: src.description,
          createdById: me.id,
          updatedById: me.id,
        })
        .returning({ id: opsChecklistTemplates.id });

      const rows = await tx
        .select({
          code: opsChecklistItems.code,
          title: opsChecklistItems.title,
          category: opsChecklistItems.category,
          offsetDays: opsChecklistItems.offsetDays,
          doerId: opsChecklistItems.doerId,
          backupId: opsChecklistItems.backupId,
          instructions: opsChecklistItems.instructions,
          fileLink: opsChecklistItems.fileLink,
          jdEntryId: opsChecklistItems.jdEntryId,
          client: opsChecklistItems.client,
          initiatorId: opsChecklistItems.initiatorId,
          recurrenceRule: opsChecklistItems.recurrenceRule,
          sortOrder: opsChecklistItems.sortOrder,
        })
        .from(opsChecklistItems)
        .where(and(eq(opsChecklistItems.templateId, v.id), eq(opsChecklistItems.isActive, true)));

      if (rows.length > 0) {
        await tx.insert(opsChecklistItems).values(
          rows.map((r) => ({ ...r, templateId: tpl!.id, runId: null, createdById: me.id, updatedById: me.id })),
        );
      }
      return tpl!.id;
    });
    revalidateChecklist();
    return { ok: true, id };
  } catch {
    return fail("Could not copy the master. The new name must be unique.");
  }
}

const CreateTemplateItem = ItemFields.extend({ templateId: idText });

/** Add a row to a master. A master has no dates — only a day offset (event-linked). */
export async function createTemplateItem(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { me, denied } = await requireEditor();
  if (denied) return denied;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateTemplateItem.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid row.");
  if (checklistDemoActive()) return fail(MASTERS_NEED_TABLES);
  const v = parsed.data;
  if (v.backupId && v.backupId === v.doerId) {
    return fail("The backup must be someone other than the doer.");
  }

  try {
    const tail = await db
      .select({ next: sql<number>`coalesce(max(${opsChecklistItems.sortOrder}), 0) + 10` })
      .from(opsChecklistItems)
      .where(eq(opsChecklistItems.templateId, v.templateId));

    const [row] = await db
      .insert(opsChecklistItems)
      .values({
        templateId: v.templateId,
        title: v.title,
        offsetDays: v.offsetDays,
        targetDate: null,
        doerId: v.doerId,
        backupId: v.backupId,
        category: v.category,
        instructions: v.instructions,
        fileLink: v.fileLink,
        client: v.client,
        initiatorId: v.initiatorId ?? me.id,
        recurrenceRule: v.recurrenceRule,
        sortOrder: tail[0]?.next ?? 100,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: opsChecklistItems.id });
    revalidateChecklist();
    return { ok: true, id: row!.id };
  } catch {
    return fail("Could not add that row.");
  }
}
