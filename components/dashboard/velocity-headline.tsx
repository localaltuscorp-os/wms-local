import { formatCount } from "@/lib/format";

/**
 * Two-card headline above the velocity chart. Each card follows the
 * same reading hierarchy as the KPI tiles below — a top channel-color
 * bar identifies the metric, then BIG label / HUGE number / BIG
 * sublabel. No gradient text effects, no decoration — readability
 * over polish.
 */
export function VelocityHeadline({
  totalCreated,
  totalCompleted,
}: {
  totalCreated: number;
  totalCompleted: number;
}) {
  const net = totalCreated - totalCompleted;
  return (
    <div
      className="grid grid-cols-2 max-md:grid-cols-1 gap-5 mb-7"
    >
      <Stat
        label="New tasks"
        value={totalCreated}
        sublabel="Coming in"
        tone="blue"
      />
      <Stat
        label="Finished"
        value={totalCompleted}
        sublabel="Going out"
        tone="green"
        net={net}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
  tone,
  net,
}: {
  label: string;
  value: number;
  sublabel: string;
  tone: "blue" | "green";
  /** Only the "Finished" card shows the net delta against new tasks. */
  net?: number;
}) {
  const showNet = typeof net === "number";
  const netGood = (net ?? 0) <= 0;

  return (
    <div
      className="relative bg-surface-card rounded-section overflow-hidden"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "32px 32px 28px",
      }}
    >
      {/* Top channel-color bar — same affordance as the KPI cards. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{
          background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
        }}
      />

      <div className="flex items-center justify-between gap-6 max-md:flex-col max-md:items-start max-md:gap-4">
        <div className="flex flex-col gap-3 min-w-0">
          <span
            className="uppercase font-black tracking-[0.10em] leading-none"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 22,
              color: `var(--color-${tone}-deep)`,
            }}
          >
            {label}
          </span>
          <span
            className="block leading-[0.85] tracking-[-0.04em] tabular-nums text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(72px, 7vw, 112px)",
            }}
          >
            {formatCount(value)}
          </span>
          <span
            className="font-bold leading-tight text-ink-strong"
            style={{ fontSize: 20 }}
          >
            {sublabel}
          </span>
        </div>

        {showNet && (
          <div className="flex flex-col items-end gap-1.5 shrink-0 max-md:items-start">
            <span
              className="inline-flex items-baseline gap-1.5 tabular-nums"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 800,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: netGood
                  ? "var(--color-green-deep)"
                  : "var(--color-amber-deep)",
              }}
            >
              <span aria-hidden style={{ fontSize: 22 }}>
                {netGood ? "▼" : "▲"}
              </span>
              {net! > 0 ? "+" : ""}
              {net}
            </span>
            <span
              className="uppercase font-bold tracking-[0.12em]"
              style={{
                fontSize: 14,
                color: "var(--color-ink-muted)",
              }}
            >
              net change
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
