import "server-only";
import { after } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dccKpiItems, dccMasterItems, dccMasterLinks, designations, employees } from "@/db/schema";
import { planMasterSync, type LinkedItem, type MasterItem } from "./master";
import { scheduleDccCalendarSync } from "./calendar-sync";

/**
 * Applies the DCC Masters to every holder (see lib/dcc/master.ts).
 *
 * Called after every master change, after a designation change, and by the
 * midnight DCC calendar cron as a backstop — so a designation edited by any
 * other route is picked up by the next day at the latest.
 *
 * One run at a time (a Postgres advisory lock inside the transaction), and the
 * unique index on (owner, master item) as a second guard: two saves in quick
 * succession must not give anybody the same KPI twice.
 *
 * ── BEFORE MIGRATION 0230 ────────────────────────────────────────────────
 * Every function here treats the missing tables as "no masters", so /dcc and
 * editing KPIs keep working in the window where the code is deployed and the
 * migration has not been applied by hand.
 */

/** Postgres 42P01 / 42703 — the table or column is not there yet. */
export function isMissingTable(e: unknown): boolean {
  const codeOf = (v: unknown): unknown =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  if (hit(codeOf(e))) return true;
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return hit(codeOf(cause));
}

export interface MasterSyncResult {
  created: number;
  updated: number;
  archived: number;
  /** True when migration 0230 has not been applied. */
  missing: boolean;
}

export async function reconcileDccMasters(): Promise<MasterSyncResult> {
  try {
    const { result, owners } = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dcc-master-sync'))`);

      const holders = await tx
        .select({ id: employees.id, designationId: employees.designationId })
        .from(employees)
        .where(eq(employees.isActive, true));
      const masters: MasterItem[] = await tx
        .select({
          id: dccMasterItems.id,
          designationId: dccMasterItems.designationId,
          section: dccMasterItems.section,
          code: dccMasterItems.code,
          title: dccMasterItems.title,
          frequency: dccMasterItems.frequency,
          targetNumber: dccMasterItems.targetNumber,
          unit: dccMasterItems.unit,
          sortOrder: dccMasterItems.sortOrder,
          isActive: dccMasterItems.isActive,
          createdById: dccMasterItems.createdById,
        })
        .from(dccMasterItems);
      const linked: LinkedItem[] = await tx
        .select({
          itemId: dccMasterLinks.itemId,
          masterItemId: dccMasterLinks.masterItemId,
          ownerEmployeeId: dccMasterLinks.ownerEmployeeId,
          archived: dccKpiItems.archived,
          section: dccKpiItems.section,
          code: dccKpiItems.code,
          title: dccKpiItems.title,
          frequency: dccKpiItems.frequency,
          weekdays: dccKpiItems.weekdays,
          scheduleKind: dccKpiItems.scheduleKind,
          needsReview: dccKpiItems.needsReview,
          targetNumber: dccKpiItems.targetNumber,
          unit: dccKpiItems.unit,
          sortOrder: sql<number>`coalesce(${dccKpiItems.sortOrder}, 0)`,
        })
        .from(dccMasterLinks)
        .innerJoin(dccKpiItems, eq(dccKpiItems.id, dccMasterLinks.itemId));

      const ops = planMasterSync(holders, masters, linked);
      const counts = { created: 0, updated: 0, archived: 0 };
      const touched = new Set<string>();
      for (const op of ops) {
        if (op.kind === "create") {
          const [row] = await tx
            .insert(dccKpiItems)
            .values({ ownerEmployeeId: op.ownerEmployeeId, ...op.fields, isParticipantList: false, createdById: op.createdById })
            .returning({ id: dccKpiItems.id });
          await tx
            .insert(dccMasterLinks)
            .values({ itemId: row!.id, masterItemId: op.masterItemId, ownerEmployeeId: op.ownerEmployeeId });
          counts.created++;
        } else if (op.kind === "update") {
          await tx
            .update(dccKpiItems)
            .set({ ...op.fields, archived: false, updatedAt: new Date() })
            .where(eq(dccKpiItems.id, op.itemId));
          counts.updated++;
        } else {
          await tx.update(dccKpiItems).set({ archived: true, updatedAt: new Date() }).where(eq(dccKpiItems.id, op.itemId));
          counts.archived++;
        }
        touched.add(op.ownerEmployeeId);
      }
      return { result: counts, owners: touched };
    });

    // Today's calendar entry for everyone whose KPIs changed.
    for (const owner of owners) scheduleDccCalendarSync(owner);
    return { ...result, missing: false };
  } catch (e) {
    if (isMissingTable(e)) return { created: 0, updated: 0, archived: 0, missing: true };
    throw e;
  }
}

/** Reconcile after the current response — for callers that change designations. */
export function scheduleDccMasterReconcile(): void {
  const run = async () => {
    try {
      await reconcileDccMasters();
    } catch (err) {
      console.error("[dcc-master] reconcile failed", err instanceof Error ? err.message : err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

/** item id → the designation whose master it comes from. Empty before 0230. */
export async function loadMasterLinksForItems(itemIds: string[]): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();
  try {
    const rows = await db
      .select({ itemId: dccMasterLinks.itemId, designation: designations.name })
      .from(dccMasterLinks)
      .innerJoin(dccMasterItems, eq(dccMasterItems.id, dccMasterLinks.masterItemId))
      .innerJoin(designations, eq(designations.id, dccMasterItems.designationId))
      .where(inArray(dccMasterLinks.itemId, itemIds));
    return new Map(rows.map((r) => [r.itemId, r.designation]));
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}

/** The designation a KPI's master belongs to, or null for a person-specific KPI. */
export async function masterDesignationForItem(itemId: string): Promise<string | null> {
  return (await loadMasterLinksForItems([itemId])).get(itemId) ?? null;
}
