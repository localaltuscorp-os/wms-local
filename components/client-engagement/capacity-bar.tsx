import { formatDuration } from "@/lib/client-engagement/schedule";
import type { MemberCapacity } from "@/lib/client-engagement/grids";
import { DISPLAY, TONE_VAR } from "./tokens";

/**
 * The KPI summary bar: every team member's active accounts against their cap,
 * toned green / amber / red, with this week's committed call time underneath.
 *
 * UNASSIGNED COMES FIRST (2026-09-21). It used to sit at the end, on the
 * reasoning that trailing the row kept it in sight; in practice the row wrapped
 * and it landed alone on a second line, which is the opposite of in sight. The
 * pool waiting to be handed out is the one number that needs acting on, so it
 * leads — and it carries the same dashed red tint the Unassigned lane on the
 * board below uses, so the two read as the same thing.
 *
 * FIVE TO A LINE, fixed rather than auto-filled. auto-fill packed seven or eight
 * cards onto wide screens and reflowed on every sidebar toggle; a stated count
 * means the row breaks in the same place every time.
 *
 * Five holds all the way down to `lg` (1024px) DELIBERATELY, even though the
 * cards get narrow with the sidebar open. The count is the requirement, not a
 * suggestion — the step-downs below lg exist only for widths where five cards
 * could not show their own contents at all.
 */
export function CapacityBar({ capacity, unassigned }: { capacity: MemberCapacity[]; unassigned: number }) {
  return (
    <div className="mb-3 grid grid-cols-5 gap-2 max-lg:grid-cols-3 max-sm:grid-cols-2">
      {/* The pool waiting to be handed out — first in the line. */}
      <div
        className="rounded-2xl border border-dashed px-3 py-2.5"
        style={{
          borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, transparent)",
          background: "color-mix(in srgb, var(--color-altus-red) 3%, var(--color-surface-card))",
        }}
        title="Added but not yet given to anyone"
      >
        <div className="text-[12.5px] font-bold text-ink-soft">Unassigned</div>
        <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-ink-strong" style={DISPLAY}>
          {unassigned}
        </div>
        <div className="mt-3.5 text-[11px] font-medium text-ink-subtle">waiting to be handed out</div>
      </div>

      {capacity.map((c) => {
        const tone = TONE_VAR[c.tone];
        const pct = c.limit > 0 ? Math.min(100, Math.round((c.active / c.limit) * 100)) : c.active > 0 ? 100 : 0;
        const state = c.tone === "red" ? "Over capacity" : c.tone === "amber" ? "Near capacity" : "Has room";
        return (
          <div
            key={c.memberId}
            className="rounded-2xl border border-hairline bg-surface-card px-3 py-2.5"
            style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
            title={`${c.name}: ${c.active} active of ${c.limit || "no"} cap — ${state}`}
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
                {state}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-soft">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone.ink }} />
            </div>
            <div className="mt-1.5 text-[11px] font-medium tabular-nums text-ink-subtle">{formatDuration(c.weeklyMinutes)} of calls this week</div>
          </div>
        );
      })}
    </div>
  );
}
