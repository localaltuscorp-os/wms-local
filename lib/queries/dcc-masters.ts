import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dccMasterItems, designations, employees } from "@/db/schema";
import { isMissingTable } from "@/lib/dcc/master-sync";

export interface MasterEmployee {
  id: string;
  name: string;
  designationId: string | null;
}

export interface MasterDesignationRow {
  id: string;
  name: string;
  isActive: boolean;
  /** Active employees in this position — who the master applies to. */
  holders: { id: string; name: string }[];
  activeKpis: number;
}

export interface DccMasterItemRow {
  id: string;
  designationId: string;
  section: string | null;
  code: string | null;
  title: string;
  frequency: string | null;
  targetNumber: string | null;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Everything the DCC Master page lists: positions (with holders), master items,
 * and the active roster. `missing` = migration 0230 not applied yet; positions
 * and people still load so the page can say what to do.
 */
export async function loadDccMasterData(): Promise<{
  designations: MasterDesignationRow[];
  items: DccMasterItemRow[];
  employees: MasterEmployee[];
  missing: boolean;
}> {
  const [desigRows, people] = await Promise.all([
    db
      .select({ id: designations.id, name: designations.name, isActive: designations.isActive })
      .from(designations)
      .orderBy(asc(designations.sortOrder), asc(designations.name)),
    db
      .select({ id: employees.id, name: employees.name, designationId: employees.designationId })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
  ]);

  let items: DccMasterItemRow[] = [];
  let missing = false;
  try {
    items = await db
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
      })
      .from(dccMasterItems)
      .orderBy(asc(dccMasterItems.sortOrder), asc(dccMasterItems.createdAt));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    missing = true;
  }

  const rows = desigRows
    .map((d) => ({
      ...d,
      holders: people.filter((p) => p.designationId === d.id).map(({ id, name }) => ({ id, name })),
      activeKpis: items.filter((i) => i.designationId === d.id && i.isActive).length,
    }))
    // A retired designation stays listed only while somebody or something still uses it.
    .filter((d) => d.isActive || d.holders.length > 0 || items.some((i) => i.designationId === d.id));

  return { designations: rows, items, employees: people, missing };
}
