import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/lib/ecos/labels";

/**
 * Pure presentational primitives for the Communications module — server-safe
 * (no client hooks) so both the home list and the read view share one look.
 */

/** A labelled pill. Colour-blind safe — the label always carries the meaning. */
export function Pill({ tone, children, style }: { tone: Tone; children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap"
      style={{ color: tone.fg, background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.border}`, ...style }}
    >
      {children}
    </span>
  );
}

/**
 * A slim labelled progress bar (e.g. "Read 62%"). Value is 0–100. The numeric
 * label sits beside it so the meter is never colour-only.
 */
export function MiniBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">{label}</span>
        <span className="text-[12px] font-bold tabular-nums text-ink-strong">{v}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#eef2f7" }}>
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  );
}
