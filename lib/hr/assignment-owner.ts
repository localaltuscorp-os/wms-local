import "server-only";
import { eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSettings, employees } from "@/db/schema";

/**
 * The employee who receives the auto-created task when an HR assignment is
 * dispatched from a candidate's Management Assessment.
 *
 * Reads the org_settings singleton (id = 1). When unset, falls back to
 * resolving "Rutvisha Mehta" by name (case-insensitive) — WITHOUT writing, so
 * this stays a pure read. The apply script best-effort seeds the column so the
 * fallback is only ever hit on a fresh/unseeded DB.
 */
export async function getHrAssignmentOwnerId(): Promise<string | null> {
  const [row] = await db
    .select({ ownerId: orgSettings.hrAssignmentOwnerId })
    .from(orgSettings)
    .where(eq(orgSettings.id, 1))
    .limit(1);

  if (row?.ownerId) return row.ownerId;

  // Fallback: resolve by name (case-insensitive). Read-only — never writes.
  const [fallback] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(ilike(employees.name, "Rutvisha%"))
    .limit(1);

  return fallback?.id ?? null;
}
