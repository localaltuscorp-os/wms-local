"use client";

import * as React from "react";
import {
  UserRound,
  Building2,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ArrowLeftRight,
  FileText,
  History,
} from "lucide-react";
import {
  RECOMMENDATIONS,
  type EvaluationInstance,
} from "@/lib/hr/candidate/evaluation-v2";
import {
  overallScore,
  allSectionScores,
  eligibilityVerdict,
  type ScoreContext,
  type SectionScore,
  type WeightProfile,
} from "@/lib/hr/candidate/evaluation-v2-scoring";
import { computeComposites, scoreBand } from "@/lib/hr/candidate/evaluation-v2-composites";

/**
 * EVALUATION v2 REPORT — the side-by-side Interviewer × Management comparison.
 *
 * Each role gets a column with: the weighted overall as a dial, every rating
 * section's weighted "X / Y" as a labeled bar, the X-Factor and Overall
 * Interviewer number shown SEPARATELY (never blended into the weighted score),
 * the eligibility verdict (all-clear vs deal-breaker), and the recommendation
 * chip. Where the two roles' section micro-averages diverge by ≥ 2 points, that
 * row is flagged in both columns so disagreements jump out.
 *
 * Load-neutral (CSS-string styling, no motion library) and print-friendly.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";

const DELTA_THRESHOLD = 2;

type Tone = { ring: string; fg: string; soft: string };

function toneFor(value: number | null): Tone {
  if (value === null) return { ring: "var(--color-hairline)", fg: "var(--color-ink-subtle)", soft: "var(--color-surface-soft)" };
  if (value >= 7) return { ring: "#16a34a", fg: "#15803d", soft: "color-mix(in srgb, #16a34a 12%, white)" };
  if (value >= 4) return { ring: "#f59e0b", fg: "#b45309", soft: "color-mix(in srgb, #f59e0b 16%, white)" };
  return { ring: RED, fg: RED_DEEP, soft: "color-mix(in srgb, var(--color-altus-red) 12%, white)" };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function EvaluationV2Report({
  interviewer,
  management,
  profile,
  ctx,
}: {
  interviewer: EvaluationInstance | null;
  management: EvaluationInstance | null;
  profile: Record<string, number>;
  ctx?: ScoreContext;
}) {
  const prof = profile as WeightProfile;

  const iScores = interviewer ? allSectionScores(interviewer, prof, ctx) : null;
  const mScores = management ? allSectionScores(management, prof, ctx) : null;

  // Sections where the two roles' 0–10 micro-averages diverge by ≥ threshold.
  const deltaBySection = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!iScores || !mScores) return map;
    for (let i = 0; i < iScores.length; i++) {
      const a = iScores[i];
      const b = mScores[i];
      if (!a || !b) continue;
      if (a.micro !== null && b.micro !== null) {
        const d = Math.abs(a.micro - b.micro);
        if (d >= DELTA_THRESHOLD) map.set(a.sectionId, d);
      }
    }
    return map;
  }, [iScores, mScores]);

  const bothFilled = Boolean(interviewer) && Boolean(management);

  return (
    <div className="ev2-report">
      <style>{CSS}</style>

      {/* Legend header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
          <FileText size={14} style={{ color: RED }} /> Interviewer × Management
        </span>
        {bothFilled && (
          <span className="ev2-noprint inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RED }} />
            Rows flagged where the two differ by ≥ {DELTA_THRESHOLD} points
          </span>
        )}
      </div>

      {/* Two columns — stack on mobile */}
      <div className="grid grid-cols-2 gap-5 max-lg:grid-cols-1">
        <RoleColumn
          role="interviewer"
          instance={interviewer}
          scores={iScores}
          deltaBySection={deltaBySection}
          ctx={ctx}
          profile={prof}
        />
        <RoleColumn
          role="management"
          instance={management}
          scores={mScores}
          deltaBySection={deltaBySection}
          ctx={ctx}
          profile={prof}
        />
      </div>

      {/* Per-criteria side-by-side table (rows A–K, + L/M for sales) */}
      <SectionComparisonTable iScores={iScores} mScores={mScores} deltaBySection={deltaBySection} />

      {/* Management can override the recommendation with a reason (surfaced in the
          column above). Custom weight tuning is DEFERRED — scoring uses the default
          section weights until the Dept → Role → Designation hierarchy exists. */}
      <p className="mt-3 text-[11.5px] font-medium leading-snug text-ink-subtle">
        Management can override the recommendation with a reason. Custom weight tuning is temporarily disabled — every score uses the default section weights.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Role column                                                         */
/* ------------------------------------------------------------------ */

const ROLE_META = {
  interviewer: { label: "Interviewer", sub: "Candidate Evaluation Checklist", icon: UserRound },
  management: { label: "Management", sub: "Management Assessment", icon: Building2 },
} as const;

function RoleColumn({
  role,
  instance,
  scores,
  deltaBySection,
  ctx,
  profile,
}: {
  role: "interviewer" | "management";
  instance: EvaluationInstance | null;
  scores: SectionScore[] | null;
  deltaBySection: Map<string, number>;
  ctx?: ScoreContext;
  profile: WeightProfile;
}) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const composites = instance ? computeComposites(instance, profile, ctx) : null;

  return (
    <section className="ev2-col flex flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      {/* Column header */}
      <header
        className="flex items-center gap-2.5 border-b border-hairline px-5 py-3.5"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, white)" }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <h3
            className="text-[16px] font-black leading-tight text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}
          >
            {meta.label}
          </h3>
          <p className="truncate text-[12px] font-medium text-ink-muted">{meta.sub}</p>
        </div>
      </header>

      {!instance || !scores ? (
        <NotFilled />
      ) : (
        <div className="flex flex-1 flex-col gap-5 p-5">
          {/* Overall dial + recommendation */}
          <div className="flex flex-wrap items-center gap-5">
            <OverallDial instance={instance} ctx={ctx} interviewScore={composites?.interviewScore ?? null} />
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Recommendation</p>
              <RecommendationChip value={instance.recommendation} overridden={Boolean(instance.recommendationOverride)} />
              <div className="mt-3">
                <EligibilityBadge instance={instance} />
              </div>
            </div>
          </div>

          {/* Composite scorecard + gut number */}
          {composites && (
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Composite scorecard</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
                {composites.scorecard.map((c) => {
                  const band = scoreBand(c.score);
                  return (
                    <div key={c.key} className="rounded-lg border border-hairline bg-surface-soft px-2 py-2 text-center">
                      <p className="truncate text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">{c.label}</p>
                      <p className="text-[16px] font-black tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: c.score === null ? "var(--color-ink-subtle)" : band.tone }}>
                        {c.score === null ? "—" : fmt(c.score)}
                      </p>
                    </div>
                  );
                })}
                <StatTile icon={<Gauge size={13} />} label="Gut" value={instance.overall} hint="Manual" compact />
              </div>
            </div>
          )}

          {/* Override note — the Management score override stays intact here. */}
          {instance.recommendationOverride && (
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "color-mix(in srgb, #d97706 35%, white)", background: "color-mix(in srgb, #d97706 6%, white)" }}>
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#b45309" }}>
                <History size={12} /> Recommendation overridden
              </p>
              <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">{instance.recommendationOverride.reason}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Criteria comparison table (Interviewer | Management | Δ)            */
/* ------------------------------------------------------------------ */

function SectionComparisonTable({
  iScores,
  mScores,
  deltaBySection,
}: {
  iScores: SectionScore[] | null;
  mScores: SectionScore[] | null;
  deltaBySection: Map<string, number>;
}) {
  // Both instances are scored over the same section set (same profile + ctx),
  // so either non-null array gives the full, ordered row list.
  const base = iScores ?? mScores ?? [];
  const iById = React.useMemo(() => new Map((iScores ?? []).map((s) => [s.sectionId, s])), [iScores]);
  const mById = React.useMemo(() => new Map((mScores ?? []).map((s) => [s.sectionId, s])), [mScores]);

  if (base.length === 0) return null;

  return (
    <div className="ev2-cmp mt-5 overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <div
        className="flex items-center gap-2 border-b border-hairline px-4 py-3"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, white)" }}
      >
        <ArrowLeftRight size={14} style={{ color: RED }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">Criteria comparison</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
              <th className="px-4 py-2.5 font-bold">Criteria</th>
              <th className="px-3 py-2.5 text-right font-bold">Interviewer</th>
              <th className="px-3 py-2.5 text-right font-bold">Management</th>
              <th className="px-4 py-2.5 text-right font-bold">Δ</th>
            </tr>
          </thead>
          <tbody>
            {base.map((row) => {
              const iS = iById.get(row.sectionId) ?? null;
              const mS = mById.get(row.sectionId) ?? null;
              const delta = deltaBySection.get(row.sectionId);
              const flagged = delta !== undefined;
              return (
                <tr
                  key={row.sectionId}
                  className="border-t border-hairline"
                  style={flagged ? { background: "color-mix(in srgb, var(--color-altus-red) 5%, white)" } : undefined}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-black text-white"
                        style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                      >
                        {row.code}
                      </span>
                      <span className="text-[13px] font-semibold text-ink-strong">{row.title}</span>
                    </span>
                  </td>
                  <ScoreCell s={iS} />
                  <ScoreCell s={mS} />
                  <td className="px-4 py-2.5 text-right">
                    {flagged ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[11px] font-black tabular-nums"
                        style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, white)", color: RED_DEEP }}
                        title={`The two roles differ by ${fmt(delta!)} points on this criterion`}
                      >
                        <ArrowLeftRight size={10} strokeWidth={2.6} /> {fmt(delta!)}
                      </span>
                    ) : (
                      <span className="text-[12px] font-semibold text-ink-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreCell({ s }: { s: SectionScore | null }) {
  if (!s) {
    return (
      <td className="px-3 py-2.5 text-right">
        <span className="text-[12px] font-semibold text-ink-subtle">—</span>
      </td>
    );
  }
  if (!s.applicable) {
    return (
      <td className="px-3 py-2.5 text-right">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Skipped</span>
      </td>
    );
  }
  const rated = s.micro !== null;
  const tone = toneFor(s.micro);
  return (
    <td className="px-3 py-2.5 text-right">
      <span className="inline-flex items-baseline gap-1 tabular-nums">
        <span className="text-[14px] font-black" style={{ color: rated ? tone.fg : "var(--color-ink-subtle)" }}>
          {rated ? fmt(s.micro!) : "—"}
        </span>
        <span className="text-[10.5px] font-bold text-ink-subtle">/10</span>
      </span>
    </td>
  );
}

/* ------------------------------------------------------------------ */
/* Overall dial                                                        */
/* ------------------------------------------------------------------ */

function OverallDial({ instance, ctx, interviewScore }: { instance: EvaluationInstance; ctx?: ScoreContext; interviewScore: number | null }) {
  const overall = overallScore(instance, undefined, ctx);
  const value = overall.avg;
  const tone = toneFor(value);

  const R = 48;
  const C = 2 * Math.PI * R;
  const frac = value === null ? 0 : Math.max(0, Math.min(1, value / 10));
  const dash = C * frac;

  return (
    <div className="flex shrink-0 items-center gap-3.5">
      <div className="relative grid place-items-center" style={{ width: 120, height: 120 }}>
        <svg width={120} height={120} viewBox="0 0 120 120">
          <circle cx={60} cy={60} r={R} fill="none" stroke="var(--color-hairline)" strokeWidth={10} />
          <circle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke={tone.ring}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C - dash}`}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute grid place-items-center text-center">
          <span
            className="text-[27px] font-black leading-none tabular-nums text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
          >
            {value === null ? "—" : fmt(value)}
            <span className="text-[14px] font-bold text-ink-subtle">/10</span>
          </span>
          <span className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Weighted</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tone.fg }}>
          {interviewScore === null ? "Not scored" : `${interviewScore} / 100`}
        </p>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-ink-muted">
          {overall.ratedSections} / {overall.applicableSections} sections rated
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile (X-Factor / Overall)                                      */
/* ------------------------------------------------------------------ */

function StatTile({
  icon,
  label,
  value,
  hint,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  hint: string;
  compact?: boolean;
}) {
  const tone = toneFor(value);
  if (compact) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-soft px-2 py-2 text-center" title={hint}>
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.05em] text-ink-soft">{label}</p>
        <p className="text-[16px] font-black tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: value === null ? "var(--color-ink-subtle)" : tone.fg }}>
          {value === null ? "—" : fmt(value)}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        <span style={{ color: RED }}>{icon}</span> {label}
      </div>
      <p className="mt-1.5 text-[22px] font-black leading-none tabular-nums" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", color: value === null ? "var(--color-ink-subtle)" : tone.fg }}>
        {value === null ? "—" : fmt(value)}
        <span className="text-[13px] font-bold text-ink-subtle">/10</span>
      </p>
      <p className="mt-1 text-[11px] font-medium leading-snug text-ink-subtle">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendation chip                                                 */
/* ------------------------------------------------------------------ */

function RecommendationChip({ value, overridden }: { value: EvaluationInstance["recommendation"]; overridden?: boolean }) {
  if (!value) {
    return (
      <span className="inline-flex items-center rounded-pill border border-solid border-hairline-strong px-3 py-1.5 text-[13px] font-semibold text-ink-subtle">
        No recommendation yet
      </span>
    );
  }
  const rec = RECOMMENDATIONS.find((r) => r.value === value);
  const tone = rec?.tone ?? "#64748b";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[13.5px] font-bold"
        style={{ background: `color-mix(in srgb, ${tone} 14%, white)`, color: tone }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
        {rec?.label ?? value}
      </span>
      {overridden && (
        <span className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[10.5px] font-black uppercase tracking-[0.06em]" style={{ background: "color-mix(in srgb, #d97706 14%, white)", color: "#b45309" }}>
          <History size={10} /> Override
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Eligibility badge                                                   */
/* ------------------------------------------------------------------ */

function EligibilityBadge({ instance }: { instance: EvaluationInstance }) {
  const v = eligibilityVerdict(instance);

  let bg: string;
  let fg: string;
  let icon: React.ReactNode;
  let text: string;

  if (v.answered === 0) {
    bg = "var(--color-surface-soft)";
    fg = "var(--color-ink-subtle)";
    icon = <ShieldQuestion size={14} />;
    text = "Eligibility not screened";
  } else if (v.dealbreaker) {
    bg = "color-mix(in srgb, var(--color-altus-red) 12%, white)";
    fg = RED_DEEP;
    icon = <ShieldAlert size={14} />;
    text = `Deal-breaker · ${v.noItems.length} failed`;
  } else if (v.noItems.length > 0) {
    bg = "color-mix(in srgb, #f59e0b 16%, white)";
    fg = "#b45309";
    icon = <ShieldAlert size={14} />;
    text = `${v.noItems.length} flagged · exception noted`;
  } else {
    bg = "color-mix(in srgb, #16a34a 12%, white)";
    fg = "#15803d";
    icon = <ShieldCheck size={14} />;
    text = "Eligibility all-clear";
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold" style={{ background: bg, color: fg }}>
      {icon} {text}
      <span className="font-semibold opacity-70">
        · {v.answered}/{v.total}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Not-filled placeholder                                              */
/* ------------------------------------------------------------------ */

function NotFilled() {
  return (
    <div className="flex flex-1 items-center gap-3 px-5 py-6">
      <span
        className="grid shrink-0 place-items-center rounded-xl"
        style={{ height: 40, width: 40, background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}
      >
        <FileText size={19} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
          Not filled yet
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-ink-muted">
          Once this pass is saved, its scores appear here for comparison.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Print + layout CSS                                                  */
/* ------------------------------------------------------------------ */

const CSS = `
  .ev2-report .ev2-col { break-inside: avoid; }
  @media print {
    .ev2-report .ev2-noprint { display: none !important; }
    .ev2-report { color: #000; }
    .ev2-report .grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
    .ev2-report .ev2-col { box-shadow: none !important; border-color: #d4d4d8 !important; }
    .ev2-report svg circle { transition: none !important; }
    .ev2-report * { transition: none !important; }
  }
`;
