import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dccKpiItems, employees, type Employee } from "@/db/schema";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { checkDccItemDelete } from "@/lib/dcc/item-lock";
import { isMissingTable, masterDesignationForItem } from "@/lib/dcc/master-sync";
import { masterLockedMessage } from "@/lib/dcc/master";

/** The owner comes back on success — the calendar sync needs whose day changed. */
export type GuardResult = { ok: true; owner: string } | { ok: false; error: string };

/**
 * May this viewer change or remove this compliance at all? Ownership, then the
 * position-master lock, then Manan's author guardrail.
 *
 * THE ORDER IS THE MESSAGE: "it belongs to the Sales master" tells the author
 * where to go and change it, which a flat "you may not" does not.
 *
 * Shared by the DCC board's actions and the WCC / MCC ones, so the two doors
 * onto the same compliances cannot apply different rules.
 */
export async function guardItemWrite(itemId: string, me: Employee): Promise<GuardResult> {
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
