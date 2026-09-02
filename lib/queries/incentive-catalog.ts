import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { incentiveCatalog } from "@/db/schema";

/** One incentive-catalog row ("3.Incentive Chart") — what each incentive earns. */
export interface CatalogRow {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  salesEligible: boolean;
  internsEligible: boolean;
  notes: string | null;
  sortOrder: number;
  active: boolean;
}

/** The full incentive catalog, in display order. Shown in-app (popup) to
 *  everyone; editable by admins. */
export async function listIncentiveCatalog(): Promise<CatalogRow[]> {
  const rows = await db
    .select()
    .from(incentiveCatalog)
    .orderBy(asc(incentiveCatalog.sortOrder), asc(incentiveCatalog.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    amount: Number(r.amount),
    salesEligible: r.salesEligible ?? false,
    internsEligible: r.internsEligible ?? false,
    notes: r.notes,
    sortOrder: r.sortOrder ?? 100,
    active: r.active,
  }));
}
