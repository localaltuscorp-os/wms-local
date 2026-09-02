import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsCashItems, accountsCashMonths, accountsCashLimits } from "@/db/schema";

export interface CashItemRow {
  id: string;
  code: string | null;
  entity: string | null;
  nameOnCheque: string | null;
  chequeNo: string | null;
  chqDate: string | null;
  amount: string | null;
  sortOrder: number | null;
}

export interface CashMonthCell {
  itemId: string;
  month: number;
  amount: string | null;
}

export interface CashLimitRow {
  id: string;
  entity: string;
  maxAllowed: string | null;
  sortOrder: number | null;
}

export async function listCashItems(fyStartYear: number): Promise<CashItemRow[]> {
  return db
    .select({
      id: accountsCashItems.id,
      code: accountsCashItems.code,
      entity: accountsCashItems.entity,
      nameOnCheque: accountsCashItems.nameOnCheque,
      chequeNo: accountsCashItems.chequeNo,
      chqDate: accountsCashItems.chqDate,
      amount: accountsCashItems.amount,
      sortOrder: accountsCashItems.sortOrder,
    })
    .from(accountsCashItems)
    .where(and(eq(accountsCashItems.fyStartYear, fyStartYear), eq(accountsCashItems.archived, false)))
    .orderBy(asc(accountsCashItems.sortOrder), asc(accountsCashItems.code));
}

export async function listCashMonths(fyStartYear: number): Promise<CashMonthCell[]> {
  return db
    .select({
      itemId: accountsCashMonths.itemId,
      month: accountsCashMonths.month,
      amount: accountsCashMonths.amount,
    })
    .from(accountsCashMonths)
    .innerJoin(accountsCashItems, eq(accountsCashMonths.itemId, accountsCashItems.id))
    .where(eq(accountsCashItems.fyStartYear, fyStartYear));
}

export async function listCashLimits(fyStartYear: number): Promise<CashLimitRow[]> {
  return db
    .select({
      id: accountsCashLimits.id,
      entity: accountsCashLimits.entity,
      maxAllowed: accountsCashLimits.maxAllowed,
      sortOrder: accountsCashLimits.sortOrder,
    })
    .from(accountsCashLimits)
    .where(and(eq(accountsCashLimits.fyStartYear, fyStartYear), eq(accountsCashLimits.archived, false)))
    .orderBy(asc(accountsCashLimits.sortOrder), asc(accountsCashLimits.entity));
}
