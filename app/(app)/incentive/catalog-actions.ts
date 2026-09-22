"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveCatalog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
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

/**
 * NOTE (0244): `salesEligible` / `internsEligible` are NOT part of this schema
 * any more. They are legacy columns that no longer decide anything, and this is
 * the quick in-app editor — the place where eligibility is chosen is the Admin
 * Panel's Incentive Master, which owns `applicability` and the function scope.
 * The columns are left untouched by an edit here precisely so a quick amount
 * change cannot silently rewrite who is eligible; see the eligibility-authority
 * guard in app/(admin)/admin/incentive-master/actions.ts.
 */
const EntrySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name is required.").max(160),
  description: z.string().trim().max(500).optional().nullable(),
  amount: z.number().min(0).max(10_000_000),
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
