"use client";

import { PanelsTopLeft } from "lucide-react";

import type { HrConsoleModule } from "@/lib/hr/console-nav";

/**
 * The console's "nothing open yet" pane — the dashed card that fills column 3
 * whenever no real page belongs there.
 *
 * TWO callers, deliberately sharing one component so both states look
 * identical:
 *   • HrConsoleHome — the bare /hr front door (`module` is whatever the rail
 *     currently previews, or null before anything is picked).
 *   • HrConsoleShell — when you click a DIFFERENT module while a page from
 *     the previous one is still routed. The old page's content would
 *     otherwise sit there contradicting the rail and step list, so the shell
 *     swaps in this ghost for the newly-picked module instead.
 */
export function HrModuleGhost({ module }: { module: HrConsoleModule | null }) {
  const Icon = module?.Icon ?? PanelsTopLeft;
  const heading = module ? module.title : "Welcome to Human Resources";
  const body = module ? (
    <>Choose a step from the list in the middle to open it here.</>
  ) : (
    <>
      Pick a module on the left to see its steps, then choose a step to open it here.
      Everything in the room - the employee lifecycle, policies, records and the help
      desk - is one or two clicks away.
    </>
  );

  return (
    <div className="px-6 pb-10 pt-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-dashed border-hairline bg-surface-card px-6 py-14 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-altus-red-wash text-altus-red">
            <Icon size={26} strokeWidth={2.1} />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">{heading}</h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-muted">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
