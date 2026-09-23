import type { CapacityTone } from "@/lib/client-engagement/grids";

/**
 * CLIENT ENGAGEMENT — shared style constants.
 *
 * A PLAIN module on purpose (no "use client"), so SERVER components can import
 * real values. A value exported from a "use client" file reaches server code
 * only as a client reference — `undefined` when read — which is exactly what
 * crashed the capacity bar on 2026-09-18 ("reading 'ink'"). Components live in
 * ./ui.tsx; constants live here.
 */

export const FIELD =
  "h-9 w-full rounded-pill border border-hairline bg-surface-card px-3 text-[13px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle hover:border-hairline-strong focus:border-altus-red disabled:cursor-not-allowed disabled:opacity-60";

export const LABEL = "mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle";

export const BTN_PRIMARY =
  "pastel-cta wg-btn inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50";

export const BTN_NEUTRAL =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft transition-all hover:border-hairline-strong hover:text-ink-strong disabled:cursor-not-allowed disabled:opacity-50";

export const CARD = "rounded-2xl border border-hairline bg-surface-card";
export const CARD_SHADOW = { boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 30px -24px rgba(15,23,42,0.22)" };

export const TH = "px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle";
export const TD = "px-3 py-2 text-[12.5px] text-ink-muted";

export const DISPLAY = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

export const TONE_VAR: Record<CapacityTone, { fill: string; ink: string }> = {
  green: { fill: "var(--color-green)", ink: "var(--color-green-deep)" },
  amber: { fill: "var(--color-amber)", ink: "var(--color-amber-deep)" },
  red: { fill: "var(--color-red)", ink: "var(--color-red-deep)" },
};
