"use client";

import Link from "next/link";
import type { Route } from "next";
import { FolderKanban, Flag, Target } from "lucide-react";

/**
 * WHERE THIS ROW SITS IN THE PLAN — Project, Milestone (with its number) and
 * Result (with its number), each named.
 *
 * Manan, 2026-09-15: "In Detailed View of any Task or Action I should see the
 * names of project, milestone with milestone no and results with results no".
 *
 * ONE COMPONENT, TWO DETAIL VIEWS. The WMS task drawer and the Project Plan's
 * own row dialog are different screens built by different code, and both answer
 * the same question about the same three rows. Written once so the two cannot
 * start disagreeing about how a plan address is spelled — which is exactly what
 * happened to the ref labels before `refFor` was centralised.
 *
 * PURELY PRESENTATIONAL, and deliberately: the numbers are DERIVED from sibling
 * position, and each caller already derives them from the ordering it renders.
 * The task drawer gets them from `planBreadcrumbForNode` (a server query), the
 * plan board from its own flatten pass. Handing this component the finished
 * strings keeps it out of that argument and keeps it client-safe.
 *
 * A level with no row is shown as a dash rather than hidden: "this task is not
 * filed under a result" is information, and a panel whose rows appear and
 * disappear is harder to read at a glance than one that always has three.
 */

export interface PlanPlaceLevel {
  /** "P2" / "M3" / "RB". Null when the level is not numbered (archived out). */
  ref: string | null;
  name: string | null;
  /** Where clicking the name goes, when the caller can link it. */
  href?: string | null;
}

export interface PlanPlaceProps {
  project: PlanPlaceLevel | null;
  milestone: PlanPlaceLevel | null;
  result: PlanPlaceLevel | null;
  /** Rendered under the three rows when given — the P3M3RDA5 traceability path. */
  fullRef?: string | null;
  className?: string;
}

const ROWS = [
  { key: "project", label: "Project", Icon: FolderKanban },
  { key: "milestone", label: "Milestone", Icon: Flag },
  { key: "result", label: "Result", Icon: Target },
] as const;

export function PlanPlacePanel({
  project,
  milestone,
  result,
  fullRef,
  className,
}: PlanPlaceProps) {
  const levels = { project, milestone, result };

  return (
    <section
      className={`rounded-xl border border-slate-200/80 bg-white p-4 ${className ?? ""}`}
      aria-label="Where this sits in the plan"
    >
      <h2 className="mb-2.5 text-[14px] font-black text-ink-strong">Plan location</h2>
      <dl className="flex flex-col gap-2">
        {ROWS.map(({ key, label, Icon }) => {
          const level = levels[key];
          return (
            <div key={key} className="flex items-start gap-2.5">
              <Icon size={14} className="mt-[3px] shrink-0 text-ink-subtle" aria-hidden />
              <dt className="w-[74px] shrink-0 text-[11.5px] font-bold uppercase tracking-wide text-ink-subtle">
                {label}
              </dt>
              <dd className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-strong">
                {level?.name ? (
                  <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    {level.ref && (
                      // The NUMBER is the point of the request, so it is set
                      // apart rather than run into the name: "M3 · Discovery"
                      // is scannable down a column of these, "M3 Discovery" is
                      // just a longer name.
                      <span className="rounded bg-surface-soft px-1.5 py-[1px] text-[11.5px] font-black tabular-nums text-ink-muted">
                        {level.ref}
                      </span>
                    )}
                    {level.href ? (
                      <Link
                        href={level.href as Route}
                        className="min-w-0 break-words font-semibold underline-offset-2 hover:underline"
                      >
                        {level.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 break-words font-semibold">{level.name}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-subtle">—</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {fullRef && (
        <p className="mt-2.5 border-t border-hairline-strong pt-2 text-[11.5px] text-ink-subtle">
          Full ref <span className="font-black tabular-nums text-ink-muted">{fullRef}</span>
        </p>
      )}
    </section>
  );
}
