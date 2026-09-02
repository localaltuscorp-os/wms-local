"use client";

import * as React from "react";
import Link from "next/link";
import { DASHBOARD_TABLE_HEAD } from "@/components/dashboard/section-chrome";
import type { Route } from "next";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import {
  WORKLOAD_FAMILIES,
  WORKLOAD_RELATIONS,
  type SortDir,
  type WorkloadFamily,
  type WorkloadRelation,
} from "@/lib/dashboard/creator-workload-contract";

/**
 * ONE NUMBER CELL, shared by both delegation sections.
 *
 * "Who is delegating, and how much" and "Who is creating how much work" sit
 * directly above one another and count the same things. Two implementations of
 * the cell would be two attainment palettes, two tooltip sentences and two href
 * builders — and the first one edited alone would have the same figure reading
 * differently in the two sections on one screen.
 */

/* ── Attainment palette ────────────────────────────────────────────────────
   red under 50% · amber 50-99% · emerald at or above target.

   NOTE, because it differs from the older dashboard convention: the rest of
   this dashboard uses green >=100 / amber >=60 / red below. These two boards
   use 50 as the amber floor, per the delegation spec. Stated here rather than
   left as a silent divergence for whoever next compares the two. */
const GREEN = "var(--color-green-deep)";
const AMBER = "var(--color-amber-deep)";
const RED = "var(--color-altus-red)";

export function attainColor(actual: number, target: number): string {
  const pct = target > 0 ? (actual / target) * 100 : actual > 0 ? 100 : 0;
  if (pct >= 100) return GREEN;
  if (pct >= 50) return AMBER;
  return RED;
}

/* ── Click destinations ────────────────────────────────────────────────────
   Two of the three routes the spec names do not exist, and none of them read
   the param names it gives. Checked against the pages themselves:

     /commitments        does not exist. The daily-commitment surface is
                         /my-day, which reads `emp` (app/(app)/my-day/page.tsx).
     /goals              exists but is the module HUB, with no filters at all.
                         The weekly board is /goals/weekly, which reads `emp`
                         (app/(app)/goals/weekly/page.tsx).
     ?creator= / ?user=  neither is in the filter schema. /tasks selects a
                         person with `emp` and picks which SIDE of the task they
                         sit on with `view=doer|initiator` (lib/filters.ts) — so
                         `emp=<id>&view=initiator` is literally "tasks this
                         person created", which is what these cells count.

   So every link carries BOTH: the params the route reads today, so the click
   lands genuinely filtered rather than merely annotated, and the spec's own
   names as the stated contract for whoever wires these routes next.

   `user` is deliberately NOT sent. On these boards the cell names ONE person —
   its creator — and a category cell aggregates many recipients, so there is no
   single `user` to name. Sending the creator's id under a param that means
   "recipient" would be a wrong answer rather than a missing one. */
const FAMILY_ROUTE: Record<WorkloadFamily, string> = {
  goals: "/goals/weekly",
  tasks: "/tasks",
  commitments: "/my-day",
};

export function workloadHref(
  creatorId: string,
  family: WorkloadFamily,
  relation: WorkloadRelation | "total" | "delegated",
): Route {
  const sp = new URLSearchParams({ emp: creatorId, creator: creatorId, relation });
  if (family === "goals") {
    sp.set("view", "weekly");
  } else if (family === "tasks") {
    // The filter that actually bites: this person as the INITIATOR, not the
    // doer. Without it the link lands on their assigned work — the opposite of
    // the number that was clicked.
    sp.set("view", "initiator");
  } else {
    sp.set("view", "daily");
  }
  return `${FAMILY_ROUTE[family]}?${sp.toString()}` as Route;
}

/* ── Header typography ─────────────────────────────────────────────────────
   Two tiers, defined once so both boards' headers are the same size and weight
   as each other rather than each drifting to its own.

   NO `dark:` VARIANTS, and this is the one instruction from the brief I have
   not followed literally. Tailwind's `dark:` in this project compiles to
   `@media (prefers-color-scheme: dark)` — verified in the built CSS, and no
   dark variant is configured in globals.css. These tables are hardcoded light
   (white rows, #f9fafb header band), so `dark:text-slate-100` would paint
   near-white header text onto a white header for every reader whose OS is in
   dark mode: the exact opposite of the high contrast this brief asks for, and
   visible to nobody testing on a light OS. section-chrome.tsx, section-nav.tsx
   and top-performers.tsx all carry the same note. If a real dark theme lands,
   these two constants are where the variants belong. */

/** Manager / Initiator, Employee, the three family spanners, Grand Total. */
export const HEAD_MAIN = `px-4 py-3.5 ${DASHBOARD_TABLE_HEAD}`;

/** Member, Self Created, Delegated Out, Total Goals / Tasks / Commitments.
 *
 *  THE SECOND TIER KEEPS ITS OWN COLOUR. These tables carry a real two-row
 *  header — a family spanner above, its sub-columns below — and giving both
 *  rows the identical recipe would flatten that into one wall of caps with no
 *  way to see which heading governs which columns. So the sub row takes the
 *  shared weight, size and tracking (which is the consistency the standard is
 *  for) and stays one step back in `text-slate-700`, plus the tint that has
 *  always separated the two bands. */
export const HEAD_SUB = `px-3 py-2.5 ${DASHBOARD_TABLE_HEAD} text-slate-700 bg-slate-100/70`;

/* ── Sorting ──────────────────────────────────────────────────────────────── */

/** `direction: null` means "no sort applied" — the rows keep the order the
 *  server sent them in. */
export interface SortConfig<K extends string> {
  key: K;
  direction: SortDir | null;
}

/**
 * The toggle every sortable header shares: a new column starts ascending, and
 * clicking the column that is already ascending flips it to descending.
 */
export function nextSortConfig<K extends string>(
  current: SortConfig<K>,
  key: K,
): SortConfig<K> {
  const direction: SortDir =
    current.key === key && current.direction === "asc" ? "desc" : "asc";
  return { key, direction };
}

/**
 * Both directions are always drawn — dimmed until this column is the sorted
 * one. An indicator that appears only on the active column gives no hint that
 * the others sort at all, which is how a sortable table reads as a static one.
 */
export function SortArrows({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDir | null;
}) {
  if (!active || !direction) {
    return (
      <ChevronsUpDown
        className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600"
        strokeWidth={2.6}
        aria-hidden
      />
    );
  }
  return direction === "asc" ? (
    <ChevronUp className="h-3.5 w-3.5 shrink-0 text-red-600" strokeWidth={3} aria-hidden />
  ) : (
    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-red-600" strokeWidth={3} aria-hidden />
  );
}

/**
 * A sortable header cell. `className` carries the caller's own tier, borders
 * and alignment, so the two tables can differ in chrome without differing in
 * behaviour.
 */
export function SortHead<K extends string>({
  label,
  sortKey,
  sortConfig,
  onSort,
  className,
  title,
  colSpan,
  rowSpan,
  align = "center",
}: {
  label: React.ReactNode;
  sortKey: K;
  sortConfig: SortConfig<K>;
  onSort: (k: K) => void;
  className: string;
  title?: string;
  colSpan?: number;
  rowSpan?: number;
  align?: "left" | "center";
}) {
  const active = sortConfig.key === sortKey && sortConfig.direction !== null;
  return (
    <th className={className} colSpan={colSpan} rowSpan={rowSpan} title={title}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${typeof label === "string" ? label : sortKey}`}
        // `group` is what lets the dim arrows brighten with the label rather
        // than only when the pointer is on the arrow itself — a 14px target.
        className={`group flex w-full cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)] ${
          align === "left" ? "justify-start" : "justify-center"
        } ${active ? "text-red-600" : ""}`}
      >
        {label}
        <SortArrows active={active} direction={sortConfig.direction} />
      </button>
    </th>
  );
}

/* ── The number ───────────────────────────────────────────────────────────── */

/**
 * A count, its optional target, its tooltip and its link, in one place so no
 * cell can end up with three of the four.
 *
 * A zero renders INERT rather than as a dead link. Offering a click that lands
 * on an empty list teaches the reader nothing and costs them their place.
 */
export function WorkloadCountCell({
  value,
  target,
  creatorId,
  creatorName,
  family,
  relation,
  hero = false,
  /** Overrides the generated sentence — used where the caller knows more about
   *  the cell than its coordinates do (a manager's whole line, say). */
  sentence: sentenceOverride,
  denominator = "target",
  tone = "attainment",
}: {
  value: number;
  /** Null for every category that carries no quota. */
  target: number | null;
  creatorId: string;
  creatorName: string;
  family: WorkloadFamily;
  relation: WorkloadRelation | "total" | "delegated";
  hero?: boolean;
  sentence?: string;
  /**
   * WHAT THE DENOMINATOR MEANS — and the reason this prop has to exist.
   *
   * Every cell now reads x/y, but not every y is a quota. Self and Downward
   * are the only two categories the business sets a number for; Counterpart,
   * Upward and Founder measure where work FLOWED, and inventing a target for
   * them would put a pass/fail on a figure nobody is graded on.
   *
   * So those cells take `share`: the denominator is the person's own total for
   * that family, and the cell reads "6 of the 150 tasks they created". Same
   * x/y shape, different meaning — which is exactly why a share does NOT take
   * the attainment palette. A 6-of-150 share painted red would say "4% of
   * target, failing" about a number that has no target at all. Shares stay in
   * neutral ink; only quotas are graded. The tooltip spells out which is which.
   */
  denominator?: "target" | "share";
  /**
   * COLOUR — `attainment` (default) or `red`.
   *
   * `attainment` is the green >=100% / amber >=50% / red scale documented at
   * the top of this file: the colour IS the reading, which is how a wall of
   * counts becomes scannable.
   *
   * `red` paints every figure in the brand red regardless of performance, and
   * is opt-in per table rather than global for a reason. This cell is shared
   * by both delegation boards precisely so one figure cannot read two ways on
   * one screen; making the choice a prop keeps that property visible instead
   * of hiding it behind a hardcoded palette that only one caller wanted.
   */
  tone?: "attainment" | "red";
}) {
  const meta = WORKLOAD_FAMILIES.find((f) => f.key === family)!;
  const rel =
    relation === "total" || relation === "delegated"
      ? null
      : WORKLOAD_RELATIONS.find((r) => r.key === relation)!;

  const isShare = denominator === "share" && target != null;
  const targetClause = target != null && !isShare ? ` out of a target of ${target}` : "";
  const sentence =
    sentenceOverride ??
    (isShare && rel
      ? `${value} of the ${target} ${meta.noun} ${creatorName} created in this window went to ${rel.phrase}. This category carries no target.`
      : rel
        ? `${creatorName} created ${value} ${meta.noun}${targetClause} for ${rel.phrase} in this window.`
        : relation === "delegated"
          ? `${creatorName} delegated out ${value} ${meta.noun}${targetClause} to other people in this window.`
          : `${creatorName} created ${value} ${meta.noun}${targetClause} in total in this window.`);

  /* ── THE RATIO, UPSCALED ─────────────────────────────────────────────────
     Size and weight moved OUT of the style object and into classes. They had
     to: `md:` cannot be expressed as an inline style, and an inline fontSize
     beats any class that tries to override it, so leaving either behind would
     have silently pinned the cell at the old size on every breakpoint.

     THE SAME SCALE ON SUMMARY AND CHILD ROWS. `hero` used to buy the summary
     row 16px/900 against a child row's 13.5px/700 — except no caller has ever
     passed it, so every cell on both tables was rendering at the smaller pair.
     The brief asks for one scale across both, which is what this now is; `hero`
     survives only as the colour branch below, where it still means something.

     THE COLOUR IS UNTOUCHED. `attainColor` (green ≥100% / amber ≥50% / red)
     stays exactly as it was, on both halves of the fraction — it is the one
     thing the brief marks off-limits, and the literal red-600/emerald-600 in
     its code sample would have replaced that three-step scale with a two-step
     one. The denominator keeps that colour too and takes `opacity-80` for the
     recession the brief asks of it, rather than a slate that would drop the
     attainment signal from half the cell. */
  const red = tone === "red";

  /* One red, and it is the brand token the rest of the app reads from rather
     than a second near-identical hex. `--color-altus-red` is #E10600; the
     brief's #dc2626 is Tailwind's `red-600`, a different red that would sit
     beside the CTA buttons and the accent rail looking almost — but not
     quite — the same. Same call as the section nav's active pill.

     The denominator drops `opacity-80` here: the brief asks for
     `text-red-600/80`, and keeping both would compound to 64% and grey the
     slash out rather than recede it. */
  const body = (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap leading-none">
      <span
        className={`tabular-nums md:text-lg ${red ? "text-base font-extrabold" : "text-base font-black"}`}
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          color: red
            ? "var(--color-altus-red)"
            : target != null && !isShare
              ? attainColor(value, target)
              : hero
                ? "var(--color-ink-strong)"
                : value === 0
                  ? "var(--color-ink-subtle)"
                  : "var(--color-ink)",
        }}
      >
        {value}
      </span>
      {target != null && (
        <span
          className={`text-xs font-bold tabular-nums md:text-sm ${red ? "" : "opacity-80"}`}
          style={{
            color: red
              ? "color-mix(in srgb, var(--color-altus-red) 80%, transparent)"
              : isShare
                ? "var(--color-ink-subtle)"
                : attainColor(value, target),
          }}
        >
          /{target}
        </span>
      )}
    </span>
  );

  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        {value === 0 ? (
          <span className="inline-flex cursor-default">{body}</span>
        ) : (
          <Link
            href={workloadHref(creatorId, family, relation)}
            className="inline-flex rounded outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
          >
            {body}
          </Link>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        {/* Portalled: both tables are `overflow-auto` scroll boxes, which would
            clip an in-flow tooltip on every edge that matters. */}
        <Tooltip.Content
          side="top"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-[280px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-semibold leading-snug text-white shadow-xl"
        >
          {sentence}
          {value > 0 && <span className="block text-[10.5px] text-white/60">Click to open</span>}
          <Tooltip.Arrow className="fill-slate-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
