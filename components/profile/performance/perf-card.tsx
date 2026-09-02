"use client";

import { SectionHeader } from "@/components/profile/identity/avatar-and-name";

interface Props {
  stats: {
    thisWeek: { completed: number; onTimeRate: number };
    thisMonth: { completed: number; onTimeRate: number };
    lifetime: { completed: number; avgCycleHours: number; overdueRate: number };
    weeklyTrend: Array<{ weekStart: string; me: number; teamAvg: number }>;
  };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function hours(n: number): string {
  if (n >= 48) return `${Math.round(n / 24)}d`;
  if (n >= 1) return `${Math.round(n)}h`;
  return `${Math.round(n * 60)}m`;
}

export function PerfCard({ stats }: Props) {
  return (
    <section
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        padding: 32,
      }}
    >
      <SectionHeader
        title="Performance"
        description="Your recent throughput, on-time rate, and lifetime trends. Numbers refresh every minute."
        savedAt={null}
      />

      <div
        className="perf-strip"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <Column
          label="This week"
          rows={[
            { label: "Completed", value: stats.thisWeek.completed.toString() },
            { label: "On-time", value: pct(stats.thisWeek.onTimeRate) },
          ]}
          accent="#16A34A"
        />
        <Column
          label="This month"
          rows={[
            { label: "Completed", value: stats.thisMonth.completed.toString() },
            { label: "On-time", value: pct(stats.thisMonth.onTimeRate) },
          ]}
          accent="#2563EB"
        />
        <Column
          label="Lifetime"
          rows={[
            { label: "Completed", value: stats.lifetime.completed.toString() },
            { label: "Avg cycle", value: hours(stats.lifetime.avgCycleHours) },
            { label: "Overdue", value: pct(stats.lifetime.overdueRate) },
          ]}
          accent="#E10600"
        />
      </div>

      <h3
        style={{
          margin: "0 0 12px",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--color-ink-soft)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Last 12 weeks — completed
      </h3>
      <TrendChart trend={stats.weeklyTrend} />

      <style>{`
        @media (max-width: 768px) {
          .perf-strip {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}

function Column({
  label,
  rows,
  accent,
}: {
  label: string;
  rows: { label: string; value: string }[];
  accent: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-stripe)",
        border: "1px solid rgba(15, 23, 42, 0.05)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-ink-soft)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: "var(--color-ink-subtle)",
                fontWeight: 500,
              }}
            >
              {r.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
                fontSize: 22,
                fontWeight: 700,
                color: accent,
                letterSpacing: "-0.02em",
              }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({
  trend,
}: {
  trend: Array<{ weekStart: string; me: number; teamAvg: number }>;
}) {
  if (trend.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: "var(--color-ink-subtle)" }}>
        No completion data yet — finish some tasks and the trend will appear.
      </p>
    );
  }
  const W = 600;
  const H = 140;
  const PAD = 24;
  const max = Math.max(
    1,
    ...trend.map((t) => Math.max(t.me, t.teamAvg)),
  );
  const xStep = (W - PAD * 2) / Math.max(1, trend.length - 1);

  function point(values: number[]): string {
    return values
      .map((v, i) => {
        const x = PAD + i * xStep;
        const y = H - PAD - (v / max) * (H - PAD * 2);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  }

  const mePath = point(trend.map((t) => t.me));
  const teamPath = point(trend.map((t) => t.teamAvg));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", maxWidth: 720 }}
        aria-label="Tasks completed per week, last 12 weeks"
      >
        {/* baseline */}
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="rgba(15, 23, 42, 0.08)"
          strokeWidth={1}
        />
        {/* team avg (faint) */}
        <path
          d={teamPath}
          fill="none"
          stroke="rgb(148, 163, 184)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        {/* me */}
        <path
          d={mePath}
          fill="none"
          stroke="#E10600"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* dots */}
        {trend.map((t, i) => (
          <circle
            key={t.weekStart}
            cx={PAD + i * xStep}
            cy={H - PAD - (t.me / max) * (H - PAD * 2)}
            r={3}
            fill="#E10600"
          />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          gap: 20,
          fontSize: 12,
          color: "var(--color-ink-subtle)",
          marginTop: 6,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 2, background: "#E10600" }} /> You
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 16,
              height: 2,
              background:
                "repeating-linear-gradient(to right, rgb(148, 163, 184) 0 4px, transparent 4px 8px)",
            }}
          />{" "}
          Team average
        </span>
      </div>
    </div>
  );
}
