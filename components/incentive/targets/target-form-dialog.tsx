"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";
import { formatInr } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { Segmented, INCENTIVE_BTN_NEUTRAL, INCENTIVE_BTN_PRIMARY } from "@/components/incentive/ui/chrome";
import { createTargetPlan, fetchTargetCtc } from "@/app/(app)/incentive/target-actions";
import type { TargetProductOption, TeamOption } from "@/lib/queries/incentive-target-plans";
import type { EmployeeOption } from "@/lib/queries/employees";
import {
  TARGET_PERIOD_TYPES,
  TARGET_PERIOD_LABELS,
  addMonthsKey,
  currentPeriodValue,
  weekOptions,
  monthOptions,
  quarterOptions,
  yearOptions,
  type TargetPeriodType,
} from "@/lib/incentive/target-period";
import { addDays, mondayOf } from "@/lib/weekly-goals/week";

interface Line {
  productId: string;
  quantity: string;
}

function defaultValueFor(type: TargetPeriodType, now: Date): string {
  const cur = currentPeriodValue(type, now);
  if (type === "week") return addDays(mondayOf(now), 7);
  if (type === "month") return addMonthsKey(cur, 1);
  if (type === "year") return String(Number(cur) + 1);
  // quarter — advance one
  const m = cur.match(/^(\d{4})-Q([1-4])$/);
  if (m) {
    const q = Number(m[2]);
    const y = Number(m[1]);
    return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
  }
  return cur;
}

const LEVEL_OPTIONS = [
  { value: "team" as const, label: "Team" },
  { value: "user" as const, label: "User" },
];

export function TargetFormDialog({
  products,
  teams,
  users,
  onSaved,
}: {
  products: TargetProductOption[];
  teams: TeamOption[];
  users: EmployeeOption[];
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [level, setLevel] = React.useState<"team" | "user">("user");
  const [subjectId, setSubjectId] = React.useState("");
  const [periodType, setPeriodType] = React.useState<TargetPeriodType>("month");
  const [periodValue, setPeriodValue] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [ctc, setCtc] = React.useState<{ monthlyCtc: number; minRequired: number } | null>(null);
  const [ctcLoading, setCtcLoading] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const productById = React.useMemo(() => {
    const m = new Map<string, TargetProductOption>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // Reset per type default.
  function onTypeChange(t: TargetPeriodType) {
    setPeriodType(t);
    setPeriodValue(defaultValueFor(t, new Date()));
  }

  // When the subject changes, fetch its CTC for the live 10% validation.
  React.useEffect(() => {
    if (!subjectId) {
      setCtc(null);
      return;
    }
    let cancelled = false;
    setCtcLoading(true);
    fetchTargetCtc({ level, subjectId }).then((res) => {
      if (cancelled) return;
      setCtcLoading(false);
      if (res.ok) setCtc(res);
      else setCtc(null);
    });
    return () => {
      cancelled = true;
    };
  }, [level, subjectId]);

  function openDialog() {
    setOpen(true);
    setPeriodValue(defaultValueFor("month", new Date()));
  }

  function reset() {
    setLevel("user");
    setSubjectId("");
    setPeriodType("month");
    setPeriodValue(defaultValueFor("month", new Date()));
    setLines([]);
    setCtc(null);
  }

  const total = React.useMemo(() => {
    let qty = 0;
    let amt = 0;
    for (const l of lines) {
      const p = productById.get(l.productId);
      const q = Number(l.quantity);
      if (!p || !Number.isFinite(q) || q <= 0) continue;
      qty += q;
      amt += p.rate * q;
    }
    return { quantity: qty, amount: amt };
  }, [lines, productById]);

  const subjectOptions = level === "team" ? teams : users;
  const subjectMissing = subjectId === "";

  // Validation — immediate, not deferred to submit.
  const linesValid = lines.length > 0 && lines.every((l) => {
    const p = productById.get(l.productId);
    const q = Number(l.quantity);
    return p && Number.isFinite(q) && q > 0;
  });
  const minMet = ctc != null && total.amount >= ctc.minRequired;
  const canSave =
    subjectId !== "" && linesValid && ctc != null && minMet && periodValue !== "" && !pending;

  function addLine() {
    const firstUnused = products.find((p) => !lines.some((l) => l.productId === p.id));
    if (!firstUnused) return;
    setLines((prev) => [...prev, { productId: firstUnused.id, quantity: "" }]);
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    startTransition(async () => {
      const res = await createTargetPlan({
        targetLevel: level,
        subjectId,
        periodType,
        periodValue,
        products: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Target saved." });
      setOpen(false);
      reset();
      onSaved();
    });
  }

  const periodOptions = {
    week: weekOptions(),
    month: monthOptions(),
    quarter: quarterOptions(),
    year: yearOptions(),
  }[periodType];

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? openDialog() : setOpen(false))}>
      <Dialog.Trigger asChild>
        <button type="button" className={INCENTIVE_BTN_PRIMARY}>
          <Plus size={14} strokeWidth={2.6} aria-hidden />
          Add Target
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90]" style={{ background: "rgba(15,23,42,0.45)" }} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] max-h-[90vh] w-[calc(100vw-24px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-hairline bg-surface-card p-5"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <div className="mb-4">
            <Dialog.Title className="flex items-center gap-2 text-[16px] font-bold text-ink-strong">
              <Target size={16} strokeWidth={2.4} aria-hidden />
              Add target
            </Dialog.Title>
            <Dialog.Description className="text-[13px] font-medium text-ink-muted">
              Plan a target for a team or user, for any past or future period.
            </Dialog.Description>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented ariaLabel="Target type" options={LEVEL_OPTIONS} value={level} onChange={setLevel} />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-bold text-ink-strong">
                {level === "team" ? "Select Team" : "Select User"}
              </span>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="h-9 w-full rounded-pill border border-hairline bg-surface-card px-3.5 text-[13.5px] font-medium text-ink-strong outline-none transition-colors focus:border-altus-red"
              >
                <option value="">Choose…</option>
                {level === "team"
                  ? (subjectOptions as TeamOption[]).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.memberCount > 0 ? ` · ${o.memberCount} reports` : ""}
                      </option>
                    ))
                  : (subjectOptions as EmployeeOption[]).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
              </select>
            </label>

            <div>
              <span className="mb-1.5 block text-[13px] font-bold text-ink-strong">Target period</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  ariaLabel="Period type"
                  options={TARGET_PERIOD_TYPES.map((t) => ({ value: t, label: TARGET_PERIOD_LABELS[t] }))}
                  value={periodType}
                  onChange={onTypeChange}
                  size="sm"
                />
                <select
                  value={periodValue}
                  onChange={(e) => setPeriodValue(e.target.value)}
                  className="h-9 rounded-pill border border-hairline bg-surface-card px-2.5 text-[12.5px] font-bold text-ink-soft outline-none transition-colors focus:border-altus-red"
                >
                  {periodOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product lines */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-bold text-ink-strong">Products</span>
                <button type="button" onClick={addLine} className={INCENTIVE_BTN_NEUTRAL} style={{ height: 32 }}>
                  <Plus size={13} strokeWidth={2.6} aria-hidden />
                  Add another product
                </button>
              </div>

              {lines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-hairline px-3 py-4 text-center text-[12.5px] text-ink-subtle">
                  Add at least one product to plan a target.
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((l, i) => {
                    const p = productById.get(l.productId);
                    const q = Number(l.quantity);
                    const amount = p && Number.isFinite(q) && q > 0 ? p.rate * q : 0;
                    return (
                      <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline px-3 py-2">
                        <label className="min-w-[140px] flex-1">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                            Product
                          </span>
                          <select
                            value={l.productId}
                            onChange={(e) => updateLine(i, { productId: e.target.value })}
                            className="h-9 w-full rounded-pill border border-hairline bg-surface-card px-2.5 text-[13px] font-medium text-ink-strong outline-none focus:border-altus-red"
                          >
                            {products.map((pr) => (
                              <option key={pr.id} value={pr.id}>
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="w-24">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                            Quantity
                          </span>
                          <input
                            type="number"
                            min={0}
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={(e) => updateLine(i, { quantity: e.target.value })}
                            placeholder="0"
                            className="h-9 w-full rounded-pill border border-hairline bg-surface-card px-3 text-[13px] font-medium tabular-nums text-ink-strong outline-none focus:border-altus-red"
                          />
                        </label>
                        <div className="w-28">
                          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                            Amount
                          </span>
                          <div className="flex h-9 items-center text-[13px] font-bold tabular-nums text-ink-strong">
                            {p ? formatInr(amount) : "—"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label="Remove product"
                          className="grid size-9 shrink-0 place-items-center rounded-pill border border-hairline text-ink-subtle transition-colors hover:border-hairline-strong hover:text-altus-red"
                        >
                          <Trash2 size={14} strokeWidth={2.4} aria-hidden />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {lines.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] font-semibold text-ink-subtle">
                  <span>
                    Total quantity <b className="tabular-nums text-ink-strong">{total.quantity}</b>
                  </span>
                  <span>
                    Total target amount <b className="tabular-nums text-ink-strong">{formatInr(total.amount)}</b>
                  </span>
                </div>
              )}
            </div>

            {/* 10% CTC validation */}
            <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--color-surface-soft)" }}>
              {subjectMissing ? (
                <p className="text-[12.5px] text-ink-subtle">Select a team or user to check the minimum target.</p>
              ) : ctcLoading ? (
                <p className="flex items-center gap-2 text-[12.5px] text-ink-subtle">
                  <Loader2 size={13} className="animate-spin" aria-hidden /> Checking CTC…
                </p>
              ) : ctc == null ? (
                <p className="text-[12.5px] text-ink-subtle">No CTC on record for this team or user.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-[12.5px] font-semibold text-ink-soft">
                    Monthly CTC <b className="tabular-nums">{formatInr(ctc.monthlyCtc)}</b> · Minimum required (10%){" "}
                    <b className="tabular-nums">{formatInr(ctc.minRequired)}</b>
                  </p>
                  {minMet ? (
                    <p className="text-[12.5px] font-bold" style={{ color: "var(--color-green-deep)" }}>
                      Valid
                    </p>
                  ) : (
                    <p className="text-[12.5px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>
                      Target does not meet the minimum requirement. Minimum required target:{" "}
                      {formatInr(ctc.minRequired)} · Current target: {formatInr(total.amount)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className={INCENTIVE_BTN_NEUTRAL} disabled={pending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" disabled={!canSave} className={INCENTIVE_BTN_PRIMARY}>
                {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                {pending ? "Saving…" : "Save target"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
