"use client";

import { formatDuration } from "@/lib/client-engagement/schedule";
import type { MemberCapacity } from "@/lib/client-engagement/grids";
import { DISPLAY, TONE_VAR } from "./tokens";

/**
 * The KPI summary bar: every team member's active accounts against their cap,
 * toned green / amber / red, with this week's committed call time and the
 * load percentage underneath.
 *
 * UNASSIGNED COMES FIRST (2026-09-21). It used to sit at the end, on the
 * reasoning that trailing the row kept it in sight; in practice the row wrapped
 * and it landed alone on a second line, which is the opposite of in sight. The
 * pool waiting to be handed out is the one number that needs acting on, so it
 * leads — and it carries the same dashed red tint the Unassigned lane on the
 * board below uses, so the two read as the same thing.
 *
 * ONE ROW, ALWAYS (2026-09-28: "keep the KPIs in one row only") — this scrolls
 * horizontally instead of wrapping, which is also why a member carrying
 * NOTHING is left out entirely: an empty card earns no space in a row this
 * tight, and it was already visible as "Has room" everywhere else.
 *
 * CLICKING a card filters the board below to that person (or Unassigned) and
 * scrolls to it — the same "click a KPI, see it below" pattern PcaGrid's
 * matrix headers already use.
 */
export function CapacityBar({
  capacity,
  unassigned,
  onSelectMember,
}: {
  capacity: MemberCapacity[];
  unassigned: number;
  /** Called with a member id, or "none" for Unassigned. */
  onSelectMember?: (id: string) => void;
}) {
  const staffed = capacity.filter((c) => c.active > 0);
  return (
    <div className="flex gap-2 scroll-x-only">
      {/* The pool waiting to be handed out — first in the line. */}
      <button
        type="button"
        onClick={() => onSelectMember?.("none")}
        className="w-[160px] shrink-0 rounded-2xl border border-dashed px-3 py-2.5 text-left transition-transform hover:-translate-y-px"
        style={{
          borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
          background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))",
        }}
        title="Added but not yet given to anyone — click to filter the board below"
      >
        <div className="text-[12.5px] font-bold text-ink-soft">Unassigned</div>
        <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-ink-strong" style={DISPLAY}>
          {unassigned}
        </div>
        <div className="mt-3.5 text-[11px] font-medium text-ink-subtle">waiting to be handed out</div>
      </button>

      {staffed.map((c) => {
        const tone = TONE_VAR[c.tone];
        const pct = c.limit > 0 ? Math.round((c.active / c.limit) * 100) : 100;
        const state = c.tone === "red" ? "Over capacity" : c.tone === "amber" ? "Near capacity" : "Has room";
        return (
          <button
            type="button"
            key={c.memberId}
            onClick={() => onSelectMember?.(c.memberId)}
            className="w-[160px] shrink-0 rounded-2xl border border-hairline bg-surface-card px-3 py-2.5 text-left transition-transform hover:-translate-y-px"
            style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
            title={`${c.name}: ${c.active} active of ${c.limit || "no"} cap (${pct}%) — ${state}. Click to filter the board below.`}
          >
            <div className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: tone.ink }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink-soft">{c.name}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[22px] font-extrabold leading-none tabular-nums text-ink-strong" style={DISPLAY}>
                {c.active}
              </span>
              <span className="text-[11.5px] font-semibold tabular-nums text-ink-subtle">/ {c.limit || "∞"}</span>
              <span
                className="ml-auto whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold"
                style={{ color: tone.ink, background: `color-mix(in srgb, ${tone.fill} 45%, transparent)` }}
              >
                {pct}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-soft">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: tone.ink }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px] font-medium tabular-nums text-ink-subtle">
              <span>{formatDuration(c.weeklyMinutes)} of calls</span>
              <span className="whitespace-nowrap font-bold" style={{ color: tone.ink }}>{state}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
