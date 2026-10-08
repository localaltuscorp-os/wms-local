"use client";

import { PLAN_STATUS_LABEL, PLAN_STATUS_TONE, type PlanStatus } from "@/lib/project-plan/status";

const DOER_STATUSES: string[] = [
  "dont_know", "not_started", "initiated", "follow_up", "need_info", "done", "abandoned",
];

export function PlanStatusKpiStrip({
  counts,
  total,
  activeStatus,
  onStatusChange,
}: {
  counts: Record<string, number>;
  total: number;
  activeStatus: string | null;
  onStatusChange: (status: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Project status summary">
      <PlanStatusKpiChip label="Total" value={total} tone="#64748B" active={activeStatus === null} onClick={() => onStatusChange(null)} />
      {DOER_STATUSES.map((status) => (
        <PlanStatusKpiChip
          key={status}
          label={status === "pending" ? "Pending" : PLAN_STATUS_LABEL[status as PlanStatus]}
          value={counts[status] ?? 0}
          tone={PLAN_STATUS_TONE[status as PlanStatus]}
          active={activeStatus === status}
          onClick={() => onStatusChange(activeStatus === status ? null : status)}
        />
      ))}
    </div>
  );
}

function PlanStatusKpiChip({ label, value, tone, active, onClick }: { label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 transition-all duration-150"
      style={{
        background: `color-mix(in srgb, ${tone} 8%, white)`,
        borderColor: active ? "white" : `color-mix(in srgb, ${tone} 28%, white)`,
        color: tone,
        boxShadow: active ? "0 0 0 1px rgba(15,23,42,0.10)" : undefined,
      }}
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: tone }} />
      <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>{value}</span>
      <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>{label}</span>
    </button>
  );
}
