"use client";
import * as React from "react";

interface WeeklyPoint {
  weekStart: string;
  weekLabel: string;
  created: number;
  completed: number;
}

interface Props {
  data: WeeklyPoint[];
}

/**
 * Velocity = two smooth curves over time, blue (new) and green
 * (finished), with faint gradient fills underneath. Generous padding
 * so the lines breathe; explicit Y-axis ticks, week labels along X;
 * hover anywhere drops a vertical guide, highlights both points, and
 * shows a floating tooltip with both values + the weekly net.
 *
 * End-of-line labels pin "New tasks" and "Finished" colors to the
 * series without needing an extra legend.
 */
export function VelocityChart({ data }: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(960);
  const [hover, setHover] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isNarrow = width < 640;
  const height = isNarrow ? 320 : 380;
  const padL = isNarrow ? 40 : 56;
  // No end-of-line labels on narrow screens → reclaim the right padding.
  const padR = isNarrow ? 20 : 96;
  const padT = 32;
  const padB = 52;

  const innerW = Math.max(width - padL - padR, 120);
  const innerH = height - padT - padB;

  const rawMax = Math.max(
    ...data.map((d) => Math.max(d.created, d.completed)),
    1,
  );
  // Nice rounded Y-max so ticks read cleanly (e.g. 25, 50, 100, 150).
  const niceMax = niceCeil(rawMax);

  const n = Math.max(data.length, 2);
  const xAt = (i: number) => padL + (i / (n - 1)) * innerW;
  const yAt = (v: number) => padT + (1 - v / niceMax) * innerH;

  const createdPoints = data.map((d, i) => ({ x: xAt(i), y: yAt(d.created) }));
  const completedPoints = data.map((d, i) => ({
    x: xAt(i),
    y: yAt(d.completed),
  }));

  const createdLine = smoothPath(createdPoints);
  const completedLine = smoothPath(completedPoints);

  const baselineY = padT + innerH;
  const createdArea = areaPath(createdLine, createdPoints, baselineY);
  const completedArea = areaPath(completedLine, completedPoints, baselineY);

  // Y-axis ticks — 3 evenly spaced from 0 to niceMax.
  const yTicks = [0, niceMax / 2, niceMax].map((v) => ({
    v,
    y: yAt(v),
  }));

  // X-axis tick density — adapts to viewport. On narrow screens each
  // "MMM d" label needs ~64px to read; we divide width by that to pick
  // a stride that keeps labels from overlapping.
  const maxTicks = Math.max(2, Math.floor(innerW / 70));
  const stride = Math.max(1, Math.ceil(data.length / maxTicks));
  const xTicks = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % stride === 0 || i === data.length - 1);

  // End-of-line "New" / "Finished" pinned labels need ~70px of right
  // padding (padR). On narrow screens we drop the text and keep just
  // the dot — the tooltip on tap still shows the channel.
  const showEndLabels = width >= 640;

  const lastIdx = data.length - 1;
  const lastCreated = createdPoints[lastIdx];
  const lastCompleted = completedPoints[lastIdx];

  // Hover position → nearest data point index.
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * width;
    if (mx < padL - 6 || mx > padL + innerW + 6) {
      setHover(null);
      return;
    }
    const idx = Math.round(((mx - padL) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const hovered = hover !== null ? data[hover] : null;
  const hoverX = hover !== null ? xAt(hover) : 0;
  const hoverCreatedY = hover !== null ? yAt(hovered!.created) : 0;
  const hoverCompletedY = hover !== null ? yAt(hovered!.completed) : 0;
  const hoverNet = hovered ? hovered.created - hovered.completed : 0;

  return (
    <div ref={containerRef} className="w-full relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Task velocity over weeks"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id="vc-created-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-blue)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-blue)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="vc-completed-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-green)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-green)" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + tick labels */}
        {yTicks.map((t) => (
          <g key={`yt-${t.v}`}>
            <line
              x1={padL}
              y1={t.y}
              x2={padL + innerW}
              y2={t.y}
              stroke="var(--color-hairline)"
              strokeWidth={1}
              strokeDasharray={t.v === 0 ? "0" : "3 4"}
            />
            <text
              x={padL - 10}
              y={t.y + 4}
              textAnchor="end"
              style={{
                fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                fontSize: 13,
                fontWeight: 700,
                fill: "var(--color-ink-muted)",
              }}
            >
              {t.v}
            </text>
          </g>
        ))}

        {/* X-axis tick labels */}
        {xTicks.map(({ d, i }) => (
          <text
            key={`xt-${d.weekStart}`}
            x={xAt(i)}
            y={baselineY + 22}
            textAnchor={
              i === 0 ? "start" : i === lastIdx ? "end" : "middle"
            }
            style={{
              fontFamily: "var(--font-mono-display), ui-monospace, monospace",
              fontSize: 12,
              fontWeight: 700,
              fill: "var(--color-ink-subtle)",
              letterSpacing: "0.04em",
            }}
          >
            {d.weekLabel}
          </text>
        ))}

        {/* Area fills */}
        <path d={createdArea} fill="url(#vc-created-fill)" />
        <path d={completedArea} fill="url(#vc-completed-fill)" />

        {/* Smooth lines */}
        <path
          d={completedLine}
          fill="none"
          stroke="var(--color-green-deep)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={createdLine}
          fill="none"
          stroke="var(--color-blue-deep)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End-of-line labels — color-coded so the legend lives ON the chart.
            Text labels drop out below 640px viewport (mobile); the dot
            stays so the user can still read the latest data point. */}
        {lastCreated && (
          <g>
            <circle
              cx={lastCreated.x}
              cy={lastCreated.y}
              r={6}
              fill="var(--color-blue)"
              stroke="#ffffff"
              strokeWidth={2.5}
            />
            {showEndLabels && (
              <text
                x={lastCreated.x + 12}
                y={lastCreated.y + 5}
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: 14,
                  fontWeight: 800,
                  fill: "var(--color-blue-deep)",
                }}
              >
                New
              </text>
            )}
          </g>
        )}
        {lastCompleted && (
          <g>
            <circle
              cx={lastCompleted.x}
              cy={lastCompleted.y}
              r={6}
              fill="var(--color-green)"
              stroke="#ffffff"
              strokeWidth={2.5}
            />
            {showEndLabels && (
              <text
                x={lastCompleted.x + 12}
                y={lastCompleted.y + 5}
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: 14,
                  fontWeight: 800,
                  fill: "var(--color-green-deep)",
                }}
              >
                Finished
              </text>
            )}
          </g>
        )}

        {/* HOVER LAYER */}
        {hovered && hover !== null && (
          <g>
            {/* Vertical guide */}
            <line
              x1={hoverX}
              y1={padT}
              x2={hoverX}
              y2={baselineY}
              stroke="var(--color-ink-strong)"
              strokeWidth={1}
              strokeOpacity={0.32}
              strokeDasharray="4 4"
            />
            {/* Highlighted dots */}
            <circle
              cx={hoverX}
              cy={hoverCreatedY}
              r={7}
              fill="var(--color-blue)"
              stroke="#ffffff"
              strokeWidth={3}
              style={{
                filter: "drop-shadow(0 2px 8px rgba(59,130,246,0.45))",
              }}
            />
            <circle
              cx={hoverX}
              cy={hoverCompletedY}
              r={7}
              fill="var(--color-green)"
              stroke="#ffffff"
              strokeWidth={3}
              style={{
                filter: "drop-shadow(0 2px 8px rgba(34,197,94,0.45))",
              }}
            />
          </g>
        )}
      </svg>

      {/* Tooltip card — rendered as an HTML overlay so its text scales
          like the rest of the dashboard. Positioned by clamping the
          hover X into the visible band so it never clips off-screen. */}
      {hovered && hover !== null && (
        <Tooltip
          weekLabel={hovered.weekLabel}
          created={hovered.created}
          completed={hovered.completed}
          net={hoverNet}
          left={(hoverX / width) * 100}
        />
      )}
    </div>
  );
}

function Tooltip({
  weekLabel,
  created,
  completed,
  net,
  left,
}: {
  weekLabel: string;
  created: number;
  completed: number;
  net: number;
  left: number;
}) {
  const netGood = net <= 0;
  // Clamp the tooltip horizontally so it doesn't fly off either edge.
  const clamped = Math.max(6, Math.min(94, left));
  return (
    <div
      className="pointer-events-none absolute -mt-2"
      style={{
        left: `${clamped}%`,
        transform: "translate(-50%, -100%)",
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline-strong)",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
        minWidth: 220,
        zIndex: 5,
      }}
    >
      <div
        className="uppercase tracking-[0.10em] mb-2"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-ink-subtle)",
        }}
      >
        Week of {weekLabel}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--color-blue)",
              boxShadow: "0 0 6px rgba(59,130,246,0.5)",
            }}
          />
          <span
            className="font-bold"
            style={{ fontSize: 15, color: "var(--color-ink-strong)" }}
          >
            New
          </span>
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 22,
            color: "var(--color-blue-deep)",
          }}
        >
          {created}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--color-green)",
              boxShadow: "0 0 6px rgba(34,197,94,0.5)",
            }}
          />
          <span
            className="font-bold"
            style={{ fontSize: 15, color: "var(--color-ink-strong)" }}
          >
            Finished
          </span>
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 22,
            color: "var(--color-green-deep)",
          }}
        >
          {completed}
        </span>
      </div>
      <div
        className="mt-2 pt-2 flex items-baseline justify-between gap-4"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <span
          className="uppercase tracking-[0.10em] font-bold"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 12,
            color: "var(--color-ink-subtle)",
          }}
        >
          Net
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 20,
            color: netGood
              ? "var(--color-green-deep)"
              : "var(--color-amber-deep)",
          }}
        >
          {net > 0 ? "+" : ""}
          {net}
        </span>
      </div>
    </div>
  );
}

/** Cubic-bezier smoothed path through a series of points. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dx = curr.x - prev.x;
    const cp1x = prev.x + dx * 0.4;
    const cp1y = prev.y;
    const cp2x = curr.x - dx * 0.4;
    const cp2y = curr.y;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }
  return d;
}

/** Close a line path into an area by dropping to baseline at both ends. */
function areaPath(
  linePath: string,
  points: { x: number; y: number }[],
  baselineY: number,
): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

/** Round a max value up to a nice tick boundary so axis labels read cleanly. */
function niceCeil(n: number): number {
  if (n <= 10) return Math.max(5, Math.ceil(n / 5) * 5);
  if (n <= 50) return Math.ceil(n / 10) * 10;
  if (n <= 200) return Math.ceil(n / 25) * 25;
  if (n <= 1000) return Math.ceil(n / 50) * 50;
  return Math.ceil(n / 100) * 100;
}
