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
import { CHECK_STATUSES } from "@/lib/operations/checklist";
import { OFFSET_MAX, OFFSET_MIN } from "@/lib/operations/checklist-dates";

const PATH = "/operations/checklist";

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

const optUuid = z
  .preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional())
  .transform((v) => v ?? null);

const optOffset = z
  .preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(OFFSET_MIN).max(OFFSET_MAX).nullable(),
  )
  .transform((v) => v ?? null);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

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
              createdById: me.id,
              updatedById: me.id,
            })),
          );
        }
      }

      return runId;
    });

    revalidatePath(PATH);
    return { ok: true, id };
  } catch {
    return fail("Could not create the checklist. Nothing was saved.");
  }
}

const UpdateRun = z.object({
  id: z.string().uuid(),
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

  try {
    await db.update(opsChecklistRuns).set(patch).where(eq(opsChecklistRuns.id, id));
    revalidatePath(PATH);
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
  category: optText,
  instructions: optText,
  fileLink: optText,
});

const CreateItem = ItemFields.extend({ runId: z.string().uuid() });

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
        sortOrder: next ?? 100,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: opsChecklistItems.id });

    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch {
    return fail("Could not add that row.");
  }
}

const UpdateItem = ItemFields.partial().extend({ id: z.string().uuid() });

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
  ] as const) {
    if (rest[k] !== undefined) patch[k] = rest[k];
  }

  try {
    await db.update(opsChecklistItems).set(patch).where(eq(opsChecklistItems.id, id));
    revalidatePath(PATH);
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

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail("Invalid row.");

  try {
    await db
      .update(opsChecklistItems)
      .set({ isActive: false, updatedById: me.id, updatedAt: new Date() })
      .where(eq(opsChecklistItems.id, parsed.data.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail("Could not remove that row.");
  }
}

/* ── Ticks ────────────────────────────────────────────────────────────────── */

const SetCheck = z.object({
  runId: z.string().uuid(),
  itemId: z.string().uuid(),
  status: z.enum(CHECK_STATUSES),
  notes: optText.optional(),
});

/**
 * Tick a row. ANY member of the room may do this — see requireEditor's note.
 *
 * `done_at` IS THE ACTUAL DATE, and it is written by the server on the
 * transition INTO Done and cleared on the way out. Trusting a client-sent
 * timestamp would let a late tick be backdated to look on time, which is
 * precisely the number variance exists to measure.
 */
export async function setChecklistCheck(input: unknown): Promise<ActionResult> {
  const me = await requireWorkspace("operations");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetCheck.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid tick.");
  const v = parsed.data;

  const doneAt = v.status === "Done" ? new Date() : null;

  try {
    await db
      .insert(opsChecklistChecks)
      .values({
        runId: v.runId,
        itemId: v.itemId,
        status: v.status,
        notes: v.notes ?? null,
        doneAt,
        updatedById: me.id,
      })
      .onConflictDoUpdate({
        target: [opsChecklistChecks.runId, opsChecklistChecks.itemId],
        set: {
          status: v.status,
          ...(v.notes !== undefined ? { notes: v.notes } : {}),
          doneAt,
          updatedById: me.id,
          updatedAt: new Date(),
        },
      });

    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return fail("Could not save that tick.");
  }
}

/* ── Templates ────────────────────────────────────────────────────────────── */

const SaveTemplate = z.object({
  runId: z.string().uuid(),
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

    revalidatePath(PATH);
    return { ok: true, id };
  } catch {
    return fail("Could not save the master checklist. A name must be unique.");
  }
}
