"use client";
import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";

/**
 * TargetActualBars — grouped horizontal bars comparing actual delivery against
 * the goal/target per report row. Actual is brand green; the goal is a muted
 * grey marker bar behind it. Bars grow on via scaleX (GPU transform) and carry
 * value labels.
 *
 * Pure / presentational — `rows` is an array of { label, actual, goal }.
 */
export type BarRow = {
  label: string;
  actual: number;
  goal: number;
};

export type TargetActualBarsProps = {
  rows: BarRow[];
  /** Bar track height in px. */
  barHeight?: number;
};

export function TargetActualBars({ rows, barHeight = 16 }: TargetActualBarsProps) {
  const reduce = useReducedMotion() ?? false;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.goal)));

  const [grown, setGrown] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) {
      setGrown(true);
      return;
    }
    setGrown(false);
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, max, rows.length]);

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r, i) => {
        const actualPct = (r.actual / max) * 100;
        const goalPct = (r.goal / max) * 100;
        const hit = r.goal > 0 && r.actual >= r.goal;
        const green = "var(--color-green)";
        const greenDeep = "var(--color-green-deep)";

        return (
          <li key={`${r.label}-${i}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span
                className="truncate font-bold text-ink-strong"
                style={{ fontSize: 14 }}
                title={r.label}
              >
                {r.label}
              </span>
              <span className="flex items-baseline gap-1.5 shrink-0">
                <span
                  className="tabular-nums font-black"
                  style={{ fontSize: 15, color: hit ? greenDeep : "var(--color-ink-strong)" }}
                >
                  {r.actual}
                </span>
                <span
                  className="tabular-nums font-semibold"
                  style={{ fontSize: 12.5, color: "var(--color-ink-muted)" }}
                >
                  / {r.goal}
                </span>
              </span>
            </div>

            {/* Track */}
            <div
              className="relative w-full overflow-hidden rounded-full"
              style={{
                height: barHeight,
                background: "var(--color-hairline)",
              }}
            >
              {/* Goal marker — muted grey fill behind actual. */}
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${goalPct}%`,
                  background: "color-mix(in srgb, var(--color-slate) 26%, transparent)",
                  transformOrigin: "left center",
                  transform: grown ? "scaleX(1)" : "scaleX(0)",
                  transition: reduce
                    ? "none"
                    : `transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.06 + 0.05}s`,
                }}
              />
              {/* Goal tick line. */}
              <span
                aria-hidden
                className="absolute inset-y-0"
                style={{
                  left: `calc(${goalPct}% - 1px)`,
                  width: 2,
                  background: "var(--color-slate-deep)",
                  opacity: grown ? 0.7 : 0,
                  transition: reduce ? "none" : "opacity 0.4s ease 0.5s",
                }}
              />

              {/* Actual — brand green, drawn over the goal. */}
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${actualPct}%`,
                  background: `linear-gradient(90deg, ${greenDeep}, ${green})`,
                  boxShadow: hit
                    ? "0 0 10px color-mix(in srgb, var(--color-green) 55%, transparent)"
                    : "none",
                  transformOrigin: "left center",
                  transform: grown ? "scaleX(1)" : "scaleX(0)",
                  transition: reduce
                    ? "none"
                    : `transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.06}s`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
