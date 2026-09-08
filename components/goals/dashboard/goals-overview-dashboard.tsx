"use client";

/**
 * GOALS DASHBOARD — the whole cascade on one page, one section per level.
 *
 * The module's other dashboard (components/goals/board/goals-dashboard.tsx) is
 * a TAB on a level board and only ever sees that board's level. This page gives
 * each level its own section — Yearly · Quarterly · Monthly · Weekly · Daily —
 * under a frozen filter band and a pill nav that jumps between them, the same
 * shape as the WMS dashboard.
 *
 * EVERY number is a client-side projection over the payload the page loaded —
 * no fetching here. The health maths is `classify()` from the board's own
 * dashboard-model, so a goal reading "At risk" here reads "At risk" on its
 * level board too; re-deriving bands locally is exactly how two dashboards
 * start disagreeing about the same goal.
 */

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Target,
  Trophy,
  CalendarRange,
  CalendarCheck,
  CalendarDays,
  Gauge,
  AlertTriangle,
  ArrowLeftRight,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { SectionIcon, type SectionIconTone } from "@/components/dashboard/section-icon";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD_PADDED,
  DASHBOARD_TABLE_HEAD,
  SECTION_CONTROL,
} from "@/components/dashboard/section-chrome";
import { DashboardSectionNav } from "@/components/dashboard/section-nav";
/* THE SHARE PAIR, borrowed from the WMS dashboard rather than rebuilt.
   Every section there carries WhatsApp + Email; this page carried neither, so
   the only way to send anyone a goals read was a screenshot. The control is
   already generic — it takes a thunk returning a SectionReport and owns the
   recipient picker, the PDF build and the two send flows — so what this page
   needs to supply is the report, not the plumbing. */
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";
import {
  classify,
  BAND_META,
  BAND_ORDER,
  type DisplayBand,
  type Row,
  DISPLAY,
} from "@/components/goals/board/dashboard-model";
import { periodBounds } from "@/lib/goals/derive";
import { fyLabel, periodKeyLabel, type GoalDTO } from "@/components/goals/cascade/util";
import { GoalsDashboardFilters } from "./goals-dashboard-filters";
import type { GoalsDashboardData, DailyDay } from "@/app/(app)/goals/dashboard/data";

/**
 * The pill bar's sections, in the page's own top-to-bottom order.
 *
 * A bar whose sequence disagrees with the scroll it drives reads as broken even
 * when every link works, so this list and the JSX below have to stay in step.
 * `DashboardSectionNav` drops any id that is not on the page at mount, so a
 * section hidden by a filter never leaves a pill pointing at nothing.
 */
export const GOALS_DASHBOARD_SECTIONS = [
  { id: "goals-overview", label: "Overview" },
  { id: "yearly-goals", label: "Yearly Goals" },
  { id: "quarterly-goals", label: "Quarterly Goals" },
  { id: "monthly-goals", label: "Monthly Goals" },
  { id: "weekly-goals", label: "Weekly Goals" },
  { id: "daily-commitments", label: "Daily Commitments" },
  { id: "needs-attention", label: "Needs Attention" },
] as const;

/* ── The four goal levels. Daily is not here: commitments live in
      `daily_checklist`, carry no pace expectation and get their own section. ── */
const LEVELS = [
  {
    key: "year",
    id: "yearly-goals",
    label: "Yearly Goals",
    href: "/goals/yearly",
    Icon: Trophy,
    tone: "amber" as SectionIconTone,
    color: "#8a3d06",
    blurb: "The financial year's objectives — everything below cascades from these.",
  },
  {
    key: "quarter",
    id: "quarterly-goals",
    label: "Quarterly Goals",
    href: "/goals/quarterly",
    Icon: Target,
    tone: "red" as SectionIconTone,
    color: "var(--color-altus-red)",
    blurb: "Each quarter's share of the year, and how far through it the work is.",
  },
  {
    key: "month",
    id: "monthly-goals",
    label: "Monthly Goals",
    href: "/goals/monthly",
    Icon: CalendarRange,
    tone: "violet" as SectionIconTone,
    color: "#5b21b6",
    blurb: "The month-by-month breakdown that the weekly plan is drawn from.",
  },
  {
    key: "week",
    id: "weekly-goals",
    label: "Weekly Goals",
    href: "/goals/weekly",
    Icon: CalendarCheck,
    tone: "blue" as SectionIconTone,
    color: "#174ea6",
    blurb: "The committed week — the last level with a target before it becomes a day's work.",
  },
] as const;

const DAILY_COLOR = "#0f766e";
/** How many rows a level section lists before it caps. */
const LIST_MAX = 8;
/** How many rows the attention list shows. */
const ATTENTION_MAX = 15;

/**
 * How far off pace a row is, in words — "4d late", "+7 ahead", "12 behind".
 *
 * ONE definition, three readers: the goal row on screen, the transposed table,
 * and the WhatsApp/email report. It was inline in the row component; the moment
 * a PDF had to state the same gap, a second copy would have been the start of
 * the screen and the attachment disagreeing about the same goal.
 *
 * The GAP, not just the score. "38%" says little on its own; "31 behind" is
 * what ranks this row against the others.
 */
function paceText(row: Row): string {
  if (row.band === "overdue" && row.daysLate > 0) return `${row.daysLate}d late`;
  return row.h.delta >= 0
    ? `+${Math.round(row.h.delta)} ahead`
    : `${Math.abs(Math.round(row.h.delta))} behind`;
}

/**
 * The columns a goal row has, as DATA.
 *
 * Declared once because the rows are rendered in three orientations now — down
 * the page as a list, across the page when transposed, and into a PDF — and a
 * second copy of the schema is how the three drift apart. Same reasoning as
 * STATUS_COLUMNS in the WMS dashboard's Status by Doer table, which is where
 * this pattern is borrowed from.
 *
 * `tone` marks the cells that carry the band colour. Nothing here INVENTS a
 * colour: it is `BAND_META[band].color`, the same value the list rows, the
 * segmented bar and the level bars already paint with.
 */
const GOAL_COLUMNS: {
  label: string;
  get: (row: Row) => string;
  tone?: boolean;
}[] = [
  { label: "Period", get: (r) => periodKeyLabel(r.g.periodKey) },
  { label: "Area", get: (r) => r.g.area || "—" },
  { label: "Attainment", get: (r) => `${r.eff}%`, tone: true },
  { label: "Pace", get: paceText },
  { label: "Status", get: (r) => BAND_META[r.band].label, tone: true },
];

export function GoalsOverviewDashboard({
  data,
  nowIso,
}: {
  data: GoalsDashboardData;
  nowIso: string;
}) {
  /* The clock arrives as a string and is rebuilt once. Pace is a function of
     "now", so every band on this page must be measured against the SAME
     instant — the server's — or a goal could sit in one band in the HTML and
     another after hydration. */
  const now = React.useMemo(() => new Date(nowIso), [nowIso]);

  const fyRange = React.useMemo(
    () => ({ from: `${data.fyStartYear}-04-01`, to: `${data.fyStartYear + 1}-03-31` }),
    [data.fyStartYear],
  );

  /* Every goal analysed once, then filtered by the date range.

     THE RANGE TEST IS AN OVERLAP, not containment. A goal belongs to a period,
     not to a day: a yearly goal spans the whole FY, so asking "is it inside
     1–30 June" would exclude every goal above weekly and leave the top three
     sections permanently empty on any narrowed range. Overlap answers the
     question people actually mean — "what was in play during this window". */
  const rows = React.useMemo<Row[]>(() => {
    const all: GoalDTO[] = [...data.goals, ...data.weekCards];
    const childCount = new Map<string, number>();
    for (const g of all) {
      if (!g.parentGoalId) continue;
      childCount.set(g.parentGoalId, (childCount.get(g.parentGoalId) ?? 0) + 1);
    }
    const from = new Date(`${data.range.from}T00:00:00`).getTime();
    // End of the closing day, not its midnight — otherwise a range ending on
    // the day a weekly goal starts would miss it by 24 hours.
    const to = new Date(`${data.range.to}T23:59:59`).getTime();
    const full = data.range.from === fyRange.from && data.range.to === fyRange.to;

    return all
      .filter((g) => {
        if (full) return true;
        const b = periodBounds(g.periodKey);
        return b.start.getTime() <= to && b.end.getTime() >= from;
      })
      .map((g) => classify(g, now, childCount.get(g.id) ?? 0));
  }, [data.goals, data.weekCards, data.range, fyRange, now]);

  const byLevel = React.useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const list = m.get(r.g.period);
      if (list) list.push(r);
      else m.set(r.g.period, [r]);
    }
    return m;
  }, [rows]);

  const totals = React.useMemo(() => summarise(rows), [rows]);
  const daily = React.useMemo(() => summariseDaily(data.daily), [data.daily]);

  /* Worst first: overdue, then spillover, then at-risk, and within a band by
     how far behind pace. This is a to-do list, so the ordering IS the
     recommendation. */
  const needsAttention = React.useMemo(
    () =>
      rows
        .filter((r) => r.band === "overdue" || r.band === "at-risk" || r.band === "spillover")
        .sort(
          (a, b) => BAND_ORDER.indexOf(b.band) - BAND_ORDER.indexOf(a.band) || a.h.delta - b.h.delta,
        ),
    [rows],
  );

  /* Names the scope honestly. "All employees" is the default and has to read
     as one, not as a headcount that looks like a filter someone applied. */
  const scopeLabel =
    data.selectedEmployeeIds.length >= data.roster.length
      ? `All employees (${data.roster.length})`
      : data.selectedEmployeeIds.length > 1
        ? `${data.selectedEmployeeIds.length} people`
        : data.viewedName;

  /* The window and the scope, as every report's `meta` states them. Shared so
     a recipient can tell what a PDF is OF — a goals report with no date range
     and no named scope is a page of numbers about nothing in particular. */
  const reportMeta = React.useMemo(
    () => [
      { label: "FY", value: fyLabel(data.fyStartYear) },
      { label: "Window", value: `${data.range.from} → ${data.range.to}` },
      { label: "Scope", value: scopeLabel },
    ],
    [data.fyStartYear, data.range, scopeLabel],
  );

  /* OVERVIEW — the six headline figures, then the band split, as one
     measure-per-row table. The section shows KPI tiles above a segmented bar;
     both are the same numbers, and a PDF wants them in one column rather than
     as a picture of a bar. */
  const overviewReport = React.useCallback(
    (): SectionReport => ({
      title: "Goals Overview",
      subtitle: "Everything in the selected window, across all five levels",
      meta: reportMeta,
      summary: `${totals.total} ${totals.total === 1 ? "goal" : "goals"} · ${totals.weighted}% attained, pace expects ${totals.expected}%`,
      columns: [
        { label: "Measure", weight: 3, align: "left" },
        { label: "Value", weight: 1, align: "right" },
      ],
      rows: [
        ["Total goals", String(totals.total)],
        ["Done", String(totals.counts.done)],
        ["On pace", String(totals.onPace)],
        ["At risk", String(totals.atRisk)],
        ["Overdue", String(totals.counts.overdue)],
        ["Attainment (weighted)", `${totals.weighted}%`],
        ["Pace expects", `${totals.expected}%`],
        // The band split, in the bar's own order so the table reads left to
        // right the way the bar does. Zero bands included: "0 overdue" is the
        // best line this report can carry, and a table that omits it makes the
        // reader count the rows to notice.
        ...BAND_ORDER.map((b) => [BAND_META[b].label, String(totals.counts[b])]),
      ],
    }),
    [reportMeta, totals],
  );

  /* DAILY COMMITMENTS — one row per day, which is exactly what the bar strip
     draws and exactly what a table does better. */
  const dailyReport = React.useCallback(
    (): SectionReport => ({
      title: "Daily Commitments",
      subtitle: "What was committed each morning and closed out done",
      meta: reportMeta,
      summary: `${daily.done} of ${daily.planned} completed (${daily.rate}%) across ${daily.activeDays} of ${data.daily.length} days`,
      columns: [
        { label: "Date", weight: 2, align: "left" },
        { label: "Committed", weight: 1, align: "right" },
        { label: "Completed", weight: 1, align: "right" },
        { label: "Completion", weight: 1, align: "right" },
      ],
      rows: data.daily.map((d) => [
        d.ymd,
        String(d.planned),
        String(d.done),
        // "—", not "0%", on a day nobody committed anything. A 0% completion
        // rate reads as a failed day; no commitments is not a failure.
        d.planned > 0 ? `${Math.round((d.done / d.planned) * 100)}%` : "—",
      ]),
    }),
    [reportMeta, daily, data.daily],
  );

  return (
    <>
      {/* ── THE FROZEN BAND: filters, then the section pills ───────────────
          One element carrying `data-dashboard-stickybar`, because that is the
          single thing DashboardSectionNav measures to decide where a pill click
          lands a section. Two separately-pinned bars would put that sum in two
          places and they would drift the moment either row wrapped. */}
      <div
        data-dashboard-stickybar
        className="sticky sticky-below-topbar z-40 max-md:top-14"
        style={{ background: "#ffffff", borderBottom: "1px solid var(--color-hairline)" }}
      >
        <GoalsDashboardFilters
          roster={data.roster}
          selectedEmployeeIds={data.selectedEmployeeIds}
          empsMode={data.empsMode}
          viewedEmployeeId={data.viewedEmployeeId}
          myEmployeeId={data.myEmployeeId}
          range={data.range}
          fyStartYear={data.fyStartYear}
          fyRange={fyRange}
        />
        <DashboardSectionNav sections={GOALS_DASHBOARD_SECTIONS} />
      </div>

      <PageShell width="full" className="pt-6 pb-16 max-md:pt-4 max-md:pb-12">
        <header className="mb-6 flex min-w-0 items-center gap-3">
          <SectionIcon icon={Gauge} tone="red" />
          <div className="min-w-0">
            {/* `page-heading` — the same class the Tasks list and the four
                goal boards now use, so this title stops being the one that
                picked its own size (26px, stepping to 21px under md) while
                every other module page ran the shared clamp. */}
            <h1 className="page-heading truncate">Goals Dashboard</h1>
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink-subtle">
              {fyLabel(data.fyStartYear)} · {scopeLabel} · every level of the cascade in one read
            </p>
          </div>
        </header>

        {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
        <Section
          id="goals-overview"
          icon={<SectionIcon icon={Gauge} tone="red" />}
          title="Overview"
          subtitle="Everything in the selected window, across all five levels."
          label="the overview"
          report={overviewReport}
        >
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total goals" value={totals.total} tone="#334155" />
            <Kpi label="Done" value={totals.counts.done} tone={BAND_META.done.color} />
            <Kpi label="On pace" value={totals.onPace} tone={BAND_META.ahead.color} />
            <Kpi label="At risk" value={totals.atRisk} tone={BAND_META["at-risk"].color} />
            <Kpi label="Overdue" value={totals.counts.overdue} tone={BAND_META.overdue.color} />
            <Kpi
              label="Attainment"
              value={totals.weighted}
              suffix="%"
              tone="var(--color-altus-red)"
              /* WEIGHTED, not a plain average of percentages: a goal carrying
                 five times the weight of another has to move this number five
                 times as far, or the headline rewards finishing whatever
                 happens to be smallest. */
              hint={`weighted · pace expects ${totals.expected}%`}
            />
          </div>
          <BandBar rows={rows} />
        </Section>

        {/* ── ONE SECTION PER GOAL LEVEL ────────────────────────────────── */}
        {LEVELS.map((lv) => (
          <LevelSection
            key={lv.key}
            level={lv}
            rows={byLevel.get(lv.key) ?? []}
            fy={data.fyStartYear}
          />
        ))}

        {/* ── DAILY COMMITMENTS ─────────────────────────────────────────── */}
        <Section
          id="daily-commitments"
          icon={<SectionIcon icon={CalendarDays} tone="slate" />}
          title="Daily Commitments"
          subtitle={`What was committed each morning and closed out done — the last ${data.daily.length} days of the selected window.`}
          label="daily commitments"
          href={"/my-day" as Route}
          report={dailyReport}
        >
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Committed" value={daily.planned} tone="#334155" />
            <Kpi label="Completed" value={daily.done} tone={BAND_META.done.color} />
            <Kpi label="Completion" value={daily.rate} suffix="%" tone={DAILY_COLOR} />
            <Kpi
              label="Days planned"
              value={daily.activeDays}
              suffix={`/${data.daily.length}`}
              tone="#334155"
              hint="days with at least one commitment"
            />
          </div>
          <DailyStrip days={data.daily} />
        </Section>

        {/* ── NEEDS ATTENTION ───────────────────────────────────────────── */}
        <AttentionSection
          rows={needsAttention}
          totalInWindow={rows.length}
          fy={data.fyStartYear}
        />
      </PageShell>
    </>
  );
}

/* ====================================================================== */
/* Section shell                                                          */
/* ====================================================================== */

/**
 * One collapsible dashboard section, `id`'d so the pill bar can scroll to it.
 *
 * `CollapsibleBody` is the OUTERMOST element inside the section, with the card
 * inside it — collapsing has to take the section down to its header rather than
 * leaving an empty bordered strip, which is what the inverted nesting does.
 */
function Section({
  id,
  icon,
  title,
  subtitle,
  label,
  href,
  report,
  controls,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  label: string;
  /** Optional "open the real board" link in the header. */
  href?: Route;
  /**
   * What this section sends over WhatsApp or email, built at the moment the
   * button is pressed.
   *
   * A THUNK, not a value — the contract SectionDispatch already sets on the
   * WMS dashboard. A section's payload describes what it is showing right now
   * (the window selected, the rows in scope), so building it eagerly on every
   * render would be both wasteful and wrong: the snapshot has to be taken when
   * the button is pressed, not when the header last re-rendered.
   */
  report?: () => SectionReport;
  /** Section-owned controls (Transpose), placed left of the fold toggle. */
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <section id={id} className="mb-8 scroll-mt-4">
      <DashboardSectionHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        /* THE ORDER IS THE WMS DASHBOARD'S: share pair, then the section's own
           controls, then "Open board", then the fold toggle rightmost. It reads
           as arbitrary until you scroll a page of eight sections — then the two
           round icons start every toolbar at the same x and the fold control
           ends every one of them, which is the only thing that stops the header
           row looking ragged down the column. */
        actions={
          <>
            {report && <SectionDispatch report={report} />}
            {controls}
            {href && (
              <Link
                href={href}
                className="inline-flex h-8 items-center rounded-pill border border-hairline-strong px-3 text-[12px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
              >
                Open board
              </Link>
            )}
            <CollapseToggle expanded={open} onToggle={() => setOpen((v) => !v)} label={label} />
          </>
        }
      />
      <CollapsibleBody expanded={open}>
        <div className={`w-full ${DASHBOARD_CARD_PADDED}`}>{children}</div>
      </CollapsibleBody>
    </section>
  );
}

/**
 * ⇄ Transpose — lifted from the WMS dashboard's Status by Doer and Aging
 * Heatmap, where the same button flips people and statuses.
 *
 * Here it flips GOALS and their fields: the resting view lists one goal per
 * row, transposed puts each goal in a column with Period, Area, Attainment,
 * Pace and Status running down the side. That is the orientation you want when
 * the question is "how do these four compare on pace" rather than "what is on
 * this list" — reading one measure across a row beats reading it down five
 * separate cards.
 *
 * It sits beside the fold control because both change how the section is
 * SHAPED rather than what it contains — same placement, same reason, as the
 * WMS dashboard's.
 */
function TransposeButton({
  on,
  onToggle,
  noun,
}: {
  on: boolean;
  onToggle: () => void;
  /** What the rows are, for the tooltip: "goals", "flagged goals". */
  noun: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={on ? `Back to ${noun} as rows` : `Transpose: ${noun} as columns`}
      className={`${SECTION_CONTROL} ${on ? "text-altus-red" : ""}`}
    >
      <ArrowLeftRight className="size-3.5" strokeWidth={2.6} />
      Transpose
    </button>
  );
}

/**
 * The transposed view: fields down the side, one column per goal.
 *
 * ONLY the transposed orientation lives here. The upright view is the existing
 * list of `AttentionRow`s and is deliberately untouched — this control adds a
 * second way to read the same rows, it does not replace the first.
 *
 * `overflow-x-auto` on the wrapper, and the wrapper alone: past about five
 * goals this is wider than the card, and a table that widens its own card is
 * how one section starts a horizontal scrollbar on the whole page.
 */
function TransposedGoals({ rows, fy }: { rows: Row[]; fy: number }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      {/* `w-auto`, NOT `w-full`, with a stated width per column.
          A full-width table divides its slack among the columns it has, so a
          level holding one goal drew a single 1300px-wide column with four
          words in it — which reads as a rendering fault rather than as a level
          with one goal. Fixed columns mean the table is as wide as its content
          and no wider; past about seven goals it outgrows the card and the
          wrapper above scrolls it. */}
      <table className="w-auto border-collapse">
        <thead>
          <tr className="border-b border-hairline-strong">
            {/* Sticky, so the field names stay readable once the goal columns
                scroll sideways. Without it the transposed view loses its own
                row labels the moment it becomes wide enough to need scrolling —
                which is exactly when it has enough columns to be worth using. */}
            <th
              className={`sticky left-0 z-10 w-[150px] bg-surface-card px-3 py-2.5 text-left ${DASHBOARD_TABLE_HEAD}`}
            >
              Field
            </th>
            {rows.map((r) => {
              const level = LEVELS.find((l) => l.key === r.g.period);
              const href = (
                level
                  ? `${level.href}?fy=${fy}&period=${encodeURIComponent(r.g.periodKey)}`
                  : "/goals/yearly"
              ) as Route;
              return (
                <th key={r.g.id} className="w-[200px] px-3 py-2.5 text-left align-bottom">
                  {/* The goal's own band colour as a top rule on its column —
                      the same `BAND_META[band].color` the list row paints its
                      left bar with, so a goal keeps its colour in both
                      orientations. */}
                  <span
                    aria-hidden
                    className="mb-1.5 block h-1 w-full rounded-full"
                    style={{ background: BAND_META[r.band].color }}
                  />
                  <Link
                    href={href}
                    title={r.g.title}
                    className="block max-w-[180px] truncate text-[12.5px] font-bold text-ink-strong transition-colors hover:text-altus-red"
                  >
                    {r.g.title}
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {GOAL_COLUMNS.map((col) => (
            <tr key={col.label} className="border-b border-hairline last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 w-[150px] bg-surface-card px-3 py-2 text-left text-[11.5px] font-bold uppercase tracking-wider text-ink-subtle"
              >
                {col.label}
              </th>
              {rows.map((r) => (
                <td
                  key={r.g.id}
                  className="px-3 py-2 text-[12.5px] font-semibold tabular-nums"
                  /* Band colour only on the two cells that MEAN it — the
                     attainment figure and the status word. Painting every cell
                     would turn the table into five coloured stripes and say
                     nothing that the column's top rule has not already said. */
                  style={col.tone ? { color: BAND_META[r.band].color } : undefined}
                >
                  {col.get(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The rows a section sends, in the report's column order. */
function goalReportRows(rows: Row[]): string[][] {
  return rows.map((r) => [r.g.title, ...GOAL_COLUMNS.map((c) => c.get(r))]);
}

const GOAL_REPORT_COLUMNS: SectionReport["columns"] = [
  { label: "Goal", weight: 3, align: "left" },
  { label: "Period", weight: 1.4, align: "left" },
  { label: "Area", weight: 1.4, align: "left" },
  { label: "Attainment", weight: 1, align: "right" },
  { label: "Pace", weight: 1.2, align: "right" },
  { label: "Status", weight: 1.2, align: "left" },
];

function LevelSection({
  level,
  rows,
  fy,
}: {
  level: (typeof LEVELS)[number];
  rows: Row[];
  fy: number;
}) {
  const s = summarise(rows);
  const [transposed, setTransposed] = React.useState(false);
  // Worst first, so the rows worth reading are the ones on screen when the
  // list caps.
  const sorted = React.useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => BAND_ORDER.indexOf(b.band) - BAND_ORDER.indexOf(a.band) || a.h.delta - b.h.delta),
    [rows],
  );
  const listed = React.useMemo(() => sorted.slice(0, LIST_MAX), [sorted]);

  /* THE REPORT CARRIES EVERY ROW, not the eight on screen.
     The cap is a SCREEN constraint — this section is a summary above a link to
     the real board — but a PDF titled "Monthly Goals" that silently stops at
     eight has misled whoever opened it, and they have no board link to fall
     back on. The summary line says how many are in it. */
  const buildReport = React.useCallback(
    (): SectionReport => ({
      title: level.label,
      subtitle: level.blurb,
      meta: [
        { label: "FY", value: fyLabel(fy) },
        { label: "Attainment", value: `${s.weighted}%` },
        { label: "Pace expects", value: `${s.expected}%` },
      ],
      summary: `${s.total} ${s.total === 1 ? "goal" : "goals"} · ${s.counts.done} done · ${s.onPace} on pace · ${s.needsAttention} needing attention`,
      columns: GOAL_REPORT_COLUMNS,
      rows: goalReportRows(sorted),
    }),
    [level.label, level.blurb, fy, s, sorted],
  );

  return (
    <Section
      id={level.id}
      icon={<SectionIcon icon={level.Icon} tone={level.tone} />}
      title={level.label}
      subtitle={level.blurb}
      label={level.label.toLowerCase()}
      href={`${level.href}?fy=${fy}` as Route}
      report={buildReport}
      /* No Transpose on an empty level — a control that flips nothing between
         two identical empty states is a dead button, and every level section
         is empty on a narrow date range. */
      controls={
        rows.length > 0 ? (
          <TransposeButton
            on={transposed}
            onToggle={() => setTransposed((v) => !v)}
            noun="goals"
          />
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyNote>No {level.label.toLowerCase()} in this window.</EmptyNote>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Goals" value={s.total} tone="#334155" />
            <Kpi label="Done" value={s.counts.done} tone={BAND_META.done.color} />
            <Kpi label="On pace" value={s.onPace} tone={BAND_META.ahead.color} />
            <Kpi label="Needs attention" value={s.needsAttention} tone={BAND_META["at-risk"].color} />
            <Kpi
              label="Attainment"
              value={s.weighted}
              suffix="%"
              tone={level.color}
              hint={`pace expects ${s.expected}%`}
            />
          </div>

          {/* Attainment against the pace marker. The bar says how far along the
              work is; the notch says how far along it OUGHT to be, which is the
              only thing that makes a percentage good or bad. */}
          <div className="mb-5">
            <span className="relative block h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${s.weighted}%`, background: level.color }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-ink-strong/50"
                style={{ left: `${s.expected}%` }}
              />
            </span>
            <span className="mt-1.5 block text-[11.5px] font-semibold text-ink-subtle">
              The line marks where pace expects this level to be today.
            </span>
          </div>

          <BandBar rows={rows} />

          {transposed ? (
            /* Transposed shows EVERY goal, not the capped eight. The cap exists
               because eight stacked rows is as much vertical space as a summary
               section should take; sideways they cost width, which this view
               already scrolls. */
            <div className="mt-5">
              <TransposedGoals rows={sorted} fy={fy} />
            </div>
          ) : (
            <>
              <ul className="mt-5 flex flex-col gap-1.5">
                {listed.map((r) => (
                  <AttentionRow key={r.g.id} row={r} fy={fy} />
                ))}
              </ul>
              {rows.length > LIST_MAX && (
                <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
                  Showing {LIST_MAX} of {rows.length} — transpose, or open the board, for the rest.
                </p>
              )}
            </>
          )}
        </>
      )}
    </Section>
  );
}

/**
 * NEEDS ATTENTION — everything overdue, at risk or carried over, worst first.
 *
 * Its own component now, where it used to be inline in the page. It needs the
 * same three things every other section has — a transpose state, a report
 * thunk, and a cap it is honest about — and a section that owns state cannot
 * live inside the parent's render without lifting that state to the page.
 */
function AttentionSection({
  rows,
  totalInWindow,
  fy,
}: {
  rows: Row[];
  /** Every goal in the window, not just the flagged ones — the empty state has
   *  to tell "nothing is behind" apart from "nothing is here". */
  totalInWindow: number;
  fy: number;
}) {
  const [transposed, setTransposed] = React.useState(false);

  const buildReport = React.useCallback(
    (): SectionReport => ({
      title: "Needs Attention",
      subtitle: "Overdue, at risk, or carried over and still open — worst first",
      meta: [
        { label: "FY", value: fyLabel(fy) },
        { label: "Flagged", value: `${rows.length} of ${totalInWindow}` },
      ],
      summary:
        rows.length === 0
          ? "Nothing behind pace in this window."
          : `${rows.length} ${rows.length === 1 ? "goal" : "goals"} behind pace, worst first`,
      columns: GOAL_REPORT_COLUMNS,
      // Every flagged goal, not the 15 on screen — see the note on the level
      // sections' report.
      rows: goalReportRows(rows),
    }),
    [rows, totalInWindow, fy],
  );

  return (
    <Section
      id="needs-attention"
      icon={<SectionIcon icon={AlertTriangle} tone="red" />}
      title="Needs Attention"
      subtitle="Overdue, at risk, or carried over and still open — worst first."
      label="the attention list"
      report={buildReport}
      controls={
        rows.length > 0 ? (
          <TransposeButton
            on={transposed}
            onToggle={() => setTransposed((v) => !v)}
            noun="flagged goals"
          />
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyNote>
          {totalInWindow === 0
            ? "No goals in this window."
            : "Nothing behind pace. Every goal is on track or done."}
        </EmptyNote>
      ) : transposed ? (
        <TransposedGoals rows={rows} fy={fy} />
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {rows.slice(0, ATTENTION_MAX).map((r) => (
              <AttentionRow key={r.g.id} row={r} fy={fy} />
            ))}
          </ul>
          {/* Says what was cut. A list silently capped reads as "these are
              all of them", which is the one thing it is not. */}
          {rows.length > ATTENTION_MAX && (
            <p className="mt-3 text-[12px] font-semibold text-ink-subtle">
              Showing the {ATTENTION_MAX} worst of {rows.length}.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

/* ====================================================================== */
/* Aggregation                                                            */
/* ====================================================================== */

interface Summary {
  total: number;
  counts: Record<DisplayBand, number>;
  weighted: number;
  expected: number;
  onPace: number;
  atRisk: number;
  needsAttention: number;
}

/**
 * Band counts plus weighted attainment for a set of rows.
 *
 * Weight defaults to 100 when a goal carries none (`weight <= 0`) — an EVEN
 * share, not zero. A goal nobody weighted should still count; treating it as 0
 * would silently drop it out of the headline entirely.
 */
function summarise(rows: Row[]): Summary {
  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<DisplayBand, number>;
  let wSum = 0;
  let wEff = 0;
  let wExp = 0;
  for (const r of rows) {
    counts[r.band] += 1;
    const w = r.g.weight > 0 ? r.g.weight : 100;
    wSum += w;
    wEff += w * r.eff;
    wExp += w * r.h.expected;
  }
  return {
    total: rows.length,
    counts,
    weighted: wSum > 0 ? Math.round(wEff / wSum) : 0,
    expected: wSum > 0 ? Math.round(wExp / wSum) : 0,
    onPace: counts.done + counts.ahead + counts["on-track"],
    atRisk: counts["at-risk"] + counts.spillover,
    needsAttention: counts["at-risk"] + counts.spillover + counts.overdue,
  };
}

function summariseDaily(days: DailyDay[]) {
  let planned = 0;
  let done = 0;
  let activeDays = 0;
  for (const d of days) {
    planned += d.planned;
    done += d.done;
    if (d.planned > 0) activeDays += 1;
  }
  return { planned, done, activeDays, rate: planned > 0 ? Math.round((done / planned) * 100) : 0 };
}

/* ====================================================================== */
/* Pieces                                                                 */
/* ====================================================================== */

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-hairline-strong p-8 text-center text-[13px] font-semibold text-ink-subtle">
      {children}
    </p>
  );
}

function Kpi({
  label,
  value,
  suffix,
  tone,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border bg-surface-card px-4 py-3"
      style={{ borderColor: "var(--color-hairline-strong)" }}
    >
      <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
        {label}
      </span>
      <span
        className="mt-0.5 block text-[24px] font-black leading-tight tabular-nums"
        style={{ color: tone, fontFamily: DISPLAY }}
      >
        {value.toLocaleString("en-IN")}
        {suffix && <span className="text-[15px]">{suffix}</span>}
      </span>
      {hint && (
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-ink-subtle">
          {hint}
        </span>
      )}
    </div>
  );
}

/** The health split as one segmented bar plus its legend. */
function BandBar({ rows }: { rows: Row[] }) {
  const total = rows.length;
  const counts = React.useMemo(() => {
    const c = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<DisplayBand, number>;
    for (const r of rows) c[r.band] += 1;
    return c;
  }, [rows]);

  if (total === 0) return null;

  return (
    <div>
      <span className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {BAND_ORDER.map((b) =>
          counts[b] > 0 ? (
            <span
              key={b}
              title={`${BAND_META[b].label} — ${counts[b]}`}
              style={{ width: `${(counts[b] / total) * 100}%`, background: BAND_META[b].color }}
            />
          ) : null,
        )}
      </span>
      <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {BAND_ORDER.filter((b) => counts[b] > 0).map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: BAND_META[b].color }}
            />
            <span className="text-ink-soft">{BAND_META[b].label}</span>
            <span className="font-bold tabular-nums text-ink-strong">{counts[b]}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/** One goal row — used by both the level lists and the attention list. */
function AttentionRow({ row, fy }: { row: Row; fy: number }) {
  const meta = BAND_META[row.band];
  const level = LEVELS.find((l) => l.key === row.g.period);
  const href = (
    level
      ? `${level.href}?fy=${fy}&period=${encodeURIComponent(row.g.periodKey)}`
      : "/goals/yearly"
  ) as Route;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-hairline-strong hover:bg-surface-soft"
      >
        <span
          aria-hidden
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: meta.color }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-ink-strong">
            {row.g.title}
          </span>
          <span className="block truncate text-[11.5px] font-semibold text-ink-subtle">
            {periodKeyLabel(row.g.periodKey)}
            {row.g.area ? ` · ${row.g.area}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className="block text-[13px] font-black tabular-nums"
            style={{ color: meta.color, fontFamily: DISPLAY }}
          >
            {row.eff}%
          </span>
          <span className="block text-[11px] font-semibold tabular-nums text-ink-subtle">
            {/* The GAP, not just the score. "38%" says little alone; "31
                behind" is what ranks this row against the others. */}
            {row.band === "overdue" && row.daysLate > 0
              ? `${row.daysLate}d late`
              : row.h.delta >= 0
                ? `+${Math.round(row.h.delta)} ahead`
                : `${Math.abs(Math.round(row.h.delta))} behind`}
          </span>
        </span>
        <span
          className="hidden shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-bold sm:inline-block"
          style={{ background: `color-mix(in srgb, ${meta.color} 12%, #fff)`, color: meta.color }}
        >
          {meta.short}
        </span>
      </Link>
    </li>
  );
}

/** Commitments as paired bars — committed behind, done in front. */
function DailyStrip({ days }: { days: DailyDay[] }) {
  const peak = Math.max(1, ...days.map((d) => d.planned));
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 96 }}>
        {days.map((d) => {
          const h = (d.planned / peak) * 100;
          const doneShare = d.planned > 0 ? (d.done / d.planned) * 100 : 0;
          return (
            <div key={d.ymd} className="flex min-w-0 flex-1 flex-col justify-end">
              <span
                title={`${d.ymd} — ${d.done}/${d.planned} done`}
                className="relative block w-full rounded-t bg-slate-200"
                style={{ height: `${Math.max(h, d.planned > 0 ? 4 : 2)}%` }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 rounded-t"
                  style={{ height: `${doneShare}%`, background: DAILY_COLOR }}
                />
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1">
        {days.map((d) => (
          <span
            key={d.ymd}
            className="min-w-0 flex-1 text-center text-[9.5px] font-bold tabular-nums text-ink-subtle"
          >
            {Number(d.ymd.slice(8, 10))}
          </span>
        ))}
      </div>
      <span className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] font-semibold text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-sm bg-slate-200" />
          Committed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm"
            style={{ background: DAILY_COLOR }}
          />
          Done
        </span>
        <span className="text-ink-subtle">Numbers are the day of the month.</span>
      </span>
    </div>
  );
}
