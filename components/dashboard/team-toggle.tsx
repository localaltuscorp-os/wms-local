import * as React from "react";
import type { TeamView } from "@/lib/teams/app-team";
import { TEAM_VIEW_LABELS } from "@/lib/teams/app-team";

/**
 * THE TEAM TOGGLE — All Employees / App Team / Non-App Team, once.
 *
 * A SEGMENTED CONTROL, not two checkboxes or a dropdown: the three options are
 * mutually exclusive views of one list, and the counts have to be readable
 * without opening anything — comparing 9 against 9 is most of why anyone looks
 * at this split at all. A closed dropdown reading "Team (All)" hides all three
 * counts behind a click.
 *
 * ── WHY IT LIVES HERE ────────────────────────────────────────────────────
 * There were two copies of this, in aging-heatmap.tsx and
 * performance-by-person-table.tsx, already drifting: one `flex` and one
 * `inline-flex`, `gap-1.5` against `gap-1`, count pills at `px-1.5` and
 * `px-2`. Meanwhile Status by Doer ran an entirely different bar — six
 * department buckets — so the same page asked "which team?" in two
 * incompatible vocabularies, and "App Team" meant one thing in one section and
 * something else two sections down. One component, one answer.
 *
 * The labels and the membership rule are NOT this component's to decide: both
 * come from lib/teams/app-team.ts, so a section cannot relabel or redefine a
 * tab locally.
 *
 * ── NO `dark:` VARIANTS ──────────────────────────────────────────────────
 * The rule section-chrome.tsx states for DASHBOARD_CARD, which is the card
 * this bar sits inside: no dark theme is registered anywhere in the app, so
 * Tailwind compiles `dark:` to a bare @media (prefers-color-scheme: dark)
 * keyed on the reader's OS while the card underneath stays unconditionally
 * white. `dark:bg-slate-800/80` would paint a near-black bar onto a white card
 * for anyone browsing in dark mode.
 */
export function TeamToggle({
  view,
  onChange,
  counts,
  className = "",
}: {
  view: TeamView;
  onChange: (v: TeamView) => void;
  counts: { all: number; app: number; nonApp: number };
  /** Spacing to the content below — sections differ on whether they need it. */
  className?: string;
}) {
  const tabs: { id: TeamView; label: string; count: number }[] = [
    { id: "all", label: TEAM_VIEW_LABELS.all, count: counts.all },
    { id: "app", label: TEAM_VIEW_LABELS.app, count: counts.app },
    { id: "nonApp", label: TEAM_VIEW_LABELS.nonApp, count: counts.nonApp },
  ];
  return (
    <div
      role="tablist"
      aria-label="Which team to show"
      /* `inline-flex`, NOT `flex`. A flex container is block-level, so the grey
         pill stretched the full width of the card and read as a toolbar band
         rather than a segmented control.

         `flex-wrap` + `max-w-full` are the floor: inline-flex still cannot
         exceed its container, and without wrapping the pills would be clipped
         on a narrow phone instead of dropping to a second line. */
      className={`inline-flex w-auto max-w-full flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold ${className}`}
    >
      {tabs.map((t) => {
        const active = view === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 ${
              active
                ? "bg-white text-slate-900 shadow-sm transition-all"
                : "text-slate-500 transition-colors hover:text-slate-900"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                active ? "bg-slate-100 text-slate-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
