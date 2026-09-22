"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveCatalog } from "@/db/schema";
import { filterToActiveEmployees, saveEligibility } from "@/lib/queries/incentive-eligibility";
import { requireAdmin } from "@/lib/auth/current";
import { INCENTIVE_ELIGIBILITY_REFUSAL } from "@/lib/security/capabilities";
import { mayManageIncentiveEligibility } from "@/lib/incentive/eligibility-guard";
import { rateLimitOrError } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/after";
import {
  processIncentiveCatalogEvent,
  recordIncentiveCatalogEvent,
} from "@/lib/incentive/notifications/service";
import { incentiveSnapshotFor } from "@/lib/queries/incentive-master";
import { todayIst } from "@/lib/incentive/master";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/incentive";
const UUID = z.string().uuid();

const EntrySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name is required.").max(160),
  description: z.string().trim().max(500).optional().nullable(),
  amount: z.number().min(0).max(10_000_000),
  salesEligible: z.boolean(),
  internsEligible: z.boolean(),
  notes: z.string().trim().max(1000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

/**
 * Tell the affected employees about a recorded change, after the response is
 * sent. The change has already committed; nothing the notifications do can
 * fail or slow the save. See lib/incentive/notifications/service.ts.
 */
function notifyCatalogChange(eventId: string | null) {
  if (eventId) afterResponse(() => processIncentiveCatalogEvent(eventId));
}

/**
 * Create or update one incentive-catalog entry. Admin-only.
 *
 * The change and its change record (`incentive_catalog_events`) are written in
 * one transaction; an edit that changes nothing material records nothing and
 * notifies no one.
 */
export async function upsertCatalogEntry(
  input: z.input<typeof EntrySchema>,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }
  const v = parsed.data;
  const values = {
    name: v.name,
    description: v.description?.trim() || null,
    amount: v.amount.toFixed(2),
    salesEligible: v.salesEligible,
    internsEligible: v.internsEligible,
    notes: v.notes?.trim() || null,
    sortOrder: v.sortOrder ?? 100,
    active: v.active ?? true,
  };

  const today = todayIst();

  try {
    const saved = await db.transaction(async (tx) => {
      if (v.id) {
        const id = v.id;
        const [before] = await tx.select().from(incentiveCatalog).where(eq(incentiveCatalog.id, id)).for("update");
        const [after] = await tx.update(incentiveCatalog).set(values).where(eq(incentiveCatalog.id, id)).returning();
        const eventId =
          before && after
            ? await recordIncentiveCatalogEvent(tx, {
                eventType: "updated",
                catalogId: id,
                // The SHARED snapshot builder, so an edit made here describes
                // the incentive the same way the Admin Panel's Incentive Master
                // would — including its named eligibility, which decides who is
                // notified. See lib/queries/incentive-master.ts.
                before: await incentiveSnapshotFor(tx, before, today),
                after: await incentiveSnapshotFor(tx, after, today),
                actorId: me.id,
              })
            : null;
        return { id, eventId };
      }
      const [row] = await tx.insert(incentiveCatalog).values(values).returning();
      if (!row) throw new Error("insert returned no row");
      const eventId = await recordIncentiveCatalogEvent(tx, {
        eventType: "created",
        catalogId: row.id,
        before: null,
        after: await incentiveSnapshotFor(tx, row, today),
        actorId: me.id,
      });
      return { id: row.id, eventId };
    });
    notifyCatalogChange(saved.eventId);
    revalidatePath(PATH);
    return { ok: true, id: saved.id };
  } catch (err: unknown) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` ${err.cause.message}` : "";
    const msg = err instanceof Error ? `${err.message}${cause}` : String(err);
    // Unique-name collision surfaces a friendly message.
    if (/unique|duplicate/i.test(msg)) return { ok: false, error: "An incentive with that name already exists." };
    return { ok: false, error: `DB: ${msg}` };
  }
}

/**
 * Delete one incentive-catalog entry. Admin-only.
 *
 * Only the Incentive Table row goes. Requests, approvals and payments do not
 * reference it and stay on record; the change record keeps what was deleted.
 */
export async function deleteCatalogEntry(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid entry." };

  let eventId: string | null = null;
  try {
    eventId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(incentiveCatalog).where(eq(incentiveCatalog.id, id)).for("update");
      // Snapshot BEFORE the delete — afterwards the eligibility rows have
      // cascaded away and there is nothing left to describe.
      const snapshot = before ? await incentiveSnapshotFor(tx, before, todayIst()) : null;
      await tx.delete(incentiveCatalog).where(eq(incentiveCatalog.id, id));
      return snapshot
        ? recordIncentiveCatalogEvent(tx, {
            eventType: "deleted",
            catalogId: id,
            before: snapshot,
            after: null,
            actorId: me.id,
          })
        : null;
    });
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  notifyCatalogChange(eventId);
  revalidatePath(PATH);
  return { ok: true };
}

const EligibilitySchema = z.object({
  incentiveId: z.string().uuid(),
  appliesToAll: z.boolean(),
  // The headcount is the natural ceiling; the cap is only here so a malformed
  // request cannot ask the database to insert an unbounded list.
  employeeIds: z.array(z.string().uuid()).max(2000),
});

/**
 * Decide who one incentive applies to. Admin-only.
 *
 * `appliesToAll` and the list are written TOGETHER, in a transaction, so the
 * pair can never disagree — and when it is open to all, the list is cleared
 * rather than kept, so narrowing it later starts from a blank slate instead of
 * silently resurrecting whoever was picked months ago.
 *
 * The ids are re-checked against the employees table before they are stored.
 * They arrive from a browser, and a stale or invented uuid would otherwise sit
 * in the table forever deciding nothing.
 */
export async function setIncentiveEligibility(
  input: z.input<typeof EligibilitySchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();
  // Admin is NOT enough to change who may earn an incentive: that is Manan's
  // alone (`incentive_eligibility.manage`). The Incentive Master's add/remove
  // actions already asked this; this dialog writes the SAME table, so without
  // the same question here any admin could route around the rule through it.
  if (!(await mayManageIncentiveEligibility())) {
    return { ok: false, error: INCENTIVE_ELIGIBILITY_REFUSAL };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EligibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid selection." };
  }
  const { incentiveId, appliesToAll, employeeIds } = parsed.data;

  if (!appliesToAll && employeeIds.length === 0) {
    return {
      ok: false,
      error: "Pick at least one person, or set it back to everyone.",
    };
  }

  try {
    const live = appliesToAll ? [] : await filterToActiveEmployees(employeeIds);
    await saveEligibility(incentiveId, appliesToAll, live);
  } catch (err: unknown) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(PATH);
  return { ok: true };
}
