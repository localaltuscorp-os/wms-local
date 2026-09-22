"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { STATUS_AXES, STATUS_AXIS_LABEL, type StatusAxis } from "@/lib/status/axes";

/**
 * [ Doer Status | Initiator Status ] — the kanban's axis switch.
 *
 * IN THE URL, not in component state, for three reasons: the board is a server
 * component that has to fetch a different shape per axis, a link to "the
 * initiator board" should be a link someone can send, and the browser Back
 * button should undo a flip. Every other filter on this page already lives in
 * the query string, so the axis lives beside them.
 *
 * Every OTHER parameter is preserved on a flip. Switching axis while filtered to
 * one person's overdue work should keep that filter — the question changes, the
 * subject of it does not.
 */
export function KanbanAxisToggle({ axis }: { axis: StatusAxis }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: StatusAxis) {
    if (next === axis) return;
    const sp = new URLSearchParams(params.toString());
    // "doer" is the default, so it stays out of the URL — a clean link for the
    // common case, an explicit one only where it changes something.
    if (next === "doer") sp.delete("axis");
    else sp.set("axis", next);
    const qs = sp.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  }

  return (
    <div
      role="tablist"
      aria-label="Status axis"
      className="inline-flex items-center gap-0.5 rounded-pill border border-hairline bg-surface-subtle p-0.5"
    >
      {STATUS_AXES.map((a) => {
        const active = a === axis;
        return (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => go(a)}
            className={`rounded-pill px-3.5 h-8 text-[13px] font-bold transition-colors ${
              active
                ? "bg-surface-card text-ink-strong"
                : "text-ink-soft hover:text-ink-strong"
            }`}
            style={active ? { boxShadow: "0 1px 2px rgba(15,23,42,0.08)" } : undefined}
          >
            {STATUS_AXIS_LABEL[a]}
          </button>
        );
      })}
    </div>
  );
}
