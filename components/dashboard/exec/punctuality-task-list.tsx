"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, ChevronsUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { getPunctualityDrilldown } from "@/app/(app)/dashboard/drilldown-actions";
import type {
  PunctualityBucket,
  PunctualityDrilldown,
} from "@/lib/queries/punctuality-drilldown";

type SortKey = "task" | "assignee" | "daysLate";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/**
 * THE COLUMN SCHEMA — header label, alignment, and the value each column sorts
 * on, in one list. Declared as data rather than as three hand-written <th>s so
 * a heading and the comparator under it cannot end up describing different
 * fields.
 *
 * `task` sorts on the SAME string the row renders — description → subject →
 * title, in that order. Sorting on `title` instead would order the list by
 * CLIENT NAME (that is what `title` holds in this schema) while the visible
 * text stayed put, which reads as a broken sort rather than a different one.
 */
const TASK_LABEL = (t: { description: string | null; subject: string | null; title: string }) =>
  t.description?.trim() || t.subject?.trim() || t.title;

/**
 * Sort a copy, never the array in state.
 *
 * SORT BEFORE SLICING, which is why this takes the whole list rather than the
 * visible page: `shown` caps how many rows are drawn, and sorting after the
 * slice would only reorder the first 25 — so "highest days late first" would
 * show the worst of the first 25, not the worst overall, and pressing "Load
 * more" would inject rows above the ones already on screen.
 *
 * `localeCompare` for strings so accented names order the way a reader expects;
 * plain subtraction for the numeric column.
 */
function sortTasks(
  tasks: PunctualityDrilldown["tasks"],
  sort: SortState,
): PunctualityDrilldown["tasks"] {
  if (!sort) return tasks;
  const col = SORT_COLS.find((c) => c.key === sort.key);
  if (!col) return tasks;
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...tasks].sort((a, b) => {
    const av = col.value(a);
    const bv = col.value(b);
    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    return cmp * dir;
  });
}

const SORT_COLS: {
  key: SortKey;
  label: string;
  right: boolean;
  value: (t: PunctualityDrilldown["tasks"][number]) => string | number;
}[] = [
  { key: "task", label: "Task", right: false, value: (t) => TASK_LABEL(t).toLowerCase() },
  {
    key: "assignee",
    label: "Assignee",
    right: false,
    // Unassigned rows render "—"; sorting them as an empty string keeps them
    // together at one end instead of scattered through the alphabet.
    value: (t) => (t.doerName ?? "").toLowerCase(),
  },
  { key: "daysLate", label: "Days Late", right: true, value: (t) => t.daysLate },
];

/**
 * The RIGHT panel of the "Delivered On Time" widget — the task breakdown behind
 * whichever KPI card is selected on the left.
 *
 * Replaces the old `LateTasksBreakdown`, which was a collapsed accordion that
 * only ever showed the LATE half. Three things changed:
 *
 *   · It is always open. It is now a permanent column beside the gauge rather
 *     than a drawer you had to discover, so an accordion around it was a click
 *     between the user and the thing the card is about.
 *   · It takes a `bucket`, so the same list serves "Total Completed" / "On Time"
 *     / "Late Deliveries". Switching cards refetches — the sets genuinely differ.
 *   · The "Revised / Original due date" column is GONE. The columns are TASK ·
 *     ASSIGNEE · DAYS LATE, and the first two are set larger and bolder: this is
 *     a scan-for-a-name list, and 13px grey text made that work.
 *
 * Fetching stays lazy and keyed by `(basis, bucket, filters)` — the dashboard
 * load path never pays for it, and re-selecting a card you've already viewed is
 * served from the last response rather than re-hitting the server.
 */
/** Rows shown before "Load more" — and the size of each further page. */
const PAGE = 6;

export function PunctualityTaskList({
  basis,
  bucket,
  query = "",
}: {
  basis: "original" | "revised";
  bucket: PunctualityBucket;
  /** The section header's search text. Filtering happens HERE, where the rows
   *  are, rather than in the header that owns the box — the header has no
   *  access to a list this component fetches for itself. */
  query?: string;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; data: PunctualityDrilldown }
  >({ kind: "loading" });

  // How many rows are on screen. The list runs to hundreds and a wall of them
  // buries the gauge beside it, so it opens at PAGE and grows on demand.
  const [shownState, setShownState] = React.useState({ n: PAGE, key: "" });
  // Column sort. Null = the order the query returned, which is already
  // meaningful — worst-first for `late`, most-early-first for `onTime` — so it
  // stays the default rather than being replaced by an arbitrary column.
  const [sort, setSort] = React.useState<SortState>(null);

  // desc -> asc -> back to the query's own order. The third click matters here
  // BECAUSE the default is meaningful: without it there would be no way back to
  // "worst first" once you had sorted by assignee.
  const cycleSort = React.useCallback((key: SortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "desc" };
      if (cur.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }, []);

  /* THE SEARCH runs over what the ROW ACTUALLY SHOWS. That is not simply
     `title`: the label falls back description → subject → title, and in this
     schema `title` holds the CLIENT NAME (see TASK_LABEL above). Searching only
     `title` would therefore match clients while missing every task description
     on screen — so all four fields are matched, plus the assignee. */
  const visible = React.useMemo(() => {
    const all = state.kind === "ok" ? state.data.tasks : [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) =>
      [t.description, t.subject, t.title, t.doerName, t.client].some((f) =>
        (f ?? "").toLowerCase().includes(q),
      ),
    );
  }, [state, query]);

  // Keyed by everything the result depends on, so flipping back to a card you
  // already looked at doesn't re-hit the server.
  const requestKey = `${basis}|${bucket}|${search}`;
  /* The page count is STAMPED with the request AND the search it belongs to,
     so switching card, basis, dashboard filter or search text drops the list
     back to one page during RENDER. Doing it in an effect instead is what put
     a setState in the fetch effect and dragged `query` into its dependency
     list — where it would have refetched on every keystroke. */
  const pageKey = `${requestKey}|${query.trim().toLowerCase()}`;
  const shown = shownState.key === pageKey ? shownState.n : PAGE;
  const loadedKey = React.useRef<string | null>(null);
  const cache = React.useRef(new Map<string, PunctualityDrilldown>());

  React.useEffect(() => {
    const hit = cache.current.get(requestKey);
    if (hit) {
      loadedKey.current = requestKey;
      setState({ kind: "ok", data: hit });
      return;
    }

    let cancelled = false;
    setState({ kind: "loading" });
    void getPunctualityDrilldown(basis, bucket, search).then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setState({ kind: "error", message: res.error });
      } else {
        cache.current.set(requestKey, res);
        loadedKey.current = requestKey;
        setState({ kind: "ok", data: res });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [basis, bucket, search, requestKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200">
      {state.kind === "loading" && (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm font-semibold">Loading tasks…</span>
        </div>
      )}

      {state.kind === "error" && (
        <p className="flex-1 px-4 py-16 text-center text-sm font-semibold text-gray-500">
          Couldn&apos;t load the list. {state.message}
        </p>
      )}

      {state.kind === "ok" && visible.length === 0 && (
        <p className="flex-1 px-4 py-16 text-center text-sm font-semibold text-gray-500">
          {/* Says WHICH filter emptied it. "No late deliveries in range" over a
              search that simply matched nothing reads as good news about the
              data rather than as a search result. */}
          {query.trim()
            ? `Nothing matches “${query.trim()}” in this list.`
            : bucket === "late"
              ? "No late deliveries in range — everything landed on time."
              : bucket === "onTime"
                ? "No on-time deliveries in range."
                : "No completed tasks in range."}
        </p>
      )}

      {state.kind === "ok" && visible.length > 0 && (
        <>
          {/* Scrolls INSIDE its own box, capped at 360px.
              `flex-1` alone was not enough: it only resolves to a fixed height
              when an ancestor is itself height-constrained, and on this
              dashboard nothing above it is — so the box sized to its content and
              every "Load more" press grew the card and shoved the widgets below
              it down the page. The explicit max-h is what makes the cap real, so
              appending rows fills the scroller instead of the layout. */}
          <div className="min-h-0 max-h-[360px] flex-1 overflow-y-auto overscroll-contain">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50">
                {/* Header type is set on the ROW, so the three cells and their
                    sort buttons inherit one size. Setting it per-<th> is how a
                    fourth column later ends up a step smaller than its
                    neighbours. */}
                <tr className="text-left text-xs font-extrabold uppercase tracking-wider text-slate-900 md:text-sm">
                  {SORT_COLS.map((c) => {
                    const active = sort?.key === c.key;
                    const dir = active ? sort!.dir : null;
                    return (
                      <th
                        key={c.key}
                        aria-sort={
                          active ? (dir === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={`whitespace-nowrap px-4 py-3 ${
                          c.right ? "text-right" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => cycleSort(c.key)}
                          aria-label={
                            active
                              ? `${c.label}, sorted ${
                                  dir === "asc" ? "ascending" : "descending"
                                }. Activate to ${
                                  dir === "asc" ? "clear the sort" : "sort ascending"
                                }.`
                              : `Sort by ${c.label}, descending`
                          }
                          className={`group/sort inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap uppercase tracking-wider transition-colors ${
                            c.right ? "justify-end" : ""
                          } ${active ? "text-slate-900" : "text-slate-900/70 hover:text-slate-900"}`}
                        >
                          {c.label}
                          {/* The same three-state indicator Status by Doer and
                              Overdue by Person use — a dim ⇅ until this is the
                              sorted column. Always visible: an affordance that
                              only appears on hover is one nobody discovers, so
                              the headings read as plain labels and the sorting
                              goes unused. */}
                          {dir === "asc" ? (
                            <ArrowUp size={13} strokeWidth={2.6} aria-hidden />
                          ) : dir === "desc" ? (
                            <ArrowDown size={13} strokeWidth={2.6} aria-hidden />
                          ) : (
                            <ChevronsUpDown
                              size={13}
                              strokeWidth={2.4}
                              aria-hidden
                              className="text-slate-400 transition-colors group-hover/sort:text-slate-600"
                            />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortTasks(visible, sort)
                  .slice(0, shown)
                  .map((t) => {
                  // description → subject → client name, in that order. Each
                  // fallback is a real field rather than a placeholder, so a
                  // task with no body still labels itself with something a
                  // person can act on instead of an empty cell.
                  const taskLabel =
                    t.description?.trim() || t.subject?.trim() || t.title;
                  // The hover carries what truncation ate, plus the identifiers
                  // stripped from the label — nothing is lost, it just stops
                  // occupying the one line the eye scans.
                  const taskHover = [
                    taskLabel,
                    t.taskNo ? `Task #${t.taskNo}` : null,
                    t.client ? `Client: ${t.client}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n");
                  return (
                  <tr
                    key={t.id}
                    className="border-t border-gray-100 transition-colors hover:bg-gray-50"
                  >
                    {/* `title` on the <td> as well as the link: the hover target
                        is then the whole cell, including the empty space to the
                        right of a short description, rather than only the text
                        run itself. */}
                    <td className="px-3.5 py-2.5" title={taskHover}>
                      {/* The whole label is a link to the task — this list is a
                          triage queue, so the next move after spotting a late
                          row is always to open it.

                          It leads with the DESCRIPTION. It used to read
                          "#2358 · {t.title}", and `title` in this schema is the
                          CLIENT NAME — the New Task form's "Client Name" field
                          writes straight to tasks.title. So the row announced a
                          number nobody quotes followed by a client that was
                          then repeated on the line directly below it, and said
                          nothing about the work. */}
                      <Link
                        href={`/tasks/${t.id}` as Route}
                        className="block max-w-[420px] truncate text-[15px] font-semibold leading-snug text-gray-900 hover:text-altus-red hover:underline"
                        title={taskHover}
                      >
                        {taskLabel}
                      </Link>
                      {t.client && (
                        <span className="block truncate text-[12.5px] font-medium text-gray-500">
                          {t.client}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-[15px] font-semibold text-gray-900 whitespace-nowrap">
                      {t.doerName ?? "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {t.daysLate > 0 ? (
                        <span className="inline-flex min-w-[46px] justify-center rounded-full bg-red-50 px-2.5 py-1 text-[13px] font-black tabular-nums text-red-600">
                          {t.daysLate}d
                        </span>
                      ) : (
                        // An on-time row has no days-late to badge. Saying so in
                        // words beats a red "0", which reads as a near-miss.
                        <span className="inline-flex justify-center rounded-full bg-emerald-50 px-2.5 py-1 text-[12.5px] font-bold text-emerald-700">
                          On time
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ONE status bar, always present — it used to be two mutually
              exclusive strips (a Load-more button, then a truncation note that
              only appeared once everything was expanded), so the count vanished
              at exactly the moment the list got long enough to need it. Pinned
              with `sticky bottom-0` so it stays legible while the rows scroll
              behind it. */}
          <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-slate-50 px-3.5 py-2">
            <span className="min-w-0 truncate text-[12px] font-semibold text-gray-500">
              {/* Counts the FILTERED set. A footer still reporting "14 of 212"
                  under six search results describes a list the reader is not
                  looking at. The word "matching" appears only while a search is
                  active, so the unfiltered reading is unchanged. */}
              Showing {Math.min(shown, visible.length).toLocaleString("en-IN")}{" "}
              of{" "}
              {query.trim()
                ? `${visible.length.toLocaleString("en-IN")} matching`
                : state.data.total.toLocaleString("en-IN")}
              {!query.trim() && state.data.truncated && shown >= visible.length
                ? " — narrow the dashboard filters to see the rest."
                : ""}
            </span>
            {shown < visible.length && (
              <button
                type="button"
                onClick={() => setShownState({ n: shown + PAGE, key: pageKey })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <ChevronDown size={14} strokeWidth={2.6} />
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
