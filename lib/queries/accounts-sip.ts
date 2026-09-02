import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsSipItems, accountsSipMonths } from "@/db/schema";

export interface SipItemRow {
  id: string;
  code: string | null;
  entity: string | null;
  fundName: string;
  location: string | null;
  sipDate: string | null;
  type: string | null;
  amount: string | null;
  sortOrder: number | null;
}

export interface SipMonthCell {
  itemId: string;
  month: number;
  amount: string | null;
}

export async function listSipItems(fyStartYear: number): Promise<SipItemRow[]> {
  return db
    .select({
      id: accountsSipItems.id,
      code: accountsSipItems.code,
      entity: accountsSipItems.entity,
      fundName: accountsSipItems.fundName,
      location: accountsSipItems.location,
      sipDate: accountsSipItems.sipDate,
      type: accountsSipItems.type,
      amount: accountsSipItems.amount,
      sortOrder: accountsSipItems.sortOrder,
    })
    .from(accountsSipItems)
    .where(and(eq(accountsSipItems.fyStartYear, fyStartYear), eq(accountsSipItems.archived, false)))
    .orderBy(asc(accountsSipItems.sortOrder), asc(accountsSipItems.code));
}

export async function listSipMonths(fyStartYear: number): Promise<SipMonthCell[]> {
  return db
    .select({
      itemId: accountsSipMonths.itemId,
      month: accountsSipMonths.month,
      amount: accountsSipMonths.amount,
    })
    .from(accountsSipMonths)
    .innerJoin(accountsSipItems, eq(accountsSipMonths.itemId, accountsSipItems.id))
    .where(eq(accountsSipItems.fyStartYear, fyStartYear));
}
