"use client";

import * as React from "react";
import {
  RECENT_PLAN_EVENT,
  planPathTo,
  readRecentChain,
  resolveRecentPlan,
  writeRecentChain,
  type PlanTreeLike,
  type RecentPlanContext,
} from "@/lib/project-plan/recent";

/**
 * The React half of the last-accessed branch — the rule itself is in
 * `lib/project-plan/recent.ts`, which is where the tests read it.
 *
 * TWO SURFACES, ONE ANSWER. The board and the register can be open on the same
 * screen as a dialog that is asking where a new row goes, so a write broadcasts
 * `RECENT_PLAN_EVENT` and every hook re-reads. `storage` covers the second tab.
 *
 * NOTHING IS READ DURING RENDER ON THE SERVER. The first render is always the
 * empty context and the real one arrives in an effect — localStorage does not
 * exist on the server, and seeding state from it would hydrate one tree against
 * markup built from another.
 */
export function useRecentPlan(tree: PlanTreeLike[]): RecentPlanContext {
  const [chain, setChain] = React.useState<ReturnType<typeof readRecentChain>>([]);

  React.useEffect(() => {
    const read = () => setChain(readRecentChain());
    read();
    window.addEventListener(RECENT_PLAN_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(RECENT_PLAN_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  // Re-derived against the LIVE tree on every render of it, so a renamed row
  // reads by its new name and a deleted one falls back to its parent.
  return React.useMemo(() => resolveRecentPlan(tree, chain), [tree, chain]);
}

/**
 * "I just touched this row" — remember the whole path down to it.
 *
 * Called from the handlers that mean someone is WORKING somewhere: opening a
 * row's detail, expanding a branch, filtering to a project, creating a row.
 * Deliberately not called from hover or from a render pass; the memory is about
 * intent, and a mouse crossing a table is not intent.
 */
export function useRememberPlanNode(tree: PlanTreeLike[]) {
  return React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      const path = planPathTo(tree, id);
      if (path.length > 0) writeRecentChain(path);
    },
    [tree],
  );
}
