"use client";

/**
 * Goals Canvas — AI INSIGHT surfaces (Phase 8, design §2.2 "AI insight line" +
 * §3.2.4 workload balancing + §4.4 item 7).
 *
 *   · `AiInsightSection` — the health-narrative section in the LEFT
 *     ParentContextPanel: one narrative line (serif, like the panel's other
 *     prose), execution suggestions, deterministic workload flags, an honest
 *     ai/rules source badge and a Refresh affordance.
 *   · `AiExecutionHints` — the compact suggestion strip on the RIGHT child
 *     planner (renders only when there is something to say — dense-layout
 *     spec: no empty chrome).
 *
 * DATA: cache-only reads through `loadGoalInsights` behind the app-wide
 * QueryClientProvider (per-goal keys, staleTime 5 min — drilling away and
 * back does NOT refetch). Generation happens server-side AFTER the response
 * (afterResponse fire-and-forget) — this file never waits on a model; when a
 * refresh was scheduled we refetch once after a short delay to pick up the
 * freshly cached row.
 *
 * HONESTY LAWS: the narrative/suggestions are advisory prose — the recorded %
 * stays the number of record (locked decision 1); workload numbers come from
 * derive.ts math (suggestDistribution), never from the model; the source
 * badge always discloses ai vs deterministic rules.
 *
 * HARD LAWS: zero queries outside the action; amber identity; motion/react
 * reduced-motion-gated; no CSS zoom/transform on ancestors.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, RefreshCw, Scale, Sparkles } from "lucide-react";
import { type GoalDTO } from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, accentMix } from "./tokens";
import {
  loadGoalInsights,
  type GoalInsightDTO,
  type LoadInsightsResult,
} from "@/app/(app)/goals/cascade/insight-actions";

/* ------------------------------------------------------------------ */

/* Accent + ramp come from the design contract (tokens.ts, §2.0). */

/** Delay before refetching after a background regeneration was scheduled —
 *  long enough for the model round-trip, short enough to feel alive. */
const REGEN_REFETCH_MS = 7000;

const insightKey = (goalId: string) => ["goal-ai", goalId] as const;

/* ------------------------------------------------------------------ */
/* The cached-insight hook (dedupes across LEFT panel + planner strip)  */
/* ------------------------------------------------------------------ */

function useGoalInsights(goalId: string) {
  const qc = useQueryClient();
  const query = useQuery<LoadInsightsResult, Error>({
    queryKey: insightKey(goalId),
    queryFn: async () => {
      const res = await loadGoalInsights({ id: goalId, kind: "cascade" });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // A regeneration was scheduled server-side (fire-and-forget) — pick the
  // fresh row up with ONE delayed refetch instead of polling.
  const scheduled = query.data?.refreshing === true;
  const hadInsight = query.data?.insight != null;
  React.useEffect(() => {
    if (!scheduled) return;
    const t = window.setTimeout(
      () => void qc.invalidateQueries({ queryKey: insightKey(goalId) }),
      // No cached row yet → the first generation is what the user is waiting
      // on; a stale row is already on screen, so the refresh can be lazier.
      hadInsight ? REGEN_REFETCH_MS * 2 : REGEN_REFETCH_MS,
    );
    return () => window.clearTimeout(t);
  }, [scheduled, hadInsight, goalId, qc]);

  return query;
}

/* ------------------------------------------------------------------ */
/* Shared atoms                                                        */
/* ------------------------------------------------------------------ */

function SourceBadge({ source }: { source: GoalInsightDTO["source"] }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.1em]"
      style={
        source === "ai"
          ? { color: ACCENT_DEEP, background: accentMix(12) }
          : { color: "var(--color-ink-muted)", background: "var(--color-surface-soft)" }
      }
      title={
        source === "ai"
          ? "Written by the model from this goal's numbers only"
          : "Deterministic rules read-out (no model configured or reachable)"
      }
    >
      <Bot size={10} strokeWidth={2.6} aria-hidden="true" />
      {source === "ai" ? "AI" : "rules"}
    </span>
  );
}

function WorkloadChips({ workload }: { workload: GoalInsightDTO["workload"] }) {
  if (workload.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {workload.map((w, i) => {
        const hot = w.kind === "over_allocation" || w.kind === "stalled" || w.kind === "spillover";
        return (
          <span
            key={`${w.kind}-${i}`}
            className="inline-flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-semibold leading-snug"
            style={
              hot
                ? { color: "#b91c1c", background: "rgba(185,28,28,0.08)" }
                : { color: ACCENT_DEEP, background: accentMix(8) }
            }
          >
            <Scale size={12} strokeWidth={2.6} className="mt-0.5 shrink-0" aria-hidden="true" />
            {w.message}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AiInsightSection — the LEFT-panel health narrative (§2.2)           */
/* ------------------------------------------------------------------ */

export function AiInsightSection({ g }: { g: GoalDTO }): React.JSX.Element {
  const reduce = useReducedMotion() ?? false;
  const qc = useQueryClient();
  const query = useGoalInsights(g.id);
  const [forcing, setForcing] = React.useState(false);

  const forceRefresh = React.useCallback(() => {
    if (forcing) return;
    setForcing(true);
    void loadGoalInsights({ id: g.id, kind: "cascade", force: true })
      .then(() => {
        // The regen runs after that response flushes — refetch once it lands.
        window.setTimeout(() => {
          void qc.invalidateQueries({ queryKey: insightKey(g.id) });
          setForcing(false);
        }, REGEN_REFETCH_MS);
      })
      .catch(() => setForcing(false));
  }, [forcing, g.id, qc]);

  const data = query.data;
  const insight = data?.insight ?? null;

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-ink-subtle">
        <Sparkles size={12} strokeWidth={2.6} style={{ color: ACCENT }} aria-hidden="true" />
        AI read
        {insight && <SourceBadge source={insight.source} />}
        <span className="ml-auto">
          {data?.aiReady !== false && (
            <button
              type="button"
              onClick={forceRefresh}
              disabled={forcing}
              className="inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[10px] font-black text-ink-muted transition-colors hover:text-ink-strong disabled:opacity-50"
              title="Regenerate in the background from the latest numbers"
            >
              <RefreshCw size={11} strokeWidth={2.6} className={forcing ? "animate-spin" : ""} aria-hidden="true" />
              {forcing ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </span>
      </div>

      <div className="mt-2">
        {query.isPending ? (
          <div
            className="h-4 w-3/4 animate-pulse rounded"
            style={{ background: accentMix(8) }}
            aria-label="Loading the AI read"
          />
        ) : query.isError ? (
          <p className="text-[12px] font-semibold text-ink-faint">The AI read isn&apos;t available right now.</p>
        ) : data?.aiReady === false ? (
          <p className="text-[12px] font-semibold text-ink-faint">
            Insights aren&apos;t provisioned yet (migration 0143 pending) — ask an admin to apply it.
          </p>
        ) : !insight ? (
          <p className="text-[12px] font-semibold text-ink-subtle">
            {data?.refreshing
              ? "Reading the numbers — the first insight lands here shortly."
              : "No insight cached yet."}
          </p>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={insight.generatedAt}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
              className="flex flex-col gap-2.5"
            >
              {/* The health-narrative line — advisory prose, serif like the
                  panel's other editorial text; the recorded % above stays the
                  number of record. */}
              <p
                className="text-[13.5px] italic leading-relaxed text-ink-strong"
                style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
              >
                {insight.narrative}
              </p>

              {insight.suggestions.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {insight.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug text-ink-muted">
                      <Sparkles size={11} strokeWidth={2.6} className="mt-[3px] shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              )}

              <WorkloadChips workload={insight.workload} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* AiExecutionHints — the child-planner suggestion strip               */
/* ------------------------------------------------------------------ */

/**
 * Compact execution-suggestion strip for the RIGHT planner. Reads the SAME
 * cached query as the LEFT panel (React Query dedupes — zero extra fetches).
 * Renders NOTHING unless there is a cached insight with suggestions or
 * workload flags (dense-layout spec: no empty chrome). The over/under
 * rebalance itself lives in the AllocationBanner directly above — this strip
 * carries the prose; the banner carries the apply button.
 */
export function AiExecutionHints({ focus }: { focus: GoalDTO }): React.JSX.Element | null {
  const reduce = useReducedMotion() ?? false;
  const query = useGoalInsights(focus.id);
  const insight = query.data?.insight ?? null;

  if (!insight || (insight.suggestions.length === 0 && insight.workload.length === 0)) {
    return null;
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
      className="rounded-xl border px-3.5 py-2.5"
      style={{ borderColor: accentMix(30), background: accentMix(4) }}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.12em]" style={{ color: ACCENT_DEEP }}>
        <Sparkles size={11} strokeWidth={2.6} aria-hidden="true" />
        Execution read
        <SourceBadge source={insight.source} />
      </div>
      {insight.suggestions.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {insight.suggestions.slice(0, 3).map((s, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug text-ink-strong">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      )}
      {insight.workload.length > 0 && (
        <div className="mt-2">
          <WorkloadChips workload={insight.workload} />
        </div>
      )}
    </motion.div>
  );
}
