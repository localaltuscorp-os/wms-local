"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  creatorWorkloadBoard,
  type CreatorWorkloadBoard,
} from "@/lib/queries/creator-workload-board";
import type { ActivityPeriod } from "@/lib/dashboard/manager-activity-contract";

/** The periods the board can be read over. Kept in sync with the dropdown. */
const PERIODS = ["3d", "7d", "month", "last_month", "year", "custom"] as const;

/** YYYY-MM-DD. Validated so a hand-edited range cannot reach the query. */
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const InputSchema = z.object({
  period: z.enum(PERIODS),
  custom: z.object({ from: Ymd, to: Ymd }).nullish(),
});

/**
 * ON-DEMAND creator workload board. Same contract as
 * `getManagerActivityBoard` beside it: fetched when the widget mounts or its
 * period changes, never as part of the dashboard payload, so the page's load
 * path does not pay for three more aggregations. Fails open to `{ error }` so
 * the widget shows an error state instead of taking the dashboard down.
 *
 * No per-person permission gate, for the same reason the delegation board has
 * none: this is an org-wide leaderboard of ACTIVITY COUNTS and exposes no goal,
 * task or commitment CONTENT. The titles live behind the per-cell links, which
 * enforce their own scoping on arrival.
 */
export async function getCreatorWorkloadBoard(
  period: ActivityPeriod,
  custom?: { from: string; to: string } | null,
): Promise<CreatorWorkloadBoard | { error: string }> {
  try {
    const me = await requireUser();

    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const parsed = InputSchema.safeParse({ period, custom });
    if (!parsed.success) return { error: "Invalid input" };

    return await creatorWorkloadBoard(parsed.data.period, new Date(), parsed.data.custom ?? null);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load the workload board",
    };
  }
}
