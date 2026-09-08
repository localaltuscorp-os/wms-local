"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  statusCardTokens,
  type StatusCardKey,
} from "@/lib/status-palette";
import { ArrowUpRight } from "lucide-react";
import type { NeonKey } from "./kpi-card";
import { KpiDetailPanel } from "./kpi-detail-panel";
import type { KpiSet, WmsSummary } from "@/lib/types";
import type { KpiBucketKey } from "@/lib/dashboard/kpi-buckets";
import { setKpiFocus } from "@/lib/client/kpi-focus";
import { formatTrendPct } from "./kpi-trend-badge";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";
import { CollapseToggle, CollapsibleBody } from "./section-chrome";
import { DashboardSectionHeader } from "./section-header";

interface Entry {
  /** Also the key the rest of the dashboard focuses on — see lib/client/kpi-focus. */
  key: KpiBucketKey & keyof KpiSet;
  label: string;
  sublabel: string;
  neonKey: NeonKey;
  href: Route;
  /** Which entry in the shared status palette paints this card. A KEY, not a
   *  colour: the hex lives in lib/status-palette.ts so this strip and the
   *  Status Distribution tiles cannot drift apart again. */
  /** Narrowed from StatusColorKey to the six keys that HAVE a card. The wider
   *  type let an entry name a status with no container tokens, which would only
   *  have surfaced as an undefined class string at runtime. */
  color: StatusCardKey;
}

// One compact card per KPI, in a single row. The first (Total) reads as the
// anchor; the rest follow in the operational reading order.
//
// NEED INFO / NOT APPROVED WERE INVERTED HERE. This strip painted Need Info
// bright red (red-600) and Not Approved dark red (red-900); the Status
// Distribution tiles on the same screen painted them the other way round. Both
// now read `needInfo` and `notApproved` from the palette, so the pair can only
// ever be one way round.
const ITEMS: Entry[] = [
  { key: "total", label: "Total", sublabel: "All Tasks", neonKey: "total", href: "/tasks", color: "total" },
  { key: "needHelp", label: "Need Info", sublabel: "Awaiting info", neonKey: "need-help", href: "/tasks?status=need_info", color: "needInfo" },
  { key: "notApproved", label: "Not Approved", sublabel: "Sent Back", neonKey: "not-approved", href: "/tasks?status=not_approved", color: "notApproved" },
  { key: "done", label: "Done", sublabel: "Done + Approved", neonKey: "done", href: "/tasks?status=done,approved", color: "done" },
  { key: "pending", label: "Pending", sublabel: "In Progress", neonKey: "pending", href: "/tasks?status=initiated,follow_up", color: "pending" },
  { key: "notStarted", label: "Not Started", sublabel: "Awaiting Pickup", neonKey: "not-started", href: "/tasks?status=not_started", color: "notStarted" },
];

/**
 * ALWAYS "vs last week" now, and the parameter is gone with the wording it used
 * to vary.
 *
 * The label used to be derived from the selected date range on the premise that
 * the delta compared the range against the same number of days before it. It
 * never did: the comparison was hardcoded to 7 days against 7 days in
 * lib/queries/dashboard.ts, so on the default 31-day filter the card read
 * "vs last 31 days" beside a week-over-week figure. The measurement is the
 * honest half of that pair, so the label was corrected to match it rather than
 * the other way round.
 */
const VS_LABEL = "vs last week";

export function KpiStrip({
  kpis,
  summary,
  summaryByKpi,
}: {
  kpis: KpiSet;
  /** The operational summary for the whole filter — the `total` card's. */
  summary: WmsSummary;
  /** One summary per card, so expanding a card re-reads Overdue / Due Today /
   *  Avg Age against THAT status subset. Optional so a stale Data Cache entry
   *  shaped by the previous deploy degrades to the shared summary instead of
   *  throwing during render (the lesson from `sentBack`, see the cache-key note
   *  in lib/queries/dashboard.ts). */
  summaryByKpi?: Partial<Record<KpiBucketKey, WmsSummary>>;
}) {
  const vsLabel = VS_LABEL;
  const [expanded, setExpanded] = React.useState<keyof KpiSet | null>(null);
  // Whole-panel maximize/minimize. Open by default: minimized now hides the
  // cards ENTIRELY (it used to just drop to three compact ones), so defaulting
  // to closed would land the user on a dashboard with an empty summary bar.
  const [isKpiExpanded, setIsKpiExpanded] = React.useState(true);

  // FilterBar section search — narrows which summary cards are shown, matched
  // on the card's label and its sublabel ("Not Approved" / "Sent Back"). With
  // no match the strip renders nothing rather than an empty grid frame.
  const sectionQuery = useSectionSearch();
  const items = React.useMemo(
    () =>
      sectionQuery
        ? ITEMS.filter((i) => matchesSearch(sectionQuery, i.label, i.sublabel))
        : ITEMS,
    [sectionQuery],
  );

  // The FilterBar's section search can hide the very card that is expanded.
  // Clear the page-wide focus when that happens — and on unmount — so the
  // widgets below are never left filtered by a card the reader can no longer
  // see (and no way to switch it off).
  const focusVisible = expanded != null && items.some((i) => i.key === expanded);
  React.useEffect(() => {
    if (!focusVisible) setKpiFocus(null);
  }, [focusVisible]);
  React.useEffect(() => () => setKpiFocus(null), []);

  if (items.length === 0) return null;

  // Minimized hides the cards outright, so the whole set is always what WOULD
  // be shown. Folding the section must not change the number in the header;
  // that count is the one thing the collapsed bar still reports.
  const shown = items;
  // THE TOTAL CARD, not a sum over the cards. This line used to add all six
  // `current` values together — but Total already IS the sum of the other five,
  // so "N tasks in the current filter" reported exactly twice the real figure
  // while the Total card two lines below showed the right one.
  const headline = kpis.total.current;

  // Resolved against SHOWN, not all items: a card hidden by the search must not
  // leave its detail panel stranded below the strip with no card to point at.
  const active = expanded ? shown.find((i) => i.key === expanded) ?? null : null;

  return (
    <section className="mt-10" aria-label="Task summary">
     <PageShell as="div" width="full" py={false}>
      {/* Section header — the same block every dashboard widget uses. It was
          already outside the cards here; this just puts it on the shared
          typography so it reads as a peer of the headings below. */}
      <DashboardSectionHeader
        title="Task Summary"
        subtitle={
          <>
            <span className="font-semibold tabular-nums">
              {headline.toLocaleString()}
            </span>{" "}
            {headline === 1 ? "task" : "tasks"} in the current filter
          </>
        }
        /* Overview/Performance switcher, then collapse. The pills used to live
           on a "TEAM ANALYTICS · Insights" masthead of their own further down
           the page; that was a second header saying little the pills did not,
           so the control moved up here and the masthead was deleted. The fold
           control stays rightmost, as it is everywhere else.

           The red + that also used to sit here moved to the global top bar
           (<NewTaskQuickAction>, left of the notification bell): creating a task
           is an app-wide action, but here it was reachable from one section of
           one page and disappeared with the section whenever the summary was
           folded away. */
        actions={
          <>
            {/* The Overview | Performance switcher lived here. It is gone: the
                dashboard is one continuous page now, navigated by the section
                pill bar below the KPI cards rather than by swapping panels. */}
            <CollapseToggle
              expanded={isKpiExpanded}
              onToggle={() => setIsKpiExpanded((v) => !v)}
              label="the Task summary"
            />
          </>
        }
      />

      {/* Everything below the header line folds together: the KPI cards, any
          open card-detail panel, and the Task Analytics banner passed in as
          children. Collapsed, only the "Tasks <n>" line and the toggle remain. */}
      <CollapsibleBody expanded={isKpiExpanded}>
      {/* 14px between tiles. NOT the 10-12px the brief named: the grid was
          already at 0.7rem = 11.2px, so gap-2.5 (10px) would have TIGHTENED it
          and gap-3 (12px) would have moved it 0.8px. The gap reads smaller than
          it measures now that the cards are solid blocks of colour — 11px of
          near-white between two saturated tiles carries less visual separation
          than the same 11px did between two white outlined boxes, because the
          old cards had their own hairline border doing part of the work.
          `min` stays 165px, so auto-fit still reflows 6 -> 4 -> 3 -> 2 -> 1 and
          the tiles keep sharing the row width at 1fr each. */}
      <CardGrid min={165} gap="0.875rem">
        {shown.map((item) => {
          const kpi = kpis[item.key];
          // 7 days vs the 7 before, as a PERCENTAGE. See formatTrendPct for
          // what this replaced and why the old figure was meaningless.
          const trend = formatTrendPct(kpi);
          // SHARE OF TOTAL — a different measure from the trend beside it, and
          // deliberately labelled so. The badge is period-over-period CHANGE;
          // this is what fraction of the current workload this bucket is. They
          // were the two things the brief noted get confused, so the card shows
          // them as two separated figures rather than one ambiguous percentage.
          //
          // Only on cards that are a genuine PART of the total. Total itself is
          // always 100% of itself, which is not information.
          const share =
            item.key !== "total" && kpis.total.current > 0
              ? Math.round((kpi.current / kpis.total.current) * 100)
              : null;
          const isOpen = expanded === item.key;
          // Fill, border, type and badge for THIS card, resolved together.
          const t = statusCardTokens(item.color);
          // The --kpi-neon-* / --kpi-soft-* tokens no longer drive the card: they
          // existed to tint a white surface (accent rail, border, badge fill),
          // and the surface is now the status colour itself. KpiDetailPanel below
          // still resolves them from `active.neonKey` for the expanded panel.

          return (
            <div key={item.key}>
              {/* A SOFT TINTED CONTAINER, not a saturated block.
                  Six full-bleed status fills in a row were the loudest thing on
                  a page whose content is the tables below them, and the
                  white-on-mid-tone type was scraping the AA floor on three of
                  the six (see the contrast notes in status-palette.ts). A pale
                  tint with same-hue dark type reads as the same family, states
                  the number more clearly, and puts contrast out of reach.

                  Tailwind classes now, so the fill and its border come from one
                  token bundle rather than an inline gradient plus a separate ink
                  lookup that had to be kept in step by hand. */}
              <div
                className={`group relative h-full overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md ${t.shell} ${
                  isOpen ? `ring-2 ring-inset ${t.ring}` : ""
                }`}
              >
                <div>
                 <div className="flex items-start justify-between gap-1.5">
                  <Link
                    href={item.href}
                    className="group/link min-w-0 flex-1 outline-none"
                    aria-label={`${item.label} - view tasks`}
                  >
                    {/* minHeight survives the class rewrite: it is what keeps a
                        wrapping label ("NOT APPROVED") from pushing its number
                        down a line while its neighbours' numbers stay put. */}
                    {/* minHeight survives the class rewrite: it is what keeps a
                        wrapping label ("NOT APPROVED") from pushing its number
                        down a line while its neighbours' numbers stay put. */}
                    <span
                      className="flex items-start gap-1 text-[11px] font-semibold uppercase tracking-wider leading-[1.15] opacity-80"
                      style={{ minHeight: 24 }}
                    >
                      <span className="min-w-0">{item.label}</span>
                      <ArrowUpRight
                        size={13}
                        strokeWidth={3}
                        className="mt-px shrink-0 opacity-0 -translate-x-0.5 transition-all group-hover/link:opacity-100 group-hover/link:translate-x-0"
                      />
                    </span>
                    <span className="mt-2 block text-3xl font-bold tracking-tight tabular-nums leading-none">
                      {kpi.current.toLocaleString()}
                    </span>
                  </Link>

                  {/* View ⇄ Hide toggle for this card's KpiDetailPanel. The label
                      tracks the open state, backed by the fill flipping to solid
                      and by aria-expanded. "View"/"Hide" are both 4 characters, so
                      the pill's width never jumps as it toggles. */}
                  <button
                    type="button"
                    // VIEW does two things: opens this card's detail panel, and
                    // focuses the REST of the dashboard on the same status
                    // subset (lib/client/kpi-focus). HIDE clears both. The store
                    // write sits here rather than in an effect so the two can
                    // never disagree about which card is open.
                    onClick={() =>
                      setExpanded((cur) => {
                        const next = cur === item.key ? null : item.key;
                        setKpiFocus(next);
                        return next;
                      })
                    }
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Hide ${item.label} details` : `View ${item.label} details`}
                    // A SOLID same-hue chip, one step up from the card's own
                    // tint. The old translucent scrim existed to sit on a
                    // saturated fill; on a `-50` tint it is invisible, so the
                    // badge takes `-100` with `-700` type and the open state
                    // steps to `-200`/`-900`.
                    className={`inline-flex shrink-0 items-center justify-center rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] ${
                      isOpen ? t.badgeActive : t.badge
                    }`}
                  >
                    {isOpen ? "Hide" : "View"}
                  </button>
                 </div>

                  {/* Comparison line. Its OWN full-width row, deliberately not
                      inside the <Link> above. In that column it shared the row
                      with the View pill and had ~85px of a 165px card, so
                      "vs last 2 weeks" wrapped and the card's overflow-hidden
                      clipped it to a bare "vs last". Full width plus
                      `whitespace-nowrap` keeps arrow + number + label on one
                      line; the label is a step smaller than the number so the
                      longest wording still clears the narrowest card. No inner
                      collapse any more — the card only exists when the whole
                      section is expanded. */}
                  {/* NOTE: the up/down colour is gone. This line used to be
                      green when the number rose and red when it fell, which
                      cannot survive on a red or emerald card — the delta would
                      either vanish into the fill or fight it. Direction now
                      rides entirely on the ▲/▼/→ glyph. */}
                  <span
                    className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs font-medium tabular-nums opacity-90"
                    title={trend.title}
                  >
                    <span>
                      {trend.arrow} {trend.text}
                    </span>
                    <span>{vsLabel}</span>
                    {/* Shown only on DONE. Every card could carry a share, but
                        six of them on one strip is six numbers competing with
                        the six counts above them — and "what proportion is
                        finished" is the one a reader actually asks. */}
                    {item.key === "done" && share !== null && (
                      <span className="opacity-75">· {share}% of total</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </CardGrid>

      {/* Single per-card detail panel — animates open via the 0fr→1fr grid trick. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: active ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {active && (
            <div className="pt-4">
              <KpiDetailPanel
                label={active.label}
                sublabel={active.sublabel}
                value={kpis[active.key].current}
                kpi={kpis[active.key]}
                summary={summaryByKpi?.[active.key] ?? summary}
                neon={`var(--kpi-neon-${active.neonKey})`}
                neonDeep={`var(--kpi-neon-${active.neonKey}-deep)`}
                vsLabel={vsLabel}
              />
            </div>
          )}
        </div>
      </div>

      {/* The Task Analytics banner used to be slotted in here by the dashboard
          page. It is gone, and the slot with it — an empty `{children}` left a
          prop that nothing filled and invited the next person to refill it. */}
      </CollapsibleBody>
     </PageShell>
    </section>
  );
}
