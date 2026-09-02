"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Wand2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { addItem, seedEmployeeDimensions, deleteItem } from "@/app/(app)/appraisal/actions";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const BUILDABLE = [
  { dim: "kpi", label: "KPI" },
  { dim: "skill", label: "Skill" },
  { dim: "attitude", label: "Attitude" },
] as const;

const inputCls = "rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[13px] outline-none";

export function ItemBuilder({ cycleId, employeeId }: { cycleId: string; employeeId: string }) {
  const router = useRouter();
  const [dim, setDim] = React.useState<(typeof BUILDABLE)[number]["dim"]>("kpi");
  const [title, setTitle] = React.useState("");
  const [area, setArea] = React.useState("");
  const [measure, setMeasure] = React.useState("");
  const [subWeight, setSubWeight] = React.useState("");
  const [technical, setTechnical] = React.useState(false);
  const [pending, start] = React.useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      fireToast({ message: "Title is required.", type: "error" });
      return;
    }
    start(async () => {
      const res = await addItem({
        cycleId,
        employeeId,
        dimension: dim,
        title: title.trim(),
        area: area.trim() || undefined,
        measure: measure.trim() || undefined,
        subWeight: subWeight ? Number(subWeight) : undefined,
        isTechnical: dim === "skill" ? technical : undefined,
      });
      if (res.ok) {
        fireToast({ message: "Item added.", type: "success" });
        setTitle("");
        setArea("");
        setMeasure("");
        setSubWeight("");
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  function seed() {
    start(async () => {
      const res = await seedEmployeeDimensions(cycleId, employeeId);
      if (res.ok) {
        fireToast({ message: res.created > 0 ? `Seeded ${res.created} dimension(s).` : "Nothing to seed.", type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <div className="rounded-2xl bg-surface-card p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[13px] font-bold uppercase tracking-wide text-ink-subtle">Build appraisal items</span>
        <button
          type="button"
          onClick={seed}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill border-2 bg-white/70 px-3.5 py-1.5 text-[12px] font-bold disabled:opacity-60"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
          title="Create the standard Incentive, Knowledge-Sharing, Culture + manager one-liners"
        >
          <Wand2 size={13} /> Seed Standard Dimensions
        </button>
      </div>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <select value={dim} onChange={(e) => setDim(e.target.value as typeof dim)} className={inputCls}>
          {BUILDABLE.map((b) => (
            <option key={b.dim} value={b.dim}>{b.label}</option>
          ))}
        </select>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" className={inputCls} style={{ maxWidth: 140 }} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title *" className={inputCls} style={{ flex: 1, minWidth: 180 }} />
        {dim === "kpi" && (
          <input value={measure} onChange={(e) => setMeasure(e.target.value)} placeholder="Measure" className={inputCls} style={{ maxWidth: 140 }} />
        )}
        <input type="number" min={0} max={100} value={subWeight} onChange={(e) => setSubWeight(e.target.value)} placeholder="Sub-wt %" className={inputCls} style={{ maxWidth: 100 }} />
        {dim === "skill" && (
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-subtle">
            <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} /> Technical
          </label>
        )}
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
        </button>
      </form>
    </div>
  );
}

export function DeleteItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm("Remove this appraisal item? This cannot be undone.")) return;
        start(async () => {
          const res = await deleteItem(itemId);
          if (res.ok) {
            fireToast({ message: "Item removed.", type: "success" });
            router.refresh();
          } else fireToast({ message: res.error, type: "error" });
        });
      }}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      {pending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Remove
    </button>
  );
}
