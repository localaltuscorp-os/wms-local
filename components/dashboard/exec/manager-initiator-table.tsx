"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { InitiatorScorecard } from "@/lib/types";
import type { DelegationChannel } from "@/lib/transforms/initiator-scorecard";
import {
  DASHBOARD_CARD_PADDED,
  DASHBOARD_TABLE_HEAD,
} from "@/components/dashboard/section-chrome";

/* ────────────────────────────────────────────────────────────────────────
   ManagerInitiatorTable — the same initiation scorecards as
   ManagerInitiatorCard, laid out as a comparison TABLE rather than a grid of
   tiles.

   Why a table: the card grid showed one manager per tile, so comparing two
   managers meant reading two separate blocks and holding the numbers in your
   head. Delegation is a leaderboard question — "who is behind?" — and a table
   answers it by putting every manager's channel split on the same axis.

   Each row expands in place to the per-report breakdown, so the drill-down that
   used to be a second card region is now a nested table under its own manager.
   Clicking the row (but not the expander, and not the open-drilldown control)
   opens the full drill-down modal, matching the card's behaviour.
   ──────────────────────────────────────────────────────────────────────── */

/* Project threshold convention: green ≥100 · amber ≥60 · red below. */
const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-altus-red)";

function attainColor(pct: number): string {
  if (pct >= 100) return GREEN;
  if (pct >= 60) return AMBER;
  return RED;
}

/** Numeric channel cell — tabular so columns align down the table. */
function Num({ value, hero = false }: { value: number; hero?: boolean }) {
  return (
    <span
      className="tabular-nums leading-none"
      style={{
        fontFamily: "var(--font-display), system-ui, sans-serif",
        fontWeight: hero ? 900 : 700,
        fontSize: hero ? 17 : 15,
        color: hero
          ? "var(--color-ink-strong)"
          : value === 0
            ? "var(--color-ink-subtle)"
            : "var(--color-ink)",
      }}
    >
      {value}
    </span>
  );
}

/* Header cells WRAP rather than `whitespace-nowrap`.
   The wrapper is `overflow-hidden` and the columns are hard percentages, so a
   header that refuses to wrap has nowhere to go — "COUNTERPART" in a 8% column
   would simply be clipped mid-word with no scrollbar to recover it. Wrapping to
   two short lines keeps every label fully readable at any container width. */
/* `leading-tight` is kept — these headings wrap onto two lines in a narrow
   column and the shared recipe sets no leading. The old `font-bold
   text-gray-500` is gone: at that weight and colour the headings read as a
   disabled control rather than as the table's own labels. */
const HEAD_CELL = `px-2 py-3 leading-tight ${DASHBOARD_TABLE_HEAD}`;

/* The body no longer scrolls inside its own box, so the header no longer needs
   to be sticky against it. Kept as a named constant so every header cell is
   styled from one place. */
const STICKY_HEAD_CELL = HEAD_CELL;
const STICKY_HEAD_BG = { background: "#f9fafb" } as const;

/** How many rows the collapsed table shows before "View all". */
const COLLAPSED_ROWS = 5;

/**
 * A delegation-channel count that opens the drawer filtered to that channel.
 * A zero renders inert — offering a click that leads to an empty list is worse
 * than not offering it.
 */
function ChannelCell({
  value,
  onOpen,
  label,
}: {
  value: number;
  onOpen: () => void;
  label: string;
}) {
  if (value === 0) {
    return (
      <td className="px-2 py-2.5 text-center">
        <Num value={0} />
      </td>
    );
  }
  return (
    <td className="px-2 py-2.5 text-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label={`Open tasks — ${label}`}
        title={`Open the ${value} task${value === 1 ? "" : "s"} in this channel`}
        className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-gray-100"
      >
        <Num value={value} />
      </button>
    </td>
  );
}

export function ManagerInitiatorTable({
  managers,
  resolveAvatar,
  onOpenDrilldown,
  minimized = false,
}: {
  managers: InitiatorScorecard[];
  resolveAvatar: (employeeId: string) => string | null;
  /** `channel` is set when a specific delegation cell was clicked; omitted for
   *  a whole-row click, which opens the unfiltered list. */
  onOpenDrilldown: (managerId: string, channel?: DelegationChannel) => void;
  /** Collapse the body so only the column headers remain. */
  minimized?: boolean;
}) {
  // Which rows are expanded. A Set (not a single id) so several managers can be
  // compared with their breakdowns open at once — the whole point of the table.
  const [openRows, setOpenRows] = React.useState<ReadonlySet<string>>(new Set());
  const toggle = React.useCallback((id: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  // Show-all toggle. The table used to cap its own height at 380px and scroll
  // inside that box, which buried managers behind a nested scrollbar the page
  // gave no hint of. Now it renders the first five and grows into the page.
  const [showAll, setShowAll] = React.useState(false);
  const visible = React.useMemo(
    () => (minimized ? [] : showAll ? managers : managers.slice(0, COLLAPSED_ROWS)),
    [managers, minimized, showAll],
  );
  const hiddenCount = managers.length - visible.length;

  return (
    /* `overflow-hidden`, NOT `overflow-x-auto`: the ten columns below are hard
       percentages summing to exactly 100, so the table is mathematically
       incapable of exceeding its container and a scroll axis would only ever
       park an inert scrollbar under the rows. Clipping is the backstop, not the
       layout — nothing should reach it. */
    <div className={`w-full overflow-hidden ${DASHBOARD_CARD_PADDED}`}>
      <table className="w-full table-fixed border-collapse">
        {/* `table-fixed` + colgroup: without fixed layout the browser sizes
            columns from content, which is what let a long manager name push
            COUNTERPART off the edge no matter how the header was padded.
            22 + 10 + 10 + 7 + 7 + 8 + 7 + 6 + 7 + 16 = 100. */}
        <colgroup>
          <col style={{ width: "22%" }} /> {/* Manager / Initiator */}
          <col style={{ width: "10%" }} /> {/* % of Target          */}
          <col style={{ width: "10%" }} /> {/* Target Ratio         */}
          <col style={{ width: "7%" }} />  {/* Direct               */}
          <col style={{ width: "7%" }} />  {/* Downline             */}
          <col style={{ width: "8%" }} />  {/* Counterpart          */}
          <col style={{ width: "7%" }} />  {/* Founder              */}
          <col style={{ width: "6%" }} />  {/* Self                 */}
          <col style={{ width: "7%" }} />  {/* Total                */}
          <col style={{ width: "16%" }} /> {/* Breakdown            */}
        </colgroup>
        <thead>
          <tr>
            {/* Width now comes from the colgroup (20%). The old
                `min-w-[220px]` is gone: under `table-fixed` a min-width forces
                the table wider than its container, which is exactly the
                horizontal scrollbar this layout removes. */}
            <th className={`${STICKY_HEAD_CELL} text-left`} style={STICKY_HEAD_BG}>
              Manager / Initiator
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              % of Target
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Target Ratio
            </th>
            {/* The five mutually-exclusive delegation channels, then their sum.
                Kept in the same order as the card's chips so the two surfaces
                read identically. */}
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Direct
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Downline
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Counterpart
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Founder
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Self
            </th>
            <th className={`${STICKY_HEAD_CELL} text-center`} style={STICKY_HEAD_BG}>
              Total
            </th>
            <th className={`${STICKY_HEAD_CELL} text-right`} style={STICKY_HEAD_BG}>
              Breakdown
            </th>
          </tr>
        </thead>

        <tbody>
          {visible.map((m) => {
            const open = openRows.has(m.managerId);
            const hitCount = m.perReport.filter((r) => r.hit).length;
            const tone = attainColor(m.attainmentPct);

            return (
              <React.Fragment key={m.managerId}>
                <tr
                  onClick={() => onOpenDrilldown(m.managerId)}
                  className="task-row cursor-pointer border-t transition-colors"
                  style={{ borderColor: "var(--color-hairline)" }}
                >
                  {/* Manager: avatar · name · direct-report count */}
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        name={m.managerName}
                        avatarUrl={resolveAvatar(m.managerId)}
                        size={34}
                      />
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[13.5px] font-bold"
                          style={{ color: "var(--color-ink-strong)" }}
                          title={m.managerName}
                        >
                          {m.managerName}
                        </span>
                        <span
                          className="block text-[11.5px] font-semibold tabular-nums"
                          style={{ color: "var(--color-ink-subtle)" }}
                        >
                          {m.directReports}{" "}
                          {m.directReports === 1 ? "direct report" : "direct reports"}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={14}
                        strokeWidth={2.6}
                        aria-hidden
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ color: "var(--color-altus-red)" }}
                      />
                    </span>
                  </td>

                  {/* % of target — an inline number + bar. The 54px SVG ring
                      it replaced was absolutely positioned inside its cell, so
                      it sat off the row's baseline and forced the row taller
                      than every other cell needed. */}
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm font-extrabold tabular-nums text-gray-900">
                        {m.attainmentPct}%
                      </span>
                      <div className="h-2 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            // Capped at 100 so an over-target manager can't
                            // overflow the track; the number beside it still
                            // reports the true figure.
                            width: `${Math.min(m.attainmentPct, 100)}%`,
                            background: tone,
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* actual / target */}
                  <td className="px-2 py-2.5 text-center">
                    <span
                      className="inline-flex items-baseline gap-1 tabular-nums"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: 16, color: tone }}>
                        {m.actual}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: "var(--color-ink-subtle)",
                        }}
                      >
                        / {m.target}
                      </span>
                    </span>
                  </td>

                  {/* Each channel cell opens the drawer PRE-FILTERED to that
                      channel; the row itself (and Total) opens it unfiltered.
                      stopPropagation so the cell's narrower intent wins over
                      the row's. */}
                  <ChannelCell
                    value={m.toDirectReports}
                    onOpen={() => onOpenDrilldown(m.managerId, "direct")}
                    label={`${m.managerName} — direct`}
                  />
                  <ChannelCell
                    value={m.toDownline}
                    onOpen={() => onOpenDrilldown(m.managerId, "downline")}
                    label={`${m.managerName} — downline`}
                  />
                  <ChannelCell
                    value={m.toCounterparts}
                    onOpen={() => onOpenDrilldown(m.managerId, "counterpart")}
                    label={`${m.managerName} — counterpart`}
                  />
                  <ChannelCell
                    value={m.toFounderMgmt}
                    onOpen={() => onOpenDrilldown(m.managerId, "founder")}
                    label={`${m.managerName} — founder`}
                  />
                  <ChannelCell
                    value={m.toSelf}
                    onOpen={() => onOpenDrilldown(m.managerId, "self")}
                    label={`${m.managerName} — self-assigned`}
                  />
                  <td className="px-2 py-2.5 text-center">
                    <Num value={m.totalInitiated} hero />
                  </td>

                  {/* Expander, as a TIGHT action pill. The old control spelled
                      out "Show Per-Report Breakdown 3/6 on goal" and was the
                      single widest thing in the table — it alone demanded a
                      column far larger than the data it introduced, and pushed
                      the channel columns into the clipping this layout removes.
                      "Breakdown 3/6 ▾" says the same thing; the full sentence
                      survives in the aria-label and the title tooltip.

                      stopPropagation so opening the breakdown never also fires
                      the row's open-drilldown click. */}
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(m.managerId);
                      }}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} per-report breakdown for ${m.managerName}`}
                      title={`${hitCount} of ${m.perReport.length} direct reports on goal — ${open ? "hide" : "show"} the per-report breakdown`}
                      className="inline-flex max-w-full items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100"
                    >
                      <span className="truncate">Breakdown</span>
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: "var(--color-ink-subtle)" }}
                      >
                        {hitCount}/{m.perReport.length}
                      </span>
                      <ChevronDown
                        size={14}
                        strokeWidth={2.6}
                        className="shrink-0 transition-transform duration-300"
                        style={{
                          color: "var(--color-altus-red)",
                          transform: open ? "rotate(180deg)" : "none",
                        }}
                      />
                    </button>
                  </td>
                </tr>

                {/* Nested per-report table, in its own full-width row so the
                    manager columns above keep their alignment. Only mounted
                    while open — a closed row costs nothing. */}
                {open && (
                  <tr style={{ borderColor: "var(--color-hairline)" }}>
                    <td
                      /* Manager · %Target · Ratio · Direct · Downline ·
                         Counterpart · Founder · Self · Total · Breakdown */
                      colSpan={10}
                      className="px-3 pb-3 pt-0"
                    >
                      {/* Nested block, visually inset from the row above it so
                          the breakdown reads as belonging to that manager
                          rather than as more table rows. */}
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                      >
                        {m.perReport.length === 0 ? (
                          <p
                            className="py-3 text-[12.5px] font-semibold"
                            style={{ color: "var(--color-ink-subtle)" }}
                          >
                            No direct reports in this window.
                          </p>
                        ) : (
                          <div className="table-scroll -mx-1 overflow-x-auto px-1">
                          <table className="w-full min-w-[560px] border-collapse">
                            <thead>
                              <tr style={{ color: "var(--color-ink-subtle)" }}>
                                <th className={`${HEAD_CELL} text-left`}>Report</th>
                                {/* Hierarchy context: how many people this
                                    report manages, and how much work was routed
                                    past them into that team. */}
                                <th className={`${HEAD_CELL} text-center`}>Reports</th>
                                <th className={`${HEAD_CELL} text-center`}>Downline</th>
                                <th className={`${HEAD_CELL} text-center`}>Given</th>
                                <th className={`${HEAD_CELL} text-center`}>Goal</th>
                                <th className={`${HEAD_CELL} text-left`}>Progress</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.perReport.map((r) => {
                                const pct =
                                  r.goal > 0
                                    ? Math.min(100, (r.given / r.goal) * 100)
                                    : r.given > 0
                                      ? 100
                                      : 0;
                                const bar = r.hit ? GREEN : pct >= 60 ? AMBER : RED;
                                return (
                                  <tr key={r.employeeId}>
                                    <td className="px-3 py-1.5">
                                      <span className="flex items-center gap-2.5">
                                        <Avatar
                                          name={r.employeeName}
                                          avatarUrl={resolveAvatar(r.employeeId)}
                                          size={26}
                                        />
                                        <span
                                          className="truncate text-[12.5px] font-bold"
                                          style={{ color: "var(--color-ink-strong)" }}
                                          title={r.employeeName}
                                        >
                                          {r.employeeName}
                                        </span>
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <Num value={r.reportCount} />
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <Num value={r.downlineGiven} />
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <Num value={r.given} />
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <Num value={r.goal} />
                                    </td>
                                    <td className="px-3 py-1.5" style={{ minWidth: 140 }}>
                                      <span
                                        className="block h-1.5 w-full overflow-hidden rounded-full"
                                        style={{
                                          background:
                                            "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
                                        }}
                                      >
                                        <span
                                          className="block h-full rounded-full"
                                          style={{ width: `${pct}%`, background: bar }}
                                        />
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </div>
                        )}
                      </motion.div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* View-all footer — replaces the inner scrollbar. Only shown when rows
          are actually hidden, and it reports HOW MANY, so the table never
          silently truncates the leaderboard. */}
      {!minimized && (hiddenCount > 0 || showAll) && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100"
        >
          {showAll
            ? `Show Top ${COLLAPSED_ROWS}`
            : `View All (${managers.length}) Managers`}
        </button>
      )}
    </div>
  );
}
