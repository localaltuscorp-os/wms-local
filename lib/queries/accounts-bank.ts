import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsBankItems, accountsBankWeeks, accountsBankBalances } from "@/db/schema";

export interface BankItemRow {
  id: string;
  code: string | null;
  entity: string;
  targetBalance: string | null;
  sortOrder: number | null;
}

export interface BankWeekRow {
  id: string;
  label: string;
  sortOrder: number | null;
}

export interface BankBalanceCell {
  itemId: string;
  weekId: string;
  balance: string | null;
}

export async function listBankItems(fyStartYear: number): Promise<BankItemRow[]> {
  return db
    .select({
      id: accountsBankItems.id,
      code: accountsBankItems.code,
      entity: accountsBankItems.entity,
      targetBalance: accountsBankItems.targetBalance,
      sortOrder: accountsBankItems.sortOrder,
    })
    .from(accountsBankItems)
    .where(and(eq(accountsBankItems.fyStartYear, fyStartYear), eq(accountsBankItems.archived, false)))
    .orderBy(asc(accountsBankItems.sortOrder), asc(accountsBankItems.code));
}

export async function listBankWeeks(fyStartYear: number): Promise<BankWeekRow[]> {
  return db
    .select({
      id: accountsBankWeeks.id,
      label: accountsBankWeeks.label,
      sortOrder: accountsBankWeeks.sortOrder,
    })
    .from(accountsBankWeeks)
    .where(and(eq(accountsBankWeeks.fyStartYear, fyStartYear), eq(accountsBankWeeks.archived, false)))
    .orderBy(asc(accountsBankWeeks.sortOrder));
}

export async function listBankBalances(fyStartYear: number): Promise<BankBalanceCell[]> {
  return db
    .select({
      itemId: accountsBankBalances.itemId,
      weekId: accountsBankBalances.weekId,
      balance: accountsBankBalances.balance,
    })
    .from(accountsBankBalances)
    .innerJoin(accountsBankItems, eq(accountsBankBalances.itemId, accountsBankItems.id))
    .where(eq(accountsBankItems.fyStartYear, fyStartYear));
}
