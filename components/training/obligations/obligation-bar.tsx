"use client";

/**
 * A single obligation progress bar: actual-vs-target with a red/amber/green fill.
 *
 * Status policy (target-vs-actual): met (≥100%) = green, on-track (≥ the slice of
 * the month already elapsed) = amber, behind = red. Pro-rating by `expectedPct`
 * means we don't flag someone "red" on the 3rd of the month for not yet hitting a
 * full-month target. Pure presentational + keyboard/screen-reader friendly.
 */

export type ObligationStatus = "met" | "ontrack" | "behind" | "na";

const COLORS: Record<ObligationStatus, string> = {
  met: "#16a34a", // green
  ontrack: "#d97706", // amber
  behind: "#dc2626", // red
  na: "var(--color-hairline-strong)",
};

export function statusFor(actual: number, target: number, expectedPct: number): ObligationStatus {
  if (target <= 0) return "na";
  const pct = actual / target;
  if (pct >= 1) return "met";
  if (pct >= Math.min(0.999, expectedPct)) return "ontrack";
  return "behind";
}

export function ObligationBar({
  label,
  actual,
  target,
  unit,
  expectedPct,
  fmt = (n: number) => String(Math.round(n * 10) / 10),
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  /** Fraction of the period elapsed (0..1) — the on-track threshold. */
  expectedPct: number;
  fmt?: (n: number) => string;
}) {
  const status = statusFor(actual, target, expectedPct);
  const fillPct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const color = COLORS[status];
  const naLabel = target <= 0 ? "n/a" : `${fmt(actual)}/${fmt(target)} ${unit}`;

  return (
    <div
      role="meter"
      aria-label={`${label}: ${naLabel}`}
      aria-valuenow={Math.round(actual)}
      aria-valuemin={0}
      aria-valuemax={Math.max(1, Math.round(target))}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink-muted">{label}</span>
        <span className="tabular-nums text-[12.5px] font-bold" style={{ color: target <= 0 ? "var(--color-ink-subtle)" : color }}>
          {target <= 0 ? "—" : <>{fmt(actual)}<span className="text-ink-subtle font-medium">/{fmt(target)} {unit}</span></>}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-surface-soft">
        <div
          className="h-full rounded-pill transition-[width] duration-500"
          style={{ width: `${fillPct}%`, background: color }}
        />
      </div>
    </div>
  );
}
