"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { getPunctualityDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type { PunctualityDrilldown } from "@/lib/queries/punctuality-drilldown";

/**
 * The late-task list behind the Overdue-by-Person spread cells, fetched ONCE
 * and shared by every cell in the table.
 *
 * WHY NOT A FETCH PER CELL. The table has up to five spread columns per person
 * and a page of eight people — forty cells, each of which can be hovered. A
 * request per hover would be forty round trips for one pass of the mouse, and
 * the same rows over and over. This fetches the whole `late` bucket for the
 * ACTIVE FILTERS once, lazily on the first hover, and every cell reads its own
 * slice out of it in memory.
 *
 * WHY NOT SHIP IT WITH THE PAGE. The dashboard's own load is already several
 * seconds of rollup scans, and most readers never hover a single cell. Nothing
 * here runs until someone actually points at a number.
 *
 * `revised` matches the basis the Delivered-on-Time widget measures against
 * (on-time-gauge.tsx), so a task counted late here is late there too.
 */
const BASIS = "revised" as const;

/** The four columns, as day ranges. `d15` is open-ended upward. Together they
 *  cover every late task from one day on, so a hover preview can never come
 *  back empty for a cell that shows a count. */
export const LATE_BRACKETS = {
  d1_3: { label: "1–3 days late", min: 1, max: 3 },
  d4_7: { label: "4–7 days late", min: 4, max: 7 },
  d8_14: { label: "8–14 days late", min: 8, max: 14 },
  d15: { label: "15+ days late", min: 15, max: Number.POSITIVE_INFINITY },
} as const;

export type LateBracketKey = keyof typeof LATE_BRACKETS;

export type LateTask = PunctualityDrilldown["tasks"][number];

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; tasks: LateTask[]; capped: boolean }
  | { kind: "error" };

/**
 * Call `load()` on first hover; read `tasksFor(employeeName, bracket)` after.
 *
 * MATCHED BY NAME, not id: the drill-down projection carries `doerName` and no
 * `doerId`. That is a real limitation — two people with the same display name
 * would share a preview — so the COUNT on the cell always comes from
 * `lateSpread`, which is computed per employee id. Only the three sample rows
 * come from here, and the popover says "click to see all" rather than implying
 * the preview is the whole set.
 */
export function useLateSpreadPreview() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [state, setState] = React.useState<State>({ kind: "idle" });

  // A filter change invalidates the cached list — it was fetched for the old
  // scope and would preview tasks the table is no longer counting.
  React.useEffect(() => {
    setState({ kind: "idle" });
  }, [search]);

  const inFlight = React.useRef(false);
  const load = React.useCallback(() => {
    if (inFlight.current || state.kind === "ok" || state.kind === "loading") return;
    inFlight.current = true;
    setState({ kind: "loading" });
    void getPunctualityDrilldown(BASIS, "late", search)
      .then((res) => {
        if ("error" in res) {
          setState({ kind: "error" });
          return;
        }
        setState({
          kind: "ok",
          tasks: res.tasks,
          // The query caps at MAX_ROWS. When it bites, a person's preview can
          // hold fewer rows than their count — worth knowing about rather than
          // silently showing two of six.
          capped: res.total > res.tasks.length,
        });
      })
      .catch(() => setState({ kind: "error" }))
      .finally(() => {
        inFlight.current = false;
      });
  }, [search, state.kind]);

  const tasksFor = React.useCallback(
    (employeeName: string, bracket: LateBracketKey): LateTask[] => {
      if (state.kind !== "ok") return [];
      const { min, max } = LATE_BRACKETS[bracket];
      return state.tasks.filter(
        (t) =>
          (t.doerName ?? "") === employeeName &&
          t.daysLate >= min &&
          t.daysLate <= max,
      );
    },
    [state],
  );

  return { status: state.kind, load, tasksFor };
}
