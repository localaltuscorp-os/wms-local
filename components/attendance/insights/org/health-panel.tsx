"use client";

import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "@/components/dashboard/exec/viz/use-anim-count";
import type { WorkforceHealth } from "@/lib/attendance/analytics/health-score";

/**
 * Workforce Health panel — a 240° radial gauge coloured by the health band,
 * flanked by the weighted component breakdown (each sub-score + contribution).
 */
export function HealthPanel({ health }: { health: WorkforceHealth }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr] items-center">
      <div className="flex flex-col items-center">
        <HealthGauge score={health.score} tone={health.band.tone} />
        <span
          className="mt-1 rounded-pill px-3 py-1 text-[12.5px] font-black uppercase tracking-[0.1em]"
          style={{ color: health.band.tone, background: `color-mix(in srgb, ${health.band.tone} 14%, transparent)` }}
        >
          {health.band.label}
        </span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {health.components.map((c) => (
          <li key={c.key} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate font-bold text-ink-strong" style={{ fontSize: 13.5 }} title={c.note}>
                  {c.label}
                  <span className="ml-1.5 text-[11px] font-semibold text-ink-muted">·  {c.weight}% weight</span>
                </span>
                <span className="tabular-nums font-black shrink-0" style={{ fontSize: 13.5, color: toneFor(c.score) }}>
                  {c.score}
                  <span className="text-[10.5px] text-ink-muted">/100</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${c.score}%`,
                    background: `linear-gradient(90deg, ${toneFor(c.score)}, color-mix(in srgb, ${toneFor(c.score)} 60%, white))`,
                  }}
                />
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-ink-muted">{c.note}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toneFor(score: number): string {
  if (score >= 85) return "var(--color-green-deep)";
  if (score >= 70) return "var(--color-teal-deep)";
  if (score >= 50) return "var(--color-amber-deep)";
  return "var(--color-altus-red-deep)";
}

function HealthGauge({ score, tone, size = 220 }: { score: number; tone: string; size?: number }) {
  const reduce = useReducedMotion() ?? false;
  const clamped = Math.max(0, Math.min(score, 100));

  // 240° arc from 150° → 30° (sweeping through the bottom).
  const stroke = Math.max(14, Math.round(size * 0.08));
  const r = (size - stroke) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 150;
  const sweep = 240;

  const polar = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const p0 = polar(startAngle);
  const p1 = polar(startAngle + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  const arcPath = `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
  const arcLen = (sweep / 360) * (2 * Math.PI * r);

  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setDrawn(true);
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, clamped]);

  const targetOffset = arcLen * (1 - clamped / 100);
  const offset = drawn ? targetOffset : arcLen;
  const display = useAnimCount(Math.round(clamped), 1200);
  const gradId = React.useId();
  const h = Math.round(size * 0.82);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} role="img" aria-label={`Workforce health score ${Math.round(clamped)} of 100`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone} />
            <stop offset="100%" stopColor={`color-mix(in srgb, ${tone} 65%, white)`} />
          </linearGradient>
        </defs>
        <path d={arcPath} fill="none" stroke="var(--color-hairline-strong)" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={arcPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={offset}
          style={{
            transition: reduce ? "none" : "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)",
            filter: `drop-shadow(0 0 8px color-mix(in srgb, ${tone} 55%, transparent))`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: -Math.round(size * 0.04) }}>
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: Math.round(size * 0.28),
            letterSpacing: "-0.03em",
            color: tone,
          }}
        >
          {display}
        </span>
        <span
          className="uppercase font-bold tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: Math.max(9, Math.round(size * 0.05)),
            color: "var(--color-ink-muted)",
          }}
        >
          health / 100
        </span>
      </div>
    </div>
  );
}
