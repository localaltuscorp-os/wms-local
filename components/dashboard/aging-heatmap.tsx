"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import * as Tooltip from "@radix-ui/react-tooltip";
import { PRIORITY_LABELS } from "@/db/enums";
import {
  AlertTriangle,
  Flame,
  ArrowDownUp,
  ChevronRight,
  ChevronDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { AGE_BUCKETS, type AgeBucketId } from "@/db/enums";
import type { AgingRow, HeatmapCellTask } from "@/lib/types";
import { useSectionSearch, setSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { Avatar } from "@/components/ui/avatar";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD,
  SECTION_CONTROL,
  SectionSearchBox,
} from "@/components/dashboard/section-chrome";
import { AgingTaskDrawer } from "@/components/dashboard/aging-task-drawer";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { DASHBOARD_TABLE_HEAD } from "@/components/dashboard/section-chrome";
import { isAppDepartment, type TeamView } from "@/lib/teams/app-team";
import { TeamToggle } from "@/components/dashboard/team-toggle";

/**
 * THE AGE RAMP - one continuous risk gradient, green through burgundy.
 *
 * One map, read by the legend pills, the stacked bar segments and the hover
 * popover, so a bucket is the same colour in all three. Re-mapped from the old
 * green -> teal -> SKY BLUE -> amber ramp: a blue tier in the middle of a heat
 * scale reads as a category, not a step, so 8-14d looked like a different KIND
 * of thing rather than "worse than 4-7d". The ramp is now monotonic in hue AND
 * in temperature: green -> lime -> yellow -> orange -> red -> deep red ->
 * burgundy, so a bar gets visibly hotter left to right with no hue that breaks
 * the sequence.
 *
 * 46-60 AND 60+ ARE NOT THE SAME BURGUNDY. The palette names one "deep dark
 * burgundy" tier for both, but byte-identical fills on adjacent buckets is the
 * exact defect this map was rewritten once before to fix - two brackets that
 * render the same cannot show that one lane's backlog is older than another's.
 * They take the two burgundies the palette offers (#7F1D1D and #450A0A), which
 * keeps the tier reading as one family while staying distinguishable.
 *
 * INK FOLLOWS CONTRAST, not a blanket colour. Everything from green through
 * orange is too light to carry white: white on #16A34A measures 3.4:1 and on
 * #F97316 just 2.8:1, under even the 3:1 large-text floor, and these counts are
 * 12px. Those four take slate-900 (6:1 or better). Red and darker take white.
 */
const BUCKET_COLOR: Record<AgeBucketId, { fill: string; ink: string; deep: string }> = {
  "0-3":   { fill: "#16A34A", ink: "#0F172A", deep: "#15803D" }, // forest green   - freshest
  "4-7":   { fill: "#65A30D", ink: "#0F172A", deep: "#4D7C0F" }, // lime           - early warning
  "8-14":  { fill: "#EAB308", ink: "#0F172A", deep: "#CA8A04" }, // amber yellow   - moderate
  "15-20": { fill: "#F97316", ink: "#0F172A", deep: "#EA580C" }, // deep orange    - late
  "21-30": { fill: "#DC2626", ink: "#FFFFFF", deep: "#B91C1C" }, // bright red     - critical
  "31-45": { fill: "#B91C1C", ink: "#FFFFFF", deep: "#991B1B" }, // deep red       - severe
  "46-60": { fill: "#7F1D1D", ink: "#FFFFFF", deep: "#601717" }, // burgundy       - very severe
  "60+":   { fill: "#450A0A", ink: "#FFFFFF", deep: "#2C0606" }, // dark burgundy  - extreme
};

const BUCKET_WEIGHT: Record<AgeBucketId, number> = {
  "0-3": 1, "4-7": 2, "8-14": 3, "15-20": 5,
  "21-30": 7, "31-45": 10, "46-60": 14, "60+": 20,
};

const CRITICAL_BUCKETS: AgeBucketId[] = ["31-45", "46-60", "60+"];


type EnrichedAgingRow = AgingRow & { risk: number };

/**
 * The lane ordering. Kept as a free function rather than inlined into the
 * component so the transposed view and the exported report sort by exactly the
 * same rules the lane list does.
 */
function sortAgingRows(
  rows: EnrichedAgingRow[],
  mode: SortMode,
  dir: SortDir,
): EnrichedAgingRow[] {
  const copy = [...rows];
  // `desc` is the resting direction and it means WORST FIRST on every numeric
  // column - the whole point of this board. Employee is the exception: A→Z is
  // what a reader means by ascending on a name, so its default flips.
  const flip = dir === "desc" ? 1 : -1;
  const critical = (r: EnrichedAgingRow) =>
    CRITICAL_BUCKETS.reduce((n, k) => n + r.buckets[k], 0);
  if (mode === "employee") {
    copy.sort((a, b) => -flip * a.employeeName.localeCompare(b.employeeName));
  } else if (mode === "total") {
    copy.sort((a, b) => flip * (b.total - a.total));
  } else if (mode === "risk") {
    copy.sort((a, b) => flip * (b.risk - a.risk));
  } else {
    copy.sort((a, b) => flip * (critical(b) - critical(a)));
  }
  return copy;
}

// Horizontal display order for THIS section only - oldest first, left → right:
// 60+ · 46-60 · 31-45 · 21-30 · 15-20 · 8-14 · 4-7 · 0-3.
// The canonical AGE_BUCKETS (db/enums.ts) deliberately stays youngest-first:
// `computeAgingByDate` maps over it to build the ordered `agingByDate` payload,
// so reversing it there would silently reorder other consumers. Colors, counts
// and task lists are all keyed by `b.id`, so they follow this order for free.
const DISPLAY_BUCKETS = [...AGE_BUCKETS].reverse();

function riskScore(row: AgingRow): number {
  if (row.total === 0) return 0;
  const weighted = AGE_BUCKETS.reduce(
    (s, b) => s + row.buckets[b.id] * BUCKET_WEIGHT[b.id],
    0,
  );
  const raw = weighted / row.total;
  return Math.round(((raw - 1) / 19) * 100);
}

/**
 * THE SCORE, SHOWN AS ITS OWN ARITHMETIC.
 *
 * Worth being exact about, because the obvious reading of the number is wrong:
 * risk is an AVERAGE, not a total. `weighted / total` is the mean age-weight of
 * one pending task, normalised from the 1..20 weight range onto 0..100.
 *
 * That is the whole answer to "why does someone with ONE task outrank someone
 * with fifteen": one task sitting 60+ days averages weight 20 and scores 100;
 * fifteen tasks all under three days average weight 1 and score 0. The board
 * ranks how OLD a backlog is, not how big - size is what the Total column is
 * for. A breakdown that presented the weights as points to be summed would
 * contradict the number printed on the badge, which is worse than the bare
 * tooltip it replaces.
 */
interface RiskBreakdown {
  rows: { id: AgeBucketId; label: string; count: number; weight: number; points: number }[];
  weighted: number;
  total: number;
  /** Mean weight per pending task - the figure the 0-100 index is scaled from. */
  average: number;
  score: number;
}

function riskBreakdown(row: AgingRow): RiskBreakdown {
  const rows = DISPLAY_BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    count: row.buckets[b.id] ?? 0,
    weight: BUCKET_WEIGHT[b.id],
    points: (row.buckets[b.id] ?? 0) * BUCKET_WEIGHT[b.id],
  })).filter((r) => r.count > 0);
  const weighted = rows.reduce((n, r) => n + r.points, 0);
  return {
    rows,
    weighted,
    total: row.total,
    average: row.total > 0 ? weighted / row.total : 0,
    score: riskScore(row),
  };
}

/* `employee` is new, and so is a direction. The column arrows and the
   "Sort by" dropdown drive THE SAME state on purpose: two controls that can
   each set a sort independently is two controls that can disagree, and the
   reader has no way to tell which one the rows are obeying. */
type SortMode = "risk" | "total" | "oldest" | "employee";
type SortDir = "asc" | "desc";



/**
 * TRANSPOSED VIEW - age buckets down the side, people across the top.
 *
 * The standard view is a LANE list (a stacked bar per person), not a grid, so
 * this is a real table rather than a re-orientation of the same markup. Risk
 * Score and Total Pending ride along as two extra rows, because in this
 * orientation they are per-person figures like every bucket count above them.
 *
 * Sorting means what it should here: clicking a person's header ranks the
 * BUCKET rows by that person's counts, so you can see where one individual's
 * backlog actually sits. A third click clears back to oldest-first order.
 */
function TransposedAging({
  rows,
  onDrill,
  sortBy,
  onSort,
}: {
  rows: (AgingRow & { risk: number })[];
  onDrill: (employeeId: string | null, bucketId: AgeBucketId | null) => void;
  sortBy: { employeeId: string; desc: boolean } | null;
  onSort: (employeeId: string) => void;
}) {
  const bucketRows = React.useMemo(() => {
    const base = DISPLAY_BUCKETS.map((b) => ({
      bucket: b,
      counts: rows.map((r) => r.buckets[b.id] ?? 0),
    }));
    if (!sortBy) return base;
    const idx = rows.findIndex((r) => r.employeeId === sortBy.employeeId);
    if (idx < 0) return base;
    const at = (c: number[]) => c[idx] ?? 0;
    return [...base].sort((a, b) =>
      sortBy.desc ? at(b.counts) - at(a.counts) : at(a.counts) - at(b.counts),
    );
  }, [rows, sortBy]);

  // Matches the lane view's caps. This is the SAME board in a different
  // orientation, so a reader flipping between the two should not find the
  // headings a size and a weight lighter on one of them.
  const head = `px-3 py-3 ${DASHBOARD_TABLE_HEAD}`;

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse"
        style={{ minWidth: Math.max(560, 180 + rows.length * 116) }}
      >
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`${head} sticky left-0 z-10 bg-white text-left`}>Age bucket</th>
            {rows.map((r) => {
              const active = sortBy?.employeeId === r.employeeId;
              return (
                <th
                  key={r.employeeId}
                  aria-sort={active ? (sortBy!.desc ? "descending" : "ascending") : "none"}
                  className={`${head} text-right`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(r.employeeId)}
                    title={`Sort buckets by ${r.employeeName}`}
                    className={`group/sort inline-flex cursor-pointer items-center gap-1.5 select-none transition-colors hover:text-gray-900 ${
                      active ? "text-gray-900" : "text-gray-500"
                    }`}
                  >
                    <span className="max-w-[104px] truncate">{r.employeeName}</span>
                    {active ? (
                      sortBy!.desc ? (
                        <ArrowDown size={12} strokeWidth={2.6} />
                      ) : (
                        <ArrowUp size={12} strokeWidth={2.6} />
                      )
                    ) : (
                      <ChevronsUpDown
                        size={12}
                        strokeWidth={2.4}
                        className="opacity-45 transition-opacity group-hover/sort:opacity-100"
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {bucketRows.map(({ bucket, counts }) => {
            const c = BUCKET_COLOR[bucket.id];
            return (
              <tr key={bucket.id} className="border-b border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <span
                    className="inline-flex rounded-pill px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: c.fill, color: c.ink }}
                  >
                    {bucket.label}
                  </span>
                </td>
                {rows.map((r, i) => {
                  const n = counts[i] ?? 0;
                  return (
                    <td key={r.employeeId} className="px-3 py-2 text-right">
                      {n === 0 ? (
                        <span className="text-[13px] text-gray-300">0</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDrill(r.employeeId, bucket.id)}
                          title={`Open ${r.employeeName}'s ${bucket.label} tasks`}
                          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-gray-900 transition-colors hover:bg-gray-100"
                        >
                          {n}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Risk and Total are per-person figures, so in this orientation they
              are rows like the buckets above - not a separate summary block. */}
          <tr className="border-t-2 border-gray-200">
            <td className="sticky left-0 z-10 bg-white px-3 py-2 text-[12px] font-black text-gray-900">
              Risk Score
            </td>
            {rows.map((r) => (
              <td key={r.employeeId} className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-gray-900">
                {r.risk}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-white px-3 py-2 text-[12px] font-black text-gray-900">
              Total Pending
            </td>
            {rows.map((r) => (
              <td key={r.employeeId} className="px-3 py-2 text-right text-[13px] font-black tabular-nums text-gray-900">
                {r.total}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function AgingHeatmap({
  rows,
  cellTasks,
  avatarById = {},
  me,
}: {
  rows: AgingRow[];
  cellTasks: Record<string, Record<string, HeatmapCellTask[]>>;
  avatarById?: Record<string, string | null>;
  /** Needed by the drill-down drawer's inline status cell. */
  me: { id: string; isAdmin: boolean };
}) {
  const [open, setOpen] = React.useState(true);
  /* The CARD-LEVEL sort. Since the board split into two independently sorted
     one list this is the sort control again, alongside the clickable column
     caps, and it still orders the transposed view and the exported report. */
  const [sortMode, setSortMode] = React.useState<SortMode>("risk");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [teamView, setTeamView] = React.useState<TeamView>("all");
  /* Re-clicking the active column flips it; a new column adopts its own natural
     direction - names A-Z, counts worst-first. */
  const onColumnSort = React.useCallback(
    (key: SortMode) => {
      if (key === sortMode) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return;
      }
      setSortMode(key);
      setSortDir(key === "employee" ? "asc" : "desc");
    },
    [sortMode],
  );
  const [ageFilter, setAgeFilter] = React.useState<AgeBucketId | null>(null);
  // Orientation, plus the transposed view's own sort. Both live here so
  // flipping back and forth never discards the other view's ordering - the
  // lane list keeps its risk/total/oldest mode, the grid keeps its column.
  const [isTransposed, setIsTransposed] = React.useState(false);
  const [transposedSort, setTransposedSort] = React.useState<
    { employeeId: string; desc: boolean } | null
  >(null);
  const toggleTransposedSort = React.useCallback((employeeId: string) => {
    setTransposedSort((cur) =>
      cur?.employeeId === employeeId
        ? cur.desc
          ? null // third click clears, back to oldest-first
          : { employeeId, desc: true }
        : { employeeId, desc: false },
    );
  }, []);
  // "Critical Only" - keep just the people carrying 31d+ work. Reuses
  // CRITICAL_BUCKETS, the same definition the risk score and the red banner

  // Drill-down target. `employeeId: null` = "this bracket, everyone" (an age
  // badge); `bucketId: null` = "this person, every bracket" (a lane); both set
  // = one cell.
  const [drill, setDrill] = React.useState<{
    employeeId: string | null;
    bucketId: AgeBucketId | null;
  } | null>(null);
  const openDrill = React.useCallback(
    (employeeId: string | null, bucketId: AgeBucketId | null) =>
      setDrill({ employeeId, bucketId }),
    [],
  );

  // Pulled straight from `cellTasks` - the very rows the lanes counted, so the
  // drawer can never disagree with the bar that opened it. Oldest first: a
  // drill-down is a triage list.
  const drillTasks = React.useMemo(() => {
    if (!drill) return [] as HeatmapCellTask[];
    const out: HeatmapCellTask[] = [];
    for (const [empId, buckets] of Object.entries(cellTasks)) {
      if (drill.employeeId && empId !== drill.employeeId) continue;
      for (const [bId, list] of Object.entries(buckets)) {
        if (drill.bucketId && bId !== drill.bucketId) continue;
        out.push(...list);
      }
    }
    return out.sort((a, b) => b.ageDays - a.ageDays);
  }, [drill, cellTasks]);

  const drillTitle = React.useMemo(() => {
    if (!drill) return "";
    const label = drill.bucketId
      ? AGE_BUCKETS.find((b) => b.id === drill.bucketId)?.label ?? drill.bucketId
      : null;
    const who = drill.employeeId
      ? rows.find((r) => r.employeeId === drill.employeeId)?.employeeName ?? "Unknown"
      : null;
    // "Proveeka Makwana · 15-20 days Aging Tasks" - the person first, because
    // that is what the reader clicked and what they are triaging.
    if (who && label) return `${who} · ${label} Aging Tasks`;
    if (who) return `${who} · All Pending Tasks`;
    return `All ${label} Aging Tasks`;
  }, [drill, rows]);

  /** One plain line under the title saying exactly what the list is - the count
   *  and the bracket, so the drawer states its own scope instead of leaving the
   *  reader to infer it from the cell they came from. */
  const drillSubtitle = React.useMemo(() => {
    if (!drill) return "";
    const n = drillTasks.length;
    const label = drill.bucketId
      ? AGE_BUCKETS.find((b) => b.id === drill.bucketId)?.label ?? drill.bucketId
      : null;
    const noun = n === 1 ? "pending task" : "pending tasks";
    return label
      ? `Showing all ${n} ${noun} aged ${label}.`
      : `Showing all ${n} ${noun}.`;
  }, [drill, drillTasks]);

  // TWO searches, and they AND together.
  //
  // `sectionQuery` is the FilterBar's, shared with every view on the page.
  // `localQuery` is this card's own box, added because a reader looking at the
  // heatmap should be able to narrow it without scrolling back up to the page
  // chrome - and because the FilterBar's box is not on every surface this
  // section renders on. Filtering on either alone would let one silently
  // override the other; a person has to match both to appear.
  //
  // Applied BEFORE enrichment so the risk ranking, the header counts and the
  // critical banner all describe the lanes actually on screen.
  const sectionQuery = useSectionSearch();
  const [localQuery, setLocalQuery] = React.useState("");
  const searched = React.useMemo(
    () =>
      rows.filter(
        (r) =>
          (!sectionQuery || matchesSearch(sectionQuery, r.employeeName)) &&
          (!localQuery || matchesSearch(localQuery, r.employeeName)),
      ),
    [rows, sectionQuery, localQuery],
  );

  const enrichedAll = React.useMemo(
    () => searched.map((r) => ({ ...r, risk: riskScore(r) })),
    [searched],
  );

  // Applied BEFORE the counts below, so the header describes what is actually
  // on screen - the same reason the section search is applied before enrichment.
  // A lane's BARS keep their full age split: the toggle picks which PEOPLE are
  // listed, and hiding their under-31d work would misstate each person's load.
  // The "All / Critical only" toggle is gone, so there is no people-filter pass
  // left here. CRITICAL_BUCKETS survives - it still defines the risk score, the
  // "oldest" sort and the red banner, which is most of what the toggle was
  // shortcutting anyway: the risk sort already floats those people to the top.
  // The age filter the legend pills drive. Null = every lane.
  //
  // This is the "Critical only" toggle generalised: that control filtered to
  // people carrying 31d+ work, which is three of these eight buckets. One pill
  // per bucket does the same job at any age and needs no separate widget.
  //
  // A FILTERED LANE KEEPS ITS FULL BAR. The pill picks which PEOPLE are listed,
  // not which of their work counts - hiding a person's under-31d segments would
  // misstate the load the bar exists to show. Same rule the old toggle carried.
  const enriched = React.useMemo(
    () =>
      ageFilter
        ? enrichedAll.filter((r) => r.buckets[ageFilter] > 0)
        : enrichedAll,
    [enrichedAll, ageFilter],
  );

  /* THE HEAD-COUNT BEHIND EACH AGE PILL.

     Read from `enrichedAll` - the searched roster BEFORE the age filter - and
     not from `enriched`. That distinction is the whole correctness of the
     feature: `enriched` has already been narrowed to the selected bucket, so
     counting it would print the chosen pill's own total and a zero on all seven
     others the moment you clicked one. The pills have to keep saying how many
     people each bucket holds so you can decide which to click NEXT.

     The TEAM toggle is applied, though, because the brief asks the numbers to
     follow it - and because a pill promising 9 people that lists 4 when opened
     under App Team is worse than no number. Search is inherited from
     `enrichedAll` for the same reason.

     A person counts once per bucket they hold work in, so the eight figures sum
     to more than the roster. That is correct and not a total: someone carrying
     both 4-7d and 60+d work genuinely belongs in both pills. */
  const ageCounts = React.useMemo(() => {
    const scoped =
      teamView === "app"
        ? enrichedAll.filter((r) => isAppDepartment(r.department))
        : teamView === "nonApp"
          ? enrichedAll.filter((r) => !isAppDepartment(r.department))
          : enrichedAll;
    const counts = {} as Record<AgeBucketId, number>;
    for (const b of AGE_BUCKETS) counts[b.id] = 0;
    for (const r of scoped) {
      for (const b of AGE_BUCKETS) {
        if (r.buckets[b.id] > 0) counts[b.id] += 1;
      }
    }
    return counts;
  }, [enrichedAll, teamView]);

  const sorted = React.useMemo(
    () => sortAgingRows(enriched, sortMode, sortDir),
    [enriched, sortMode, sortDir],
  );

  const top12 = sorted.slice(0, 12);

  /* The App / Non-App split, partitioned AFTER search and age filtering so both
     columns honour exactly the filters the single list did. */
  const appRows = React.useMemo(
    () => enriched.filter((r) => isAppDepartment(r.department)),
    [enriched],
  );
  const nonAppRows = React.useMemo(
    () => enriched.filter((r) => !isAppDepartment(r.department)),
    [enriched],
  );

  /* ── ONE LIST, THREE VIEWS ───────────────────────────────────────────────
     This replaces the side-by-side split, and the replacement is the point
     rather than a side effect.

     Two columns meant two column-header rows, because a header can only align
     over the track it sits above - one full-width header over a 2-up grid lines
     up with the left column and misses the right. So "show the headers once"
     and "keep the columns aligned" cannot both hold for a genuine split. A
     segmented control settles it: one list at a time, one header, always
     aligned, and the counts on the tabs give the App-vs-Non-App comparison the
     split was there to provide.

     Independent per-column sorting goes with it. That was only ever needed
     because there were two headers to click. */
  /* THE WAY BACK OUT. An age pill can empty this card on perfectly healthy
     data — "nobody is carrying work aged 46-60 days" is good news — and the
     filter row used to be rendered INSIDE the non-empty branch, so the moment
     a pill emptied the list the pill that caused it disappeared with it. The
     only way back was a page refresh.

     Two things fix that, and both are needed: the filter row now renders in
     BOTH states (below), and any active filter gets an explicit Clear. */
  const filtersActive =
    ageFilter !== null ||
    teamView !== "all" ||
    localQuery.trim().length > 0 ||
    // The PAGE search counts too: it can empty this card just as completely,
    // and a Clear that left it running would look broken.
    sectionQuery.trim().length > 0;
  const clearFilters = React.useCallback(() => {
    setAgeFilter(null);
    setTeamView("all");
    setLocalQuery("");
    // Page-wide, and deliberately so — it is the only way this card can get
    // back to showing everyone. The search box empties visibly, so nothing
    // happens behind the reader's back.
    setSectionSearch("");
  }, []);

  const teamRows =
    teamView === "app" ? appRows : teamView === "nonApp" ? nonAppRows : enriched;
  const teamSorted = React.useMemo(
    () => sortAgingRows(teamRows, sortMode, sortDir),
    [teamRows, sortMode, sortDir],
  );

  /* Bar scale spans EVERY lane on the board, not just the twelve the transposed
     view caps at: the lane list renders everybody, so a scale taken from twelve
     would overflow the bars of everyone below them. Taking it from `enriched`
     rather than from the filtered `teamRows` is the other half - a scale that
     changed with the toggle would redraw every bar on switching from App to
     Non-App, and the two views would stop being comparable. */
  const maxTotal = Math.max(...enriched.map((r) => r.total), 1);

  const totalAging = enriched.reduce((s, r) => s + r.total, 0);

  /* Exports the TWELVE LANES ON SCREEN, in the order they are sorted, not the
     whole roster - `top12` is what the section renders and what the reader is
     asking to send. */
  const buildReport = React.useCallback((): SectionReport => {
    return {
      title: "Aging Heatmap",
      subtitle: "Pending tasks by how long they have been open",
      meta: [
        { label: "Sort by", value: sortMode },
        ...(ageFilter
          ? [
              {
                label: "Age filter",
                value: AGE_BUCKETS.find((b) => b.id === ageFilter)?.label ?? ageFilter,
              },
            ]
          : []),
        ...(localQuery.trim() ? [{ label: "Search", value: localQuery.trim() }] : []),
      ],
      summary: `${enriched.length} ${enriched.length === 1 ? "person" : "people"} · ${totalAging} pending`,
      columns: [
        { label: "Person", weight: 3, align: "left" },
        ...DISPLAY_BUCKETS.map((b) => ({
          label: b.label,
          weight: 1,
          align: "right" as const,
          tone: "count" as const,
        })),
        { label: "Total", weight: 1, align: "right" },
      ],
      rows: top12.map((r) => [
        r.employeeName,
        ...DISPLAY_BUCKETS.map((b) => String(r.buckets[b.id] ?? 0)),
        String(r.total),
      ]),
    };
  }, [top12, enriched.length, totalAging, sortMode, ageFilter, localQuery]);
  const criticalTotal = enriched.reduce(
    (s, r) => s + CRITICAL_BUCKETS.reduce((acc, k) => acc + r.buckets[k], 0),
    0,
  );

  return (
    <PageShell
      as="section"
      width="full"
      py={false}
      /* No page margins of its own any more: this section now sits inside the
         dashboard's tab container, which owns the padding and the rhythm
         between sections. `mb-16` in particular left 64px of dead space at the
         bottom of the Attention tab. */
      style={{
        opacity: 0,
        // 900ms suited being the FOURTH section of a long scroll - you had
        // scrolled to it by the time it faded in. Inside a tab it mounts the
        // instant you click Attention, so a near-second of blank read as a
        // failure to load.
        animation: "fadeUp 400ms ease-out 100ms forwards",
      }}
    >
      {/* Section header, OUTSIDE the card - see components/dashboard/
          section-header.tsx. The sort control comes with it so the whole
          header line reads as one bar above the heat lanes. */}
      <DashboardSectionHeader
        icon={<SectionIcon icon={Flame} tone="red" />}
        title="Aging Heatmap"
        subtitle={
          <>
            {enriched.length} {enriched.length === 1 ? "person" : "people"}
            {" · "}
            <span className="tabular-nums font-semibold">
              {totalAging}
            </span>{" "}
            pending {totalAging === 1 ? "task" : "tasks"} aging - click any lane to
            see them
          </>
        }
        actions={
          <>
            <SectionDispatch report={buildReport} />
            {/* The shared section search box, not a hand-rolled input: it is
                already the debounced, Esc-to-clear control the two delegation
                boards use, so all three toolbars read as one system. Sits left
                of the sort control, which is where the other sections put it. */}
            <SectionSearchBox
              query={localQuery}
              onQuery={setLocalQuery}
              placeholder="Search employee..."
            />
            {/* Sort is hidden while transposed - it orders LANES, and in that
                orientation there are none. */}
            {!isTransposed && <SortControl value={sortMode} onChange={setSortMode} />}
            {/* Transpose sits with the collapse control: both change the
                section's SHAPE rather than what it contains. The lane sort is
                hidden while transposed - it orders LANES, and there are none. */}
            <button
              type="button"
              onClick={() => setIsTransposed((v) => !v)}
              aria-pressed={isTransposed}
              title={isTransposed ? "Back to lanes" : "Transpose: buckets as rows"}
              className={`${SECTION_CONTROL} ${isTransposed ? "text-altus-red" : ""}`}
            >
              <ArrowLeftRight className="size-3.5" strokeWidth={2.6} />
              Transpose
            </button>
            <CollapseToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label="the Aging heatmap"
            />
          </>
        }
      />
      {/* Header stays visible; the heat lanes below fold. */}
      <CollapsibleBody expanded={open}>

      <div
        /* The shared dashboard card, not a hand-rolled copy of it. The classes
           spelled out here were already identical to DASHBOARD_CARD_PADDED -
           which is exactly how they drift apart the next time one is edited.
           `wms-card` came off with them: that utility OWNS the border, and the
           card constant sets `border-slate-200/80` alongside it, so the two
           were fighting over the same property. */
        /* DASHBOARD_CARD without its padding, then p-8/p-10 on top. NOT
           `${DASHBOARD_CARD_PADDED} p-8`: both sets are plain utilities of
           equal specificity, so which one wins is decided by their order in
           the GENERATED stylesheet, not by their order in this string - the
           override would be a coin flip. Taking the unpadded constant leaves
           exactly one padding rule.
           NO FIXED FLOOR. This carried `min-h-[600px]`, on the reasoning that
           a floor kept the section's "presence on the page even with three
           lanes in it". With one lane that presence is 350px of blank card
           under a single 56px row — the card stopped describing its contents
           and started describing the number someone picked.

           It cannot collapse to nothing: the filter row renders on every path
           (empty or not), the empty branch carries its own `py-6` message, and
           the card's own `pt-4 pb-8` sits around both. Growth is still capped —
           the lane list is `max-h-[520px]` and scrolls — so this now sizes to
           its records in both directions instead of only upward. */
        /* TOP PADDING COMES DOWN, the sides stay. Removing the standalone
           legend row took a band out of the top of this card, and 32-40px of
           padding above what is now immediately the lane header left the
           header floating. `pt-4` closes that; the horizontal and bottom
           padding are unchanged, because they are what keeps the lanes off the
           card edge and those did not gain any space. */
        className={`aging-shell relative overflow-hidden px-8 pb-8 pt-4 md:px-10 md:pb-10 ${DASHBOARD_CARD}`}
      >
        {/* The red/green "heat wash" backdrop was removed - it was the other
            half of the peach tint. The heat colours still live where they carry
            meaning: the cells, the legend and the severity chips below. */}

        <div className="relative">
          {criticalTotal > 0 && <AlertBanner count={criticalTotal} />}

          {/* The AGE legend used to be a full row of its own here, between the
              banner and the lane header - a band of pills with its own padding
              above a header that then repeated the column names. It now lives
              INSIDE the lane header, over the bar track it describes. */}

          {/* THE FILTER ROW, ALWAYS. Rendered outside the empty/non-empty fork
              on purpose: these controls are how you undo the filter that
              emptied the card, so they have to survive it. Toggle left, legend
              + Clear right, all on one rule — they are filters over the same
              list, so they belong on the same line. */}
          {!isTransposed && (
            <div className="mb-4 mt-3 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 max-md:hidden">
              <TeamToggle
                view={teamView}
                onChange={setTeamView}
                counts={{
                  all: enriched.length,
                  app: appRows.length,
                  nonApp: nonAppRows.length,
                }}
              />
              <div className="flex min-w-0 items-center gap-2">
                <Legend
                  selected={ageFilter}
                  counts={ageCounts}
                  onToggle={(b) => setAgeFilter((cur) => (cur === b ? null : b))}
                />
                {filtersActive && <ClearFiltersButton onClick={clearFilters} />}
              </div>
            </div>
          )}

          {/* TRANSPOSED VIEW: the legend row does not render there, but the age
              filter still APPLIES to it — so filtering, then transposing, would
              strand you in exactly the same dead end. The Clear follows. */}
          {isTransposed && filtersActive && (
            <div className="mb-3 mt-3 flex justify-end">
              <ClearFiltersButton onClick={clearFilters} />
            </div>
          )}

          {top12.length === 0 ? (
            <div className="mt-6">
              <p className="font-semibold" style={{ fontSize: 17, color: "var(--color-ink-muted)" }}>
                {/* Says WHICH filter emptied it. An age pill can empty this list
                    on perfectly healthy data, and a bare "no pending tasks" there
                    reads as a loading failure rather than as good news. */}
                {localQuery.trim()
                  ? `No one matching "${localQuery.trim()}" is carrying pending work.`
                  : ageFilter
                    ? `Nobody is carrying work aged ${
                        AGE_BUCKETS.find((b) => b.id === ageFilter)?.label ?? ageFilter
                      }.`
                    : "No pending tasks for the current filter."}
              </p>
              {/* A second Clear, right where the eye already is. The row above
                  has one too, but on a card this tall the filter row can be
                  scrolled past — and this is the moment someone is looking for
                  the way back. */}
              {filtersActive && (
                <div className="mt-3">
                  <ClearFiltersButton onClick={clearFilters} label="Clear filters and show everyone" />
                </div>
              )}
            </div>
          ) : (
            /* No gap between lanes and no card per lane: the rows are separated
               by a hairline rule instead, which is what lets twice as many
               people fit on screen at once. */
            <div>
              {isTransposed ? (
                <TransposedAging
                  rows={top12}
                  onDrill={openDrill}
                  sortBy={transposedSort}
                  onSort={toggleTransposedSort}
                />
              ) : (
                <>
                  <LaneSortRow sortMode={sortMode} sortDir={sortDir} onSort={onColumnSort} />

                  {/* `slim-scroll`, not the browser's own bar: a 17px grey
                      Windows scrollbar down the side of a card this light is
                      the heaviest thing on it. 520px so a full list scrolls
                      rather than pushing every section below it off screen. */}
                  <div className="slim-scroll max-h-[520px] space-y-2 overflow-y-auto overscroll-contain pr-2 pt-2">
                    {teamSorted.length === 0 ? (
                      <p className="px-3 py-6 text-[13px] font-semibold text-ink-subtle">
                        {teamView === "app"
                          ? "No App-team member is carrying pending work here."
                          : teamView === "nonApp"
                            ? "No Operations member is carrying pending work here."
                            : "Nobody is carrying pending work here."}
                      </p>
                    ) : (
                      teamSorted.map((r, i) => (
                        <Lane
                          key={r.employeeId}
                          row={r}
                          maxTotal={maxTotal}
                          index={i}
                          employeeTasks={cellTasks[r.employeeId] ?? {}}
                          onDrill={openDrill}
                          avatarUrl={avatarById[r.employeeId] ?? null}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      </CollapsibleBody>

      <AgingTaskDrawer
        subtitle={drillSubtitle}
        open={drill !== null}
        title={drillTitle}
        tasks={drillTasks}
        me={me}
        avatarById={avatarById}
        onClose={() => setDrill(null)}
      />
    </PageShell>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (m: SortMode) => void;
}) {
  // A DROPDOWN, not the three-button segmented group this was. Three always-on
  // buttons cost ~180px of a header that now also carries WhatsApp, Email,
  // Transpose and the fold toggle; a trigger that states the current mode costs
  // ~120px and says the same thing. The hints move into the options, where they
  // are read at the moment of choosing rather than sat in a tooltip nobody
  // hovers.
  //
  // A NATIVE <select>, deliberately. This header already has one (the activity
  // board's period control), it is keyboard- and screen-reader-correct with no
  // focus-trap code of our own, and it cannot be clipped by the section's
  // `overflow-x-auto` the way a custom popover would be.
  const options: { id: SortMode; label: string; hint: string }[] = [
    {
      id: "risk",
      label: "Risk",
      hint: "Sorts by weighted risk score calculated from high-aging categories.",
    },
    {
      id: "total",
      label: "Total",
      hint: "Sorts by total volume of pending aging tasks.",
    },
    {
      id: "oldest",
      label: "Oldest",
      hint: "Sorts by age of the single oldest active task.",
    },
  ];
  const current = options.find((o) => o.id === value) ?? options[0]!;
  return (
    <span className="relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs">
      <ArrowDownUp className="size-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="whitespace-nowrap">
        Sort by: <span className="text-slate-900">{current.label}</span>
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-slate-400" aria-hidden />
      {/* The real control, laid transparently over the whole pill so the native
          menu anchors to it and the entire chip is the hit target. */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortMode)}
        aria-label="Sort aging lanes"
        title={current.hint}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} title={o.hint}>
            Sort by {o.label} - {o.hint}
          </option>
        ))}
      </select>
    </span>
  );
}

function AlertBanner({ count }: { count: number }) {
  // Same warning, a third of the height: the shadow is gone, the rule is 3px
  // rather than 4, and the count sits inline with its sentence instead of
  // towering over it at 22px.
  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-chip px-3 py-1"
      style={{
        background: "rgba(225, 6, 0, 0.07)",
        borderLeft: "3px solid #dc2626",
      }}
    >
      <AlertTriangle className="size-4 shrink-0" style={{ color: "#A80400" }} />
      <p style={{ fontSize: 12.5, color: "var(--color-ink-strong)" }}>
        <span className="tabular-nums font-black" style={{ fontSize: 14 }}>
          {count}
        </span>
        <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
          {" "}
          {count === 1 ? "task is" : "tasks are"} aging more than 30 days -
          escalate or close
        </span>
      </p>
    </div>
  );
}

/**
 * CLEAR FILTERS — shown only while something is actually filtered, so it never
 * sits there as a no-op control. Deliberately not styled as one of the age
 * pills: it undoes them rather than being one of them, and a ninth coloured
 * chip in that row would read as a ninth bucket.
 */
function ClearFiltersButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clear the age, team and search filters"
      className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-hairline-strong bg-surface-card px-2.5 py-1 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
    >
      <RotateCcw size={12} strokeWidth={2.6} />
      {label ?? "Clear"}
    </button>
  );
}

function Legend({
  selected,
  counts,
  onToggle,
}: {
  selected: AgeBucketId | null;
  /** People holding work in each bucket, under the current team + search. */
  counts: Record<AgeBucketId, number>;
  onToggle: (b: AgeBucketId) => void;
}) {
  return (
    /* LEFT-ALIGNED. This briefly used `justify-between`, which spread eight
       pills across the full table width and opened gaps wider than the pills
       themselves - the row stopped reading as one control group and started
       reading as eight unrelated chips. A fixed `gap-2.5` keeps them a set;
       `overflow-x-auto` scrolls on a narrow viewport rather than wrapping to a
       second line, which would move every lane below it on resize. */
    /* COMPACT AGAIN. These were h-8 px-4 pills when the legend was a row of
       its own with a row's worth of space; inside the lane header they have to
       sit on a 10px caption line, so they come back to a chip. Third pass on
       the same pills - noted because the size is a function of WHERE they live,
       not a preference, and moving them again should move the size with them. */
    <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
      <span className="mr-1 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500">
        Age:
      </span>
      {DISPLAY_BUCKETS.map((b) => {
        const c = BUCKET_COLOR[b.id];
        const isSelected = selected === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onToggle(b.id)}
            aria-pressed={isSelected}
            title={
              isSelected
                ? `Showing only the ${counts[b.id]} ${counts[b.id] === 1 ? "person" : "people"} with work aged ${b.label} - click to clear`
                : `Show only the ${counts[b.id]} ${counts[b.id] === 1 ? "person" : "people"} with work aged ${b.label}`
            }
            /* The white BORDER is what makes the selected state legible on all
               eight fills at once. A ring alone would sit directly against the
               pill's own colour - invisible on the dark tiers, muddy on the
               light ones - whereas a white hairline separates the pill from
               both its fill and the page behind it, and the ring outside that
               does the rest. Same recipe the KPI cards use for their open
               state, and for the same reason. */
            /* px-2 py-1, down from px-3 py-1.5. The count makes every pill
               about four characters wider, and eight of those is enough to push
               the row into its own scrollbar on a laptop. Taking the padding
               back buys most of that width without touching the type size,
               which is what keeps the pills legible at a glance - `tracking-wider`
               is dropped for the same reason, since letter-spacing on a
               ten-character label is pure width. */
            className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-bold tabular-nums transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 ${
              isSelected
                ? "scale-105 border border-white shadow-sm ring-2 ring-slate-900/10"
                : "opacity-90 hover:opacity-100"
            }`}
            /* Ink comes from BUCKET_COLOR, where it was chosen next to each
               fill - all eight pairings clear AA. A `text-white` rule written
               here would be a second opinion about the same eight colours. */
            style={{ background: c.fill, color: c.ink }}
          >
            {b.id}d
            {/* Slightly recessed, and NOT a separate colour: the eight fills
                each carry their own ink (BUCKET_COLOR), chosen against that
                fill, so a fixed colour here would fail on half of them. Opacity
                rides whatever ink the pill already has and stays legible on all
                eight. */}
            <span className="opacity-75">({counts[b.id]})</span>
          </button>
        );
      })}
    </div>
  );
}

/** Column track shared by the header and every lane - one constant so the two
 *  can never drift out of alignment. */
const LANE_COLUMNS = "minmax(0, 210px) 58px 1fr 40px 18px";

/** A plain, non-sortable caption - the bar track has no single value to
 *  order by, so it gets the type treatment without the arrows. */
function ColumnCap({ label, align }: { label: string; align: "left" | "center" | "right" }) {
  return (
    <span
      className={`block py-3 text-sm font-extrabold uppercase tracking-wider text-slate-900 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
    >
      {label}
    </span>
  );
}

/** A sortable caption. Both arrows are always drawn, dimmed until this column
 *  is the sorted one - an indicator that appears only on the active column
 *  gives no hint the others sort at all. */
function SortCap({
  label,
  sortKey,
  mode,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortMode;
  mode: SortMode;
  dir: SortDir;
  onSort: (k: SortMode) => void;
  align: "left" | "center" | "right";
}) {
  const active = mode === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}`}
      className={`group flex w-full cursor-pointer select-none items-center gap-1.5 py-3 text-sm font-extrabold uppercase tracking-wider transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)] ${
        align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
      } ${active ? "text-red-600" : "text-slate-900"}`}
    >
      {label}
      {!active ? (
        <ChevronsUpDown className="size-4 shrink-0 text-slate-500 transition-colors group-hover:text-red-600" strokeWidth={2.4} aria-hidden />
      ) : dir === "asc" ? (
        <ChevronUp className="size-4 shrink-0 text-red-600" strokeWidth={2.8} aria-hidden />
      ) : (
        <ChevronDown className="size-4 shrink-0 text-red-600" strokeWidth={2.8} aria-hidden />
      )}
    </button>
  );
}


/**
 * The sortable column caps for the lane list.
 *
 * Rendered once, directly above the rows it labels - a header only aligns over
 * the grid track it sits on, which is the constraint that ruled out the
 * side-by-side split this replaced (see ONE LIST, THREE VIEWS above).
 */

function LaneSortRow({
  sortMode,
  sortDir,
  onSort,
}: {
  sortMode: SortMode;
  sortDir: SortDir;
  onSort: (k: SortMode) => void;
}) {
  return (
    <div
      className="mb-2 grid items-center gap-3 border-b border-hairline px-3 pb-2 pt-2 max-md:hidden"
      style={{ gridTemplateColumns: LANE_COLUMNS }}
    >
      <SortCap label="Employee" sortKey="employee" mode={sortMode} dir={sortDir} onSort={onSort} align="left" />
      <SortCap label="Risk" sortKey="risk" mode={sortMode} dir={sortDir} onSort={onSort} align="center" />
      <span className="min-w-0">
        <ColumnCap label="Pending by age (← oldest)" align="left" />
      </span>
      <SortCap label="Total" sortKey="total" mode={sortMode} dir={sortDir} onSort={onSort} align="right" />
      <span aria-hidden />
    </div>
  );
}

/**
 * One employee's row: avatar, risk chip, and the heat bar of their pending work
 * split across age tiers. `maxTotal` is the board-wide busiest total, passed in
 * rather than derived here so every lane shares one scale.
 */
function Lane({
  row,
  maxTotal,
  index,
  employeeTasks,
  avatarUrl,
  onDrill,
}: {
  row: AgingRow & { risk: number };
  maxTotal: number;
  index: number;
  employeeTasks: Record<string, HeatmapCellTask[]>;
  avatarUrl?: string | null;
  onDrill: (employeeId: string | null, bucketId: AgeBucketId | null) => void;
}) {
  const router = useRouter();
  const lengthPct = (row.total / maxTotal) * 100;
  const target = `/tasks?emp=${row.employeeId}` as Route;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${row.employeeName}'s aging tasks (risk ${row.risk}, ${row.total} pending)`}
      onClick={() => onDrill(row.employeeId, null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDrill(row.employeeId, null);
        }
      }}
      // 56px, up from 44px: the heat bar inside is now 26px rather than 16px,
      // and 44px would have left it 9px of air top and bottom - a bar wearing
      // the row rather than sitting in it. The lanes are separated by space-y-4
      // now instead of a hairline rule, so the row carries no border of its own.
      //
      // Tier-3 mobile fix - at 390px the desktop grid overflows the section, so
      // `aging-lane-mobile` (globals.css) collapses it to 2 stacked rows on
      // max-md, where the height has to go back to auto.
      className="aging-lane aging-lane-mobile grid h-[56px] items-center gap-3 rounded-xl px-3 transition-colors hover:bg-slate-50 max-md:h-auto max-md:gap-2 max-md:px-2 max-md:py-2"
      style={{
        gridTemplateColumns: LANE_COLUMNS,
        opacity: 0,
        // Tightened from `index * 50 + 200`: at 12 lanes the old stagger took
        // 0.8s to finish, which reads as the section loading slowly.
        animation: `fadeUp 320ms ease-out ${index * 16 + 120}ms forwards`,
        cursor: "pointer",
      }}
    >
      {/* Employee - avatar + name */}
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={row.employeeName} avatarUrl={avatarUrl ?? null} size={26} />
        <span
          className="text-ink-strong truncate font-semibold"
          style={{ fontSize: 13.5 }}
        >
          {row.employeeName}
        </span>
      </div>

      {/* Risk score */}
      <RiskChip row={row} />

      {/* Heat bar. Segments are flush (no per-segment radius) and the container
          clips them, so the eight tiers read as one continuous measure rather
          than eight little pills.
          26px outer (h-6 plus the hairline top and bottom), up from 16px: at
          the old height the tier colours were a stripe, and a count sitting in
          one was squeezed against the seams. rounded-lg rather than a pill -
          at this thickness a full radius eats the first and last segment. */}
      <div
        className="relative overflow-hidden rounded-lg bg-slate-100"
        style={{
          // h-7. `rounded-full` is what the brief asks for and is deliberately
          // NOT used: the note above is a finding from an earlier pass - at this
          // thickness a pill radius clips the first and last tier's colour, and
          // 28px is not tall enough to change that.
          height: 28,
          border: "1px solid var(--color-hairline)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{
            width: `${lengthPct}%`,
            transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {DISPLAY_BUCKETS.map((b) => {
            const v = row.buckets[b.id];
            if (v === 0) return null;
            const segPct = (v / row.total) * 100;
            return (
              <Segment
                key={b.id}
                bucketId={b.id}
                bucketLabel={b.label}
                count={v}
                widthPct={segPct}
                employeeName={row.employeeName}
                tasks={employeeTasks[b.id] ?? []}
                onOpen={() => onDrill(row.employeeId, b.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Total */}
      <span
        className="text-right tabular-nums text-ink-strong font-black"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 15,
          letterSpacing: "-0.02em",
        }}
      >
        {row.total}
      </span>

      {/* Chevron - telegraphs click target */}
      <span
        className="aging-lane-chevron inline-flex items-center justify-center"
        aria-hidden
        style={{ color: "var(--color-ink-subtle)" }}
      >
        <ChevronRight size={14} strokeWidth={2.4} />
      </span>
    </div>
  );
}

/**
 * Risk badge - a flat tinted pill.
 *
 * The three-band red / amber / green semantic is unchanged; what went is the
 * decoration around it: the 135° gradient, the coloured drop-glow, the white
 * inner border, the 8px status dot and the 76px minimum width. At 17px inside a
 * 76px pill this was the second-largest thing in the row after the bar, for a
 * two-digit number. The tint alone carries the band.
 */
function RiskChip({ row }: { row: AgingRow & { risk: number } }) {
  const score = row.risk;
  const tone = score >= 60 ? "red" : score >= 35 ? "amber" : "green";
  const palette = {
    red: { bg: "#fee2e2", fg: "#991b1b" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    green: { bg: "#d1fae5", fg: "#065f46" },
  }[tone];
  const band =
    tone === "red"
      ? { label: "Critical", cls: "bg-rose-100 text-rose-700" }
      : tone === "amber"
        ? { label: "High", cls: "bg-amber-100 text-amber-700" }
        : { label: "Low", cls: "bg-emerald-100 text-emerald-700" };
  const b = riskBreakdown(row);

  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="mx-auto inline-flex cursor-help items-center justify-center rounded-pill px-1.5 py-0.5 font-black tabular-nums"
            style={{
              background: palette.bg,
              color: palette.fg,
              minWidth: 34,
              fontSize: 11.5,
              letterSpacing: "-0.01em",
            }}
          >
            {score}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            collisionPadding={12}
            /* LIGHT CARD. This was navy (bg-slate-900) with white type - the
               only dark surface left on a dashboard that is otherwise white
               cards on a white page, so it read as a different application's
               popover. Every colour below is the same information at the same
               hierarchy, restated for a light ground: the two-tier contrast the
               dark card got from slate-300 against white is now slate-700
               against slate-900. */
            className="z-[90] w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-700 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
                Aging Risk Index
              </span>
              <span className={`rounded px-2 py-0.5 text-[11px] font-black ${band.cls}`}>
                {band.label} · {score} / 100
              </span>
            </div>

            <p className="mb-2 text-[11px] leading-relaxed text-slate-700">
              The AVERAGE age-weight of this person&apos;s pending work - not how much of
              it there is. One task sitting 60+ days outranks fifteen fresh ones.
            </p>

            {b.total === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                Nothing pending.
              </p>
            ) : (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px]">
                {b.rows.map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 text-slate-700">
                    <span className="truncate">{r.label}</span>
                    <span className="shrink-0 font-bold text-slate-900">
                      {r.count} × {r.weight} = {r.points}
                    </span>
                  </div>
                ))}
                {/* The two lines that make the number reconcile. Without them a
                    reader sums the weights above and gets a different answer
                    from the badge. */}
                <div className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-1 text-slate-700">
                  <span>Weighted total</span>
                  <span className="font-bold text-slate-900">{b.weighted}</span>
                </div>
                <div className="flex justify-between gap-2 text-slate-700">
                  <span>÷ {b.total} pending</span>
                  <span className="font-bold text-slate-900">
                    {b.average.toFixed(1)} avg weight
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-slate-700">
                  <span>scaled 1–20 → 0–100</span>
                  <span className="font-bold text-slate-900">{score}</span>
                </div>
              </div>
            )}
            {/* The arrow is a filled triangle with no stroke of its own, so
                it takes the CARD's fill rather than its border. Left navy it
                would be a dark spike pointing out of a white popover. */}
            <Tooltip.Arrow className="fill-white" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function Segment({
  bucketId,
  bucketLabel,
  count,
  widthPct,
  employeeName,
  tasks,
  onOpen,
}: {
  bucketId: AgeBucketId;
  bucketLabel: string;
  count: number;
  widthPct: number;
  employeeName: string;
  tasks: HeatmapCellTask[];
  /** Open the full drill-down for this employee + bucket. */
  onOpen: () => void;
}) {
  const c = BUCKET_COLOR[bucketId];
  // Threshold nudged up with the smaller type: an 11px count needs a little
  // more of the lane behind it than a 17px one did to avoid touching the seams.
  const showLabel = widthPct > 11;
  // `isCritical` lived here to drive the heatPulse animation. The animation is
  // gone; CRITICAL_BUCKETS is still used by the risk score and the risk sort.

  // Up to four, per spec - a hover preview is a glance, not the drill-down.
  const preview = tasks.slice(0, 4);

  return (
    // HOVER, not click. This was a Popover, which opens on click - and the same
    // click also fired `onOpen()`, so one press produced the preview card AND
    // the full drill-down drawer at once. Splitting them by input fixes that:
    // hover previews, click drills down. Radix tooltip content is hoverable, so
    // the rows inside stay reachable.
    <Tooltip.Provider delayDuration={100} skipDelayDuration={200}>
      <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          // Crucial: keep the segment click from bubbling up to the lane's
          // navigation handler so the drill-down opens instead of redirecting.
          onClick={(e) => {
            // Stop the lane's own handler: a segment click is MORE specific
            // (this person AND this bracket), so it must not be swallowed by
            // the row-level "all their brackets" drill-down.
            e.stopPropagation();
            onOpen();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          /* Flat fill, rounded-md, no gradient / glow / scale.
             What was removed and why:
               • the 180° gradient - adjacent tiers blurred into each other at
                 the seam, so the bar read as a wash rather than seven steps;
               • `heatPulse` on the three critical buckets - a permanently
                 animating bar is noise once more than one lane is overdue;
               • `hover:brightness-110 hover:scale-y-110` - brightening shifts
                 the tier off its own token, and scaling made rows jitter;
               • the text-shadow - unnecessary now the ink is chosen per tier,
                 and it muddied dark text on amber and sky. */
          /* `rounded-md` went with the taller bar - at 18px the radius ate the
             narrow segments, and the parent already clips the lane to a pill.
             Flush segments also make the eight tiers read as one measure. */
          /* `leading-none`: the lane's inner box is 14px and 11px text carries a
             ~13px line box by default, so the count sat off-centre against the
             segment. */
          className="aging-segment flex h-full items-center justify-center leading-none transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{
            width: `${widthPct}%`,
            // Ink comes from the tier: amber-400 and sky-400 need dark text,
            // the other five need white. A blanket `text-white` made the two
            // light tiers' counts unreadable.
            color: c.ink,
            background: c.fill,
            minWidth: 0,
            outlineColor: c.deep,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            // 12px / 700, up from 11px / 900. The taller bar can carry it,
            // and 900 at 11px was dense enough that the digits ran together.
            fontWeight: 700,
            fontSize: 12,
          }}
          aria-label={`${employeeName}, ${bucketLabel}: ${count} pending`}
        >
          {showLabel && <span className="tabular-nums">{count}</span>}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          align="center"
          sideOffset={10}
          collisionPadding={12}
          /* COMPACT. This was a 420px card with a full-bleed tier header and
             15.5px rows - a panel, not a hover. At 280px it sits over the lane
             without covering the neighbouring rows you are comparing against.
             The tier colour survives as the bucket pill rather than a band. */
          className="z-50 w-[280px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <p className="text-[11.5px] font-black leading-tight text-slate-900">
            {employeeName}
            <span className="mx-1.5 text-slate-400">·</span>
            <span
              className="rounded-pill px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: c.fill, color: c.ink }}
            >
              {bucketLabel}
            </span>
            <span className="ml-1.5 tabular-nums text-slate-500">
              ({count} {count === 1 ? "Task" : "Tasks"})
            </span>
          </p>

          <ul className="mt-2 flex flex-col gap-1">
            {preview.length === 0 && (
              <li className="py-2 text-[11.5px] font-semibold text-slate-500">No tasks.</li>
            )}
            {preview.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}` as Route}
                  className="block rounded-lg border border-slate-100 p-2 transition-colors hover:bg-slate-50"
                >
                  {/* DESCRIPTION, not `title`. `title` in this schema is the
                      CLIENT NAME, so this list used to read "Altus Corp / AA
                      Tech / JMT Drive Solutions" - three rows that say nothing
                      about the work. */}
                  <span className="block line-clamp-2 break-words text-xs font-semibold leading-snug text-slate-900">
                    {t.description?.trim() || "No description provided"}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        t.priority === "imp_urgent"
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-slate-500">
                      {t.ageDays}d
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {tasks.length > preview.length && (
            <p className="mt-2 text-[10.5px] font-semibold text-slate-500">
              +{tasks.length - preview.length} more - click the segment to see all
            </p>
          )}
          <Tooltip.Arrow style={{ fill: "#ffffff" }} width={14} height={7} />
        </Tooltip.Content>
      </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
