import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsFnoItems, accountsFnoMonths } from "@/db/schema";

export interface FnoItemRow {
  id: string;
  code: string | null;
  entity: string | null;
  agency: string;
  capital: string | null;
  sortOrder: number | null;
}

export interface FnoMonthCell {
  itemId: string;
  month: number;
  amount: string | null;
}

export async function listFnoItems(fyStartYear: number): Promise<FnoItemRow[]> {
  return db
    .select({
      id: accountsFnoItems.id,
      code: accountsFnoItems.code,
      entity: accountsFnoItems.entity,
      agency: accountsFnoItems.agency,
      capital: accountsFnoItems.capital,
      sortOrder: accountsFnoItems.sortOrder,
    })
    .from(accountsFnoItems)
    .where(and(eq(accountsFnoItems.fyStartYear, fyStartYear), eq(accountsFnoItems.archived, false)))
    .orderBy(asc(accountsFnoItems.sortOrder), asc(accountsFnoItems.code));
}

export async function listFnoMonths(fyStartYear: number): Promise<FnoMonthCell[]> {
  return db
    .select({
      itemId: accountsFnoMonths.itemId,
      month: accountsFnoMonths.month,
      amount: accountsFnoMonths.amount,
    })
    .from(accountsFnoMonths)
    .innerJoin(accountsFnoItems, eq(accountsFnoMonths.itemId, accountsFnoItems.id))
    .where(eq(accountsFnoItems.fyStartYear, fyStartYear));
}
