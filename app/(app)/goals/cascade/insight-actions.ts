"use server";

/**
 * Goals canvas Phase 8 — the AI-insight READ action (design §4.4 item 7).
 *
 * `loadGoalInsights` only ever SELECTS the `goal_ai_insights` cache — it never
 * calls a model and never blocks on generation. When the cache is missing,
 * stale (>6h), or a refresh is forced, it schedules `refreshGoalInsights`
 * through `afterResponse` (lib/after.ts) — the fire-and-forget pattern: the
 * worker runs AFTER this response has flushed, off the read path, and the
 * NEXT visit (or the client's delayed refetch) sees the fresh row.
 *
 * SCOPE (open Q6, resolved): who may read an insight is gated by the exact
 * same viewer-scope rule as the Phase-7 detail bundle — owner · admin ·
 * org-chart manager over the owner · named in team_involved. The insight text
 * itself derives only from the goal's own subtree, so a permitted viewer can
 * never see another person's data through it, and a peer outside the scope
 * gets nothing at all.
 *
 * UNAPPLIED-MIGRATION SAFETY: the 0143 table read is guarded (try/catch →
 * `aiReady:false` + null insight) — nothing here can 500 while the migration
 * is pending, and none of it renders unless GOALS_CANVAS_ON.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { goalAiInsights, goals } from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { afterResponse } from "@/lib/after";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCanvasOn } from "@/lib/goals/flag";
import { refreshGoalInsights, type WorkloadFlag } from "@/lib/goals/insights";
import { goalScopeFor } from "@/lib/goals/scope";
import { rateLimitOrError } from "@/lib/rate-limit";

/* ------------------------------------------------------------------ */

export interface GoalInsightDTO {
  narrative: string;
  suggestions: string[];
  workload: WorkloadFlag[];
  source: "ai" | "heuristic";
  generatedAt: string;
}

export interface LoadInsightsResult {
  ok: true;
  /** Null when nothing is cached yet (a refresh may have been scheduled). */
  insight: GoalInsightDTO | null;
  /** False when migration 0143 isn't applied — the section renders a note. */
  aiReady: boolean;
  /** True when a background regeneration was scheduled by THIS call. */
  refreshing: boolean;
}
export type LoadInsightsResponse = LoadInsightsResult | { ok: false; error: string };

const READ_BUDGET = [6000, 12000] as const;
const STALE_MS = 6 * 60 * 60 * 1000;

const InputSchema = z.object({
  id: z.string().uuid(),
  /** v1 generates for cascade goals only (the LEFT panel + child planners). */
  kind: z.literal("cascade"),
  /** Explicit "Refresh" affordance — schedules regeneration regardless of age. */
  force: z.boolean().optional(),
});

export async function loadGoalInsights(
  input: z.infer<typeof InputSchema>,
): Promise<LoadInsightsResponse> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid goal" };
  const { id, force } = parsed.data;

  // Load the node + authorize the VIEWER (same rule as goalDetailBundle —
  // never trusts a client-passed owner; no downline leak to peers).
  const [node] = await withRetry(
    () =>
      db
        .select({
          id: goals.id,
          employeeId: goals.employeeId,
          teamInvolved: goals.teamInvolved,
        })
        .from(goals)
        .where(eq(goals.id, id))
        .limit(1),
    { timeoutMs: [...READ_BUDGET], label: "goals.insights.node" },
  );
  if (!node) return { ok: false, error: "Goal not found" };
  let allowed = isAdmin || node.employeeId === me.id;
  if (!allowed) allowed = (node.teamInvolved ?? []).some((t) => t.employeeId === me.id);
  if (!allowed) {
    const scope = await goalScopeFor(me);
    allowed = scope.all || scope.ids.includes(node.employeeId);
  }
  if (!allowed) return { ok: false, error: "You can't view that goal." };

  // Cache-only read — guarded for the 0143-unapplied case.
  let aiReady = true;
  let insight: GoalInsightDTO | null = null;
  let generatedAt: Date | null = null;
  try {
    const [row] = await withRetry(
      () =>
        db
          .select({
            narrative: goalAiInsights.narrative,
            suggestions: goalAiInsights.suggestions,
            workload: goalAiInsights.workload,
            source: goalAiInsights.source,
            generatedAt: goalAiInsights.generatedAt,
          })
          .from(goalAiInsights)
          .where(eq(goalAiInsights.goalId, id))
          .limit(1),
      { timeoutMs: [...READ_BUDGET], label: "goals.insights.cache" },
    );
    if (row) {
      generatedAt = row.generatedAt;
      insight = {
        narrative: row.narrative,
        suggestions: row.suggestions ?? [],
        workload: (row.workload ?? []) as WorkloadFlag[],
        source: row.source,
        generatedAt: row.generatedAt.toISOString(),
      };
    }
  } catch {
    aiReady = false; // migration 0143 pending — honest note client-side
  }

  // Fire-and-forget regeneration OFF the read path (§4.4: afterResponse) —
  // only when it could land somewhere (flag on + table present).
  let refreshing = false;
  const stale =
    generatedAt == null || Date.now() - generatedAt.getTime() > STALE_MS;
  if (goalsCanvasOn() && aiReady && (force || stale)) {
    refreshing = true;
    afterResponse(() => refreshGoalInsights(id, force ?? false));
  }

  return { ok: true, insight, aiReady, refreshing };
}
