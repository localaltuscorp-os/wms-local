"use client";

import * as React from "react";
import {
  Trophy,
  Target,
  Layers,
  ScrollText,
  Coins,
  Gauge,
  Megaphone,
} from "lucide-react";
import { kpiWeight, type RoleClass } from "@/lib/performance/framework";
import type { ScorecardResult, BucketResult } from "@/lib/performance/scoring";
import type { PerfNarrative } from "@/lib/performance/narrative";
import { Dial, toneFor } from "@/components/hr/candidate/evaluation-v2/dial";

/**
 * PERFORMANCE & INCENTIVE DOSSIER — the four-section record shown inside the
 * Appraisal scorecard. A pure presentation surface: every number arrives already
 * computed in `result` (lib/performance/scoring is the sole source of figures)
 * and every sentence in `narrative`.
 *
 *   1. KPI Incentive Engine — per-line target vs actual, internal KPI, macro KPI,
 *      and the bold Final Incentive Authorization %.
 *   2. Monthly Goals — the goals bucket score + macro contribution.
 *   3. Competency & Culture Index — every remaining 0..100 dimension.
 *   4. Executive Summary & Altus Action Plan — the narrative + directive.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function tone100(score: number) {
  return toneFor(score / 10);
}

const ROLE_LABEL: Record<RoleClass, string> = {
  manager: "Manager",
  "non-manager": "Non-Manager",
};

export function PerformanceDossier({
  name,
  roleClass,
  result,
  narrative,
}: {
  name: string;
  roleClass: RoleClass;
  result: ScorecardResult;
  narrative: PerfNarrative;
}) {
  const displayName = name.trim() || "This person";
  const kW = kpiWeight(roleClass);
  const goals = result.buckets.find((b) => b.id === "goals") ?? null;
  const competency = result.buckets.filter((b) => b.kind === "score" && b.id !== "goals");
  const totalTone = tone100(result.totalScore);

  return (
    <section className="perf-dossier rounded-2xl border border-hairline bg-white shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <style>{CSS}</style>

      <header
        className="flex flex-wrap items-center gap-4 rounded-t-2xl border-b border-hairline px-6 py-5 max-sm:px-4"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 4%, white)" }}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -12px rgba(168,4,0,0.7)" }}
        >
          <Trophy size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="text-[19px] font-black leading-tight text-ink-strong max-sm:text-[16px]"
            style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}
          >
            {displayName} <span className="text-ink-subtle">|</span> Performance &amp; Incentive Dossier
          </h2>
          <p className="mt-0.5 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            Role Class · {ROLE_LABEL[roleClass]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Total Score</p>
            <p className="text-[26px] font-black leading-none tabular-nums" style={{ fontFamily: DISPLAY, color: totalTone.fg }}>
              {fmt(result.totalScore)}
              <span className="text-[15px] font-bold text-ink-subtle">/100</span>
            </p>
          </div>
          <Dial
            size={72}
            stroke={8}
            fill={result.totalScore / 100}
            tone={totalTone}
            main={<span style={{ fontSize: 18 }}>{Math.round(result.totalScore)}</span>}
            ariaLabel={`Total score ${fmt(result.totalScore)} out of 100`}
          />
        </div>
      </header>

      <div className="flex flex-col gap-6 p-6 max-sm:p-4">
        {/* 1. KPI Incentive Engine */}
        <DossierSection n={1} icon={<Coins size={17} />} title="KPI Incentive Engine" tag="Direct Payout Driver">
          <div className="perf-tablewrap overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface-soft text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                  <th className="px-3 py-2.5">KPI Line</th>
                  <th className="px-3 py-2.5 text-right">Monthly Target</th>
                  <th className="px-3 py-2.5 text-right">Actual</th>
                  <th className="px-3 py-2.5 text-right">Achievement</th>
                  <th className="px-3 py-2.5 text-right">Weight</th>
                  <th className="px-3 py-2.5 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {result.kpiLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[13px] font-medium text-ink-muted">
                      No KPI lines defined for this person.
                    </td>
                  </tr>
                ) : (
                  result.kpiLines.map((l) => {
                    const pct = Math.round(l.micro * 100);
                    const t = tone100(pct);
                    return (
                      <tr key={l.id} className="border-t border-hairline align-middle">
                        <td className="px-3 py-2.5">
                          <span className="block text-[13px] font-semibold leading-snug text-ink-strong">{l.label}</span>
                          <span className="text-[11px] font-medium text-ink-subtle">
                            {fmt(l.target)} / {l.period}
                            {l.unit ? ` · ${l.unit}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-ink-muted">
                          {fmt(l.monthlyTarget)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-ink-strong">
                          {fmt(l.actual)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-black tabular-nums" style={{ background: t.soft, color: t.fg }}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-ink-subtle">
                          {l.intraWeight}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[13px] font-black tabular-nums" style={{ color: RED_DEEP }}>
                          {fmt(l.weightedPoints)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatBlock icon={<Gauge size={14} />} label="Internal KPI Score" value={`${fmt(result.internalKPI)}/100`} hint="Sum of every line's weighted points." tone={tone100(result.internalKPI)} />
            <StatBlock icon={<Layers size={14} />} label="Macro KPI Score" value={`${fmt(result.macroKPI)}`} hint={`${fmt(result.internalKPI)} × ${kW}% weight = ${fmt(result.macroKPI)} toward /100.`} tone={tone100(result.internalKPI)} />
          </div>

          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 14px 34px -20px rgba(168,4,0,0.8)" }}
          >
            <div className="flex items-center gap-2.5 text-white">
              <Coins size={18} />
              <span className="text-[13.5px] font-bold uppercase tracking-[0.12em]">Final Incentive Authorization</span>
            </div>
            <span className="text-[34px] font-black leading-none tabular-nums text-white max-sm:text-[28px]" style={{ fontFamily: DISPLAY }}>
              {fmt(result.incentivePct)}%
            </span>
          </div>
        </DossierSection>

        {/* 2. Monthly Goals */}
        <DossierSection n={2} icon={<Target size={17} />} title="Monthly Goals">
          {goals ? (
            <BucketRow bucket={goals} big />
          ) : (
            <p className="text-[13px] font-medium text-ink-muted">No Monthly Goals dimension for this role class.</p>
          )}
        </DossierSection>

        {/* 3. Competency & Culture Index */}
        <DossierSection n={3} icon={<Layers size={17} />} title="Competency & Culture Index">
          {competency.length === 0 ? (
            <p className="text-[13px] font-medium text-ink-muted">No competency dimensions for this role class.</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {competency.map((b) => (
                <BucketRow key={b.id} bucket={b} />
              ))}
            </div>
          )}
        </DossierSection>

        {/* 4. Executive Summary & Action Plan */}
        <DossierSection n={4} icon={<ScrollText size={17} />} title="Executive Summary & Altus Action Plan">
          <p className="text-[14px] font-medium leading-relaxed text-ink-strong">{narrative.summary}</p>
          {narrative.directive && (
            <div
              className="mt-4 flex items-start gap-3 rounded-xl border-l-[3px] px-4 py-3.5"
              style={{ borderColor: RED, background: "color-mix(in srgb, var(--color-altus-red) 5%, white)" }}
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                <Megaphone size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-black uppercase tracking-[0.16em]" style={{ color: RED_DEEP }}>Directive</p>
                <p className="mt-0.5 text-[13.5px] font-semibold leading-relaxed text-ink-strong">{narrative.directive}</p>
              </div>
            </div>
          )}
        </DossierSection>
      </div>
    </section>
  );
}

function DossierSection({
  n,
  icon,
  title,
  tag,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="perf-sec">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
          {icon}
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-[10.5px] font-black tabular-nums text-ink-subtle">{String(n).padStart(2, "0")}</span>
          <h3 className="text-[16px] font-black leading-tight text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>
            {title}
          </h3>
          {tag && (
            <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
              {tag}
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function StatBlock({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: { fg: string };
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft">
        <span style={{ color: RED }}>{icon}</span> {label}
      </div>
      <p className="mt-1.5 text-[22px] font-black leading-none tabular-nums" style={{ fontFamily: DISPLAY, color: tone.fg }}>
        {value}
      </p>
      <p className="mt-1.5 text-[11.5px] font-medium leading-snug text-ink-subtle">{hint}</p>
    </div>
  );
}

function BucketRow({ bucket, big }: { bucket: BucketResult; big?: boolean }) {
  const t = tone100(bucket.score);
  const frac = Math.max(0, Math.min(1, bucket.score / 100));
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-strong">{bucket.label}</span>
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">{bucket.weight}% weight</span>
        <span className={`shrink-0 tabular-nums font-black ${big ? "text-[20px]" : "text-[15px]"}`} style={{ color: t.fg, fontFamily: DISPLAY }}>
          {fmt(bucket.score)}
          <span className="text-[11px] font-bold text-ink-subtle">/100</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
          <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: `linear-gradient(90deg, ${t.stroke}, ${t.fg})`, transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)" }} />
        </div>
        <span className="w-[92px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-ink-muted">
          +{fmt(bucket.macro)} to total
        </span>
      </div>
    </div>
  );
}

const CSS = `
  .perf-dossier .perf-sec { break-inside: avoid; }
  @media print {
    .perf-dossier { box-shadow: none !important; border-color: #d4d4d8 !important; color: #000; }
    .perf-dossier * { transition: none !important; }
    .perf-dossier .perf-tablewrap { overflow: visible !important; }
    .perf-dossier svg circle { transition: none !important; }
  }
`;

export default PerformanceDossier;
