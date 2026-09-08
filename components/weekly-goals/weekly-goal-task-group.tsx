"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { WeeklyGoalBadge } from "@/components/weekly-goals/weekly-goal-badge";
import { CollapseToggle, CollapsibleBody } from "@/components/dashboard/section-chrome";
import { HoverTip } from "@/components/ui/hover-tip";

/**
 * Pinned "This week's goals" group, surfaced ABOVE the regular task table on
 * the Tasks list and My Day (design §10). Each row is a read-only projection of
 * a weekly goal — badged "Weekly Goal", visually distinct (Altus accent), and a
 * deep link into the Weekly Goals workspace (the single edit/review surface).
 *
 * These rows are NEVER counted in the task stat cards / dashboard KPIs — they
 * are a display-only overlay, kept entirely separate from `TaskListRow`.
 */

const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

function pctTone(pct: number): string {
  if (pct >= 100) return "green";
  if (pct >= 50) return "blue";
  if (pct > 0) return "amber";
  return "slate";
}

export function WeeklyGoalTaskGroup({
  goals,
  /** When true (admin "all" scope), show each row's doer name. */
  showDoer = false,
  className = "",
  inset = "px-4 max-md:px-3",
}: {
  goals: VirtualTaskRow[];
  showDoer?: boolean;
  className?: string;
  /**
   * Left/right inset for the header and every row, so this block's content can
   * line up with whatever it is stacked under.
   *
   * The default is the Tasks-list value. The DASHBOARD stacks it directly above
   * the section headers, which inset their content by `px-6 md:px-8` to match
   * the cards below them — at 16px this banner's title and its "Open Weekly
   * Goals" link sat 16px outside that column on both sides, the one block on
   * the page with its own left and right edge. The dashboard passes the
   * section inset; nothing else has to care.
   */
  inset?: string;
}) {
  /* FOLDS, like every section on the dashboard it now sits above.
     This block pins itself to the top of the Tasks list, My Day and the WMS
     dashboard, and on the dashboard it was the one thing up there that could
     not be got out of the way — every section below it carries a chevron. Open
     by default: it is a pinned reminder, and one that starts folded is a
     reminder nobody sees. */
  const [open, setOpen] = React.useState(true);

  // AFTER the hook, never before. An early `return null` above a useState is a
  // conditional hook call, and this component genuinely renders nothing when a
  // week has no goals.
  if (goals.length === 0) return null;

  return (
    <section
      className={`rounded-section overflow-hidden ${className}`}
      style={{
        border:
          "1px solid color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red) 4%, white), var(--color-surface-card))",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      }}
    >
      <header className={`flex items-center justify-between gap-3 py-3 ${inset}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <WeeklyGoalBadge />
          <h2
            className="font-bold text-ink-strong truncate"
            style={{ fontSize: 16 }}
          >
            This Week&apos;s Goals
          </h2>
          <span
            className="shrink-0 tabular-nums font-bold rounded-pill px-2 py-0.5"
            style={{
              fontSize: 12.5,
              background:
                "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red-deep)",
            }}
          >
            {goals.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href={"/goals/weekly" as Route}
            className="shrink-0 inline-flex items-center gap-1 font-semibold text-altus-red-deep hover:underline"
            style={{ fontSize: 13.5 }}
          >
            Open Weekly Goals
            <ArrowUpRight size={15} strokeWidth={2.4} />
          </Link>
          {/* The SHARED toggle, not a local one — same 32px chevron button, same
              rotate animation and same aria-expanded wording as the dashboard
              sections below this block, so the two fold controls on one screen
              are visibly the same control. */}
          <CollapseToggle
            expanded={open}
            onToggle={() => setOpen((v) => !v)}
            label="this week's goals"
          />
        </div>
      </header>

      <CollapsibleBody expanded={open}>
      <ul className="divide-y divide-hairline border-t border-hairline">
        {goals.map((g) => {
          const prioTone = PRIORITY_TONE[g.priority] ?? "slate";
          const tone = pctTone(g.pct);
          const meta = [
            g.client?.trim(),
            g.subject?.trim(),
            showDoer ? g.doerName?.trim() : null,
          ].filter((p): p is string => !!p);
          /* The whole row as ONE string, for the hover tooltip. Built from the
             same two pieces the line renders, so what the tooltip shows can
             never be a different sentence from what was truncated. */
          const full = meta.length > 0 ? `${g.title} — ${meta.join(" · ")}` : g.title;
          return (
            <li key={g.id}>
              <Link
                href={g.href as Route}
                className={`group flex items-center gap-3 py-3 ${inset} transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_5%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40`}
              >
                {/* Priority accent rail */}
                <span
                  aria-hidden
                  className="shrink-0 self-stretch rounded-full"
                  style={{
                    width: 4,
                    // A 4px rail is the thinnest thing on the row; at pastel
                    // it read as a rendering artefact rather than a priority.
                    background: `var(--color-${prioTone}-deep)`,
                  }}
                />
                {/* ONE LINE — title, an em dash, then the meta, truncated.
                    It was two stacked lines, which cost this block ~18px of
                    vertical space per goal at the very top of the page, above
                    everything the page is actually for. On one line the meta is
                    still there for anyone scanning and the block is a third
                    shorter.

                    The FULL text is one hover away (and one focus away, which
                    the native `title` attribute cannot do) — HoverTip is the
                    same white portal bubble the section headings use, so it
                    wraps properly instead of clipping and is never cut off by
                    the scrolling row it sits in. */}
                <HoverTip text={full} className="block min-w-0 flex-1">
                  <span
                    className="block truncate transition-colors"
                    style={{ fontSize: 15 }}
                  >
                    <span className="font-semibold text-ink-strong group-hover:text-altus-red-deep">
                      {g.title}
                    </span>
                    {meta.length > 0 && (
                      /* The em dash carries its own spaces and is NOT part of
                         the truncation decision — putting it inside the meta
                         span would let a very narrow row clip mid-dash and
                         leave the title looking like it ends in a hyphen. */
                      <span className="text-ink-soft" style={{ fontSize: 13.5 }}>
                        {" — "}
                        {meta.join(" · ")}
                      </span>
                    )}
                  </span>
                </HoverTip>

                <span
                  className="shrink-0 hidden sm:inline-flex items-center rounded-pill px-2.5 py-1 font-bold whitespace-nowrap"
                  style={{
                    fontSize: 12,
                    color: `var(--color-${prioTone}-deep)`,
                    background: `color-mix(in srgb, var(--color-${prioTone}) 14%, transparent)`,
                  }}
                >
                  {PRIORITY_LABELS[g.priority]}
                </span>

                {/* Effective % */}
                <span
                  className="shrink-0 inline-flex items-center gap-2"
                  title={`${g.pct}% complete`}
                >
                  <span
                    aria-hidden
                    className="hidden sm:block rounded-full overflow-hidden"
                    style={{
                      width: 56,
                      height: 6,
                      background: "var(--color-hairline)",
                    }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, g.pct))}%`,
                        // The fill has to out-contrast its own track
                        // (--color-hairline), which pastel barely did.
                        background: `var(--color-${tone}-deep)`,
                      }}
                    />
                  </span>
                  <span
                    className="tabular-nums font-bold text-right"
                    style={{
                      fontSize: 13.5,
                      width: 38,
                      color: `var(--color-${tone}-deep)`,
                    }}
                  >
                    {g.pct}%
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      </CollapsibleBody>
    </section>
  );
}
