"use client";

/**
 * Data + mutation hook for the calendar workspace. TanStack Query holds the
 * month bundle (events + categories + obligations) keyed on the visible date
 * range; every mutation runs the co-located server action, toasts on failure
 * and invalidates the range so the grid re-reads. Optimistic where it helps the
 * feel of drag/resize; authoritative on refetch.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fireToast } from "@/lib/toast";
import type { CalendarBundle } from "@/lib/queries/monthly-events-calendar";
import { fetchCalendarRange } from "@/app/(app)/events/calendar/actions";
import type { ActionResult } from "@/app/(app)/events/calendar/actions";

const KEY = "events-calendar";

export function useCalendar(range: { from: string; to: string }, initial: CalendarBundle) {
  const qc = useQueryClient();
  const queryKey = [KEY, range.from, range.to] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetchCalendarRange(range.from, range.to);
      if (!res.ok) throw new Error(res.error);
      return res.bundle;
    },
    initialData: initial,
    staleTime: 15_000,
  });

  const invalidate = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: [KEY] });
  }, [qc]);

  /**
   * Run a mutation action; on success invalidate + optional toast, on failure
   * toast the error. Returns whether it succeeded so callers can branch.
   */
  const run = React.useCallback(
    async <T>(
      action: Promise<ActionResult<T>>,
      opts?: { success?: string },
    ): Promise<ActionResult<T>> => {
      const res = await action;
      if (res.ok) {
        invalidate();
        if (opts?.success) fireToast({ message: opts.success, type: "success" });
      } else {
        fireToast({ message: res.error, type: "error" });
      }
      return res;
    },
    [invalidate],
  );

  const bundle = query.data ?? initial;

  return {
    events: bundle.events,
    categories: bundle.categories,
    obligations: bundle.obligations,
    isFetching: query.isFetching,
    invalidate,
    run,
  };
}
