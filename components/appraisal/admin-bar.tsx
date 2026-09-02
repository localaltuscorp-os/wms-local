"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Play, ClipboardCheck, Lock, BookOpen } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { createCycle, setCycleStatus, assignCultureForPeriod } from "@/app/(app)/appraisal/actions";
import type { AppraisalCycleStatus } from "@/db/enums";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export interface CycleLite {
  id: string;
  period: string;
  label: string | null;
  status: AppraisalCycleStatus;
}

const NEXT: Partial<Record<AppraisalCycleStatus, { to: AppraisalCycleStatus; label: string; icon: React.ReactNode }>> = {
  draft: { to: "open", label: "Open Self-Scoring", icon: <Play size={14} /> },
  open: { to: "review", label: "Move to Review", icon: <ClipboardCheck size={14} /> },
  review: { to: "finalized", label: "Finalize", icon: <Lock size={14} /> },
};

export function AdminCycleBar({ cycle }: { cycle: CycleLite | null }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [period, setPeriod] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [pending, start] = React.useTransition();

  function doCreate(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await createCycle({ period, label: label.trim() || undefined });
      if (res.ok) {
        fireToast({ message: "Cycle created.", type: "success" });
        setCreating(false);
        setPeriod("");
        setLabel("");
        router.push(`/appraisal?cycle=${res.id}`);
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  function transition(to: AppraisalCycleStatus) {
    if (!cycle) return;
    start(async () => {
      const res = await setCycleStatus(cycle.id, to);
      if (res.ok) {
        fireToast({ message: `Cycle → ${to}.`, type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  function assignCulture() {
    if (!cycle) return;
    start(async () => {
      const res = await assignCultureForPeriod(cycle.period);
      if (res.ok) {
        fireToast({ message: `Culture assigned (${res.count} items).`, type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  const next = cycle ? NEXT[cycle.status] : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {cycle && next && (
        <button
          type="button"
          onClick={() => transition(next.to)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : next.icon} {next.label}
        </button>
      )}
      {cycle && (
        <button
          type="button"
          onClick={assignCulture}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill border-2 bg-white/70 px-4 py-2 text-[13px] font-bold disabled:opacity-60"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
        >
          <BookOpen size={14} /> Assign Culture
        </button>
      )}
      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-pill border-2 bg-white/70 px-4 py-2 text-[13px] font-bold"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, color: ACCENT_DEEP }}
        >
          <Plus size={14} /> New Cycle
        </button>
      ) : (
        <form onSubmit={doCreate} className="flex flex-wrap items-center gap-2 rounded-pill bg-white/80 px-2 py-1.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <input
            autoFocus
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="YYYY-MM"
            className="rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[13px] outline-none"
            style={{ maxWidth: 110 }}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[13px] outline-none"
            style={{ maxWidth: 160 }}
          />
          <button type="submit" disabled={pending} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : "Create"}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-2 py-1.5 text-[13px] font-semibold text-ink-subtle">Cancel</button>
        </form>
      )}
    </div>
  );
}

/** Small cycle picker — links to ?cycle=. */
export function CyclePicker({ cycles, current }: { cycles: CycleLite[]; current: string | null }) {
  const router = useRouter();
  if (cycles.length === 0) return null;
  return (
    <select
      value={current ?? ""}
      onChange={(e) => {
        router.push(`/appraisal?cycle=${e.target.value}`);
        router.refresh();
      }}
      className="rounded-pill border-2 bg-white/70 px-4 py-2 text-[13px] font-bold outline-none"
      style={{ borderColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)`, color: ACCENT_DEEP }}
    >
      {cycles.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label || c.period} · {c.status}
        </option>
      ))}
    </select>
  );
}
