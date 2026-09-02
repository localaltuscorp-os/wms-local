import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsLoanItems, accountsLoanPeriods, accountsLoanCells } from "@/db/schema";

export interface LoanItemRow {
  id: string;
  code: string | null;
  entity: string | null;
  loanName: string;
  location: string | null;
  emiDate: string | null;
  sortOrder: number | null;
}

export interface LoanPeriodRow {
  id: string;
  label: string;
  sortOrder: number | null;
}

export interface LoanCell {
  loanId: string;
  periodId: string;
  emi: string | null;
  closingBalance: string | null;
}

export async function listLoanItems(): Promise<LoanItemRow[]> {
  return db
    .select({
      id: accountsLoanItems.id,
      code: accountsLoanItems.code,
      entity: accountsLoanItems.entity,
      loanName: accountsLoanItems.loanName,
      location: accountsLoanItems.location,
      emiDate: accountsLoanItems.emiDate,
      sortOrder: accountsLoanItems.sortOrder,
    })
    .from(accountsLoanItems)
    .where(eq(accountsLoanItems.archived, false))
    .orderBy(asc(accountsLoanItems.sortOrder), asc(accountsLoanItems.code));
}

export async function listLoanPeriods(): Promise<LoanPeriodRow[]> {
  return db
    .select({ id: accountsLoanPeriods.id, label: accountsLoanPeriods.label, sortOrder: accountsLoanPeriods.sortOrder })
    .from(accountsLoanPeriods)
    .where(eq(accountsLoanPeriods.archived, false))
    .orderBy(asc(accountsLoanPeriods.sortOrder));
}

export async function listLoanCells(): Promise<LoanCell[]> {
  return db
    .select({
      loanId: accountsLoanCells.loanId,
      periodId: accountsLoanCells.periodId,
      emi: accountsLoanCells.emi,
      closingBalance: accountsLoanCells.closingBalance,
    })
    .from(accountsLoanCells);
}
