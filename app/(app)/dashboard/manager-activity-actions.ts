"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  managerActivityBoard,
  type ManagerActivityBoard,
} from "@/lib/queries/manager-activity-board";
import { managerActivityPreview } from "@/lib/queries/manager-activity-preview";
import type {
  ActivityPreview,
  ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";

/** The periods the board can be read over. Kept in sync with the dropdown. */
const PERIODS = ["3d", "7d", "month", "last_month", "year", "custom"] as const;

/** YYYY-MM-DD. Validated so a hand-edited range cannot reach the query. */
const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CustomRange = z.object({ from: Ymd, to: Ymd }).nullish();

const InputSchema = z.object({
  period: z.enum(PERIODS),
  custom: CustomRange,
});

/**
 * ON-DEMAND manager activity board. Same contract as the drill-down actions
 * beside it: fired when the widget mounts or its period changes — never as part
 * of the dashboard payload, so the dashboard load path does not pay for three
 * extra aggregations. Fails open to `{ error }` so the widget shows an error
 * state instead of taking the page down.
 *
 * No per-manager permission gate: this is an org-wide leaderboard of ACTIVITY
 * COUNTS, the same shape of number the initiation scorecards above it already
 * show every signed-in viewer. It exposes no task, goal or commitment content —
 * the titles live behind the per-cell links, which enforce their own scoping.
 */
export async function getManagerActivityBoard(
  period: ActivityPeriod,
  custom?: { from: string; to: string } | null,
): Promise<ManagerActivityBoard | { error: string }> {
  try {
    const me = await requireUser();

    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const parsed = InputSchema.safeParse({ period, custom });
    if (!parsed.success) return { error: "Invalid input" };

    return await managerActivityBoard(parsed.data.period, new Date(), parsed.data.custom ?? null);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load the activity board",
    };
  }
}

const PreviewSchema = z.object({
  managerId: z.string().uuid(),
  memberId: z.string().uuid(),
  category: z.enum(["goals", "tasks", "commitments"]),
  split: z.enum(["delegate", "counterpart", "gt"]),
  period: z.enum(PERIODS),
  custom: CustomRange,
});

/**
 * The item list behind ONE activity cell, fetched when the pointer lands on it.
 *
 * Deliberately not part of the board payload: the board renders hundreds of
 * cells and a reader hovers a handful, so pre-loading every list would be a
 * few hundred wasted queries per page view.
 */
export async function getActivityPreview(input: {
  managerId: string;
  memberId: string;
  category: "goals" | "tasks" | "commitments";
  split: "delegate" | "counterpart" | "gt";
  period: ActivityPeriod;
  custom?: { from: string; to: string } | null;
}): Promise<ActivityPreview | { error: string }> {
  try {
    const me = await requireUser();

    const limited = rateLimitOrError(me.id, "read");
    if (limited) return { error: limited.error };

    const parsed = PreviewSchema.safeParse(input);
    if (!parsed.success) return { error: "Invalid input" };

    return await managerActivityPreview(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load the preview" };
  }
}
