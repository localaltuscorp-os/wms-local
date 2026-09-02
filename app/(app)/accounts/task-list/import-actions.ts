"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsTaskList, accountsScreenshots } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { addAccountsLookup } from "@/lib/accounts/lookups";
import { parseAccountsTaskWorkbook } from "@/lib/accounts/task-import";

const PATH = "/accounts/task-list";

export interface BulkImportResult {
  ok: boolean;
  createdTasks: number;
  createdShots: number;
  skipped: number;
  error?: string;
}

/**
 * Bulk-import the Accounts Task List + Screenshots-to-Post from an uploaded
 * .xlsx / .csv. Server re-parses the file (never trusting the client), appends
 * rows after the current max sortOrder, and auto-registers any new Status / Gear
 * / Frequency values into accounts_lookups so they appear in the dropdowns.
 * Unknown statuses/gears are kept as-is on the row. Access-gated + rate-limited.
 */
export async function bulkImportAccountsTasks(
  formData: FormData,
): Promise<BulkImportResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, createdTasks: 0, createdShots: 0, skipped: 0, error: limited.error };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, createdTasks: 0, createdShots: 0, skipped: 0, error: "No file uploaded." };
  }

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseAccountsTaskWorkbook(buf);
  } catch {
    return {
      ok: false,
      createdTasks: 0,
      createdShots: 0,
      skipped: 0,
      error: "Couldn't read the file. Upload a .xlsx or .csv.",
    };
  }

  const { tasks, shots } = parsed;
  if (tasks.length === 0 && shots.length === 0) {
    return {
      ok: false,
      createdTasks: 0,
      createdShots: 0,
      skipped: 0,
      error:
        "No importable rows found. Make sure the sheet has a header row with Sr. No., Task Description and Status.",
    };
  }

  try {
    // Append after the current bottom of each table.
    const taskMaxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsTaskList.sortOrder}), 0)` })
      .from(accountsTaskList)) as Array<{ next: number }>;
    let taskOrder = Number(taskMaxRows[0]?.next ?? 0);

    const shotMaxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsScreenshots.sortOrder}), 0)` })
      .from(accountsScreenshots)) as Array<{ next: number }>;
    let shotOrder = Number(shotMaxRows[0]?.next ?? 0);

    // Collect new dropdown values to register once (de-duped, case-insensitive).
    const newStatuses = new Set<string>();
    const newTaskGears = new Set<string>();
    const newShotGears = new Set<string>();
    const newFrequencies = new Set<string>();

    let createdTasks = 0;
    let createdShots = 0;

    if (tasks.length > 0) {
      const values = tasks.map((t) => {
        taskOrder += 1;
        const status = t.status?.trim() || "Pending";
        if (status) newStatuses.add(status);
        if (t.gear) newTaskGears.add(t.gear.trim());
        return {
          srNo: t.srNo,
          area: t.area,
          taskDescription: t.taskDescription,
          status,
          links: t.links,
          targetDate: t.targetDate,
          actualDate: t.actualDate,
          gear: t.gear,
          notes: t.notes,
          sortOrder: taskOrder,
          createdById: me.id,
        };
      });
      const inserted = await db.insert(accountsTaskList).values(values).returning({ id: accountsTaskList.id });
      createdTasks = inserted.length;
    }

    if (shots.length > 0) {
      const values = shots.map((s) => {
        shotOrder += 1;
        if (s.gear) newShotGears.add(s.gear.trim());
        if (s.frequency) newFrequencies.add(s.frequency.trim());
        return {
          srNo: s.srNo,
          projectName: s.projectName,
          projectDetails: s.projectDetails,
          frequency: s.frequency,
          targetDate: s.targetDate,
          actualDate: s.actualDate,
          gear: s.gear,
          notes: s.notes,
          sortOrder: shotOrder,
        };
      });
      const inserted = await db
        .insert(accountsScreenshots)
        .values(values)
        .returning({ id: accountsScreenshots.id });
      createdShots = inserted.length;
    }

    // Auto-register new dropdown options (addAccountsLookup is idempotent /
    // case-insensitively de-duped, so re-adding existing values is harmless).
    const lookupJobs: Promise<unknown>[] = [];
    for (const v of newStatuses) lookupJobs.push(addAccountsLookup("task_status", v));
    for (const v of newTaskGears) lookupJobs.push(addAccountsLookup("task_gear", v));
    for (const v of newShotGears) lookupJobs.push(addAccountsLookup("shot_gear", v));
    for (const v of newFrequencies) lookupJobs.push(addAccountsLookup("shot_freq", v));
    // Best-effort — never fail the import if a lookup insert hiccups.
    await Promise.allSettled(lookupJobs);

    revalidatePath(PATH);
    return { ok: true, createdTasks, createdShots, skipped: 0 };
  } catch (err) {
    return {
      ok: false,
      createdTasks: 0,
      createdShots: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
