import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsCcCards, accountsCcMonths } from "@/db/schema";

export interface CcCardRow {
  id: string;
  code: string | null;
  entityName: string | null;
  cardName: string;
  ecs: string | null;
  ecsFrom: string | null;
  stmtPeriod: string | null;
  stmtStartDay: string | null;
  dueDay: string | null;
  softCopyAutoEmail: string | null;
  sortOrder: number | null;
}

export interface CcMonthRow {
  cardId: string;
  month: number;
  hardCopy: string | null;
  googleDrive: string | null;
  tallyEntry: string | null;
  balanceTally: string | null;
  ccPaidDate: string | null;
  ccPaidAmt: string | null;
  intFinChgs: string | null;
  chgReversed: string | null;
  notes: string | null;
}

const ccCardCols = {
  id: accountsCcCards.id,
  code: accountsCcCards.code,
  entityName: accountsCcCards.entityName,
  cardName: accountsCcCards.cardName,
  ecs: accountsCcCards.ecs,
  ecsFrom: accountsCcCards.ecsFrom,
  stmtPeriod: accountsCcCards.stmtPeriod,
  stmtStartDay: accountsCcCards.stmtStartDay,
  dueDay: accountsCcCards.dueDay,
  softCopyAutoEmail: accountsCcCards.softCopyAutoEmail,
  sortOrder: accountsCcCards.sortOrder,
} as const;

/** Non-archived cards for one financial year, ordered by sort then code. */
export async function listCcCards(fyStartYear: number): Promise<CcCardRow[]> {
  return db
    .select(ccCardCols)
    .from(accountsCcCards)
    .where(and(eq(accountsCcCards.fyStartYear, fyStartYear), eq(accountsCcCards.archived, false)))
    .orderBy(asc(accountsCcCards.sortOrder), asc(accountsCcCards.code));
}

/** Archived (soft-deleted) cards for one financial year — for the Restore view. */
export async function listArchivedCcCards(fyStartYear: number): Promise<CcCardRow[]> {
  return db
    .select(ccCardCols)
    .from(accountsCcCards)
    .where(and(eq(accountsCcCards.fyStartYear, fyStartYear), eq(accountsCcCards.archived, true)))
    .orderBy(asc(accountsCcCards.sortOrder), asc(accountsCcCards.code));
}

/** All month records for the given FY's cards (joined so we can scope by FY). */
export async function listCcMonths(fyStartYear: number): Promise<CcMonthRow[]> {
  return db
    .select({
      cardId: accountsCcMonths.cardId,
      month: accountsCcMonths.month,
      hardCopy: accountsCcMonths.hardCopy,
      googleDrive: accountsCcMonths.googleDrive,
      tallyEntry: accountsCcMonths.tallyEntry,
      balanceTally: accountsCcMonths.balanceTally,
      ccPaidDate: accountsCcMonths.ccPaidDate,
      ccPaidAmt: accountsCcMonths.ccPaidAmt,
      intFinChgs: accountsCcMonths.intFinChgs,
      chgReversed: accountsCcMonths.chgReversed,
      notes: accountsCcMonths.notes,
    })
    .from(accountsCcMonths)
    .innerJoin(accountsCcCards, eq(accountsCcMonths.cardId, accountsCcCards.id))
    .where(eq(accountsCcCards.fyStartYear, fyStartYear));
}
