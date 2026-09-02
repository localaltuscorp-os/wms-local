import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsDueItems } from "@/db/schema";
import type { AccountsDueItem } from "@/db/schema";

export type DueItemRow = Omit<
  AccountsDueItem,
  "archived" | "createdById" | "createdAt" | "updatedAt"
>;

const COLUMNS = {
  id: accountsDueItems.id,
  code: accountsDueItems.code,
  area: accountsDueItems.area,
  compliance: accountsDueItems.compliance,
  frequency: accountsDueItems.frequency,
  ecs: accountsDueItems.ecs,
  ecsFrom: accountsDueItems.ecsFrom,
  statementPeriod: accountsDueItems.statementPeriod,
  statementDate: accountsDueItems.statementDate,
  dueDate: accountsDueItems.dueDate,
  softCopyAutoEmail: accountsDueItems.softCopyAutoEmail,
  hardCopy: accountsDueItems.hardCopy,
  softCopy: accountsDueItems.softCopy,
  tallyEntry: accountsDueItems.tallyEntry,
  balanceTally: accountsDueItems.balanceTally,
  paidDate: accountsDueItems.paidDate,
  paidAmt: accountsDueItems.paidAmt,
  intFinChgs: accountsDueItems.intFinChgs,
  chgReversed: accountsDueItems.chgReversed,
  notes: accountsDueItems.notes,
  sortOrder: accountsDueItems.sortOrder,
};

/** Non-archived due-date items, ordered by manual sort then code. */
export async function listDueItems(): Promise<DueItemRow[]> {
  return db
    .select(COLUMNS)
    .from(accountsDueItems)
    .where(eq(accountsDueItems.archived, false))
    .orderBy(asc(accountsDueItems.sortOrder), asc(accountsDueItems.code));
}
