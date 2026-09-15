"use client";

import * as React from "react";
import type { ClaimFilter } from "@/lib/reimbursements/claim-status";

/**
 * The active claim filter, shared between the KPI strip and the claims list.
 *
 * ── WHY A CONTEXT AND NOT A URL PARAM ──────────────────────────────────────
 * The status filter ALREADY existed as local state inside `RbClaimsList`, with
 * its own chip row, counts and "All" reset. Making the KPI cards drive it means
 * one more reader of that state, not a second filtering mechanism — so the
 * state moves up a level and nothing about how filtering WORKS changes. Lifting
 * it into the URL instead would have meant a server round-trip per click and a
 * second source of truth beside the chips.
 *
 * The page's KPI TOTALS stay server-computed over every row, deliberately: a
 * KPI that recomputed itself against the active filter would read ₹0 for every
 * card except the selected one, which is not a dashboard.
 */

interface ClaimFilterState {
  filter: ClaimFilter;
  setFilter: (f: ClaimFilter) => void;
  /** Set `f`, or clear back to "all" when `f` is already active. */
  toggleFilter: (f: ClaimFilter) => void;
}

const Ctx = React.createContext<ClaimFilterState | null>(null);

export function RbFilterProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = React.useState<ClaimFilter>("all");
  const toggleFilter = React.useCallback(
    (f: ClaimFilter) => setFilter((cur) => (cur === f ? "all" : f)),
    [],
  );
  const value = React.useMemo(
    () => ({ filter, setFilter, toggleFilter }),
    [filter, toggleFilter],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the active filter.
 *
 * Throws when used outside the provider rather than falling back to "all": a
 * silent default would make a mis-wired KPI card look like it simply does not
 * filter, which is the one failure this whole change exists to prevent.
 */
export function useClaimFilter(): ClaimFilterState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useClaimFilter must be used inside <RbFilterProvider>");
  return v;
}
