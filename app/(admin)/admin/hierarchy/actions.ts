"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { setReportingManager, managerHistoryFor } from "@/lib/employees/manager-history";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";

/**
 * REPORTING HIERARCHY — the write path for a manager move.
 *
 * ── ONE ACTION, AND WHAT IT DOES NOT DO ────────────────────────────────────
 * It changes `employees.manager_id` and records the period. That is all, and
 * that is deliberately all: it does NOT walk tasks, goals, DCC, KPI or approvals
 * reassigning anything, because none of those tables stores a manager. Every one
 * of them resolves the manager from `employees.manager_id` when it runs, so the
 * move has already reached them the moment this commits.
 *
 * Writing manager ids onto historical rows is exactly what the brief warns
 * against ("Do not blindly update every historical task/goal record's manager ID
 * if that destroys historical reporting"), and it is what a fan-out here would
 * amount to.
 */

const NODE = "admin.people.hierarchy";
const PATHS = ["/admin/hierarchy", "/admin/employees"];

const MoveSchema = z
  .object({
    employeeId: z.string().uuid(),
    /** Null moves them OUT of every team, into "No manager assigned". */
    managerId: z.string().uuid().nullable(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export type MoveResult = { ok: true; changed: boolean } | { ok: false; error: string };

export async function moveEmployeeToManager(
  input: z.infer<typeof MoveSchema>,
): Promise<MoveResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // `setReportingManager` owns the self-manager and cycle refusals, so the two
  // write paths (this board and the employee editor) cannot disagree about what
  // a legal tree is.
  const res = await setReportingManager({
    employeeId: parsed.data.employeeId,
    managerId: parsed.data.managerId,
    changedById: me.id,
    note: parsed.data.note ?? null,
  });
  if (!res.ok) return res;

  for (const p of PATHS) revalidatePath(p);
  // The employee roster cache carries manager ids to the pickers.
  updateTag(CACHE_TAGS.employees);
  return { ok: true, changed: res.changed };
}

/** One person's reporting history — loaded on demand when a card is opened, so
 *  the board's first paint is not carrying every employee's full history. */
export async function fetchManagerHistory(employeeId: string): Promise<
  | {
      ok: true;
      periods: {
        managerId: string | null;
        effectiveFrom: string;
        effectiveTo: string | null;
        note: string | null;
      }[];
    }
  | { ok: false; error: string }
> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(employeeId).success) {
    return { ok: false, error: "Invalid id" };
  }
  const periods = await managerHistoryFor(employeeId);
  return {
    ok: true,
    periods: periods.map((p) => ({
      managerId: p.managerId,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      note: p.note,
    })),
  };
}
