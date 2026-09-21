"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  performanceArchiveStateOf,
  setPerformanceArchived,
} from "@/lib/productivity/archive";

/**
 * Productivity › Team Performance — put a row away (migration 0232).
 *
 * WHAT IT WRITES, AND WHAT IT DELIBERATELY DOES NOT. One flag on the employee:
 * `performance_archived`. Nothing on that board is a stored record — every
 * number is computed live from tasks, goals, DCC and attendance — so there is
 * nothing to file and nothing to copy. The row leaves the list; the person
 * keeps their login, their employment status, their Productivity Dashboard,
 * their Goals row on /goals/weekly/team and every task and goal they own.
 *
 * ADMINS ONLY, and not because a manager is not trusted: the flag is GLOBAL —
 * archiving a row takes the person off everybody's board, admins included —
 * and the way back (Archive › Team Performance) is an admin-only page. Letting
 * a manager press a button they cannot undo, on a list they do not own, is the
 * one shape this must not have. `unarchiveRecord` in app/(app)/archive/actions
 * carries the same gate, which is what makes the pair symmetric.
 *
 * NO DELETE LIVES HERE. Archiving hides a row; it must never be a step on the
 * way to removing an employee. See the `team-performance` entry in that file
 * for the refusal that enforces it.
 */

const Input = z.object({ employeeId: z.string().uuid() });

export type TeamArchiveResult = { ok: true; message: string } | { ok: false; error: string };

export async function archiveFromTeamPerformance(employeeId: string): Promise<TeamArchiveResult> {
  const me = await requireUser();
  if (!me.isAdmin && !isSuperAdmin(me.email)) {
    return { ok: false, error: "Only an admin can archive a row from Team Performance." };
  }

  const parsed = Input.safeParse({ employeeId });
  if (!parsed.success) return { ok: false, error: "That is not an employee this board shows." };

  // `null` = this database has no 0232 (the board hides the button there, so
  // the only way in is a page that was open before the column existed);
  // `undefined` = no such employee. See lib/productivity/archive.ts.
  const state = await performanceArchiveStateOf(parsed.data.employeeId);
  if (state === null) {
    return { ok: false, error: "This database does not have the Team Performance archive yet." };
  }
  if (!state) return { ok: false, error: "That employee no longer exists." };
  // Already filed — the board this was pressed on was simply out of date. Say
  // so rather than re-stamping `performance_archived_at`, which would rewrite
  // when it was actually put away.
  if (state.archived) return { ok: true, message: `${state.name} is already in the Archive.` };

  if (!(await setPerformanceArchived(parsed.data.employeeId, true))) {
    return { ok: false, error: `Could not archive ${state.name}'s row.` };
  }

  revalidatePath("/productivity/team");
  revalidatePath("/archive");
  revalidatePath("/archive/[section]", "page");
  return { ok: true, message: `${state.name} is off the board — find them in Archive.` };
}
