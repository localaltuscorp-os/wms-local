"use client";

import * as React from "react";
import { ChevronUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { DEFAULT_DEBOUNCE_MS, useDebouncedCallback } from "@/lib/client/use-debounced";
import {
  DashboardSectionHeader,
  type DashboardSectionHeaderProps,
} from "./section-header";

/**
 * Shared chrome for the analytics dashboard's panels — ONE collapse control and
 * ONE pager, so every section folds and pages identically.
 *
 * Deliberately two small primitives rather than a wrapper component: the panels
 * have very different headers (icon + title + subtitle + their own controls),
 * and a one-size wrapper would have meant rewriting all of them. These drop
 * into the headers that already exist.
 */

/* ───────────────────────── Collapse / expand ───────────────────────── */

/**
 * Maximize ⇄ Minimize toggle. Pair with <CollapsibleBody> and drive both from
 * the same boolean.
 *
 * ICON-ONLY, following the window-chrome convention rather than words: when the
 * section is open the button shows the OVERLAPPING double square ("restore
 * down"), and when it is folded it shows a single square ("maximize"). That
 * reads instantly at the corner of a header, where a 9-character "MINIMIZE"
 * pill competed with the section title for attention. The meaning is still
 * carried for assistive tech by aria-expanded + aria-label.
 */
export function CollapseToggle({
  expanded,
  onToggle,
  label,
  tone = "var(--color-altus-red)",
}: {
  expanded: boolean;
  onToggle: () => void;
  /** Section name, used to build the accessible label ("Expand Task summary"). */
  label: string;
  tone?: string;
}) {
  // CHEVRON, not the Minimize2/Maximize2 window-chrome pair this used to show.
  // Those icons say "resize" — they are what a fullscreen control looks like —
  // so a button that actually folds the section away read as one that would
  // blow it up. A chevron points at what happens: up folds it, down unfolds it.
  //
  // One <ChevronUp> that rotates, rather than swapping two icon components:
  // swapping remounts the SVG and kills the transition, so the flip would be
  // instant while the body animated.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      title={expanded ? "Collapse" : "Expand"}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
    >
      <ChevronUp
        size={15}
        strokeWidth={2.6}
        aria-hidden
        className={`transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
          expanded ? "" : "rotate-180"
        }`}
      />
    </button>
  );
}

/**
 * Smoothly-animating collapse container. Uses the `grid-template-rows: 0fr → 1fr`
 * technique (the same one the KPI detail panel already uses) rather than
 * animating `height`, because it transitions to the content's NATURAL height
 * with no measurement and no layout thrash.
 *
 * `aria-hidden` + `inert` while collapsed so screen readers and Tab skip the
 * folded content instead of landing on invisible controls.
 */
export function CollapsibleBody({
  expanded,
  children,
  className = "",
}: {
  expanded: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
    >
      <div
        className={`overflow-hidden ${className}`}
        aria-hidden={!expanded}
        // `inert` keeps collapsed content out of the tab order. Cast because the
        // React types in this version don't yet expose it.
        {...(!expanded ? ({ inert: "" } as Record<string, string>) : {})}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Header + collapsible card, wired together.
 *
 * Every section had its own masthead and only two of the nine could fold. This
 * pairs `DashboardSectionHeader` with `CollapsibleBody` and owns the one
 * boolean between them, so adding the control to a widget is a wrapper rather
 * than a fresh piece of state per file — and the toggle always lands in the
 * same place, to the right of whatever pager that section already had.
 *
 * The header stays OUTSIDE the collapsible body on purpose: folding a section
 * must leave its title on screen, or the page becomes a column of anonymous
 * strips with no way to tell what you are re-opening.
 */
/**
 * THE ONE RECIPE FOR A SECTION TOOLBAR CONTROL.
 *
 * Nine sections had each grown their own: h-8 here and h-9 there, text-xs
 * against text-[12.5px] and text-[13px], font-medium against font-bold, some
 * bordered and some not. Side by side in one header they read as unrelated
 * widgets rather than a control group, and a reader's eye had to re-find the
 * same button at a different size on every card down the page.
 *
 * h-8 to match SectionSearchBox, which is the one control every toolbar has.
 * Anything that toggles or selects wears this; the search box and the pager
 * carry their own shapes because they are not buttons.
 */
export const SECTION_CONTROL =
  "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50";

export function CollapsibleSection({
  children,
  defaultExpanded = true,
  actions,
  label,
  bodyClassName,
  ...header
}: Omit<DashboardSectionHeaderProps, "actions"> & {
  children: React.ReactNode;
  /** Start folded. Defaults to open. */
  defaultExpanded?: boolean;
  /** Section-owned controls (pagers, window toggles) — placed LEFT of the
   *  minimize button so the fold control is always the rightmost thing. */
  actions?: React.ReactNode;
  /** Accessible name for the toggle, e.g. "the Aging heatmap". */
  label: string;
  bodyClassName?: string;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  return (
    <>
      <DashboardSectionHeader
        {...header}
        actions={
          <>
            {actions}
            <CollapseToggle
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              label={label}
            />
          </>
        }
      />
      <CollapsibleBody expanded={expanded} className={bodyClassName}>
        {children}
      </CollapsibleBody>
    </>
  );
}

/* ───────────────────────────── Pagination ──────────────────────────── */

/** Up to 5 numbered buttons around the current page, with ellipses at the ends. */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, Math.min(current - 1, total - 3));
  const to = Math.min(total - 1, Math.max(current + 1, 4));
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}

/**
 * Top-right pager shared by every paginated dashboard section: ‹ Prev · 1 2 3 ·
 * Next ›, with a "5–8 of 23" readout. Renders nothing on a single page, so a
 * short list stays clean.
 */
export function SectionPagination({
  page,
  pageCount,
  onPage,
  label,
}: {
  /** 1-based. */
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  /** Section name for the nav's accessible label. */
  label: string;
}) {
  // `total` and `pageSize` used to be props. They existed ONLY to print the
  // "1–8 of 14" range; the pills themselves are built from `pageCount`. With
  // the range gone they were two required arguments every caller had to compute
  // and pass for nothing, so they go too rather than linger as dead surface.
  if (pageCount <= 1) return null;
  const btn =
    "inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-1.5 text-[12px] font-bold tabular-nums transition-colors disabled:opacity-35 disabled:cursor-not-allowed";

  return (
    <nav className="flex items-center gap-1.5 shrink-0" aria-label={`${label} pages`}>
      {/* THE "1–8 of 14" READOUT IS GONE, everywhere, not behind a prop.
          It was added back when the pager stood alone in a header; those
          headers now also carry two dispatch buttons, a search box and a
          transpose toggle, and the range is the least useful number in that
          row — the page pills already say where you are. `showTotal` existed
          for exactly one caller and is retired with it rather than left as a
          switch nobody will ever flip back. */}
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={`${btn} border-hairline bg-surface-card text-ink-strong enabled:hover:border-altus-red enabled:hover:text-altus-red`}
      >
        <ChevronLeft size={14} strokeWidth={2.6} />
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} aria-hidden className="px-0.5 text-[12px] font-bold text-ink-subtle">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${btn} ${
              p === page
                ? "border-transparent text-white"
                : "border-hairline bg-surface-card text-ink-strong hover:border-altus-red hover:text-altus-red"
            }`}
            style={
              p === page
                ? {
                    background:
                      "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    boxShadow: "0 4px 10px -4px rgba(225,6,0,0.5)",
                  }
                : undefined
            }
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
        aria-label="Next page"
        className={`${btn} border-hairline bg-surface-card text-ink-strong enabled:hover:border-altus-red enabled:hover:text-altus-red`}
      >
        <ChevronRight size={14} strokeWidth={2.6} />
      </button>
    </nav>
  );
}

/**
 * Page state over a list. Clamps when the list shrinks (a search or filter can
 * drop the row count below the current page) so you never land on a blank page.
 */
export function usePagedRows<T>(rows: T[], pageSize: number) {
  const [page, setPage] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  React.useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(rows.length / pageSize))));
  }, [rows.length, pageSize]);

  const visible = React.useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return { page, setPage, pageCount, visible, total: rows.length, pageSize };
}

/**
 * THE dashboard section card. One definition, because the six sections had
 * grown six different shells — `rounded-xl px-4 py-3`, `rounded-section` with
 * no padding at all, `rounded-2xl p-6` — and that divergence is what reads as
 * erratic when they are stacked.
 *
 * NO `dark:` variants. This app has no dark theme: there is not one real
 * `dark:` class anywhere in components/, and no dark variant is configured in
 * globals.css. Tailwind's default `dark:` is `@media (prefers-color-scheme:
 * dark)`, so `dark:bg-slate-900` here would paint these cards near-black for
 * anyone whose OS is in dark mode while every heading, label and number inside
 * them stayed dark — unreadable, not dark mode. Dark mode is worth doing, but
 * as its own pass across the token layer, not one card at a time.
 */
/**
 * ONE token, so "universal" is structural rather than a convention everyone has
 * to remember. Every dashboard section container reads this, which is why a
 * single edit here reframes Top Performers, Overdue by Person, Sent-back Work,
 * the Aging Heatmap, Status by Doer and the Delegation scorecards together —
 * and why none of them can drift out of the set later.
 *
 * The slate hairline is now a brand-red one at 20%, with a soft red ambient
 * glow. `border` supplies the width and style; `.dashboard-card-edge`
 * (app/globals.css) supplies the colour and the shadow, and carries the note on
 * why those two live in CSS rather than in Tailwind arbitrary values.
 *
 * `shadow-xs` is gone — it was a neutral drop shadow, and stacking it under the
 * red glow would have muddied the colour it exists to suggest.
 */
export const DASHBOARD_CARD =
  "bg-white border rounded-2xl dashboard-card-edge";

/** The card with its standard internal padding. Tables that need to bleed to
 *  the scroll edge use DASHBOARD_CARD and pad their own wrapper instead. */
export const DASHBOARD_CARD_PADDED = `${DASHBOARD_CARD} p-6 md:p-8`;

/**
 * THE COLUMN-HEADING RECIPE — type only, no padding.
 *
 * Every dashboard table already shouted its headings in caps; what they did not
 * agree on was everything else. Five tables carried five recipes — `font-black`
 * here, `font-bold` there, `tracking-wide` against `tracking-wider`,
 * `text-slate-900` against `text-slate-800` against `text-gray-500`. Stacked
 * down one page that reads as five tables from five apps, and the faintest of
 * them (gray-500 at font-bold) looked like a disabled control rather than a
 * heading.
 *
 * TYPE ONLY, DELIBERATELY. Padding stays at each call site: the tables genuinely
 * differ in density (a twelve-column status grid cannot carry the same px-4 as a
 * four-column list), and folding padding in here would have quietly re-laid-out
 * every one of them. Callers compose `${DASHBOARD_TABLE_HEAD}` with their own
 * spacing, and their column widths, hover states and sort arrows are untouched.
 *
 * NO `dark:` VARIANT. The header bands these sit on are painted a fixed light
 * colour (#f9fafb, or DASHBOARD_CARD's unconditional white) and this app
 * registers no dark theme, so `dark:text-slate-100` compiles to a bare
 * prefers-color-scheme rule that would paint near-white heading text onto a
 * white header for every reader whose OS is dark — the exact opposite of the
 * contrast this recipe exists to give. The note above HEAD_MAIN in
 * components/dashboard/exec/workload-cell.tsx records the same finding.
 */
export const DASHBOARD_TABLE_HEAD =
  "text-xs font-extrabold uppercase tracking-wider text-slate-900 md:text-sm";

/** Gap between a section's title bar and its content grid. */
export const SECTION_HEADER_GAP = "mb-6";

/* MOVED HERE FROM status-table.tsx, where it was private. Overdue-by-person
   needs the same control, and a second copy is how two search boxes on one
   page end up with different widths, debounces and clear behaviour. */
/**
 * The table's own search box. Extracted from the old FilterBar so it can sit in
 * the section header beside the pager; the debounce behaviour is unchanged.
 *
 * h-9 matches the Department trigger and the pager buttons next to it — the
 * three controls have to agree on height or the header row reads as ragged.
 */
export function SectionSearchBox({
  query,
  onQuery,
  placeholder = "Search employees",
}: {
  query: string;
  onQuery: (v: string) => void;
  /** Overridable so each section names what it actually filters. */
  placeholder?: string;
}) {
  // Live text is local; the parent (which re-filters the rows and rebuilds the
  // TanStack row model) hears about it on a 300ms debounce. `query` is still
  // the committed value, so it doubles as the external reset signal.
  const [text, setText] = React.useState(query);
  const commit = useDebouncedCallback(onQuery, DEFAULT_DEBOUNCE_MS);
  const lastSent = React.useRef(query);
  React.useEffect(() => {
    if (query !== lastSent.current) {
      lastSent.current = query;
      commit.cancel();
      setText(query);
    }
  }, [query, commit]);

  function type(next: string) {
    setText(next);
    lastSent.current = next;
    commit(next);
  }
  function clearNow() {
    setText("");
    lastSent.current = "";
    commit.flush("");
  }

  return (
    <div
      /* h-8 and w-36, widening to w-48 while it has focus — a header now
         carrying two dispatch buttons, a pager and a transpose toggle cannot
         also give a permanent 220px to a box that is empty most of the time.

         `focus-within`, NOT `focus`. The focus lands on the <input>; this is
         the container around it, and a bare `focus:w-48` here would never fire
         — the box would simply never widen and the bug would look like a
         missing transition rather than a wrong variant. */
      className="relative flex h-8 w-36 shrink-0 items-center rounded-lg border border-slate-200 bg-white pl-2.5 pr-1.5 transition-all duration-200 focus-within:w-48 focus-within:border-hairline-strong max-md:w-full"
      style={{
        boxShadow: text
          ? "0 0 0 3px color-mix(in srgb, var(--color-altus-red) 12%, transparent), 0 1px 2px rgba(15,23,42,0.04)"
          : "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <Search className="size-3.5 shrink-0 text-ink-subtle" />
      <input
        type="text"
        value={text}
        onChange={(e) => type(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && text) clearNow();
        }}
        placeholder={placeholder}
        title="Local search - filters only the list on this page"
        aria-label={`${placeholder} - filters only this section`}
        className="min-w-0 flex-1 border-0 bg-transparent px-2 text-xs text-ink outline-none placeholder:text-slate-400"
      />
      {text && (
        <button
          type="button"
          onClick={clearNow}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
