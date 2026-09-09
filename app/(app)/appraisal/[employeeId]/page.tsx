import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { requireAppraisal } from "@/lib/pms/appraisal-flag";
import { isAppraisalAdmin, canViewAppraisal, canManagerScore } from "@/lib/pms/appraisal/access";
import { loadEmployeeCard, loadLatestCycle } from "@/lib/pms/appraisal/queries";
import {
  AppraisalScorecard,
  type ClientDimension,
  type ClientItem,
  type ViewerCaps,
} from "@/components/appraisal/scorecard";
import { ItemBuilder } from "@/components/appraisal/item-builder";
import { APPRAISAL_CYCLE_STATUS_LABELS } from "@/db/enums";
import type { ScoredItem } from "@/lib/pms/appraisal/engine";
import type { AppraisalAttachment } from "@/db/schema";

export const dynamic = "force-dynamic";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

function n(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}
function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

function mapItem(it: ScoredItem, attachments: AppraisalAttachment[]): ClientItem {
  const s = it.score;
  return {
    id: it.id,
    dimension: it.dimension,
    area: it.area,
    title: it.title,
    measure: it.measure,
    isTechnical: it.isTechnical,
    isManagerOnly: it.isManagerOnly,
    isAuto: it.isAuto,
    subWeight: n(it.subWeight) ?? 0,
    fraction: it.fraction,
    maxPoints: it.maxPoints,
    earnedPoints: it.earnedPoints,
    stage: it.stage,
    status: it.status,
    actualValue: it.actualValue,
    evidence: it.evidence,
    adminApproved: it.adminApproved,
    adminRemarks: it.adminRemarks,
    self: { score: n(s?.selfScore ?? null), note: s?.selfJustification ?? null, at: iso(s?.selfSubmittedAt ?? null) },
    manager: { score: n(s?.managerScore ?? null), note: s?.managerExplanation ?? null, at: iso(s?.managerSubmittedAt ?? null) },
    management: { score: n(s?.managementScore ?? null), note: s?.managementExplanation ?? null, at: iso(s?.managementSubmittedAt ?? null) },
    meta: it.meta,
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, stage: a.stage })),
  };
}

export default async function AppraisalEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  requireAppraisal();
  const me = await requireUser();
  const { employeeId } = await params;
  const { cycle: cycleParam } = await searchParams;

  if (!(await canViewAppraisal(me, employeeId))) redirect("/appraisal" as Route);

  const cycleId = cycleParam || (await loadLatestCycle())?.id;
  if (!cycleId) redirect("/appraisal" as Route);

  const card = await loadEmployeeCard(cycleId, employeeId);
  if (!card) notFound();

  const admin = isAppraisalAdmin(me);
  const caps: ViewerCaps = {
    isAdmin: admin,
    isSelf: me.id === employeeId,
    canManager: await canManagerScore(me, employeeId),
    cycleStatus: card.cycle.status,
  };

  const dimensions: ClientDimension[] = card.scorecard.dimensions.map((d) => ({
    dimension: d.dimension,
    label: d.label,
    weight: d.weight,
    pct: d.pct,
    earnedPoints: d.earnedPoints,
    maxPoints: d.maxPoints,
    isAuto: d.isAuto,
    items: d.items.map((it) => mapItem(it, card.attachments.get(it.id) ?? [])),
  }));

  const p = Math.round(card.scorecard.finalPct);
  const color = p >= 75 ? "#16a34a" : p >= 50 ? "#d97706" : "#dc2626";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1000px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">
        <header className="wg-rise mb-5 flex items-center gap-4 rounded-[22px] bg-surface-card px-6 py-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 18px 44px -30px rgba(15,23,42,0.25)" }}>
          <EmployeeAvatar name={card.employee.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}>
              {card.employee.name}
            </h1>
            <div className="mt-0.5 text-[13px] text-ink-subtle">
              {card.employee.department || "—"} · Cycle {card.cycle.label || card.cycle.period} · {APPRAISAL_CYCLE_STATUS_LABELS[card.cycle.status]}
              {card.isManager ? " · Manager" : ""}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 44, color }}>{p}</div>
            <div className="mt-0.5 text-[12px] font-bold uppercase tracking-wide" style={{ color }}>{card.scorecard.ratingTerm}</div>
          </div>
        </header>

        {card.culture.length > 0 && (
          <section className="wg-rise mb-5 rounded-2xl bg-surface-card p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-subtle">This month's Constitution items (Culture)</div>
            <ol className="flex flex-col gap-1.5">
              {card.culture.map((c) => (
                <li key={c.paraId} className="flex gap-2 text-[13px] text-ink-strong">
                  <span className="shrink-0 font-black tabular-nums" style={{ color: ACCENT_DEEP }}>{c.serial}.</span>
                  <span>{c.title ? <strong>{c.title}: </strong> : null}{c.body}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {admin && (
          <div className="mb-5">
            <ItemBuilder cycleId={cycleId} employeeId={employeeId} />
          </div>
        )}

        <AppraisalScorecard dimensions={dimensions} caps={caps} />
      </main>
    </>
  );
}
