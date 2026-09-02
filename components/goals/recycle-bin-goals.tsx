"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, Loader2, Archive, X, AlertTriangle } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { restoreGoal, purgeGoals } from "@/app/(app)/goals/cascade/actions";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface BinGoal {
  id: string;
  title: string;
  area: string | null;
  code: string; // e.g. "Y3", "AprM2" — a short Sr.No-ish label
  periodLabel: string; // e.g. "FY 2026-27", "Q2 · Jul-Sep", "Jul 2026"
  ownerName: string; // whose goal it was
  deletedAt: string | null; // ISO string or null
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Coarse relative label ("2h ago", "5d ago") — rendered client-side only to
 *  avoid server/client clock drift causing hydration mismatches. */
function relativeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function DeletedWhen({ iso }: { iso: string }) {
  const [label, setLabel] = React.useState<string>("");
  React.useEffect(() => setLabel(relativeLabel(iso)), [iso]);
  if (!label) return null;
  return (
    <span className="whitespace-nowrap text-[12px] tabular-nums text-ink-subtle">
      deleted {label}
    </span>
  );
}

const RED_TINT_10 = "color-mix(in srgb, var(--color-altus-red) 10%, transparent)";
const RED_TINT_16 = "color-mix(in srgb, var(--color-altus-red) 16%, transparent)";

/* ------------------------------------------------------------------ */
/* Checkbox (custom, brand-styled, keyboard-native)                    */
/* ------------------------------------------------------------------ */

function BinCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);
  return (
    <label className="relative grid size-5 shrink-0 cursor-pointer place-items-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="grid size-5 place-items-center rounded-[7px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1"
        style={{
          borderColor:
            checked || indeterminate ? "var(--color-altus-red)" : "var(--color-hairline-strong)",
          background:
            checked || indeterminate
              ? "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))"
              : "var(--color-surface-card)",
          // ring color for focus-visible
          ["--tw-ring-color" as string]: RED_TINT_16,
        }}
      >
        {checked ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2 6.2 4.8 9 10 3.4"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : indeterminate ? (
          <span className="block h-[2px] w-2.5 rounded-full bg-white" />
        ) : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm modal — fixed overlay + centered card, no external dep      */
/* ------------------------------------------------------------------ */

function ConfirmPurgeModal({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purge-title"
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
        style={{ background: "color-mix(in srgb, var(--color-ink-strong) 45%, transparent)" }}
      />
      {/* Card */}
      <div
        className="wg-rise relative w-full max-w-md rounded-2xl border border-hairline bg-surface-card p-6"
        style={{
          boxShadow:
            "0 24px 64px -16px color-mix(in srgb, var(--color-ink-strong) 35%, transparent), 0 2px 8px color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl"
            style={{ background: RED_TINT_10, color: "var(--color-altus-red)" }}
          >
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            <h3
              id="purge-title"
              className="text-[17px] font-bold text-ink-strong"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Permanently delete <span className="tabular-nums">{count}</span> goal{count === 1 ? "" : "s"}?
            </h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
              This wipes {count === 1 ? "it" : "them"} from the record for good — restoring later
              won&apos;t be possible. This can&apos;t be undone.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-chip border border-hairline bg-surface-card px-4 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-hairline-strong disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="wg-sheen inline-flex h-10 items-center gap-1.5 rounded-chip px-4 text-[13.5px] font-bold text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: `0 6px 18px -6px ${RED_TINT_16}`,
            }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Delete Forever
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function RecycleBinGoals({ items }: { items: BinGoal[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Selection can only reference goals that still exist in the list.
  const visibleIds = React.useMemo(() => new Set(items.map((g) => g.id)), [items]);
  const selectedIds = React.useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );
  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0;

  const toggleOne = (id: string, next: boolean) =>
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  const toggleAll = (next: boolean) =>
    setSelected(next ? new Set(items.map((g) => g.id)) : new Set());

  const doRestoreOne = (goal: BinGoal) => {
    setRowBusy(goal.id);
    startTransition(async () => {
      try {
        const res = await restoreGoal({ id: goal.id });
        if (res.ok) {
          setSelected((prev) => {
            const copy = new Set(prev);
            copy.delete(goal.id);
            return copy;
          });
          fireToast({ message: `Restored “${goal.title}”.`, type: "success" });
          router.refresh();
        } else {
          fireToast({ message: res.error, type: "error" });
        }
      } finally {
        setRowBusy(null);
      }
    });
  };

  const doRestoreSelected = () => {
    const ids = selectedIds;
    if (ids.length === 0) return;
    startTransition(async () => {
      const results = await Promise.all(ids.map((id) => restoreGoal({ id })));
      const okCount = results.filter((r) => r.ok).length;
      const firstFail = results.find((r) => !r.ok);
      if (okCount > 0) {
        fireToast({
          message: `Restored ${okCount} goal${okCount === 1 ? "" : "s"}.`,
          type: "success",
        });
      }
      if (firstFail && !firstFail.ok) {
        fireToast({ message: firstFail.error, type: "error" });
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  const doPurgeSelected = () => {
    const ids = selectedIds;
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await purgeGoals({ ids });
      if (res.ok) {
        fireToast({
          message: `Permanently deleted ${res.deleted} goal${res.deleted === 1 ? "" : "s"}.`,
          type: "success",
        });
        setSelected(new Set());
        setConfirmOpen(false);
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
        setConfirmOpen(false);
      }
    });
  };

  /* ---------------- Empty state ---------------- */
  if (items.length === 0) {
    return (
      <div
        className="wg-rise grid place-items-center gap-3 rounded-2xl border border-hairline-strong bg-surface-card py-16 text-center"
      >
        <span
          className="grid size-14 place-items-center rounded-2xl"
          style={{ background: RED_TINT_10, color: "var(--color-altus-red)" }}
        >
          <Archive size={26} />
        </span>
        <p
          className="text-[16px] font-bold text-ink-strong"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Recycle bin is empty
        </p>
        <p className="max-w-[42ch] text-[13px] leading-relaxed text-ink-muted">
          Deleted goals land here so nothing is lost by accident. Restore them to the cascade, or
          clear them out for good.
        </p>
      </div>
    );
  }

  /* ---------------- List ---------------- */
  return (
    <section className="flex flex-col gap-3">
      {/* Header row */}
      <header className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-soft px-4 py-3">
        <BinCheckbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={toggleAll}
          label={allSelected ? "Deselect all goals" : "Select all goals"}
        />
        <div className="min-w-0 flex-1">
          <h2
            className="text-[16px] font-bold text-ink-strong"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Recycle Bin
          </h2>
          <p className="truncate text-[12.5px] text-ink-muted">
            <span className="tabular-nums">{items.length}</span> deleted goal
            {items.length === 1 ? "" : "s"} — restore or clear for good.
          </p>
        </div>
        {someSelected && (
          <span
            className="rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums"
            style={{ background: RED_TINT_10, color: "var(--color-altus-red-deep)" }}
          >
            {selectedIds.length} selected
          </span>
        )}
      </header>

      {/* Bulk action bar */}
      {someSelected && (
        <div
          className="wg-rise sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5"
          style={{
            borderColor: RED_TINT_16,
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 7%, var(--color-surface-card)), var(--color-surface-card))",
            boxShadow:
              "0 10px 30px -12px color-mix(in srgb, var(--color-ink-strong) 22%, transparent)",
          }}
        >
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            className="wg-sheen inline-flex h-9 items-center gap-1.5 rounded-chip px-3.5 text-[13px] font-bold text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            }}
          >
            <Trash2 size={14} /> Permanently delete ({selectedIds.length})
          </button>
          <button
            type="button"
            onClick={doRestoreSelected}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-chip border px-3.5 text-[13px] font-bold transition-colors disabled:opacity-50"
            style={{
              borderColor: "color-mix(in srgb, var(--color-green, #1a7f4e) 45%, transparent)",
              color: "var(--color-green-deep, var(--color-ink-strong))",
              background: "var(--color-surface-card)",
            }}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Restore Selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={pending}
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-chip px-3 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink-strong disabled:opacity-50"
          >
            <X size={14} /> Clear
          </button>
        </div>
      )}

      {/* Rows */}
      <ul className="flex flex-col gap-2.5">
        {items.map((g) => {
          const isChecked = selected.has(g.id);
          const isBusy = rowBusy === g.id;
          return (
            <li
              key={g.id}
              className="wg-rise flex items-center gap-3 rounded-2xl border bg-surface-card px-4 py-3 transition-colors"
              style={{
                borderColor: isChecked ? RED_TINT_16 : "var(--color-hairline)",
                background: isChecked
                  ? "color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card))"
                  : undefined,
              }}
            >
              <BinCheckbox
                checked={isChecked}
                onChange={(next) => toggleOne(g.id, next)}
                label={`Select ${g.title}`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-muted">
                    {g.code}
                  </span>
                  <span
                    className="truncate text-[15px] font-semibold text-ink-strong"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {g.title}
                  </span>
                  {g.area && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: RED_TINT_10, color: "var(--color-altus-red-deep)" }}
                    >
                      {g.area}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-muted">
                  <span className="whitespace-nowrap">{g.periodLabel}</span>
                  <span aria-hidden className="text-ink-subtle">·</span>
                  <span className="truncate">{g.ownerName}</span>
                  {g.deletedAt && (
                    <>
                      <span aria-hidden className="text-ink-subtle">·</span>
                      <DeletedWhen iso={g.deletedAt} />
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => doRestoreOne(g)}
                disabled={pending || isBusy}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-chip border px-3 text-[13px] font-bold transition-colors hover:border-hairline-strong disabled:opacity-50"
                style={{
                  borderColor: "var(--color-hairline)",
                  color: "var(--color-green-deep, var(--color-ink-strong))",
                  background: "var(--color-surface-card)",
                }}
              >
                {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Restore
              </button>
            </li>
          );
        })}
      </ul>

      {confirmOpen && someSelected && (
        <ConfirmPurgeModal
          count={selectedIds.length}
          busy={pending}
          onCancel={() => (!pending ? setConfirmOpen(false) : undefined)}
          onConfirm={doPurgeSelected}
        />
      )}
    </section>
  );
}
