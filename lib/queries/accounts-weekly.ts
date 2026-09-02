import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsWeeklyItems, accountsWeeklyChecks } from "@/db/schema";

/** A recurring weekly checklist item, shaped for the client table. */
export interface WeeklyItemRow {
  id: string;
  code: string | null;
  title: string;
  deadline: string | null;
  category: string | null;
  responsiblePerson: string | null;
  accountsNotes: string | null;
  mananNotes: string | null;
  fileLink: string | null;
  frequency: string | null;
  sortOrder: number | null;
}

/** One completion cell for a given month: item × week → status. */
export interface WeeklyCheckCell {
  itemId: string;
  weekNo: number;
  status: string;
}

/** Non-archived items, ordered by manual sortOrder then code. */
export async function listWeeklyItems(): Promise<WeeklyItemRow[]> {
  return db
    .select({
      id: accountsWeeklyItems.id,
      code: accountsWeeklyItems.code,
      title: accountsWeeklyItems.title,
      deadline: accountsWeeklyItems.deadline,
      category: accountsWeeklyItems.category,
      responsiblePerson: accountsWeeklyItems.responsiblePerson,
      accountsNotes: accountsWeeklyItems.accountsNotes,
      mananNotes: accountsWeeklyItems.mananNotes,
      fileLink: accountsWeeklyItems.fileLink,
      frequency: accountsWeeklyItems.frequency,
      sortOrder: accountsWeeklyItems.sortOrder,
    })
    .from(accountsWeeklyItems)
    .where(eq(accountsWeeklyItems.archived, false))
    .orderBy(asc(accountsWeeklyItems.sortOrder), asc(accountsWeeklyItems.code));
}

/** All check cells for one (year, month). */
export async function listWeeklyChecks(
  year: number,
  month: number,
): Promise<WeeklyCheckCell[]> {
  const rows = await db
    .select({
      itemId: accountsWeeklyChecks.itemId,
      weekNo: accountsWeeklyChecks.weekNo,
      status: accountsWeeklyChecks.status,
    })
    .from(accountsWeeklyChecks)
    .where(
      and(
        eq(accountsWeeklyChecks.periodYear, year),
        eq(accountsWeeklyChecks.periodMonth, month),
      ),
    );
  return rows;
}
