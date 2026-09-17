"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccKpiItems, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { checkDccItemDelete } from "@/lib/dcc/item-lock";
import { scheduleDccCalendarSync } from "@/lib/dcc/calendar-sync";
import {
  DCC_SCHEDULE_CHOICES,
  isCompleteSchedule,
  resolveSchedule,
  type DccSchedule,
} from "@/lib/dcc/frequency";
import { writeDccEntry } from "@/lib/dcc/write";
import { DCC_STATUSES } from "@/lib/dcc/util";
import { isMissingTable, masterDesignationForItem } from "@/lib/dcc/master-sync";
import { masterLockedMessage } from "@/lib/dcc/master";

/**
 * THE DAILY BOARD'S WRITES (DCC-SPEC §5, §6).
 *
 * Three actions, three different rules, and they are deliberately not collapsed
 * into one "save" — the lock that governs an ENTRY (a day closing at 11:59 pm)
 * is not the lock that governs a COMPLIANCE (who may delete what Manan gave).
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/* ── 1 · Setting a day's outcome ──────────────────────────────────────────── */

const EntryInput = z.object({
  itemId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(DCC_STATUSES).nullable(),
  note: z.string().max(2000).nullable().optional(),
  value: z.number().finite().nullable().optional(),
});

export async function setDccEntry(raw: z.input<typeof EntryInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EntryInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That didn't look like a DCC entry." };

  // The window check, the ownership check and the upsert all live in the shared
  // write core, so the website and the native app cannot enforce different rules.
  return writeDccEntry(
    { id: me.id, email: me.email },
    {
      itemId: parsed.data.itemId,
      date: parsed.data.date,
      status: parsed.data.status,
      note: parsed.data.note ?? null,
      // dcc_entries.value_number is numeric(14,2); Drizzle hands numerics across
      // as strings so a big one cannot lose precision through a JS float.
      value: parsed.data.value === null || parsed.data.value === undefined ? null : String(parsed.data.value),
      subjectId: null,
    },
  );
}

/* ── 2 · Adding a compliance ──────────────────────────────────────────────── */

/**
 * THE SCHEDULE IS PICKED, NOT TYPED (lib/dcc/frequency.ts).
 *
 * This input used to take `frequency` as free text and write only that, leaving
 * `weekdays` NULL — and `scheduledDueOn` reads a NULL mask as "due every day".
 * So a compliance created as "Every Friday" was due seven days a week, and one
 * created as "Adhoc" was too: the row said one thing and the board did another,
 * with nothing on screen admitting it. The three values now come out of one
 * `resolveSchedule` call and cannot disagree.
 */
const ScheduleInput = z.object({
  choice: z.enum(DCC_SCHEDULE_CHOICES),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
});

/** The fields an author sets, shared by add and edit so the two cannot drift. */
const FIELDS = {
  title: z.string().trim().min(1).max(300),
  section: z.string().trim().max(120).nullable().optional(),
  code: z.string().trim().max(40).nullable().optional(),
  schedule: ScheduleInput,
  targetNumber: z.string().trim().max(20).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
};

const AddInput = z.object({ ownerEmployeeId: z.string().uuid(), ...FIELDS });

type ResolvedOrError =
  | { ok: true; value: ReturnType<typeof resolveSchedule> }
  | { ok: false; error: string };

/** A schedule with no day at all would be a compliance that is never due. */
function scheduleOrError(s: DccSchedule): ResolvedOrError {
  if (!isCompleteSchedule(s)) {
    return { ok: false, error: "Pick at least one day, or the compliance will never be due." };
  }
  return { ok: true, value: resolveSchedule(s) };
}

export async function addDccItem(raw: z.input<typeof AddInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Give the compliance a title." };
  const d = parsed.data;

  const sched = scheduleOrError(d.schedule);
  if (!sched.ok) return { ok: false, error: sched.error };

  /* A Team Lead authors for themselves and for anyone below them; a super-admin
     for anyone. Read from the org chart, never from a role flag — an admin with
     no reports has no downline, and that is correct. */
  const scope = await loadDccScope(me);
  if (!canManageItemsFor(scope, d.ownerEmployeeId)) {
    return { ok: false, error: "You can't add a compliance for this person." };
  }

  await db.insert(dccKpiItems).values({
    ownerEmployeeId: d.ownerEmployeeId,
    title: d.title,
    section: d.section || null,
    code: d.code || null,
    /* ALL THREE TOGETHER. `frequency` is the text people read; `weekdays` and
       `scheduleKind` are what the board actually obeys. Writing the text alone
       is the bug this replaces. */
    frequency: sched.value.frequency,
    weekdays: sched.value.weekdays,
    scheduleKind: sched.value.scheduleKind,
    needsReview: sched.value.needsReview,
    targetNumber: d.targetNumber || null,
    unit: d.unit || null,
    // THE AUTHOR IS THE POINT. lib/dcc/item-lock.ts reads this to decide whether
    // the delete guardrail fires, so an unrecorded author would silently turn
    // Manan's protected KPI into an ordinary one.
    createdById: me.id,
  });

  /* THE DAY'S GOOGLE CALENDAR EVENT LISTS THE DAY'S COMPLIANCES, so adding,
     renaming or removing one changes it. Deferred and best-effort: it runs
     after the response, and a Google failure is logged rather than thrown, so
     an expired token can never fail the save. The cron repairs whatever the
     live path missed. The Handholding calendar needs no call — it reads
     dcc_kpi_items live on every render. */
  scheduleDccCalendarSync(d.ownerEmployeeId);

  revalidatePath("/dcc");
  revalidatePath("/dcc/masters");
  return { ok: true };
}

/* ── 3 · Editing a compliance ─────────────────────────────────────────────── */

const UpdateInput = z.object({ itemId: z.string().uuid(), ...FIELDS });

/**
 * THE SAME GATES AS A DELETE, deliberately.
 *
 * A master row belongs to the position's template, and a row Manan authored is
 * his alone to remove (§5) — and an edit free to rename "Log every client call"
 * to anything at all would be a way straight around both rules. Edit and delete
 * share `guardItemWrite` rather than growing two copies of a rule that has to be
 * identical.
 */
export async function updateDccItem(raw: z.input<typeof UpdateInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Give the compliance a title." };
  const d = parsed.data;

  const sched = scheduleOrError(d.schedule);
  if (!sched.ok) return { ok: false, error: sched.error };

  const guard = await guardItemWrite(d.itemId, me);
  if (!guard.ok) return guard;

  await db
    .update(dccKpiItems)
    .set({
      title: d.title,
      section: d.section || null,
      code: d.code || null,
      frequency: sched.value.frequency,
      weekdays: sched.value.weekdays,
      scheduleKind: sched.value.scheduleKind,
      needsReview: sched.value.needsReview,
      targetNumber: d.targetNumber || null,
      unit: d.unit || null,
      updatedAt: new Date(),
    })
    .where(and(eq(dccKpiItems.id, d.itemId), eq(dccKpiItems.archived, false)));

  scheduleDccCalendarSync(guard.owner);

  revalidatePath("/dcc");
  revalidatePath("/dcc/masters");
  return { ok: true };
}

/**
 * May this viewer change this compliance at all? Ownership, then the
 * position-master lock, then Manan's author guardrail.
 *
 * THE ORDER IS THE MESSAGE: "it belongs to the Sales master" tells the author
 * where to go and change it, which a flat "you may not" does not.
 */
type CurrentUser = Awaited<ReturnType<typeof requireUser>>;

/** The owner comes back on success — the calendar sync needs whose day changed. */
type GuardResult = { ok: true; owner: string } | { ok: false; error: string };

async function guardItemWrite(itemId: string, me: CurrentUser): Promise<GuardResult> {
  const [item] = await db
    .select({ owner: dccKpiItems.ownerEmployeeId, createdById: dccKpiItems.createdById })
    .from(dccKpiItems)
    .where(eq(dccKpiItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "That compliance no longer exists." };

  const scope = await loadDccScope(me);
  if (!canManageItemsFor(scope, item.owner)) {
    return { ok: false, error: "You can't change this person's compliances." };
  }

  /* A master row is the template's, not the person's — it changes only through
     the DCC Master, or every holder quietly drifts from the position. */
  const designation = await masterDesignationForItem(itemId).catch((e) => {
    if (isMissingTable(e)) return null; // 0230 unapplied: no masters exist yet.
    throw e;
  });
  if (designation) return { ok: false, error: masterLockedMessage(designation) };

  // The Manan guardrail, from the KPI's recorded creator.
  let creatorEmail: string | null = null;
  if (item.createdById) {
    const [c] = await db
      .select({ email: employees.email })
      .from(employees)
      .where(eq(employees.id, item.createdById))
      .limit(1);
    creatorEmail = c?.email ?? null;
  }
  const guard = checkDccItemDelete({ actorEmail: me.email, creatorEmail });
  return guard.ok ? { ok: true, owner: item.owner } : { ok: false, error: guard.error };
}

/* ── 4 · Deleting a compliance ────────────────────────────────────────────── */

export async function deleteDccItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(itemId).success) {
    return { ok: false, error: "Unknown compliance." };
  }

  const guard = await guardItemWrite(itemId, me);
  if (!guard.ok) return guard;

  // ARCHIVED, never deleted: the entries recorded against it are the record of
  // what somebody actually did, and a hard delete would cascade them away.
  await db
    .update(dccKpiItems)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(dccKpiItems.id, itemId), eq(dccKpiItems.archived, false)));

  // The day's event has one row fewer now; see the note in addDccItem.
  scheduleDccCalendarSync(guard.owner);

  revalidatePath("/dcc");
  revalidatePath("/dcc/masters");
  return { ok: true };
}
