"use client";

import { PLAN_STATUS_LABEL, PLAN_STATUS_TONE, type PlanStatus } from "@/lib/project-plan/status";

export type PlanStatusPerspective = "doer" | "initiator";

const DOER_STATUSES: string[] = [
  "dont_know", "not_started", "initiated", "follow_up", "need_info", "done", "abandoned",
];
const INITIATOR_STATUSES: string[] = [
  "pending", "approved", "not_approved", "on_hold", "cancelled", "archived",
];

export function PlanStatusKpiStrip({
  perspective,
  onPerspectiveChange,
  counts,
  total,
  activeStatus,
  onStatusChange,
}: {
  perspective: PlanStatusPerspective;
  onPerspectiveChange: (perspective: PlanStatusPerspective) => void;
  counts: Record<string, number>;
  total: number;
  activeStatus: string | null;
  onStatusChange: (status: string | null) => void;
}) {
  const statuses = perspective === "doer" ? DOER_STATUSES : INITIATOR_STATUSES;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Project status summary">
      <div className="mr-1 inline-flex h-8 overflow-hidden rounded-none border border-hairline-strong bg-surface-soft">
        {(["doer", "initiator"] as const).map((next) => (
          <button
            key={next}
            type="button"
            aria-pressed={perspective === next}
            onClick={() => onPerspectiveChange(next)}
            className="px-2.5 text-[12px] font-bold transition-colors"
            style={perspective === next ? { background: "var(--color-surface-card)", color: "var(--color-ink-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.10)" } : { color: "var(--color-ink-subtle)" }}
          >
            {next === "doer" ? "Doer" : "Initiator"}
          </button>
        ))}
      </div>
      <PlanStatusKpiChip label="Total" value={total} tone="#64748B" active={activeStatus === null} onClick={() => onStatusChange(null)} />
      {statuses.map((status) => (
        <PlanStatusKpiChip
          key={status}
          label={status === "pending" ? "Pending" : PLAN_STATUS_LABEL[status as PlanStatus]}
          value={counts[status] ?? 0}
          tone={status === "pending" ? "#7C3AED" : PLAN_STATUS_TONE[status as PlanStatus]}
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
