"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { GoalPeriod } from "@/lib/goals/types";
import { createGoal, addChildGoal, editGoal } from "@/app/(app)/goals/cascade/actions";
import { TeamPicker, type TeamMember } from "./team-picker";
import { MultiSelect } from "@/components/ui/multi-select";
import { DateInput } from "@/components/ui/date-input";
import {
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
  PERIOD_LABEL,
  periodKeyLabel,
  num,
  type GoalDTO,
  type RosterMember,
} from "./util";

/** Accountability hand-off (mig 0171) — each delegate answerable for their %. */
type DelegRef = { employeeId: string; name?: string; pct: number };

type Mode =
  | { kind: "create"; employeeId: string; period: GoalPeriod; periodKey: string }
  | { kind: "child"; parentId: string; childPeriod: GoalPeriod; periodKeyOptions: string[] }
  | { kind: "edit"; goal: GoalDTO };

interface FieldState {
  area: string;
  title: string;
  uom: string;
  targetQty: string;
  targetAmount: string;
  actualQty: string;
  actualAmount: string;
  teamInvolved: TeamMember[];
  teamDependencyPct: string;
  delegatedTo: DelegRef[];
  notes: string;
  targetDate: string;
}

function initial(mode: Mode): FieldState {
  if (mode.kind === "edit") {
    const g = mode.goal;
    return {
      area: g.area ?? "",
      title: g.title,
      uom: g.uom ?? "",
      targetQty: g.targetQty ?? "",
      targetAmount: g.targetAmount ?? "",
      actualQty: g.actualQty ?? "",
      actualAmount: g.actualAmount ?? "",
      teamInvolved: g.teamInvolved ?? [],
      teamDependencyPct: g.teamDependencyPct == null ? "" : String(g.teamDependencyPct),
      delegatedTo: (g.delegatedTo ?? []).map((d) => ({
        employeeId: d.employeeId,
        name: d.name,
        pct: d.pct,
      })),
      notes: g.notes ?? "",
      targetDate: g.targetDate ?? "",
    };
  }
  return {
    area: "", title: "", uom: "", targetQty: "", targetAmount: "",
    actualQty: "", actualAmount: "", teamInvolved: [], teamDependencyPct: "",
    delegatedTo: [], notes: "", targetDate: "",
  };
}

/** The period this dialog is composing/editing — drives the month-only fields. */
function periodOf(mode: Mode): GoalPeriod {
  if (mode.kind === "edit") return mode.goal.period;
  if (mode.kind === "child") return mode.childPeriod;
  return mode.period;
}

const inputCls =
  "w-full rounded-xl border border-hairline bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition-colors focus:border-hairline-strong";
const labelCls = "text-[11.5px] font-black uppercase tracking-[0.06em] text-ink-muted";

export function GoalEditDialog({
  mode,
  roster,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: Mode;
  roster: RosterMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode only — fires with the server's updated row right after a
   *  successful save, for callers with no server-refetch of their own
   *  (e.g. a standalone detail page hydrated from sessionStorage). */
  onSaved?: (row: GoalDTO) => void;
}) {
  const router = useRouter();
  const [f, setF] = React.useState<FieldState>(() => initial(mode));
  const [childKey, setChildKey] = React.useState<string>(
    mode.kind === "child" ? (mode.periodKeyOptions[0] ?? "") : "",
  );
  const [pending, start] = React.useTransition();
  const titleRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setF(initial(mode));
      if (mode.kind === "child") setChildKey(mode.periodKeyOptions[0] ?? "");
      requestAnimationFrame(() => titleRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isEdit = mode.kind === "edit";
  const isMonth = periodOf(mode) === "month";
  const heading =
    mode.kind === "edit"
      ? "Edit goal"
      : mode.kind === "child"
        ? `Add ${PERIOD_LABEL[mode.childPeriod].toLowerCase()} goal`
        : `Add ${PERIOD_LABEL[mode.period].toLowerCase()} goal`;
  const subKey =
    mode.kind === "edit"
      ? periodKeyLabel(mode.goal.periodKey)
      : mode.kind === "child"
        ? periodKeyLabel(childKey || mode.periodKeyOptions[0] || "")
        : periodKeyLabel(mode.periodKey);

  function upd<K extends keyof FieldState>(k: K, v: FieldState[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!f.title.trim()) {
      fireToast({ message: "A goal title is required", type: "error" });
      return;
    }
    const shared = {
      area: f.area.trim() || null,
      title: f.title.trim(),
      uom: f.uom.trim() || null,
      targetQty: f.targetQty.trim() === "" ? null : f.targetQty.trim(),
      targetAmount: f.targetAmount.trim() === "" ? null : f.targetAmount.trim(),
      teamInvolved: f.teamInvolved.length ? f.teamInvolved : null,
      teamDependencyPct: f.teamDependencyPct.trim() === "" ? null : num(f.teamDependencyPct) ?? null,
      notes: f.notes.trim() || null,
      // Target date only on month goals (the server ignores it for year/quarter).
      ...(isMonth ? { targetDate: f.targetDate.trim() || null } : {}),
    };

    start(async () => {
      let res:
        | { ok: true; id?: string; row?: GoalDTO }
        | { ok: false; error: string };
      if (mode.kind === "create") {
        res = await createGoal({
          employeeId: mode.employeeId,
          period: mode.period,
          periodKey: mode.periodKey,
          ...shared,
        });
      } else if (mode.kind === "child") {
        res = await addChildGoal({
          parentId: mode.parentId,
          periodKey: childKey || mode.periodKeyOptions[0] || "",
          ...shared,
        });
      } else {
        res = await editGoal({
          id: mode.goal.id,
          ...shared,
          actualQty: f.actualQty.trim() === "" ? null : f.actualQty.trim(),
          actualAmount: f.actualAmount.trim() === "" ? null : f.actualAmount.trim(),
          delegatedTo: f.delegatedTo.length ? f.delegatedTo : null,
        });
      }
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: isEdit ? "Goal updated" : "Goal added", type: "success" });
      if (isEdit && res.row) onSaved?.(res.row);
      onOpenChange(false);
      router.refresh();
    });
  }

  if (!open) return null;

  return createPortal(
    <div
      className="wg-fade-in fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={() => !pending && onOpenChange(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onOpenChange(false);
      }}
    >
      <form
        onSubmit={submit}
        className="wg-modal-in max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-section border border-hairline bg-surface-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-black text-ink-strong">{heading}</h2>
            <p className="mt-0.5 text-[13px] font-semibold text-ink-soft">{subKey}</p>
          </div>
          <button
            type="button"
            onClick={() => !pending && onOpenChange(false)}
            className="rounded-md p-1 text-ink-muted hover:bg-black/[0.05]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {mode.kind === "child" && mode.periodKeyOptions.length > 1 && (
            <div>
              <label className={labelCls}>Lands in</label>
              <select
                value={childKey}
                onChange={(e) => setChildKey(e.target.value)}
                className={`${inputCls} mt-1`}
              >
                {mode.periodKeyOptions.map((k) => (
                  <option key={k} value={k}>
                    {periodKeyLabel(k)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Goal *</label>
            <input
              ref={titleRef}
              value={f.title}
              onChange={(e) => upd("title", e.target.value)}
              className={`${inputCls} mt-1`}
              placeholder="What will you achieve?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Area</label>
              <input value={f.area} onChange={(e) => upd("area", e.target.value)} className={`${inputCls} mt-1`} placeholder="e.g. Sales" />
            </div>
            <div>
              <label className={labelCls}>UOM</label>
              <input value={f.uom} onChange={(e) => upd("uom", e.target.value)} className={`${inputCls} mt-1`} placeholder="e.g. seats" />
            </div>
          </div>

          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Actual (qty)</label>
                <input value={f.actualQty} onChange={(e) => upd("actualQty", e.target.value)} className={`${inputCls} mt-1`} inputMode="decimal" placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>Actual amount (₹)</label>
                <input value={f.actualAmount} onChange={(e) => upd("actualAmount", e.target.value)} className={`${inputCls} mt-1`} inputMode="decimal" placeholder="0" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Target (qty)</label>
              <input value={f.targetQty} onChange={(e) => upd("targetQty", e.target.value)} className={`${inputCls} mt-1`} inputMode="decimal" placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Target amount (₹)</label>
              <input value={f.targetAmount} onChange={(e) => upd("targetAmount", e.target.value)} className={`${inputCls} mt-1`} inputMode="decimal" placeholder="0" />
            </div>
          </div>

          {isMonth && (
            <div>
              <label className={labelCls}>Target date</label>
              <DateInput
                value={f.targetDate}
                onChange={(iso) => upd("targetDate", iso)}
                className={`${inputCls} mt-1`}
                ariaLabel="Target date"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Team involved</label>
              <div className="mt-1 rounded-xl border border-hairline px-2 py-1.5">
                <TeamPicker value={f.teamInvolved} roster={roster} onChange={(t) => upd("teamInvolved", t)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Dependency %</label>
              <input value={f.teamDependencyPct} onChange={(e) => upd("teamDependencyPct", e.target.value)} className={`${inputCls} mt-1`} inputMode="numeric" placeholder="0–100" />
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>Delegated to</label>
              <p className="mt-0.5 text-[11.5px] font-medium text-ink-subtle">
                Accountability hand-off — each delegate answers for their share of this goal.
              </p>
              <DelegateField
                value={f.delegatedTo}
                roster={roster}
                onChange={(next) => upd("delegatedTo", next)}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={f.notes} onChange={(e) => upd("notes", e.target.value)} rows={2} className={`${inputCls} mt-1 resize-none`} placeholder="Context, dependencies…" />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => !pending && onOpenChange(false)} className="rounded-full border border-hairline bg-surface-card px-4 py-2 text-[14px] font-bold text-ink-soft transition-colors hover:text-ink-strong">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-bold text-white disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` }}
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Goal"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Delegate picker with per-member % + inline remove — pre-fills from the goal's
 *  existing delegation so editing a delegated goal shows who already owns it. */
function DelegateField({
  value,
  roster,
  onChange,
}: {
  value: DelegRef[];
  roster: RosterMember[];
  onChange: (next: DelegRef[]) => void;
}) {
  const nameById = React.useMemo(
    () => new Map(roster.map((r) => [r.id, r.name])),
    [roster],
  );
  const options = React.useMemo(
    () => roster.map((r) => ({ value: r.id, label: r.name })),
    [roster],
  );
  const selectedIds = value.map((d) => d.employeeId);

  function setIds(ids: string[]) {
    // Keep each retained delegate's % (and order); new picks default to 100%.
    onChange(
      ids.map(
        (id) =>
          value.find((d) => d.employeeId === id) ?? {
            employeeId: id,
            name: nameById.get(id),
            pct: 100,
          },
      ),
    );
  }
  function setPct(id: string, raw: string) {
    const p = Math.round(Math.max(0, Math.min(100, num(raw) ?? 0)));
    onChange(value.map((d) => (d.employeeId === id ? { ...d, pct: p } : d)));
  }
  function remove(id: string) {
    onChange(value.filter((d) => d.employeeId !== id));
  }

  return (
    <div className="mt-1 space-y-2">
      <MultiSelect
        options={options}
        selected={selectedIds}
        placeholder="Delegate to…"
        onChange={setIds}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((d) => {
            const nm = d.name ?? nameById.get(d.employeeId) ?? "—";
            return (
              <span
                key={d.employeeId}
                className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft py-1 pl-1 pr-1.5 text-[12px] font-semibold text-ink-strong"
              >
                <span
                  aria-hidden
                  className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
                  style={{ background: "var(--color-altus-red-deep)" }}
                >
                  {nm.trim().charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[110px] truncate">{nm}</span>
                <input
                  value={String(d.pct)}
                  onChange={(e) => setPct(d.employeeId, e.target.value)}
                  inputMode="numeric"
                  aria-label={`${nm} share %`}
                  className="w-8 rounded bg-transparent text-right font-bold tabular-nums text-altus-red-deep outline-none focus:bg-surface-card"
                />
                <span className="font-bold text-altus-red-deep">%</span>
                <button
                  type="button"
                  onClick={() => remove(d.employeeId)}
                  aria-label={`Remove ${nm}`}
                  title="Remove delegate"
                  className="ml-0.5 grid size-4 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_15%,transparent)] hover:text-altus-red"
                >
                  <X size={11} strokeWidth={3} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
