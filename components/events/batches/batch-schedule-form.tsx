"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarClock, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EVENT_STATUSES, EVENT_STATUS_LABELS } from "@/db/enums";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
  minToLabel,
} from "@/lib/monthly-events/types";
import {
  createBatchSchedule,
  updateBatchSchedule,
} from "@/app/(app)/events/batches/actions";
import type {
  BatchScheduleRow,
  BatchTypeOption,
  CategoryOption,
} from "./types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** 0=Mon … 6=Sun — matches event_batch_schedules.days_of_week. */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Start-time options: every 30-min slot whose 30-min block still ends by 21:00. */
const START_OPTIONS = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN - SLOT_MIN; m += SLOT_MIN) {
    out.push({ value: String(m), label: minToLabel(m) });
  }
  return out;
})();

interface FormState {
  batchTypeId: string;
  name: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startMin: number | null;
  endMin: number | null;
  daysOfWeek: number[];
  categoryId: string;
  status: (typeof EVENT_STATUSES)[number];
  location: string;
  notes: string;
}

function initialFrom(row: BatchScheduleRow | null): FormState {
  if (!row) {
    return {
      batchTypeId: "",
      name: "",
      startDate: "",
      endDate: "",
      allDay: false,
      startMin: 540, // 9:00 AM default
      endMin: 660, // 11:00 AM default
      daysOfWeek: [],
      categoryId: "",
      status: "confirmed",
      location: "",
      notes: "",
    };
  }
  const allDay = row.startMin == null || row.endMin == null;
  return {
    batchTypeId: row.batchTypeId,
    name: row.name ?? "",
    startDate: row.startDate,
    endDate: row.endDate,
    allDay,
    startMin: allDay ? 540 : row.startMin,
    endMin: allDay ? 660 : row.endMin,
    daysOfWeek: row.daysOfWeek ?? [],
    categoryId: row.categoryId ?? "",
    status: row.status,
    location: row.location ?? "",
    notes: row.notes ?? "",
  };
}

export function BatchScheduleForm({
  open,
  onOpenChange,
  initial,
  batchTypes,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: BatchScheduleRow | null;
  batchTypes: BatchTypeOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialFrom(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial;

  // Re-seed the form whenever the dialog (re)opens for a different row.
  useEffect(() => {
    if (open) {
      setForm(initialFrom(initial));
      setError(null);
    }
  }, [open, initial]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // End-time options depend on the chosen start so end is always after start.
  const endOptions = useMemo(() => {
    const floor = (form.startMin ?? DAY_START_MIN) + SLOT_MIN;
    const out: { value: string; label: string }[] = [];
    for (let m = floor; m <= DAY_END_MIN; m += SLOT_MIN) {
      out.push({ value: String(m), label: minToLabel(m) });
    }
    return out;
  }, [form.startMin]);

  function pickBatchType(id: string) {
    set("batchTypeId", id);
    // Prefill category from the type's default when the user hasn't chosen one.
    if (!form.categoryId) {
      const def = batchTypes.find((t) => t.id === id)?.defaultCategoryId;
      if (def) set("categoryId", def);
    }
  }

  function toggleDay(d: number) {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d].sort((a, b) => a - b),
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.batchTypeId) return setError("Pick a batch type.");
    if (!form.startDate || !form.endDate) return setError("Set a start and end date.");
    if (form.endDate < form.startDate)
      return setError("End date can't be before the start date.");
    if (!form.allDay && (form.startMin == null || form.endMin == null))
      return setError("Set both a start and end time.");
    if (!form.allDay && form.startMin != null && form.endMin != null && form.endMin <= form.startMin)
      return setError("End time must be after the start time.");

    const payload = {
      batchTypeId: form.batchTypeId,
      name: form.name.trim() || null,
      startDate: form.startDate,
      endDate: form.endDate,
      startMin: form.allDay ? null : form.startMin,
      endMin: form.allDay ? null : form.endMin,
      daysOfWeek: form.daysOfWeek,
      categoryId: form.categoryId || null,
      status: form.status,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateBatchSchedule({ id: initial!.id, ...payload })
        : await createBatchSchedule(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: isEdit
          ? "Batch schedule updated — calendar re-blocked."
          : "Batch schedule created — calendar auto-blocked.",
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  const typeOptions = batchTypes.map((t) => ({ value: t.id, label: t.name }));
  const categoryOptions = [
    { value: "", label: "— No category —" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="wg-rise fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg overflow-hidden rounded-2xl bg-surface-card max-h-[calc(100dvh-32px)]"
          style={{
            border: "1px solid var(--color-hairline-strong)",
            boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
          }}
        >
          <span
            aria-hidden
            className="block h-1 w-full"
            style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          />
          <div className="max-h-[calc(100dvh-36px)] overflow-y-auto p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${ACCENT}1f`, color: ACCENT_DEEP }}
                  aria-hidden
                >
                  <CalendarClock size={20} strokeWidth={2.4} />
                </span>
                <div>
                  <Dialog.Title
                    className="text-ink-strong"
                    style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}
                  >
                    {isEdit ? "Edit Batch Schedule" : "New Batch Schedule"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-[14.5px] text-ink-muted" style={{ lineHeight: 1.5 }}>
                    The calendar auto-blocks locked events across the range × days ×
                    time slots. Re-saving reconciles them — never duplicates.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={pending}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <Field label="Batch Type" required>
                  <Select
                    options={typeOptions}
                    value={form.batchTypeId}
                    onValueChange={pickBatchType}
                    placeholder="— Select type —"
                    ariaLabel="Batch type"
                  />
                </Field>
                <Field label="Name">
                  <input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Batch 7"
                    maxLength={200}
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <Field label="Start Date" required>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        startDate: v,
                        // keep end ≥ start for convenience
                        endDate: prev.endDate && prev.endDate < v ? v : prev.endDate || v,
                      }));
                    }}
                    className={INPUT}
                  />
                </Field>
                <Field label="End Date" required>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(e) => set("endDate", e.target.value)}
                    className={INPUT}
                  />
                </Field>
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between">
                  <span className="text-[14px] font-bold text-ink-strong">Time</span>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-muted">
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={(e) => set("allDay", e.target.checked)}
                      className="size-4"
                      style={{ accentColor: ACCENT }}
                    />
                    All-day
                  </label>
                </label>
                {form.allDay ? (
                  <p className="rounded-chip border border-hairline bg-surface-soft px-3.5 py-2.5 text-[14px] text-ink-muted">
                    Blocks the whole day as an all-day banner on every matching date.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                    <Select
                      options={START_OPTIONS}
                      value={form.startMin == null ? "" : String(form.startMin)}
                      onValueChange={(v) => {
                        const n = Number(v);
                        setForm((prev) => ({
                          ...prev,
                          startMin: n,
                          endMin: prev.endMin != null && prev.endMin <= n ? n + SLOT_MIN : prev.endMin,
                        }));
                      }}
                      placeholder="Start time"
                      ariaLabel="Start time"
                    />
                    <Select
                      options={endOptions}
                      value={form.endMin == null ? "" : String(form.endMin)}
                      onValueChange={(v) => set("endMin", Number(v))}
                      placeholder="End time"
                      ariaLabel="End time"
                    />
                  </div>
                )}
              </div>

              <Field label="Days of Week" hint="Leave empty to block every day in the range.">
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((lbl, i) => {
                    const on = form.daysOfWeek.includes(i);
                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => toggleDay(i)}
                        aria-pressed={on}
                        className={cn(
                          "h-9 min-w-[46px] rounded-chip border px-2 text-[13px] font-bold transition-all",
                          on
                            ? "border-transparent text-white shadow-sm"
                            : "border-hairline-strong bg-surface-card text-ink-muted hover:border-hairline-strong hover:bg-surface-soft",
                        )}
                        style={on ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` } : undefined}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <Field label="Category">
                  <Select
                    options={categoryOptions}
                    value={form.categoryId}
                    onValueChange={(v) => set("categoryId", v)}
                    placeholder="— No category —"
                    ariaLabel="Category"
                  />
                </Field>
                <Field label="Status">
                  <div className="flex h-11 items-center gap-1.5 rounded-chip border border-hairline bg-surface-soft p-1">
                    {EVENT_STATUSES.map((s) => {
                      const on = form.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set("status", s)}
                          aria-pressed={on}
                          className={cn(
                            "flex-1 rounded-[10px] px-2 py-1.5 text-[13px] font-bold transition-all",
                            on ? "text-white shadow-sm" : "text-ink-muted hover:text-ink-strong",
                          )}
                          style={on ? { background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` } : undefined}
                        >
                          {EVENT_STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              <Field label="Location">
                <input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="e.g. Head office · Conference room"
                  maxLength={2000}
                  className={INPUT}
                />
              </Field>

              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Anything worth noting on each blocked slot…"
                  rows={2}
                  maxLength={2000}
                  className={INPUT}
                />
              </Field>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg px-3.5 py-2.5 text-[14px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
                    color: "var(--color-altus-red-deep)",
                  }}
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="bg-surface-card rounded-pill px-4 py-2.5 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={pending}
                  className="brand-btn rounded-pill py-2.5 px-6 text-[15px] font-bold text-white shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                >
                  {pending ? "Saving…" : isEdit ? "Save Changes" : "Create Schedule"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const INPUT =
  "w-full rounded-chip border px-3.5 py-2.5 text-[15px] bg-surface-card text-ink-strong transition-colors outline-none border-hairline-strong focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/25 placeholder:text-ink-subtle";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[14px] font-bold text-ink-strong">
        {label}
        {required && <span className="ml-0.5 text-altus-red">*</span>}
        {hint && <span className="ml-2 text-[12px] font-medium text-ink-subtle">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
