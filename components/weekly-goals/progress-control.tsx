"use client";

import * as React from "react";
import { pctTone } from "@/components/weekly-goals/field-controls";

const PRESETS = [0, 25, 50, 75, 100] as const;

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/**
 * The one progress control for a weekly goal — replaces the old bar + slider +
 * number-box trio. Tap a preset chip (0/25/50/75/100) for a one-tap update, or
 * drag the slider for anything in between; the live % reads out beside it. Fast
 * on both phone and desktop. Optimistic: commits on chip tap and on drag-release.
 */
export function ProgressControl({
  value,
  disabled,
  onCommit,
  compact,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (pct: number) => void;
  /** Hide the preset chips (tight spaces) — slider only. */
  compact?: boolean;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  function commit(n: number) {
    const c = clamp(n);
    setV(c);
    if (c !== value) onCommit(c);
  }

  const tone = pctTone(v);

  return (
    <div className="grid gap-2.5">
      {!compact && (
        <div className="grid grid-cols-5 gap-1">
          {PRESETS.map((p) => {
            const active = v === p;
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => commit(p)}
                aria-pressed={active}
                className={`rounded-md py-1.5 text-center text-[12.5px] font-black tabular-nums transition-colors disabled:opacity-60 ${FOCUS_RING}`}
                style={
                  active
                    ? { background: "var(--color-altus-red)", color: "#fff", border: "1px solid var(--color-altus-red)" }
                    : {
                        background: "var(--color-surface-soft)",
                        color: "var(--color-ink-soft)",
                        border: "1px solid var(--color-hairline-strong)",
                      }
                }
              >
                {p}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={v}
          disabled={disabled}
          aria-label="Progress percent"
          onChange={(e) => setV(clamp(Number(e.target.value)))}
          onMouseUp={() => commit(v)}
          onTouchEnd={() => commit(v)}
          onKeyUp={(e) => {
            if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") commit(v);
          }}
          className={`h-2 flex-1 cursor-pointer rounded-full accent-[var(--color-altus-red)] disabled:opacity-60 ${FOCUS_RING}`}
        />
        <span
          className="w-12 shrink-0 text-right text-[17px] font-black tabular-nums"
          style={{ fontFamily: "var(--font-display)", color: `var(--color-${tone}-deep)` }}
        >
          {v}%
        </span>
      </div>
    </div>
  );
}
