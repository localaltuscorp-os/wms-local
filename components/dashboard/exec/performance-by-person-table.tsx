"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Users,
  ArrowLeftRight,
  ChevronsUpDown,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { useReducedMotion } from "@/lib/motion-utils";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";
import {
  SectionSearchBox,
  CollapsibleSection,
  DASHBOARD_CARD_PADDED,
  SECTION_CONTROL,
  DASHBOARD_TABLE_HEAD,
} from "@/components/dashboard/section-chrome";
import type { PunctualityPerson } from "@/lib/types";
import { inFunctionView, FUNCTION_LABELS, FUNCTION_VIEWS, type FunctionView } from "@/lib/org/functions";
import { FunctionToggle } from "@/components/dashboard/function-toggle";
import Link from "next/link";
import type { Route } from "next";
import { formatDate } from "@/lib/format";
import {
  useLateSpreadPreview,
  LATE_BRACKETS,
  type LateBracketKey,
} from "@/components/dashboard/exec/late-spread-preview";

/** The opening batch, and the step each "Load More" adds. 8 keeps the card
 *  about as tall as the heatmap beside it before anyone expands it. */
const BATCH = 8;

/* ────────────────────────────────────────────────────────────────────────
   PerformanceByPersonTable — V2 executive per-person delivery table.

   For every doer (busiest first): the Avatar character + name, their on-time
   rate as a bar + a `{late} late` count, and the late-spread broken into the
   1–3 / 4–7 / 8–14 / 15+ day buckets. Renders as a table on desktop and
   stacks to cards on mobile.

   Privacy: admins see all rows; a non-admin sees ONLY their own row
   (filtered to `meId`; null `meId` → none).

   Brand discipline (altus-premium-ui): rate thresholds green ≥80 / amber ≥60
   / red (matches punctuality-card); cream-glass surface + aurora wash,
   --font-display numbers with tabular-nums, .wg-rise entrance, motion/react
   staggered bar springs (reduced-motion-gated), Avatar character per row.
   ──────────────────────────────────────────────────────────────────────── */

const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-red-deep)";

/** On-time rate colour: green ≥80, amber ≥60, red below (project convention). */
function rateColor(rate: number): string {
  if (rate >= 80) return GREEN;
  if (rate >= 60) return AMBER;
  return RED;
}

/** WORST-FIRST: 15+ leads, 1–3 trails, and the total Late count sits after
 *  them all. The eye lands on the most damaging bracket first instead of
 *  reading up to it.
 *
 *  This list is the SINGLE source of order — the header, the desktop cells,
 *  the mobile cards and the tooltip all map it. The desktop row used to
 *  hardcode its four cells ascending while the header mapped this array, so
 *  reversing the array alone would have put every number under the wrong
 *  heading. */
const SPREAD_COLS: {
  key: keyof PunctualityPerson["lateSpread"];
  label: string;
}[] = [
  { key: "d15", label: "15+" },
  { key: "d8_14", label: "8–14" },
  { key: "d4_7", label: "4–7" },
  { key: "d1_3", label: "1–3" },
];

/**
 * THE COLUMN SCHEMA — label, alignment, and the value each column sorts on,
 * in one list.
 *
 * SPREAD_COLS above is spread INTO this rather than duplicated: the header, the
 * desktop cells and the sort comparator all have to agree about which bracket
 * is which, and the comment on SPREAD_COLS already records what happened last
 * time two of those were maintained separately (numbers under the wrong
 * heading). A second hand-written list of the same four keys would be the same
 * bug waiting to happen, one file older.
 */
type SortKey = "person" | "rate" | keyof PunctualityPerson["lateSpread"] | "late";
type SortDir = "desc" | "asc";
type SortState = { key: SortKey; dir: SortDir } | null;

const SORT_COLS: {
  key: SortKey;
  label: string;
  center: boolean;
  /** What this column orders by. Strings compare by locale, numbers by value. */
  value: (p: PunctualityPerson) => number | string;
}[] = [
  { key: "person", label: "Person", center: false, value: (p) => p.employeeName.toLowerCase() },
  { key: "rate", label: "On-time rate", center: false, value: (p) => p.rate },
  ...SPREAD_COLS.map((c) => ({
    key: c.key as SortKey,
    label: c.label,
    center: true,
    value: (p: PunctualityPerson) => p.lateSpread[c.key],
  })),
  { key: "late", label: "Late", center: true, value: (p: PunctualityPerson) => p.late },
];

/**
 * One header cell: label, sort arrow, and the three-step cycle.
 *
 * DESC FIRST on every column, including Person. On a count column that is
 * plainly right — the reader is asking "who has the most" — and making the name
 * column cycle A-Z first purely because it is text would mean two columns
 * behaving differently under the same click. The arrow says which way it went.
 *
 * Every heading carries its indicator at all times — a slate-500 ⇅ until the
 * column is the one being sorted. That costs a little ink across seven columns
 * and buys the only thing that matters here: someone can tell the headings are
 * buttons without having to hover one first.
 *
 * ── NO `dark:` VARIANTS IN THIS COMPONENT ────────────────────────────────
 * Deliberate, and it is a correctness point rather than a style preference.
 * This app has no dark theme: no @custom-variant dark, no .dark class, no
 * colour-scheme declaration. Tailwind therefore compiles `dark:` to a bare
 * @media (prefers-color-scheme: dark) — confirmed in the built CSS — so those
 * rules key off the READER'S OS SETTING and nothing else.
 *
 * Meanwhile the card underneath is DASHBOARD_CARD's unconditional `bg-white`.
 * So `dark:text-slate-100` on this row did not adapt anything; it painted
 * #f1f5f9 text on a #ffffff card for every reader browsing in dark mode —
 * 1.07:1, which is why the headings read as blank. Adding `dark:text-white`
 * makes it 1.00:1. Until a real dark theme exists, light-on-white is the only
 * thing a dark: variant can produce here.
 */
function SortHeader({
  col,
  sort,
  onSort,
}: {
  col: (typeof SORT_COLS)[number];
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === col.key;
  const dir = active ? sort!.dir : null;
  return (
    <button
      type="button"
      onClick={() => onSort(col.key)}
      aria-label={
        active
          ? `${col.label}, sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to ${
              dir === "asc" ? "clear the sort" : "sort ascending"
            }.`
          : `Sort by ${col.label}, descending`
      }
      /* `whitespace-nowrap` and a `min-w` floor belong on the header itself,
         not only on the track: the track sets how much room the column HAS,
         this stops the label using it to break onto a second line if a future
         layout ever squeezes it. Belt and braces, cheap, and the failure it
         prevents ("8-" above "14") is one nobody reads as a bug in the CSS —
         they read it as a broken heading. */
      /* The row now sets the weight and the near-black colour, so the ACTIVE
         state can no longer be "bold + slate-900" — that was lighter than the
         font-extrabold it sits among, which made the sorted column look thinner
         than the six it outranks. Active goes heavier (font-black); inactive
         only shifts hue on hover, since it is already at full contrast. */
      className={`group/sort inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap transition-colors ${
        col.center ? "w-full min-w-[56px] justify-center text-center" : ""
      } ${active ? "font-black text-rose-700" : "hover:text-rose-700"}`}
    >
      {col.label}
      {/* THE SAME THREE-STATE INDICATOR STATUS BY DOER USES — dim ⇅ when
          inactive, a solid arrow when sorted. Lucide icons, not the 8px ▲/▼
          text glyph this had.

          The glyph was the real problem, and it was not that it was small: it
          was `opacity-0` until hover, so seven headings looked like seven
          labels. An affordance nobody can see before they hover is an
          affordance nobody discovers — the sorting has worked here all along
          and read as static text. */}
      {dir === "asc" ? (
        <ArrowUp size={13} strokeWidth={2.6} aria-hidden />
      ) : dir === "desc" ? (
        <ArrowDown size={13} strokeWidth={2.6} aria-hidden />
      ) : (
        <ChevronsUpDown
          size={13}
          strokeWidth={2.4}
          aria-hidden
          /* Muted by colour, at FULL opacity. opacity-45 on a 13px glyph is
             the difference between "this column is not the sorted one" and
             "there is no arrow here"; slate-500 reads as secondary without
             disappearing. */
          className="text-slate-500 transition-colors group-hover/sort:text-rose-700"
        />
      )}
    </button>
  );
}

export interface PerformanceByPersonTableProps {
  people: PunctualityPerson[];
  isAdmin: boolean;
  meId: string | null;
  resolveAvatar: (employeeId: string) => string | null;
}

export function PerformanceByPersonTable({
  people,
  isAdmin,
  meId,
  resolveAvatar,
}: PerformanceByPersonTableProps) {
  const reduce = useReducedMotion() ?? false;
  // null = the default burden rank. Third click on a column returns here.
  const [sort, setSort] = React.useState<SortState>(null);
  // Orientation. A rendering choice over rows already in hand — never refetches.
  const [isTransposed, setIsTransposed] = React.useState(false);
  // This section's OWN search, filtering the people in this table and nothing
  // else. Separate from the FilterBar's page-wide box on purpose: the answer to
  // "is this person behind?" is one row, and paging to find it is the slow way.
  const [query, setQuery] = React.useState("");
  // Which slice of the roster the table is showing. Same three views, same
  // control, same "all" default as the aging heatmap — a reader who learns the
  // split in one section does not relearn it in the other.
  const [functionView, setFunctionView] = React.useState<FunctionView>("all");
  // Lazy, once, shared by every spread cell in the table.
  const preview = useLateSpreadPreview();

  const cycleSort = React.useCallback((key: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }, []);

  // Privacy: admins all rows; non-admin only their own (null → none).
  const allScoped = isAdmin ? people : people.filter((p) => p.employeeId === meId);
  // Search narrows AFTER the privacy scope, never before — a non-admin must not
  // be able to type a colleague's name and see their row.
  const scoped = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allScoped;
    return allScoped.filter((p) => p.employeeName.toLowerCase().includes(q));
  }, [allScoped, query]);

  /* The function split, partitioned AFTER the privacy scope and the search so
     every tab honours exactly the filters the single list did — the same order
     the aging heatmap uses.

     inFunctionView is imported, not re-written here: it pattern-matches the
     department name rather than testing equality against one literal, because
     the names that actually exist include "App Devp" and "BSS App". A second
     copy of the predicate is how two sections start disagreeing about who is
     in which function while both look right. */
  const functionCounts = React.useMemo(
    () =>
      Object.fromEntries(
        FUNCTION_VIEWS.map((v) => [
          v,
          v === "all" ? scoped.length : scoped.filter((p) => inFunctionView(p.department, v)).length,
        ]),
      ) as Record<FunctionView, number>,
    [scoped],
  );
  const functionScoped = React.useMemo(
    () => (functionView === "all" ? scoped : scoped.filter((p) => inFunctionView(p.department, functionView))),
    [scoped, functionView],
  );
  // HEAVIEST OVERDUE BURDEN FIRST — this section is read as "who is behind",
  // so the count of late deliveries leads, not raw throughput. Ties break on the
  // worse on-time rate, then on volume, so of two people with 4 late each the
  // one who is late a larger share of the time surfaces first.
  const rows = React.useMemo(() => {
    const base = [...functionScoped].sort(
      (a, b) => b.late - a.late || a.rate - b.rate || b.done - a.done,
    );
    if (!sort) return base;
    const col = SORT_COLS.find((c) => c.key === sort.key);
    if (!col) return base;
    const dir = sort.dir === "desc" ? -1 : 1;
    // Sorting the ALREADY burden-ranked array, and Array.prototype.sort is
    // stable — so ties inside a chosen column keep the default ordering
    // underneath instead of landing in whatever order the input happened to be.
    return base.sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return cmp * dir;
    });
  }, [functionScoped, sort]);

  /* ── ONE GROWING SLICE, NOT PAGES ────────────────────────────────────────
     This replaces usePagedRows and the header's prev/next pager, and the
     replacement is the point rather than a side effect: two controls that can
     each decide which rows are on screen is two controls that can disagree,
     and a reader has no way to tell which one the table is obeying. A batch
     that only ever grows has no such second state to fall out of sync.

     THE SLICE APPLIES TO "All Employees" ONLY. A function tab is already a filter —
     it is the reader saying "just this side of the roster" — and answering that
     with a second, hidden limit means the honest answer to "how many Sales
     people are behind?" is a number you have to click to finish reading. All
     Employees is the only view long enough to need the cut. */
  const [visibleCount, setVisibleCount] = React.useState(BATCH);

  /* BACK TO THE FIRST BATCH whenever the list underneath changes identity.
     Re-sorting reshuffles who is in the top 8, so an expanded slice would carry
     "I have already seen these" over to rows the reader has not seen. Typing
     shrinks the list, and switching tabs replaces it outright — the tab reset
     is required, and sort and search need it for the same reason.

     Adjusted DURING RENDER rather than in an effect. This is React's own
     documented pattern for resetting state when an input changes: the effect
     version renders the stale slice first and the corrected one immediately
     after, which is the cascading render `react-hooks/set-state-in-effect`
     flags — and on a tab switch it is a visible flash of the previous function's
     rows. Here the discarded pass never reaches the DOM. */
  const listKey = `${functionView}|${query.trim()}|${sort ? `${sort.key}:${sort.dir}` : ""}`;
  const [seenListKey, setSeenListKey] = React.useState(listKey);
  if (listKey !== seenListKey) {
    setSeenListKey(listKey);
    setVisibleCount(BATCH);
  }

  const isAllFunctions = functionView === "all";
  const visible = React.useMemo(
    () => (isAllFunctions ? rows.slice(0, visibleCount) : rows),
    [rows, isAllFunctions, visibleCount],
  );
  /* `visible.length`, not `visibleCount`: the count is a ceiling that can sit
     above a list the search just shortened, and "Showing 16 of 11" is worse
     than no footer at all. */
  const hasMore = isAllFunctions && visible.length < rows.length;

  /* `rows`, not `people`: the search and the sort the reader applied are what
     this section is showing, and the export has to be that — not the roster it
     started from. The whole list goes in, not just the loaded batch: a reader
     sending "the overdue report" means the report, not sheet 2 of 4. */
  const buildReport = React.useCallback((): SectionReport => {
    return {
      title: "Overdue Tasks by Person",
      subtitle: "On-time rate and late spread · heaviest overdue burden first",
      /* The tab goes in the meta line for the same reason the search term
         does: the export is the filtered list, and a sheet of Sales-only rows
         headed only "Overdue Tasks by Person" reads as the whole roster. */
      meta: [
        ...(query.trim() ? [{ label: "Search", value: query.trim() }] : []),
        ...(functionView === "all"
          ? []
          : [{ label: "Function", value: FUNCTION_LABELS[functionView] }]),
      ],
      summary: `${rows.length} ${rows.length === 1 ? "person" : "people"}`,
      columns: [
        { label: "Person", weight: 3, align: "left" },
        { label: "On-time rate", weight: 1.4, align: "right" },
        // `tone: "count"` — the age buckets read crimson when they are
        // carrying something and quiet at zero, matching the web view's own
        // emphasis rather than printing every figure at the same weight.
        ...SPREAD_COLS.map((c) => ({
          label: `${c.label} late`,
          weight: 1,
          align: "right" as const,
          tone: "count" as const,
        })),
        { label: "Late", weight: 1, align: "right", tone: "count" as const },
      ],
      rows: rows.map((p) => [
        p.employeeName,
        p.done > 0 ? `${Math.round((p.onTime / p.done) * 100)}%` : "-",
        ...SPREAD_COLS.map((c) => String(p.lateSpread[c.key])),
        String(p.late),
      ]),
    };
  }, [rows, query, functionView]);
  // Header ABOVE the card — see components/dashboard/section-header.tsx. The
  // pager rides along in the actions slot because its page state lives here,
  // with the rows it pages; the fold control sits to its right.
  return (
    <CollapsibleSection
      label="Overdue tasks by person"
      icon={<SectionIcon icon={Users} tone="red" />}
      title="Overdue Tasks by Person"
      subtitle="On-time rate & late spread · heaviest overdue burden first"
      /* TOOLBAR ORDER: search · transpose · collapse.
      
         Narrow the set, then change its shape, then put it away — each control
         acting on the result of the one before it. CollapsibleSection always
         appends the collapse toggle after whatever a section passes here, so
         the minimize button stays rightmost on every section of the dashboard
         without this needing to say so.

         THE PAGER HAS LEFT THIS ROW. Moving through the list is now the footer's
         "Load More", which sits at the end of the rows it extends — where a
         reader arrives at the moment they want it, rather than back up at the
         header they scrolled past. Its counter carries the "8 of 14" readout
         the pager used to, so nothing was lost in the move. */
      actions={
        <>
          {/* `rows`, not `people` — the dispatch list is what this section is
              currently SHOWING, so "select all" means the filtered set the
              reader is looking at rather than the whole roster. */}
          <SectionDispatch report={buildReport} />
          <SectionSearchBox
            query={query}
            onQuery={setQuery}
            placeholder="Search person..."
          />
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setIsTransposed((v) => !v)}
              aria-pressed={isTransposed}
              title={isTransposed ? "Back to people as rows" : "Transpose: metrics as rows"}
              className={`${SECTION_CONTROL} ${isTransposed ? "text-altus-red" : ""}`}
            >
              <ArrowLeftRight className="size-3.5" strokeWidth={2.6} aria-hidden />
              Transpose
            </button>
          )}
        </>
      }
    >
    {/* THE SHARED CARD. This was the dashboard's one remaining bespoke shell:
        a 155deg gradient ground, a red-tinted 54px drop shadow, an 8px backdrop
        blur and two aurora spans, on `rounded-section p-7`. Stacked between the
        flat white cards above and below it, it read as a different surface
        rather than a peer — which is the whole reason the section stack looked
        uneven. The aurora spans and the two --kpi-tone vars that fed them go
        with it; nothing else referenced them. */}
    <section
      className={`wg-rise relative overflow-hidden ${DASHBOARD_CARD_PADDED}`}
      aria-label="Overdue tasks by person"
    >
      <div className="relative">
        {/* THE TEAM TABS, directly under the section sub-header and above
            everything the card shows.

            Gated on `allScoped`, not `rows`: the whole point of a segmented
            control is that an empty view is still one you can leave. Keyed on
            the privacy-scoped roster so a non-admin — who only ever sees their
            own row — is not shown a function switcher that can do nothing. */}
        {allScoped.length > 0 && (
          <div className="mb-4 border-b border-slate-100 pb-4">
            <FunctionToggle
              view={functionView}
              onChange={setFunctionView}
              counts={functionCounts}
            />
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-ink-subtle">
            {functionView === "all"
              ? "No delivered tasks to break down in this range."
              : `Nobody in ${FUNCTION_LABELS[functionView]} has delivered tasks to break down in this range.`}
          </p>
        ) : (
          <>
            {/* ── Transposed: metrics down, people across ── */}
            {isTransposed && (
              <TransposedPerformance
                people={visible}
                resolveAvatar={resolveAvatar}
              />
            )}

            {/* ── Desktop table ── */}
            <div className={isTransposed ? "hidden" : "max-md:hidden"}>
              <div
                /* No `dark:` variant on purpose — see SortHeader. The card
                   under this row is always white, so a light-text rule keyed on
                   the OS preference is exactly how these headings became
                   invisible. */
                className={`grid items-center gap-3 px-3 py-3 ${DASHBOARD_TABLE_HEAD}`}
                style={{ gridTemplateColumns: COLS }}
              >
                {SORT_COLS.map((c) => (
                  <SortHeader key={c.key} col={c} sort={sort} onSort={cycleSort} />
                ))}
              </div>
              {/* 520px, not unbounded: the whole roster is reachable by
                  scrolling without the card growing down the page. */}
              {/* space-y-4 rhythm, matching the other card interiors. No
                  max-height and no inner scroller: the page size bounds the
                  card now, so the rows scroll with the page like everything
                  else instead of trapping a second scrollbar inside a card. */}
              <ul className="flex flex-col gap-4">
                <AnimatePresence initial={false}>
                  {visible.map((p, i) => (
                    <PersonTableRow
                      preview={preview}
                      key={p.employeeId}
                      person={p}
                      avatarUrl={resolveAvatar(p.employeeId)}
                      index={i}
                      reduce={reduce}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            {/* ── Mobile cards ── */}
            <ul className={`flex flex-col gap-4 ${isTransposed ? "hidden" : "md:hidden"}`}>
              <AnimatePresence initial={false}>
                {visible.map((p, i) => (
                  <PersonCard
                    key={p.employeeId}
                    person={p}
                    avatarUrl={resolveAvatar(p.employeeId)}
                    index={i}
                    reduce={reduce}
                  />
                ))}
              </AnimatePresence>
            </ul>

            {/* ── The footer: counter + Load More ──
                Outside both lists rather than once per breakpoint, so the
                desktop table, the mobile cards and the transposed view all
                extend from the same control and cannot disagree about how much
                of the roster is on screen.

                It renders only while there is genuinely more to show, so it
                disappears on the last batch instead of sitting there inert —
                and never appears at all on a function tab, which shows everyone it
                matched the moment it is clicked. */}
            {hasMore && (
              <div className="mt-5 flex items-center justify-center gap-3 border-t border-slate-100 pt-4">
                <span className="text-xs font-bold tabular-nums text-slate-500">
                  Showing {visible.length} of {rows.length}
                </span>
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + BATCH)}
                  aria-label={`Load ${Math.min(BATCH, rows.length - visible.length)} more of ${rows.length} people`}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-800 shadow-sm transition-all hover:bg-slate-200"
                >
                  Load More
                  <ChevronDown className="size-3.5" strokeWidth={2.6} aria-hidden />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
    </CollapsibleSection>
  );
}


/**
 * TRANSPOSED — metrics down the side, people across the top.
 *
 * Reads the SAME people the standard view is showing (the current page), so
 * the pager still governs how many columns appear and the two orientations can
 * never disagree about a number.
 *
 * The metric column is frozen with `sticky left-0`: with a column per person
 * the grid scrolls sideways, and a row label that scrolls out of view leaves a
 * line of bare numbers meaning nothing. `kanban-scroll` is the project's
 * existing thin-scrollbar class (globals.css) — reused rather than inventing a
 * second one. The scroll box sits INSIDE the card's padding with its own
 * radius, so a sideways scroll never runs under the card's border.
 */
function TransposedPerformance({
  people,
  resolveAvatar,
}: {
  people: PunctualityPerson[];
  resolveAvatar: (employeeId: string) => string | null;
}) {
  const metrics: {
    key: string;
    label: string;
    render: (p: PunctualityPerson) => React.ReactNode;
  }[] = [
    {
      key: "rate",
      label: "On-Time Rate",
      render: (p) => (
        <span
          className="text-[15px] font-black tabular-nums"
          style={{ color: rateColor(p.rate) }}
        >
          {p.rate}%
        </span>
      ),
    },
    ...SPREAD_COLS.map((c) => ({
      key: c.key,
      label: `${c.label} Days`,
      render: (p: PunctualityPerson) => <SpreadCell value={p.lateSpread[c.key]} />,
    })),
    {
      key: "late",
      label: "Total Late",
      render: (p: PunctualityPerson) => (
        <span
          className="text-[15px] font-black tabular-nums"
          style={{ color: p.late > 0 ? RED : "var(--color-ink-subtle)" }}
        >
          {p.late}
        </span>
      ),
    },
  ];

  const stickyCell =
    "sticky left-0 z-10 bg-white px-3 py-2.5 text-left text-[12.5px] font-bold text-ink-strong";

  return (
    <div className="kanban-scroll overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            <th
              className={`${stickyCell} z-20 text-[11px] uppercase tracking-[0.08em] text-ink-subtle`}
              style={{ background: "#f9fafb" }}
            >
              Metric
            </th>
            {people.map((p) => (
              <th key={p.employeeId} className="px-3 py-2.5" style={{ background: "#f9fafb" }}>
                <span className="inline-flex flex-col items-center gap-1">
                  <Avatar
                    name={p.employeeName}
                    avatarUrl={resolveAvatar(p.employeeId)}
                    size={26}
                  />
                  <span
                    className="max-w-[14ch] truncate text-[11.5px] font-bold text-ink-strong"
                    title={p.employeeName}
                  >
                    {p.employeeName}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.key} className="border-b border-hairline last:border-b-0">
              <td className={stickyCell}>{m.label}</td>
              {people.map((p) => (
                <td key={p.employeeId} className="px-3 py-2.5 text-center">
                  {m.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Person · rate · [15+ · 8–14 · 4–7 · 1–3] · Late.
// The four bracket tracks are now equal (they hold the same kind of number and
// sit under equal-weight headings); Late keeps the wider track since it's the
// sum and runs to more digits. The old string front-loaded 56px for Late back
// when it came third.
/**
 * THE ONE COLUMN TRACK, read by the header row and every person row — so the
 * two cannot drift out of alignment.
 *
 * The five bracket columns were fixed 50px (56px for Late), which is what made
 * "8–14" wrap: the label plus a 13px sort icon and its gap does not fit 50px,
 * so the header broke to "8-" over "14" while the number below sat on one line.
 *
 * Now the 12-column ratio the brief asks for, expressed as grid fr units —
 * 3 for the person, 4 for the rate bar, and 5 shared equally by the five
 * bracket columns (1fr each). `minmax(64px, …)` is the guardrail: the floor is
 * wide enough for the longest label plus its icon at any container width, so
 * the fr share can shrink without the text ever breaking again.
 */
const COLS =
  "minmax(0,3fr) minmax(120px,4fr) repeat(5, minmax(64px,1fr))";

function RateBar({
  rate,
  reduce,
  delay,
}: {
  rate: number;
  reduce: boolean;
  delay: number;
}) {
  const color = rateColor(rate);
  return (
    <span
      className="relative block h-2.5 w-full overflow-hidden rounded-full"
      style={{ background: "color-mix(in srgb, var(--color-red-deep) 16%, transparent)" }}
    >
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        whileInView={reduce ? undefined : { width: `${rate}%` }}
        animate={reduce ? { width: `${rate}%` } : undefined}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}

/**
 * Hover breakdown behind the On-Time Rate percentage: how many delivered tasks
 * the rate is computed from, the on-time/late split, and the late spread. The
 * bar alone says "72%" without saying 72% *of what* — 72% of 4 tasks and 72% of
 * 90 are very different signals.
 */
function OnTimeRateTooltip({
  person,
  children,
}: {
  person: PunctualityPerson;
  children: React.ReactNode;
}) {
  // Use the field rather than re-deriving `done - late`. They agree today
  // (done is defined as onTime + late), but if that ever stops being true the
  // tooltip should report what the transform actually counted.
  const onTime = person.onTime;
  const spread = person.lateSpread;
  const row = "flex items-baseline justify-between gap-6";

  const pct = (n: number) =>
    person.done > 0 ? `${Math.round((n / person.done) * 100)}%` : "-";

  // NO RESIDUAL ROW any more. The brackets started at two days, so a task one
  // day late fell through all four and the tooltip had to add a "1 day" line to
  // stop the breakdown summing to less than the Late total above it. The first
  // bracket is 1–3 now, so the four partition every late task and the residual
  // is structurally zero.
  return (
    <Tooltip.Provider delayDuration={220}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className="z-[90]"
            style={{
              minWidth: 232,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 14,
              boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
              padding: 14,
            }}
          >
            <p className="text-[14px] font-black text-ink-strong">{person.employeeName}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink-subtle">
              On-time rate ·{" "}
              <span className="tabular-nums font-black" style={{ color: rateColor(person.rate) }}>
                {person.rate}%
              </span>
            </p>

            <div className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3 text-[12.5px] font-semibold text-ink-soft">
              <div className={row}>
                <span>Delivered</span>
                <span className="tabular-nums font-black text-ink-strong">{person.done}</span>
              </div>
              <div className={row}>
                <span>On time</span>
                <span className="tabular-nums font-black" style={{ color: GREEN }}>
                  {onTime}
                  <span className="ml-1.5 text-[11.5px] font-bold opacity-70">{pct(onTime)}</span>
                </span>
              </div>
              <div className={row}>
                <span>Late</span>
                <span className="tabular-nums font-black" style={{ color: person.late > 0 ? RED : "var(--color-ink-subtle)" }}>
                  {person.late}
                  <span className="ml-1.5 text-[11.5px] font-bold opacity-70">{pct(person.late)}</span>
                </span>
              </div>
            </div>

            {person.late > 0 && (
              <div className="mt-3 border-t border-hairline pt-3">
                <p className="text-[10.5px] font-black uppercase tracking-[0.1em] text-ink-subtle">
                  Late by
                </p>
                <div className="mt-1.5 flex flex-col gap-1 text-[12.5px] font-semibold text-ink-soft">
                  {SPREAD_COLS.map((c) => (
                    <div key={c.key} className={row}>
                      <span>{c.label} days</span>
                      <span className="tabular-nums font-black text-ink-strong">{spread[c.key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** A late-spread bucket cell — emphasised in red only when non-zero. */
/**
 * One spread count.
 *
 * ZERO IS NOT A BUTTON. A cell at 0 keeps dim grey text and the default
 * cursor, and carries no hover card and no click target — most of this grid is
 * zeroes, and forty inert hover targets that open an empty popover is worse
 * than no affordance at all. Non-zero cells get the pointer, the red wash and
 * a slight scale, so what is clickable is the same thing that is interesting.
 */
function SpreadCell({
  value,
  className,
  employeeName,
  employeeId,
  bracket,
  preview,
}: {
  value: number;
  className?: string;
  /** Omitted by the transposed view, which renders the same counts in a
   *  different orientation and has no popover — the cell then stays inert. */
  employeeName?: string;
  employeeId?: string;
  bracket?: LateBracketKey;
  preview?: ReturnType<typeof useLateSpreadPreview>;
}) {
  const hot = value > 0;
  const interactive = hot && employeeName != null && bracket != null && preview != null;

  const numberStyle: React.CSSProperties = {
    fontFamily: "var(--font-display), system-ui, sans-serif",
    fontSize: 16,
  };

  if (!interactive) {
    return (
      <span
        className={`cursor-default tabular-nums font-black ${
          hot ? "" : "text-slate-300"
        } ${className ?? ""}`}
        style={{ ...numberStyle, color: hot ? RED : undefined }}
      >
        {value}
      </span>
    );
  }

  const rows = preview.tasksFor(employeeName, bracket);
  const shown = rows.slice(0, 3);

  return (
    /* ITS OWN PROVIDER. The only Tooltip.Provider in this file lives inside
       OnTimeRateTooltip, which wraps the rate column — not this one. A
       Tooltip.Root with no Provider ancestor throws at render, and it would
       throw only on the rows that have a non-zero spread, so a table of
       healthy people would look fine and a table with late work would not
       render at all. Nesting providers is supported and costs nothing. */
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Link
          href={`/tasks?emp=${encodeURIComponent(employeeId ?? "")}` as Route}
          onMouseEnter={preview.load}
          onFocus={preview.load}
          title={`${employeeName} - ${LATE_BRACKETS[bracket].label}`}
          className={`inline-flex cursor-pointer items-center justify-center rounded-md px-1.5 tabular-nums font-black text-red-600 transition-all hover:scale-105 hover:bg-red-100/60 ${
            className ?? ""
          }`}
          style={numberStyle}
        >
          {value}
        </Link>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <p className="text-[12.5px] font-bold text-slate-900">
            {employeeName} · {LATE_BRACKETS[bracket].label}
            <span className="ml-1 font-semibold text-slate-500">
              ({value} {value === 1 ? "task" : "tasks"})
            </span>
          </p>

          <div className="slim-scroll mt-2 max-h-[132px] overflow-y-auto">
            {preview.status === "loading" && (
              <p className="text-[12px] font-semibold text-slate-500">Loading…</p>
            )}
            {preview.status === "error" && (
              <p className="text-[12px] font-semibold text-slate-500">
                Couldn&apos;t load the preview.
              </p>
            )}
            {preview.status === "ok" && shown.length === 0 && (
              <p className="text-[12px] font-semibold text-slate-500">
                No preview available for these rows.
              </p>
            )}
            {shown.map((t) => (
              <div key={t.id} className="border-t border-slate-100 py-1.5 first:border-t-0">
                <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-slate-800">
                  {t.description?.trim() || t.subject?.trim() || t.title}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
                  {t.daysLate}d late · due {formatDate(t.dueAt)}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-500">
            💡 Click to open {employeeName}&apos;s tasks.
          </p>
          <Tooltip.Arrow className="fill-white" />
        </Tooltip.Content>
      </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function PersonTableRow({
  person,
  avatarUrl,
  index,
  reduce,
  preview,
}: {
  person: PunctualityPerson;
  avatarUrl: string | null;
  index: number;
  reduce: boolean;
  /** The table's ONE shared preview fetch, threaded down rather than started
   *  per row — see late-spread-preview.ts for why forty of them would be
   *  forty round trips for one pass of the mouse. */
  preview: ReturnType<typeof useLateSpreadPreview>;
}) {
  const { lateSpread } = person;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      animate={reduce ? { opacity: 1, y: 0 } : undefined}
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: reduce ? 0 : index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="grid items-center gap-3 rounded-xl px-3 py-3"
      style={{
        gridTemplateColumns: COLS,
        background: "color-mix(in srgb, var(--color-ink-strong) 2.5%, transparent)",
      }}
    >
      {/* Person */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={36} />
        <div className="min-w-0">
          <p
            className="truncate text-[15.5px] font-bold text-ink-strong"
            title={person.employeeName}
          >
            {person.employeeName}
          </p>
          <p className="text-[12.5px] font-semibold tabular-nums text-ink-subtle">
            {person.done} done
          </p>
        </div>
      </div>

      {/* On-time rate (bar + %) — hover for the numbers behind the percentage. */}
      <OnTimeRateTooltip person={person}>
        <div className="flex cursor-help items-center gap-2.5">
          <RateBar rate={person.rate} reduce={reduce} delay={reduce ? 0 : index * 0.04 + 0.1} />
          <span
            className="w-12 shrink-0 text-right text-[15.5px] font-black tabular-nums"
            style={{ color: rateColor(person.rate) }}
          >
            {person.rate}%
          </span>
        </div>
      </OnTimeRateTooltip>

      {/* Late spread — mapped from SPREAD_COLS (not hardcoded) so each number
          always sits under its own heading, whatever order that array is in. */}
      {/* `min-w-[56px]` mirrors the header cell above, so a number and its
          heading claim the same width and stay on the same centre line — the
          header carries a sort icon the cell does not, and without the matching
          floor the two centre against different widths. */}
      {SPREAD_COLS.map((c) => (
        <span key={c.key} className="min-w-[56px] text-center">
          <SpreadCell
            value={lateSpread[c.key]}
            employeeName={person.employeeName}
            employeeId={person.employeeId}
            bracket={c.key as LateBracketKey}
            preview={preview}
          />
        </span>
      ))}

      {/* Total late — last, after the brackets that make it up. Centred to
          match the columns it follows. */}
      <span
        className="min-w-[56px] text-center text-[15.5px] font-black tabular-nums"
        style={{ color: person.late > 0 ? RED : "var(--color-ink-subtle)" }}
      >
        {person.late}
      </span>
    </motion.li>
  );
}

function PersonCard({
  person,
  avatarUrl,
  index,
  reduce,
}: {
  person: PunctualityPerson;
  avatarUrl: string | null;
  index: number;
  reduce: boolean;
}) {
  const { lateSpread } = person;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      animate={reduce ? { opacity: 1, y: 0 } : undefined}
      exit={reduce ? undefined : { opacity: 0, y: -4 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: reduce ? 0 : index * 0.045, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border p-3.5"
      style={{
        borderColor: "var(--color-hairline-strong)",
        background:
          "color-mix(in srgb, var(--color-ink-strong) 2.5%, var(--color-surface-card))",
      }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[16px] font-bold text-ink-strong"
            title={person.employeeName}
          >
            {person.employeeName}
          </p>
          <p className="text-[13px] font-semibold tabular-nums text-ink-subtle">
            {person.done} done · {person.late} late
          </p>
        </div>
        <span
          className="shrink-0 text-[22px] font-black tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            color: rateColor(person.rate),
          }}
        >
          {person.rate}%
        </span>
      </div>

      <div className="mt-2.5">
        <RateBar rate={person.rate} reduce={reduce} delay={reduce ? 0 : index * 0.045 + 0.1} />
      </div>

      {/* Late spread grid */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {SPREAD_COLS.map((c) => (
          <div
            key={c.key}
            className="rounded-lg px-2 py-1.5 text-center"
            style={{
              background: "color-mix(in srgb, var(--color-ink-strong) 4%, transparent)",
            }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">
              {c.label}
            </p>
            <div className="mt-0.5">
              <SpreadCell value={lateSpread[c.key]} />
            </div>
          </div>
        ))}
      </div>
    </motion.li>
  );
}
