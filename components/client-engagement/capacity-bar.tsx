import { formatDuration } from "@/lib/client-engagement/schedule";
import type { MemberCapacity } from "@/lib/client-engagement/grids";
import { DISPLAY, TONE_VAR } from "./tokens";

/**
 * The KPI summary bar: every team member's active accounts against their cap,
 * toned green / amber / red, with this week's committed call time underneath.
 * Unassigned sits at the end so the pool waiting to be handed out is never out
 * of sight.
 */
export function CapacityBar({ capacity, unassigned }: { capacity: MemberCapacity[]; unassigned: number }) {
  return (
    <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
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
      <div
        className="rounded-2xl border border-dashed border-hairline-strong px-3 py-2.5"
        style={{ background: "var(--color-surface-soft)" }}
        title="Added but not yet given to anyone"
      >
        <div className="text-[12.5px] font-bold text-ink-soft">Unassigned</div>
        <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-ink-strong" style={DISPLAY}>
          {unassigned}
        </div>
        <div className="mt-3.5 text-[11px] font-medium text-ink-subtle">waiting to be handed out</div>
      </div>
    </div>
  );
}
