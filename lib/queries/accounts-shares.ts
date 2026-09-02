import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsShares } from "@/db/schema";

export interface ShareRow {
  id: string;
  code: string | null;
  entity: string | null;
  company: string;
  folioDemat: string | null;
  qty: string | null;
  rate: string | null;
  value: string | null;
  txnDate: string | null;
  notes: string | null;
  sortOrder: number | null;
}

export async function listShares(): Promise<ShareRow[]> {
  return db
    .select({
      id: accountsShares.id,
      code: accountsShares.code,
      entity: accountsShares.entity,
      company: accountsShares.company,
      folioDemat: accountsShares.folioDemat,
      qty: accountsShares.qty,
      rate: accountsShares.rate,
      value: accountsShares.value,
      txnDate: accountsShares.txnDate,
      notes: accountsShares.notes,
      sortOrder: accountsShares.sortOrder,
    })
    .from(accountsShares)
    .where(eq(accountsShares.archived, false))
    .orderBy(asc(accountsShares.sortOrder), asc(accountsShares.code));
}
