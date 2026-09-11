import * as React from "react";
import type { FunctionView } from "@/lib/org/functions";
import { FUNCTION_LABELS, FUNCTION_VIEWS } from "@/lib/org/functions";

/**
 * THE FUNCTION TOGGLE — All Employees / the eight business functions / Others,
 * once.
 *
 * A SEGMENTED CONTROL, not a dropdown: the options are mutually exclusive views
 * of one list, and the counts have to be readable without opening anything —
 * comparing Sales against Operations at a glance is most of why anyone looks at
 * this split at all. A closed dropdown reading "Function (All)" hides every
 * count behind a click.
 *
 * ── WHY IT LIVES HERE ────────────────────────────────────────────────────
 * There were two copies of the old App/Non-App version of this, in
 * aging-heatmap.tsx and performance-by-person-table.tsx, already drifting: one
 * `flex` and one `inline-flex`, `gap-1.5` against `gap-1`, count pills at
 * `px-1.5` and `px-2`. Meanwhile Status by Doer ran an entirely different bar,
 * so the same page asked "which team?" in two incompatible vocabularies. One
 * component, one answer.
 *
 * The labels, the order and the membership rule are NOT this component's to
 * decide: all three come from lib/org/functions.ts, so a section cannot
 * relabel or reorder a tab locally.
 *
 * ── EVERY TAB ALWAYS RENDERS, INCLUDING THE ZEROES ───────────────────────
 * Ten tabs is a wide bar and on a small roster most will read 0. They stay
 * anyway. A bar whose tabs appear and disappear as you type or filter is a bar
 * you cannot aim at — the target moves under the cursor — and an empty tab is
 * legible as a fact about the org ("nobody in Marketing is overdue") rather
 * than as a missing control. Zero counts are dimmed, not hidden, so the eye
 * skips them without the bar changing shape.
 *
 * ── NO `dark:` VARIANTS ──────────────────────────────────────────────────
 * The rule section-chrome.tsx states for DASHBOARD_CARD, which is the card this
 * bar sits inside: no dark theme is registered anywhere in the app, so Tailwind
 * compiles `dark:` to a bare @media (prefers-color-scheme: dark) keyed on the
 * reader's OS while the card underneath stays unconditionally white.
 * `dark:bg-slate-800/80` would paint a near-black bar onto a white card for
 * anyone browsing in dark mode.
 */
export function FunctionToggle({
  view,
  onChange,
  counts,
  className = "",
}: {
  view: FunctionView;
  onChange: (v: FunctionView) => void;
  counts: Record<FunctionView, number>;
  /** Spacing to the content below — sections differ on whether they need it. */
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Which function to show"
      /* `inline-flex`, NOT `flex`. A flex container is block-level, so the grey
         pill stretched the full width of the card and read as a toolbar band
         rather than a segmented control.

         `flex-wrap` + `max-w-full` are the floor: inline-flex still cannot
         exceed its container, and without wrapping ten pills would be clipped
         on a narrow screen instead of dropping to a second line. */
      className={`inline-flex w-auto max-w-full flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-bold ${className}`}
    >
      {FUNCTION_VIEWS.map((id) => {
        const active = view === id;
        const count = counts[id] ?? 0;
        const empty = count === 0 && !active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 ${
              active
                ? "bg-white text-slate-900 shadow-sm transition-all"
                : empty
                  ? "text-slate-400 transition-colors hover:text-slate-700"
                  : "text-slate-500 transition-colors hover:text-slate-900"
            }`}
          >
            {FUNCTION_LABELS[id]}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                active
                  ? "bg-slate-100 text-slate-700"
                  : empty
                    ? "bg-slate-200/60 text-slate-400"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
