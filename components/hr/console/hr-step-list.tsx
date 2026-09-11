"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, ChevronLeft } from "lucide-react";

import type { HrConsoleModule } from "@/lib/hr/console-nav";
import { cn } from "@/lib/utils";

/**
 * Column 2 of the HR console — the steps inside the selected module. Each row
 * is a real link to the surface that already implements it (a stage page, a
 * letter, or a module route), so the console never fabricates a destination.
 */
export function HrStepList({
  module,
  activeHref,
  onCollapse,
}: {
  module: HrConsoleModule | null;
  /** The step whose route is currently open. */
  activeHref: string | null;
  /** Collapses this column. Passed down rather than read from
   *  useHrStepsToggle() because HrConsoleContextProvider wraps only the
   *  CONTENT column -- this component sits outside it, so that hook would
   *  throw here. The shell owns the state either way. */
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-hairline bg-surface-card">
      {/* title -- count | collapse. The collapse control lives HERE while
          this column is open, so it reads as the column's own chrome.
          Once collapsed the whole column is 0-wide, so the control moves out
          to the shell, which renders it beside the rail (the per-page title
          bar no longer exists — a page's title and controls now portal into
          the global top bar via components/layout/page-chrome-slots). */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
          {module ? module.title : "Steps"}
        </p>
        {module && module.subModules.length > 0 && (
          <>
            <span className="shrink-0 text-[10px] font-bold text-altus-red">
              {String(module.subModules.length).padStart(2, "0")}
            </span>
            <span aria-hidden className="h-4 w-px shrink-0 bg-hairline" />
          </>
        )}
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse steps list"
          title="Collapse steps list"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!module && (
          <p className="px-1 pt-2 text-[13px] leading-relaxed text-ink-muted">
            Select a module from the left to see its steps.
          </p>
        )}

        {module && module.subModules.length === 0 && (
          <div className="rounded-xl border border-dashed border-hairline p-4">
            <p className="text-[13px] font-bold text-ink">{module.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              This module has no inner steps - its content opens directly on the right.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {module?.subModules.map((sub, index) => {
            const active = sub.href === activeHref;
            return (
              <li key={sub.id}>
                <Link
                  href={sub.href as Route}
                  aria-current={active ? "page" : undefined}
                  title={sub.external ? `${sub.title} - opens outside HR` : sub.title}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-altus-red/40 bg-altus-red-wash"
                      : "border-hairline bg-surface-card hover:border-altus-red/25 hover:bg-surface-soft",
                  )}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-altus-red text-[12px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <sub.Icon className="h-3.5 w-3.5 shrink-0 text-altus-red" />
                      <span className="truncate text-[13px] font-bold text-ink">{sub.title}</span>
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                      {sub.blurb}
                    </span>
                  </span>
                  <ArrowUpRight
                    className={cn(
                      "mt-1 h-4 w-4 shrink-0",
                      sub.external ? "text-ink-subtle" : "text-ink-muted",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
