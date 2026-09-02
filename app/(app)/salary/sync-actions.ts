"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  runSalaryBreakupSync,
  type SalarySyncSummary,
} from "@/lib/salary/breakup-sync";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Admin "Refresh now" — pulls the live salary Google Sheet into
 * `salary_breakup` on demand (same engine as the /api/cron/salary-sync cron;
 * the sync itself is idempotent, transactional and audit-logged in
 * sync_runs — see lib/salary/breakup-sync.ts).
 *
 * Safe while unconfigured: until SALARY_SHEET_ID / SALARY_SHEET_RANGE are set
 * the engine returns a clean "not configured" error and writes nothing.
 *
 * Wire this to a button on /salary (admin-only page) — the returned summary
 * (rows, months touched, unmatched names) is designed to be shown verbatim;
 * it deliberately contains NO salary figures.
 */
export async function refreshSalaryBreakupNow(): Promise<
  ActionResult<{ summary: SalarySyncSummary }>
> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const result = await runSalaryBreakupSync({ trigger: "admin", actorId: me.id });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/salary");
  const { ok: _ok, ...summary } = result;
  return { ok: true, summary };
}
