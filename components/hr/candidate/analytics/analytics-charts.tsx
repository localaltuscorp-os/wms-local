"use client";

import * as React from "react";
import { useReducedMotion } from "@/lib/motion-utils";
import { useAnimCount } from "@/components/dashboard/exec/viz/use-anim-count";
import type {
  FunnelRow,
  InterviewerStat,
  ReasonCount,
  SectionAvg,
  SkillBar,
  SourceCount,
  TrendPoint,
} from "@/lib/hr/candidate/analytics-data";

/* ------------------------------------------------------------------ */
/* Shared band helpers                                                 */
/* ------------------------------------------------------------------ */

/** 0..100 band → brand tone. green ≥75 / amber ≥50 / red else. */
export function band100(v: number | null): { color: string; deep: string } {
  if (v === null) return { color: "var(--color-slate)", deep: "var(--color-slate-deep)" };
  if (v >= 75) return { color: "var(--color-green)", deep: "var(--color-green-deep)" };
  if (v >= 50) return { color: "var(--color-amber)", deep: "var(--color-amber-deep)" };
  return { color: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" };
}

/** 0..10 band → brand tone. green ≥7.5 / amber ≥5 / red else. */
export function band10(v: number | null): { color: string; deep: string } {
  if (v === null) return { color: "var(--color-slate)", deep: "var(--color-slate-deep)" };
  if (v >= 7.5) return { color: "var(--color-green)", deep: "var(--color-green-deep)" };
  if (v >= 5) return { color: "var(--color-amber)", deep: "var(--color-amber-deep)" };
  return { color: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" };
}

/* ------------------------------------------------------------------ */
/* Card shell                                                          */
/* ------------------------------------------------------------------ */

export function ChartCard({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-section border border-hairline bg-surface-card p-6 max-md:p-5 ${className ?? ""}`}
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <header className="mb-5 flex items-start gap-3">
        {icon && (
          <span
            aria-hidden
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(15,23,42,0.05)", color: "var(--color-ink-strong)" }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}
          >
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] font-medium text-ink-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
      <p className="text-[13.5px] font-medium text-ink-muted">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline donut — proper Altus states/labels                        */
/* ------------------------------------------------------------------ */

type PipeSeg = { key: string; label: string; value: number; color: string; deep: string };

export function PipelineDonut({
  slices,
  size = 208,
}: {
  slices: { new: number; shortlisted: number; hired: number; rejected: number };
  size?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const segs: PipeSeg[] = [
    { key: "hired", label: "Hired", value: slices.hired, color: "var(--color-green)", deep: "var(--color-green-deep)" },
    { key: "shortlisted", label: "Shortlisted", value: slices.shortlisted, color: "var(--color-teal)", deep: "var(--color-teal-deep)" },
    { key: "new", label: "New", value: slices.new, color: "var(--color-amber)", deep: "var(--color-amber-deep)" },
    { key: "rejected", label: "Rejected", value: slices.rejected, color: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" },
  ];
  const total = segs.reduce((s, x) => s + x.value, 0);

  const stroke = Math.max(16, Math.round(size * 0.14));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;

  const [drawn, setDrawn] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setDrawn(true);
    setDrawn(false);
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, total]);

  const display = useAnimCount(total, 1100);

  let cursor = 0;
  const arcs = segs.map((seg, i) => {
    const frac = total > 0 ? seg.value / total : 0;
    const len = frac * circ;
    const rotation = (cursor / circ) * 360;
    cursor += len;
    return { seg, len, rotation, i };
  });

  if (total === 0) return <EmptyState label="No candidates in the pipeline yet." />;

  return (
    <div className="flex items-center gap-7 max-md:flex-col max-md:gap-4">
      <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Pipeline, ${total} candidates`} style={{ overflow: "visible" }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={stroke} />
          {arcs.map(({ seg, len, rotation, i }) => (
            <circle
              key={seg.key}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={drawn ? 0 : len}
              transform={`rotate(${rotation - 90} ${cx} ${cx})`}
              style={{ transition: reduce ? "none" : `stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.12}s` }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="tabular-nums leading-none text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: Math.round(size * 0.24), letterSpacing: "-0.03em" }}
          >
            {display}
          </span>
          <span
            className="uppercase font-bold tracking-[0.14em]"
            style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace", fontSize: Math.max(9, Math.round(size * 0.05)), color: "var(--color-ink-muted)" }}
          >
            candidates
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {arcs.map(({ seg }) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <li key={seg.key} className="flex items-center gap-2.5">
              <span className="inline-block size-3 rounded-[4px]" style={{ background: seg.color, boxShadow: `0 0 6px color-mix(in srgb, ${seg.color} 55%, transparent)` }} />
              <span className="font-bold text-ink-strong" style={{ fontSize: 14, minWidth: 82 }}>{seg.label}</span>
              <span className="tabular-nums font-black" style={{ fontSize: 15, color: seg.deep }}>{seg.value}</span>
              <span className="tabular-nums font-semibold" style={{ fontSize: 12.5, color: "var(--color-ink-muted)" }}>{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funnel — stacked horizontal bar per position                       */
/* ------------------------------------------------------------------ */

const FUNNEL_STATES: { key: keyof Pick<FunnelRow, "new" | "shortlisted" | "hired" | "rejected">; label: string; color: string }[] = [
  { key: "hired", label: "Hired", color: "var(--color-green)" },
  { key: "shortlisted", label: "Shortlisted", color: "var(--color-teal)" },
  { key: "new", label: "New", color: "var(--color-amber)" },
  { key: "rejected", label: "Rejected", color: "var(--color-altus-red)" },
];

export function FunnelBars({ rows }: { rows: FunnelRow[] }) {
  const reduce = useReducedMotion() ?? false;
  const [grown, setGrown] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setGrown(true);
    setGrown(false);
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, rows.length]);

  if (rows.length === 0) return <EmptyState label="No roles captured yet." />;
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {rows.map((r, idx) => {
          const widthPct = (r.total / max) * 100;
          return (
            <li key={r.position}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate font-bold text-ink-strong" style={{ fontSize: 14 }} title={r.position}>{r.position}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {r.hireRate != null && (
                    <span className="tabular-nums font-bold" style={{ fontSize: 12.5, color: band100(r.hireRate).deep }}>{r.hireRate}% hire</span>
                  )}
                  <span className="tabular-nums font-black text-ink-strong" style={{ fontSize: 15 }}>{r.total}</span>
                </span>
              </div>
              <div
                className="flex w-full overflow-hidden rounded-full"
                style={{ height: 18, background: "var(--color-hairline)", width: `${Math.max(widthPct, 6)}%`, minWidth: 40 }}
              >
                {FUNNEL_STATES.map((st, si) => {
                  const val = r[st.key];
                  if (val <= 0) return null;
                  const segPct = (val / r.total) * 100;
                  return (
                    <div
                      key={st.key}
                      title={`${st.label}: ${val}`}
                      style={{
                        width: `${segPct}%`,
                        background: st.color,
                        transformOrigin: "left center",
                        transform: grown ? "scaleX(1)" : "scaleX(0)",
                        transition: reduce ? "none" : `transform 0.7s cubic-bezier(0.16,1,0.3,1) ${idx * 0.05 + si * 0.03}s`,
                      }}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
        {FUNNEL_STATES.map((st) => (
          <li key={st.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: st.color }} />
            <span className="text-[12px] font-semibold text-ink-muted">{st.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skill distribution — 0..10 bars, colour-banded                     */
/* ------------------------------------------------------------------ */

export function SkillDistribution({ skills }: { skills: SkillBar[] }) {
  const reduce = useReducedMotion() ?? false;
  const [grown, setGrown] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setGrown(true);
    setGrown(false);
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, skills.length]);

  const rated = skills.filter((s) => s.avg != null);
  if (rated.length === 0) return <EmptyState label="No skills scored yet." />;

  return (
    <ul className="flex flex-col gap-3">
      {skills.map((s, i) => {
        const tone = band10(s.avg);
        const pct = s.avg != null ? (s.avg / 10) * 100 : 0;
        return (
          <li key={s.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate font-semibold text-ink-strong" style={{ fontSize: 13.5 }} title={s.label}>{s.label}</span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="tabular-nums font-black" style={{ fontSize: 14, color: tone.deep }}>{s.avg != null ? s.avg.toFixed(1) : "—"}</span>
                {s.count > 0 && <span className="tabular-nums font-semibold" style={{ fontSize: 11.5, color: "var(--color-ink-muted)" }}>n={s.count}</span>}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${tone.deep}, ${tone.color})`,
                  transformOrigin: "left",
                  transform: grown ? "scaleX(1)" : "scaleX(0)",
                  transition: reduce ? "none" : `transform 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.03}s`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Section averages — compact bars 0..10                              */
/* ------------------------------------------------------------------ */

export function SectionAverages({ sections }: { sections: SectionAvg[] }) {
  const rated = sections.filter((s) => s.avg != null);
  if (rated.length === 0) return <EmptyState label="No section scores yet." />;
  return (
    <ul className="flex flex-col gap-3.5">
      {sections.map((s) => {
        const tone = band10(s.avg);
        const pct = s.avg != null ? (s.avg / 10) * 100 : 0;
        return (
          <li key={s.sectionId} className="flex items-center gap-3">
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg tabular-nums font-black text-white"
              style={{ background: tone.deep, fontSize: 12 }}
            >
              {s.code}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold text-ink-strong" style={{ fontSize: 13.5 }} title={s.title}>{s.title}</span>
                <span className="tabular-nums font-black shrink-0" style={{ fontSize: 14, color: tone.deep }}>{s.avg != null ? `${s.avg.toFixed(1)}/10` : "—"}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tone.deep}, ${tone.color})` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Rank list — interviewers                                           */
/* ------------------------------------------------------------------ */

export function InterviewerList({ people }: { people: InterviewerStat[] }) {
  if (people.length === 0) return <EmptyState label="No interviewers on record yet." />;
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {people.map((p, i) => {
        const tone = band100(p.avgScore);
        return (
          <li key={p.id ?? p.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums font-black"
              style={{ background: "rgba(15,23,42,0.05)", color: "var(--color-ink-strong)", fontSize: 12 }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-ink-strong" style={{ fontSize: 14 }}>{p.name}</div>
              <div className="text-[12px] font-medium text-ink-muted">
                {p.count} interview{p.count === 1 ? "" : "s"}
                {p.scored > 0 ? ` · ${p.scored} scored` : ""}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 tabular-nums font-black"
              style={{ fontSize: 13, color: tone.deep, background: `color-mix(in srgb, ${tone.color} 14%, transparent)` }}
            >
              {p.avgScore != null ? `${p.avgScore}` : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Reason list                                                        */
/* ------------------------------------------------------------------ */

export function ReasonList({ reasons }: { reasons: ReasonCount[] }) {
  if (reasons.length === 0) return <EmptyState label="No rejection reasons recorded yet." />;
  const max = Math.max(1, ...reasons.map((r) => r.count));
  return (
    <ul className="flex flex-col gap-2.5">
      {reasons.map((r) => (
        <li key={r.reason} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-[13.5px] font-semibold text-ink-strong" title={r.reason}>{r.reason}</span>
              <span className="tabular-nums font-black shrink-0" style={{ fontSize: 13.5, color: "var(--color-altus-red-deep)" }}>{r.count}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
              <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "linear-gradient(90deg, var(--color-altus-red-deep), var(--color-altus-red))" }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Sources                                                            */
/* ------------------------------------------------------------------ */

export function SourceList({ sources }: { sources: SourceCount[] }) {
  if (sources.length === 0) return <EmptyState label="No hiring-source data captured on the intake form." />;
  const max = Math.max(1, ...sources.map((s) => s.count));
  return (
    <ul className="flex flex-col gap-3">
      {sources.map((s) => (
        <li key={s.source}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink-strong" title={s.source}>{s.source}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              {s.hireRate != null && <span className="tabular-nums font-bold" style={{ fontSize: 12, color: band100(s.hireRate).deep }}>{s.hireRate}% hire</span>}
              <span className="tabular-nums font-black text-ink-strong" style={{ fontSize: 14 }}>{s.count}</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
            <span className="block h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: "linear-gradient(90deg, var(--color-indigo-deep, #4338ca), var(--color-indigo, #6366f1))" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Monthly trend — count bars + score line, correct month labels      */
/* ------------------------------------------------------------------ */

export function MonthlyTrend({ points }: { points: TrendPoint[] }) {
  const reduce = useReducedMotion() ?? false;
  const [grown, setGrown] = React.useState(reduce);
  React.useEffect(() => {
    if (reduce) return setGrown(true);
    setGrown(false);
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [reduce, points.length]);

  // Must run before the empty-state early return — a hook called after it
  // changes the hook order when `points` flips between empty and non-empty,
  // which throws "rendered fewer hooks than expected". (Preserved from live.)
  const gradId = React.useId();

  if (points.length === 0) return <EmptyState label="No interviews recorded yet." />;

  const W = 720;
  const H = 240;
  const padL = 40;
  const padR = 40;
  const padT = 30;
  const padB = 44;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const n = points.length;
  const slot = chartW / n;
  const barW = Math.min(46, slot * 0.5);

  // Score line points (0..100 → y). Only where avgScore != null.
  const scorePts = points.map((p, i) => ({
    x: padL + slot * (i + 0.5),
    y: p.avgScore != null ? padT + (1 - p.avgScore / 100) * chartH : null,
    score: p.avgScore,
  }));
  const linePath = (() => {
    let d = "";
    for (const pt of scorePts) {
      if (pt.y == null) continue;
      d += d === "" ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`;
    }
    return d;
  })();

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Interview volume and average score by month" style={{ minWidth: 460, display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-altus-red)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--color-altus-red-deep)" stopOpacity={0.7} />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="rgba(15,23,42,0.14)" strokeWidth={1} />

        {/* Count bars */}
        {points.map((p, i) => {
          const h = (p.count / maxCount) * chartH;
          const x = padL + slot * (i + 0.5) - barW / 2;
          const y = padT + chartH - h;
          // Tall bar → draw the count INSIDE the bar (white) so it never collides
          // with the score-line label above; short bar → above the bar.
          const insideBar = h > 30;
          const countY = insideBar ? y + 18 : Math.max(y - 6, padT - 2);
          return (
            <g key={p.month}>
              <rect
                x={x}
                y={grown ? y : padT + chartH}
                width={barW}
                height={grown ? h : 0}
                rx={4}
                fill={`url(#${gradId})`}
                style={{ transition: reduce ? "none" : `all 0.7s cubic-bezier(0.16,1,0.3,1) ${i * 0.05}s` }}
              />
              <text x={padL + slot * (i + 0.5)} y={countY} textAnchor="middle" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 13, fill: insideBar ? "#fff" : "var(--color-ink-strong)" }}>
                {p.count}
              </text>
              <text x={padL + slot * (i + 0.5)} y={H - 22} textAnchor="middle" style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace", fontSize: 11, fontWeight: 700, fill: "var(--color-ink-muted)" }}>
                {p.label}
              </text>
            </g>
          );
        })}

        {/* Score line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-green-deep)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: grown ? 1 : 0, transition: reduce ? "none" : "opacity 0.6s ease 0.4s" }}
          />
        )}
        {scorePts.map((pt) =>
          pt.y == null ? null : (
            <g key={`s-${pt.x}`} style={{ opacity: grown ? 1 : 0, transition: reduce ? "none" : "opacity 0.6s ease 0.5s" }}>
              <circle cx={pt.x} cy={pt.y} r={4} fill="var(--color-green-deep)" stroke="#fff" strokeWidth={2} />
              <text x={pt.x} y={pt.y - 9} textAnchor="middle" style={{ fontFamily: "var(--font-mono-display), ui-monospace, monospace", fontSize: 10.5, fontWeight: 800, fill: "var(--color-green-deep)" }}>
                {pt.score}
              </text>
            </g>
          ),
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: "var(--color-altus-red)" }} />
          <span className="text-[12px] font-semibold text-ink-muted">Interviews / Month</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: "var(--color-green-deep)" }} />
          <span className="text-[12px] font-semibold text-ink-muted">Avg Score (0–100)</span>
        </span>
      </div>
    </div>
  );
}
