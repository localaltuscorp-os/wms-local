"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { fyLabel, type RosterMember } from "./util";

/** Year-board toolbar: pick whose cascade to view + step the financial year. */
export function CascadeToolbar({
  roster,
  viewedEmployeeId,
  fyStartYear,
  canPickEmployee,
}: {
  roster: RosterMember[];
  viewedEmployeeId: string;
  fyStartYear: number;
  canPickEmployee: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function go(next: { emp?: string; fy?: number }) {
    const sp = new URLSearchParams(params.toString());
    if (next.emp !== undefined) sp.set("emp", next.emp);
    if (next.fy !== undefined) sp.set("fy", String(next.fy));
    router.push(`/goals/cascade?${sp.toString()}` as Route);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {canPickEmployee && roster.length > 1 && (
        <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-card px-3 py-1.5">
          <User size={15} className="text-ink-soft" />
          <select
            value={viewedEmployeeId}
            onChange={(e) => go({ emp: e.target.value })}
            className="bg-transparent text-[13.5px] font-bold text-ink-strong outline-none"
          >
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-card p-1">
        <button
          type="button"
          onClick={() => go({ fy: fyStartYear - 1 })}
          className="wg-btn flex size-7 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.05] hover:text-ink-strong"
          aria-label="Previous year"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-2 text-[13.5px] font-black text-ink-strong tabular-nums">{fyLabel(fyStartYear)}</span>
        <button
          type="button"
          onClick={() => go({ fy: fyStartYear + 1 })}
          className="wg-btn flex size-7 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-black/[0.05] hover:text-ink-strong"
          aria-label="Next year"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
