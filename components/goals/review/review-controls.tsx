"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ViewingSelect } from "@/components/goals/shared/viewing-select";
import { fyLabel, type RosterMember } from "@/components/goals/cascade/util";
import { fyStartYearOf } from "@/lib/goals/types";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/**
 * Header controls for the Review & Scores page — the same FY stepper +
 * `ViewingSelect` the level boards use, but navigating the review route (its
 * picker is labelled "Reviewing"). A manager/admin (roster > 1) can pick whose
 * scorecard to review; the FY stepper walks financial years. Shareable via
 * ?emp= & ?fy=.
 *
 * `basePath` exists because this same workbench is mounted twice: at
 * `/goals/review` for the Goals room and at the WMS-owned alias `/review`.
 * Hard-coding the Goals path would mean stepping the FY from WMS silently threw
 * you into the Goals room — the exact sidebar-swap `/review` exists to avoid.
 */
export function ReviewControls({
  roster,
  viewedEmployeeId,
  viewedName,
  myEmployeeId,
  fyStartYear,
  basePath = "/goals/review",
}: {
  roster: RosterMember[];
  viewedEmployeeId: string;
  viewedName: string;
  myEmployeeId: string;
  fyStartYear: number;
  /** Route these controls navigate within. Defaults to the Goals surface. */
  basePath?: string;
}) {
  const router = useRouter();
  const fy = fyStartYear;

  const go = React.useCallback(
    (params: { emp?: string; fy?: number }) => {
      const sp = new URLSearchParams();
      const emp = params.emp ?? viewedEmployeeId;
      if (emp && emp !== myEmployeeId) sp.set("emp", emp);
      const fyNext = params.fy ?? fy;
      if (fyNext !== fyStartYearOf(new Date())) sp.set("fy", String(fyNext));
      const qs = sp.toString();
      router.push(`${basePath}${qs ? `?${qs}` : ""}` as Route);
    },
    [router, viewedEmployeeId, myEmployeeId, fy, basePath],
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      {/* FY stepper FIRST — [ FY ] [ Reviewing ], same order and same box as
          every other Goals header. */}
      <div className="inline-flex items-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
        <button
          type="button"
          aria-label="Previous financial year"
          onClick={() => go({ fy: fy - 1 })}
          className={`cursor-pointer px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red ${FOCUS_RING}`}
        >
          <ChevronLeft size={15} strokeWidth={2.4} />
        </button>
        <span className="border-x border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums text-ink-strong">
          {fyLabel(fy)}
        </span>
        <button
          type="button"
          aria-label="Next financial year"
          onClick={() => go({ fy: fy + 1 })}
          className={`cursor-pointer px-2 py-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-altus-red ${FOCUS_RING}`}
        >
          <ChevronRight size={15} strokeWidth={2.4} />
        </button>
      </div>

      {roster.length > 1 && (
        <ViewingSelect
          people={roster}
          value={viewedEmployeeId}
          viewedName={viewedName}
          onChange={(v) => go({ emp: v })}
          myEmployeeId={myEmployeeId}
          label="Reviewing"
          ariaLabel="Review another person's goals"
        />
      )}
    </div>
  );
}
