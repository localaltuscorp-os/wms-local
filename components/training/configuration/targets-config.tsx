"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { upsertLearningTarget, retireLearningTarget } from "@/app/(app)/training/configuration/actions";
import {
  LEARNING_ROLE_GROUPS,
  LEARNING_ROLE_GROUP_LABELS,
  LEARNING_METRICS,
  LEARNING_METRIC_LABELS,
} from "@/db/enums";
import type { LearningMetric, LearningRoleGroup } from "@/db/enums";

const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-3 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

export interface TargetRow {
  id: string;
  roleGroup: LearningRoleGroup;
  metric: LearningMetric;
  value: number;
  unit: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function TargetsConfig({ rows }: { rows: TargetRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [roleGroup, setRoleGroup] = React.useState<string>("employee");
  const [metric, setMetric] = React.useState<string>("trainings_attend");
  const [value, setValue] = React.useState(4);
  const [unit, setUnit] = React.useState<"count" | "hours">("count");
  const [effectiveFrom, setEffectiveFrom] = React.useState(() => new Date().toISOString().slice(0, 10));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const res = await upsertLearningTarget({
      roleGroup: roleGroup as LearningRoleGroup,
      metric: metric as LearningMetric,
      value,
      unit,
      effectiveFrom,
    });
    setPending(false);
    if (!res.ok) fireToast({ message: res.error, type: "error" });
    else {
      fireToast({ message: "Target set.", type: "success" });
      router.refresh();
    }
  }

  async function retire(id: string) {
    const res = await retireLearningTarget(id);
    if (!res.ok) fireToast({ message: res.error, type: "error" });
    else {
      fireToast({ message: "Target retired.", type: "success" });
      router.refresh();
    }
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={add} className="grid grid-cols-2 gap-3 max-md:grid-cols-1 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-5">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Role</label>
          <select className={INPUT} value={roleGroup} onChange={(e) => setRoleGroup(e.target.value)}>
            {LEARNING_ROLE_GROUPS.map((r) => <option key={r} value={r}>{LEARNING_ROLE_GROUP_LABELS[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Metric</label>
          <select className={INPUT} value={metric} onChange={(e) => { setMetric(e.target.value); setUnit(e.target.value === "self_learning_hours" ? "hours" : "count"); }}>
            {LEARNING_METRICS.map((m) => <option key={m} value={m}>{LEARNING_METRIC_LABELS[m]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">Value</label>
          <input type="number" min={0} step={0.5} className={INPUT} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">From</label>
          <input type="date" className={INPUT} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
        <div className="col-span-2 flex justify-end max-md:col-span-1">
          <button type="submit" disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Set target
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.06)] text-left">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Role</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Metric</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Value</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">From</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">To</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[rgba(15,23,42,0.04)]">
                <td className="px-4 py-2.5 text-ink-strong">{LEARNING_ROLE_GROUP_LABELS[r.roleGroup]}</td>
                <td className="px-4 py-2.5 text-ink-soft">{LEARNING_METRIC_LABELS[r.metric]}</td>
                <td className="px-4 py-2.5 font-bold text-ink-strong">{r.value} {r.unit}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.effectiveFrom}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.effectiveTo ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {!r.effectiveTo && (
                    <button onClick={() => retire(r.id)} className="text-ink-subtle hover:text-[var(--color-altus-red-deep)]" aria-label="Retire target">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-subtle">No targets configured — defaults apply.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
