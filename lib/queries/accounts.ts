import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsTaskList, accountsScreenshots } from "@/db/schema";

/** A row of the main Accounts Task List, shaped for the client table. */
export interface AccountsTaskRow {
  id: string;
  srNo: number | null;
  area: string | null;
  taskDescription: string | null;
  status: string;
  links: string | null;
  targetDate: string | null; // YYYY-MM-DD
  actualDate: string | null; // YYYY-MM-DD
  gear: string | null;
  notes: string | null;
  sortOrder: number | null;
}

/** A row of the "Screenshots to Post" sub-table. */
export interface AccountsScreenshotRow {
  id: string;
  srNo: number | null;
  projectName: string | null;
  projectDetails: string | null;
  frequency: string | null;
  targetDate: string | null; // YYYY-MM-DD
  actualDate: string | null; // YYYY-MM-DD
  gear: string | null;
  notes: string | null;
  sortOrder: number | null;
}

/** Non-archived tasks, ordered by manual sortOrder then srNo. */
export async function listAccountsTasks(): Promise<AccountsTaskRow[]> {
  return db
    .select({
      id: accountsTaskList.id,
      srNo: accountsTaskList.srNo,
      area: accountsTaskList.area,
      taskDescription: accountsTaskList.taskDescription,
      status: accountsTaskList.status,
      links: accountsTaskList.links,
      targetDate: accountsTaskList.targetDate,
      actualDate: accountsTaskList.actualDate,
      gear: accountsTaskList.gear,
      notes: accountsTaskList.notes,
      sortOrder: accountsTaskList.sortOrder,
    })
    .from(accountsTaskList)
    .where(eq(accountsTaskList.archived, false))
    .orderBy(asc(accountsTaskList.sortOrder), asc(accountsTaskList.srNo));
}

/** Non-archived screenshots-to-post, ordered by manual sortOrder then srNo. */
export async function listAccountsScreenshots(): Promise<AccountsScreenshotRow[]> {
  return db
    .select({
      id: accountsScreenshots.id,
      srNo: accountsScreenshots.srNo,
      projectName: accountsScreenshots.projectName,
      projectDetails: accountsScreenshots.projectDetails,
      frequency: accountsScreenshots.frequency,
      targetDate: accountsScreenshots.targetDate,
      actualDate: accountsScreenshots.actualDate,
      gear: accountsScreenshots.gear,
      notes: accountsScreenshots.notes,
      sortOrder: accountsScreenshots.sortOrder,
    })
    .from(accountsScreenshots)
    .where(eq(accountsScreenshots.archived, false))
    .orderBy(asc(accountsScreenshots.sortOrder), asc(accountsScreenshots.srNo));
}
