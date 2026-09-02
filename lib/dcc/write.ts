import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dccKpiItems, dccEntries } from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * The DCC entry-write CORE — one source of truth shared by the web server
 * actions (`app/(app)/dcc/actions.ts`) and the native app's `/api/mobile/dcc/*`
 * routes. Neither the cookie session nor the bearer token leaks in here: callers
 * pass an explicit actor. Callers own rate-limiting, input validation, and cache
 * revalidation; this layer owns only the ownership check and the SQL.
 */
export interface DccActor {
  id: string;
  email: string;
}
export type DccWriteResult = { ok: true } | { ok: false; error: string };

/** Owner-or-super gate. Returns the item's owner id, or an error result. */
async function ownedItem(actor: DccActor, itemId: string): Promise<{ ok: true; owner: string } | { ok: false; error: string }> {
  const [item] = await db
    .select({ owner: dccKpiItems.ownerEmployeeId })
    .from(dccKpiItems)
    .where(eq(dccKpiItems.id, itemId))
    .limit(1);
  if (!item) return { ok: false, error: "KPI not found." };
  if (!(isSuperAdmin(actor.email) || item.owner === actor.id)) return { ok: false, error: "You can only fill your own KPIs." };
  return { ok: true, owner: item.owner };
}

/**
 * Upsert (or clear) one item's entry for a day. `subjectId` null = the simple-KPI
 * row; a uuid = one participant's row. Empty status+value+note clears the slot.
 */
export async function writeDccEntry(
  actor: DccActor,
  input: { itemId: string; date: string; status: string | null; value: string | null; note: string | null; subjectId?: string | null },
): Promise<DccWriteResult> {
  const { itemId, date } = input;
  const status = input.status ?? null;
  const value = input.value ?? null;
  const note = input.note ?? null;
  const subjectId = input.subjectId ?? null;

  const owned = await ownedItem(actor, itemId);
  if (!owned.ok) return owned;

  // Target exactly this (item, date, subject) slot.
  const subjectCond = subjectId ? eq(dccEntries.subjectId, subjectId) : sql`${dccEntries.subjectId} IS NULL`;

  if (!status && value === null && !note) {
    await db.delete(dccEntries).where(and(eq(dccEntries.itemId, itemId), eq(dccEntries.entryDate, date), subjectCond));
    return { ok: true };
  }
  // Upsert on the COALESCE-sentinel expression index (Drizzle can't express it).
  await db.execute(sql`
    INSERT INTO dcc_entries (item_id, entry_date, status, value_number, note, filled_by_id, subject_id)
    VALUES (${itemId}, ${date}, ${status}, ${value}, ${note}, ${actor.id}, ${subjectId})
    ON CONFLICT (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET status = EXCLUDED.status, value_number = EXCLUDED.value_number,
                  note = EXCLUDED.note, filled_by_id = EXCLUDED.filled_by_id, updated_at = now()
  `);
  return { ok: true };
}

/** Set (or clear) the SAME status for every participant of a participant-list KPI. */
export async function writeParticipantEntries(
  actor: DccActor,
  input: { itemId: string; date: string; status: string | null },
): Promise<DccWriteResult> {
  const { itemId, date } = input;
  const status = input.status ?? null;

  const owned = await ownedItem(actor, itemId);
  if (!owned.ok) return owned;

  const subs = (await db.execute(sql`
    SELECT subject_id FROM dcc_item_subjects WHERE item_id = ${itemId} AND archived = false
  `)) as unknown as Array<{ subject_id: string }>;
  for (const { subject_id } of subs) {
    if (!status) {
      await db.delete(dccEntries).where(and(eq(dccEntries.itemId, itemId), eq(dccEntries.entryDate, date), eq(dccEntries.subjectId, subject_id)));
    } else {
      await db.execute(sql`
        INSERT INTO dcc_entries (item_id, entry_date, status, filled_by_id, subject_id)
        VALUES (${itemId}, ${date}, ${status}, ${actor.id}, ${subject_id})
        ON CONFLICT (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET status = EXCLUDED.status, filled_by_id = EXCLUDED.filled_by_id, updated_at = now()
      `);
    }
  }
  return { ok: true };
}
