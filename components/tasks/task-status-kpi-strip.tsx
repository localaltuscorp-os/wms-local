"use client";

import * as React from "react";
import type { TaskKpiKey } from "@/lib/task-status-kpis";

export type { TaskKpiKey } from "@/lib/task-status-kpis";

export type TaskKpiView = "doer" | "initiator";

export interface TaskKpiSpec {
  key: TaskKpiKey;
  label: string;
  sublabel: string;
}

const TOTAL_KPI: TaskKpiSpec = {
  key: "total", label: "TOTAL", sublabel: "Tasks matching the selected filters",
};

export const DOER_TASK_KPI_SPECS: readonly TaskKpiSpec[] = [
  TOTAL_KPI,
  { key: "notRead", label: "NOT READ", sublabel: "Doer has not read" },
  { key: "notStarted", label: "NOT STARTED", sublabel: "Awaiting work" },
  { key: "initiated", label: "INITIATED", sublabel: "Work started" },
  { key: "followUp", label: "FOLLOW UP", sublabel: "Needs follow-up" },
  { key: "needInfo", label: "NEED INFO", sublabel: "Waiting for info" },
  { key: "done", label: "DONE", sublabel: "Work completed" },
  { key: "abandoned", label: "ABANDONED", sublabel: "Work stopped" },
];

export const INITIATOR_TASK_KPI_SPECS: readonly TaskKpiSpec[] = [
  TOTAL_KPI,
  { key: "done", label: "DONE", sublabel: "Work completed" },
  { key: "abandoned", label: "ABANDONED", sublabel: "Work stopped" },
  { key: "pending", label: "PENDING", sublabel: "Awaiting a verdict" },
  { key: "approved", label: "APPROVED", sublabel: "Signed off" },
  { key: "notApproved", label: "NOT APPROVED", sublabel: "Declined" },
  { key: "onHold", label: "ON HOLD", sublabel: "Paused" },
  { key: "cancelled", label: "CANCELLED", sublabel: "Cancelled" },
  { key: "archived", label: "ARCHIVED", sublabel: "Archived" },
];

const CHIP_STYLE: Record<TaskKpiKey, { pill: string; border: string; dot: string }> = {
  total: { pill: "bg-slate-100 hover:bg-slate-200 text-slate-900", border: "border-slate-300", dot: "bg-slate-500" },
  notRead: { pill: "bg-violet-50 hover:bg-violet-100 text-violet-950", border: "border-violet-200", dot: "bg-violet-600" },
  notStarted: { pill: "bg-indigo-50 hover:bg-indigo-100 text-indigo-950", border: "border-indigo-200", dot: "bg-indigo-600" },
  initiated: { pill: "bg-amber-50 hover:bg-amber-100 text-amber-950", border: "border-amber-200", dot: "bg-amber-500" },
  followUp: { pill: "bg-orange-50 hover:bg-orange-100 text-orange-950", border: "border-orange-200", dot: "bg-orange-600" },
  needInfo: { pill: "bg-red-50 hover:bg-red-100 text-red-950", border: "border-red-200", dot: "bg-red-600" },
  done: { pill: "bg-emerald-50 hover:bg-emerald-100 text-emerald-950", border: "border-emerald-200", dot: "bg-emerald-600" },
  abandoned: { pill: "bg-sky-50 hover:bg-sky-100 text-sky-950", border: "border-sky-200", dot: "bg-sky-500" },
  pending: { pill: "bg-violet-50 hover:bg-violet-100 text-violet-950", border: "border-violet-200", dot: "bg-violet-600" },
  approved: { pill: "bg-teal-50 hover:bg-teal-100 text-teal-950", border: "border-teal-200", dot: "bg-teal-600" },
  notApproved: { pill: "bg-red-50 hover:bg-red-100 text-red-950", border: "border-red-200", dot: "bg-red-600" },
  onHold: { pill: "bg-amber-50 hover:bg-amber-100 text-amber-950", border: "border-amber-200", dot: "bg-amber-700" },
  cancelled: { pill: "bg-orange-50 hover:bg-orange-100 text-orange-950", border: "border-orange-200", dot: "bg-orange-600" },
  archived: { pill: "bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-950", border: "border-fuchsia-200", dot: "bg-fuchsia-600" },
};

export function TaskStatusKpiChip({ spec, value, active = false }: { spec: TaskKpiSpec; value: number; active?: boolean }) {
  const c = CHIP_STYLE[spec.key];
  return (
    <div
      title={spec.sublabel}
      className={`group inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 transition-all duration-150 ${c.pill} ${
        active ? "scale-[1.02] border-white font-bold shadow-xs ring-1 ring-black/10" : `${c.border} font-medium`
      }`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
      <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>
        {value}
      </span>
      <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>
        {spec.label.charAt(0) + spec.label.slice(1).toLowerCase()}
      </span>
    </div>
  );
}

export function TaskStatusKpiStrip({ counts, view }: { counts: Record<TaskKpiKey, number>; view: TaskKpiView }) {
  const specs = view === "initiator" ? INITIATOR_TASK_KPI_SPECS : DOER_TASK_KPI_SPECS;
  const storageKey = `altus:dashboard-kpi-order:${view}`;
  const [editing, setEditing] = React.useState(false);
  const [order, setOrder] = React.useState<readonly TaskKpiKey[]>(() => specs.map((spec) => spec.key));
  const dragKey = React.useRef<TaskKpiKey | null>(null);

  React.useEffect(() => {
    const arrange = (event: Event) => {
      const next = (event as CustomEvent<{ editing?: boolean }>).detail?.editing === true;
      setEditing(next);
      if (!next) return;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as TaskKpiKey[];
        if (saved.length) setOrder([...saved.filter((key) => specs.some((spec) => spec.key === key)), ...specs.map((spec) => spec.key).filter((key) => !saved.includes(key))]);
      } catch { /* ignore malformed temporary browser layout */ }
    };
    const save = () => localStorage.setItem(storageKey, JSON.stringify(order));
    window.addEventListener("altus:arrange-ui", arrange);
    window.addEventListener("altus:save-arrange-ui", save);
    return () => { window.removeEventListener("altus:arrange-ui", arrange); window.removeEventListener("altus:save-arrange-ui", save); };
  }, [order, specs, storageKey]);

  const visible = [...specs].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const moveBefore = React.useCallback((from: TaskKpiKey, target: TaskKpiKey) => {
    if (from === target) return;
    setOrder((current) => {
      const next = current.filter((key) => key !== from);
      const targetIndex = next.indexOf(target);
      if (targetIndex < 0) return current;
      next.splice(targetIndex, 0, from);
      return next;
    });
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${view === "initiator" ? "Initiator" : "Doer"} task status summary`}>
      {visible.map((spec) => <div key={spec.key} draggable={editing} onDragStart={(event) => { dragKey.current = spec.key; event.dataTransfer.setData("application/x-altus-kpi", spec.key); event.dataTransfer.setData("text/plain", spec.key); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { if (editing) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const from = (event.dataTransfer.getData("application/x-altus-kpi") || event.dataTransfer.getData("text/plain") || dragKey.current) as TaskKpiKey | null; if (!editing || !from || !specs.some((item) => item.key === from)) return; moveBefore(from, spec.key); dragKey.current = null; }} onDragEnd={() => { dragKey.current = null; }} className={editing ? "cursor-grab rounded-xl outline outline-2 outline-dashed outline-altus-red/50" : undefined}><TaskStatusKpiChip spec={spec} value={counts[spec.key]} /></div>)}
    </div>
  );
}
