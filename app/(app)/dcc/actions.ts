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

const AddInput = z.object({
  ownerEmployeeId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  section: z.string().trim().max(120).nullable().optional(),
  code: z.string().trim().max(40).nullable().optional(),
  frequency: z.string().trim().max(120).nullable().optional(),
  targetNumber: z.string().trim().max(20).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
});

export async function addDccItem(raw: z.input<typeof AddInput>): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Give the compliance a title." };
  const d = parsed.data;

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
    frequency: d.frequency || null,
    targetNumber: d.targetNumber || null,
    unit: d.unit || null,
    // THE AUTHOR IS THE POINT. lib/dcc/item-lock.ts reads this to decide whether
    // the delete guardrail fires, so an unrecorded author would silently turn
    // Manan's protected KPI into an ordinary one.
    createdById: me.id,
  });

  revalidatePath("/dcc");
  revalidatePath("/dcc/masters");
  return { ok: true };
}

/* ── 3 · Deleting a compliance ────────────────────────────────────────────── */

export async function deleteDccItem(itemId: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(itemId).success) {
    return { ok: false, error: "Unknown compliance." };
  }

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
  if (!guard.ok) return { ok: false, error: guard.error };

  // ARCHIVED, never deleted: the entries recorded against it are the record of
  // what somebody actually did, and a hard delete would cascade them away.
  await db
    .update(dccKpiItems)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(dccKpiItems.id, itemId), eq(dccKpiItems.archived, false)));

  revalidatePath("/dcc");
  revalidatePath("/dcc/masters");
  return { ok: true };
}
