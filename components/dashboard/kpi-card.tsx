"use client";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatCount } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";

// Six neon channels, one per KPI. The CSS @theme block in globals.css
// registers --kpi-neon-* RGB triplets matching these keys.
export type NeonKey =
  | "total"
  | "need-help"
  | "not-approved"
  | "done"
  | "pending"
  | "not-started";

interface BaseProps {
  label: string;
  sublabel: string;
  value: number;
  previous: number;
  /** 14-day trend series, oldest → newest. Rendered as a labeled
   *  TrendChart in the tile's white space. */
  sparkline: number[];
  neonKey: NeonKey;
  index?: number;
  href: Route;
}

/* Hero tile — Total. Full-width strip across the top of the KPI band.
   Number is the editorial centrepiece. No sparkline, no decorative
   eyebrows — every element on this tile earns its space by being
   readable at a glance. */
export function KpiHeroTile(props: BaseProps) {
  return <GlassTile {...props} variant="hero" />;
}

/* Status tile — one of five. Same minimal recipe as the hero, just
   sized down. Big label, huge number, big sublabel, big delta line. */
export function KpiStatusTile(props: BaseProps) {
  return <GlassTile {...props} variant="status" />;
}

function GlassTile({
  label,
  sublabel,
  value,
  previous,
  sparkline,
  neonKey,
  index = 0,
  href,
  variant,
}: BaseProps & { variant: "hero" | "status" }) {
  const animated = useCountUp(value);
  const delta = value - previous;
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "" : "";

  const neon = `var(--kpi-neon-${neonKey})`;
  const neonDeep = `var(--kpi-neon-${neonKey}-deep)`;

  return (
    <Link
      href={href}
      aria-label={`Open ${label} task list`}
      className="kpi-glass-tile group block focus-visible:outline-2 focus-visible:outline-offset-4"
      style={
        {
          "--kpi-neon": neon,
          outlineColor: `rgb(${neon})`,
          opacity: 0,
          animation: `kpiTileEnter 720ms cubic-bezier(0.2, 0.7, 0.3, 1) ${
            index * 90
          }ms forwards`,
        } as React.CSSProperties
      }
    >
      {/* Tinted top border bar — gives each card its channel signature
          without burning surface area on a label dot. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{
          background: `linear-gradient(90deg, rgb(${neon}), rgb(${neonDeep}))`,
        }}
      />

      {variant === "hero" ? (
        <HeroBody
          label={label}
          sublabel={sublabel}
          value={animated}
          delta={delta}
          deltaSign={deltaSign}
          arrow={arrow}
          sparkline={sparkline}
          neon={neon}
          neonDeep={neonDeep}
        />
      ) : (
        <StatusBody
          label={label}
          sublabel={sublabel}
          value={animated}
          delta={delta}
          deltaSign={deltaSign}
          arrow={arrow}
          sparkline={sparkline}
          neon={neon}
          neonDeep={neonDeep}
        />
      )}
    </Link>
  );
}

interface BodyProps {
  label: string;
  sublabel: string;
  value: number;
  delta: number;
  deltaSign: string;
  arrow: string;
  sparkline: number[];
  neon: string;
  neonDeep: string;
}

function HeroBody({
  label,
  sublabel,
  value,
  delta,
  deltaSign,
  arrow,
  sparkline,
  neon,
  neonDeep,
}: BodyProps) {
  return (
    <div className="relative z-[3] flex items-center justify-between gap-10 p-10 max-md:flex-col max-md:items-start max-md:gap-6 max-md:p-7">
      <div className="flex flex-col gap-4 min-w-0">
        {/* LABEL — huge, uppercase, channel-deep */}
        <span
          className="uppercase font-black tracking-[0.10em] leading-none"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "clamp(22px, 2vw, 32px)",
            color: `rgb(${neonDeep})`,
          }}
        >
          {label}
        </span>

        {/* BIG NUMBER */}
        <span
          className="block leading-[0.85] tracking-[-0.04em] tabular-nums text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(96px, 11vw, 160px)",
          }}
        >
          {formatCount(value)}
        </span>

        {/* SUBLABEL */}
        <span
          className="font-bold leading-tight text-ink-strong"
          style={{ fontSize: "clamp(22px, 1.6vw, 28px)" }}
        >
          {sublabel}
        </span>
      </div>

      {/* TREND CHART — fills the middle white space with a labeled line
          graph. X-axis: 14d → today. Y-axis: min / max range. */}
      <div className="flex-1 flex justify-center min-w-0 max-md:w-full max-md:order-3">
        <TrendChart values={sparkline} color={`rgb(${neon})`} variant="hero" />
      </div>

      {/* DELTA BLOCK — its own column, big and bold */}
      <div className="flex flex-col items-end gap-2 shrink-0 max-md:flex-row max-md:items-baseline max-md:gap-3">
        <span
          className="inline-flex items-baseline gap-2 text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: "clamp(36px, 3.4vw, 52px)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          <span
            aria-hidden
            style={{
              color: `rgb(${neon})`,
              fontSize: "0.65em",
            }}
          >
            {arrow}
          </span>
          {deltaSign}
          {Math.abs(delta)}
        </span>
        <span
          className="uppercase font-bold tracking-[0.12em]"
          style={{
            fontSize: 16,
            color: "var(--color-ink-muted)",
          }}
        >
          vs last week
        </span>
      </div>
    </div>
  );
}

function StatusBody({
  label,
  sublabel,
  value,
  delta,
  deltaSign,
  arrow,
  sparkline,
  neon,
  neonDeep,
}: BodyProps) {
  return (
    <div className="relative z-[3] flex flex-col gap-4 p-7 max-md:p-5">
      {/* LABEL — large + uppercase + channel-deep so each card is
          immediately identifiable from across the room */}
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 22,
          color: `rgb(${neonDeep})`,
        }}
      >
        {label}
      </span>

      {/* BIG NUMBER */}
      <span
        className="block leading-[0.85] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(72px, 7vw, 104px)",
        }}
      >
        {formatCount(value)}
      </span>

      {/* SUBLABEL */}
      <span
        className="font-bold leading-tight text-ink-strong"
        style={{ fontSize: 22 }}
      >
        {sublabel}
      </span>

      {/* TREND CHART — sits in the empty space between sublabel and
          delta line. Labeled X (14d → today) and Y (min / max) axes
          so the line reads as actual data, not decoration. */}
      <div className="mt-1 max-w-full overflow-hidden">
        <TrendChart values={sparkline} color={`rgb(${neon})`} variant="status" />
      </div>

      {/* DELTA — single line, no divider needed */}
      <div className="flex items-baseline gap-2.5 mt-1">
        <span
          className="inline-flex items-baseline gap-1.5 text-ink-strong tabular-nums"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "-0.015em",
          }}
        >
          <span
            aria-hidden
            style={{ color: `rgb(${neon})`, fontSize: 20 }}
          >
            {arrow}
          </span>
          {deltaSign}
          {Math.abs(delta)}
        </span>
        <span
          className="uppercase font-bold tracking-[0.10em]"
          style={{
            fontSize: 15,
            color: "var(--color-ink-muted)",
          }}
        >
          vs last week
        </span>
      </div>
    </div>
  );
}
