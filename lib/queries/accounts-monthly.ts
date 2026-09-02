import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsMonthlyItems, accountsMonthlyChecks } from "@/db/schema";

/** A recurring monthly/quarterly/annual checklist item, shaped for the client. */
export interface MonthlyItemRow {
  id: string;
  code: string | null;
  title: string;
  responsiblePerson: string | null;
  deadline: string | null;
  type: string | null;
  accountsNotes: string | null;
  mananNotes: string | null;
  fileLink: string | null;
  frequency: string | null;
  dueMonth: number | null;
  sortOrder: number | null;
}

/** One completion cell for a given FY: item × calendar-month → status. */
export interface MonthlyCheckCell {
  itemId: string;
  month: number;
  status: string;
}

/** Non-archived items, ordered by manual sortOrder then code. */
export async function listMonthlyItems(): Promise<MonthlyItemRow[]> {
  return db
    .select({
      id: accountsMonthlyItems.id,
      code: accountsMonthlyItems.code,
      title: accountsMonthlyItems.title,
      responsiblePerson: accountsMonthlyItems.responsiblePerson,
      deadline: accountsMonthlyItems.deadline,
      type: accountsMonthlyItems.type,
      accountsNotes: accountsMonthlyItems.accountsNotes,
      mananNotes: accountsMonthlyItems.mananNotes,
      fileLink: accountsMonthlyItems.fileLink,
      frequency: accountsMonthlyItems.frequency,
      dueMonth: accountsMonthlyItems.dueMonth,
      sortOrder: accountsMonthlyItems.sortOrder,
    })
    .from(accountsMonthlyItems)
    .where(eq(accountsMonthlyItems.archived, false))
    .orderBy(asc(accountsMonthlyItems.sortOrder), asc(accountsMonthlyItems.code));
}

/** All check cells for one financial year. */
export async function listMonthlyChecks(fyStartYear: number): Promise<MonthlyCheckCell[]> {
  return db
    .select({
      itemId: accountsMonthlyChecks.itemId,
      month: accountsMonthlyChecks.month,
      status: accountsMonthlyChecks.status,
    })
    .from(accountsMonthlyChecks)
    .where(eq(accountsMonthlyChecks.fyStartYear, fyStartYear));
}
