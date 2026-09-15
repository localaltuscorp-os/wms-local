import { periodLabel } from "@/components/dashboard/exec/period-range-picker";
import type { ActivityPeriod } from "@/lib/dashboard/manager-activity-contract";
import { daysInRange, rateTone, type PersonStats } from "@/lib/dcc/dashboard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "15 Sep". */
export function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Tue, 15 Sep 2026". */
export function longDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

/** "This Month · 1 Sep – 15 Sep". */
export function windowText(
  period: ActivityPeriod,
  custom: { from: string; to: string } | null,
  window: { from: string; to: string },
): string {
  const span = window.from === window.to ? shortDate(window.to) : `${shortDate(window.from)} – ${shortDate(window.to)}`;
  return period === "custom" ? span : `${periodLabel(period, custom)} · ${span}`;
}

/** "vs previous 15 days". */
export function previousLabel(window: { from: string; to: string }): string {
  const n = daysInRange(window.from, window.to).length;
  return n === 1 ? "vs previous day" : `vs previous ${n} days`;
}

/** "▲ 4", "▼ 2", "→ 0" — direction rides on the glyph, as on the WMS tiles. */
export function signed(n: number, unit = ""): string {
  if (n > 0) return `▲ ${n}${unit}`;
  if (n < 0) return `▼ ${Math.abs(n)}${unit}`;
  return `→ 0${unit}`;
}

const TONE_TEXT = {
  green: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-rose-700",
  none: "text-slate-400",
} as const;

const TONE_FILL = {
  green: "var(--color-green)",
  amber: "var(--color-amber, #f59e0b)",
  red: "var(--color-altus-red)",
  none: "var(--color-hairline-strong)",
} as const;

export function toneText(p: number | null): string {
  return TONE_TEXT[rateTone(p)];
}

export function toneFill(p: number | null): string {
  return TONE_FILL[rateTone(p)];
}

/** Past misses only — today's unfilled KPIs are still open, not missed. */
export function missedOf(p: PersonStats): number {
  return p.tally.unfilled - p.today.unfilled;
}
