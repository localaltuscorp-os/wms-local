"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { PieChart, LayoutGrid } from "lucide-react";
import { PENDING_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type {
  StatusDistributionPayload,
  StatusDistribution,
} from "@/lib/types";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { useCountUp } from "@/lib/use-count-up";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
} from "@/lib/format";

type Tone = StatusColorToken;

/** Tones whose mid colour is light enough that white text would wash out —
 *  these get dark text for the in-segment % label. */
const LIGHT_TONES = new Set<string>(["yellow", "amber", "stone"]);

export function StatusDistributionChart({
  data,
  labels,
  tones,
  isAdmin,
}: {
  data: StatusDistributionPayload;
  labels?: Record<TaskStatus, string>;
  tones?: Record<TaskStatus, Tone>;
  isAdmin: boolean;
}) {
  const resolvedLabels = labels ?? STATUS_LABELS_FALLBACK;
  const resolvedTones = (tones ?? STATUS_TONES_FALLBACK) as Record<
    TaskStatus,
    Tone
  >;
  // Drop retired statuses (transferred / cancelled / follow_up_1-3) — those
  // tasks are migrated/archived now and shouldn't get their own tiles.
  const rows = [...data.rows]
    .filter((r) => !isDeprecatedStatus(r.status))
    .sort((a, b) => b.count - a.count);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const denom = data.denominator;
  // Defensive: Next's Data Cache can serve a payload cached before `summary`
  // existed (up to the 60s revalidate window right after a deploy). Fall back
  // to zeros so the card renders instead of throwing on `summary.pending`.
  const summary = data.summary ?? { pending: 0, notApproved: 0, archived: 0 };

  if (rows.length === 0) {
    return (
      <section
        className="rounded-section bg-surface-card border border-hairline p-8"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <Header isAdmin={isAdmin} />
        <p className="mt-3 text-body-lg text-ink-subtle">
          No data for the current filter.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        opacity: 0,
        animation: "fadeUp 500ms ease-out 500ms forwards",
      }}
    >
      <Header isAdmin={isAdmin} />

      {/* Proportional ribbon — a VISUAL OVERVIEW only (not clickable):
          tiny segments can't be both proportional and tappable, so the
          legend cards below are the click-to-filter targets. Each segment
          shows a tooltip on hover with its exact status / count / %. Wide
          segments print their share % centred; text flips to dark on the
          light tones (yellow / amber / light-grey) so it stays legible. */}
      <div
        className="mt-6 flex w-full overflow-hidden"
        style={{
          height: 48,
          borderRadius: 14,
          background: "var(--color-surface-track)",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.06)",
        }}
        role="img"
        aria-label={`Tasks by status: ${rows
          .map((r) => `${resolvedLabels[r.status]} ${r.count}`)
          .join(", ")}`}
      >
        {rows.map((r, i) => {
          const tone = resolvedTones[r.status];
          const widthPct = totalCount > 0 ? (r.count / totalCount) * 100 : 0;
          if (widthPct === 0) return null;
          const pct = denom > 0 ? (r.count / denom) * 100 : widthPct;
          const dark = LIGHT_TONES.has(tone);
          const showPct = widthPct >= 6;
          return (
            <div
              key={r.status}
              title={`${resolvedLabels[r.status]} — ${r.count} (${pct.toFixed(1)}%)`}
              className="dist-segment flex h-full items-center justify-center"
              style={{
                width: `${widthPct}%`,
                minWidth: 6,
                background: `linear-gradient(180deg, var(--color-${tone}), var(--color-${tone}-deep))`,
                boxShadow:
                  i < rows.length - 1
                    ? "inset -2px 0 0 rgba(255,255,255,0.75)"
                    : "none",
                animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${300 + i * 70}ms backwards`,
                transformOrigin: "left",
              }}
            >
              {showPct && (
                <span
                  className="tabular-nums font-bold"
                  style={{
                    fontSize: 15,
                    color: dark ? "#1f2937" : "#ffffff",
                    textShadow: dark
                      ? "0 1px 1px rgba(255,255,255,0.4)"
                      : "0 1px 2px rgba(0,0,0,0.28)",
                  }}
                >
                  {pct.toFixed(pct < 10 ? 1 : 0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend grid — one continuous grid of status tiles followed by the
          pending / not-approved / archived summary tiles (same design), so the
          cards flow without odd mid-grid gaps. 3 cols desktop, 2 tablet, 1 mobile. */}
      <ul className="mt-6 grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {rows.map((r, i) => (
          <StatTile
            key={r.status}
            row={r}
            index={i}
            denom={denom}
            label={resolvedLabels[r.status]}
            tone={resolvedTones[r.status]}
          />
        ))}
        <SummaryTile
          label="Pending"
          value={summary.pending}
          tone="amber"
          denom={denom}
          index={rows.length}
          href={`/tasks?status=${PENDING_STATUSES.join(",")}` as Route}
        />
        <SummaryTile
          label="Not approved"
          value={summary.notApproved}
          tone="rose"
          denom={denom}
          index={rows.length + 1}
          href={"/tasks?status=not_approved" as Route}
        />
        {/* Archived view is admin-only — hide the jump-to-archive tile from doers. */}
        {isAdmin && (
          <SummaryTile
            label="Archived"
            value={summary.archived}
            tone="slate"
            denom={denom}
            index={rows.length + 2}
            href={"/archived" as Route}
          />
        )}
      </ul>
    </section>
  );
}

/**
 * Same visual language as StatTile (the 9 status cards) so the
 * pending/not-approved/archived row blends in seamlessly: coloured dot +
 * uppercase label, big count, share % of open work, and a bottom share bar.
 */
function SummaryTile({
  label,
  value,
  tone,
  denom,
  index,
  href,
}: {
  label: string;
  value: number;
  tone: Tone;
  denom: number;
  index: number;
  href: Route;
}) {
  const animated = useCountUp(value, 900 + index * 70);
  const pct = denom > 0 ? (value / denom) * 100 : 0;
  return (
    <li>
      <Link
        href={href}
        className="dist-tile group flex h-full cursor-pointer flex-col p-4 rounded-chip bg-surface-soft transition-all"
        style={{ border: "1px solid var(--color-hairline)" }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: `var(--color-${tone})` }}
          />
          <span
            className="uppercase font-bold tracking-[0.06em] truncate text-ink-soft"
            style={{ fontSize: 12 }}
          >
            {label}
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="tabular-nums font-black leading-none text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 34,
            }}
          >
            {animated}
          </span>
          <span
            className="ml-auto tabular-nums font-semibold text-ink-subtle"
            style={{ fontSize: 14 }}
          >
            {denom > 0 ? `${pct.toFixed(1)}%` : "—"}
          </span>
        </div>

        <div
          aria-hidden
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-surface-track)" }}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(Math.min(pct, 100), pct > 0 ? 3 : 0)}%`,
              background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
              animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${400 + index * 70}ms backwards`,
              transformOrigin: "left",
            }}
          />
        </div>
      </Link>
    </li>
  );
}

function Header({ isAdmin }: { isAdmin: boolean }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "rgba(15, 23, 42, 0.05)",
            color: "var(--color-ink-strong)",
          }}
        >
          <PieChart size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-display-lg text-ink-strong">Status Distribution</h2>
          <p className="text-body-lg text-ink-subtle mt-0.5">
            Tasks by current status — hover the bar for detail, click a card to filter
          </p>
        </div>
      </div>
      {/* Kanban is admin-only — doers don't see the jump-to-board link. */}
      {isAdmin && (
        <Link
          href={"/tasks/kanban" as Route}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold text-white transition-all hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 4px 12px rgba(225, 6, 0, 0.25)",
          }}
        >
          <LayoutGrid size={15} strokeWidth={2.4} />
          View in Kanban
        </Link>
      )}
    </header>
  );
}

function StatTile({
  row,
  index,
  denom,
  label,
  tone,
}: {
  row: StatusDistribution;
  index: number;
  denom: number;
  label: string;
  tone: Tone;
}) {
  const animated = useCountUp(row.count, 900 + index * 70);
  const pct = denom > 0 ? (row.count / denom) * 100 : 0;
  return (
    <li>
      <Link
        href={`/tasks?status=${row.status}` as Route}
        className="dist-tile group flex h-full cursor-pointer flex-col p-4 rounded-chip bg-surface-soft transition-all"
        style={{ border: "1px solid var(--color-hairline)" }}
      >
        {/* Label row — coloured dot + neutral status name */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: `var(--color-${tone})` }}
          />
          <span
            className="uppercase font-bold tracking-[0.06em] truncate text-ink-soft"
            style={{ fontSize: 12 }}
          >
            {label}
          </span>
        </div>

        {/* Count + share — single baseline row, % pinned right */}
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="tabular-nums font-black leading-none text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 34,
            }}
          >
            {animated}
          </span>
          <span
            className="ml-auto tabular-nums font-semibold text-ink-subtle"
            style={{ fontSize: 14 }}
          >
            {denom > 0 ? `${pct.toFixed(1)}%` : "—"}
          </span>
        </div>

        {/* Share bar — always-present track for a consistent row rhythm */}
        <div
          aria-hidden
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-surface-track)" }}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(Math.min(pct, 100), pct > 0 ? 3 : 0)}%`,
              background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
              animation: `barGrow 900ms cubic-bezier(.2,.8,.2,1) ${400 + index * 70}ms backwards`,
              transformOrigin: "left",
            }}
          />
        </div>
      </Link>
    </li>
  );
}
