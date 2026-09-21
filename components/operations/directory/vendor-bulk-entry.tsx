"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, Loader2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { bulkCreateVendors } from "@/app/(app)/operations/directory/actions";
import { vendorDupKey, vendorErrors, type VendorFields } from "@/lib/operations/directory";
import type { VendorRow } from "@/lib/queries/ops-vendors";
import { VendorBulkGrid } from "./vendor-bulk-grid";

/** "batch" = repeated earlier in this upload · "existing" = already in the Directory. */
type Dup = "batch" | "existing" | null;

type Row = VendorFields & { key: number; errors: string[]; dup: Dup; include: boolean };

function evaluate(rows: Row[], existing: Set<string>): Row[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const errors = vendorErrors(r);
    const k = vendorDupKey({ firstName: r.firstName, lastName: r.lastName || null, cellNo: r.cellNo || null });
    let dup: Dup = null;
    if (r.firstName.trim()) {
      if (existing.has(k)) dup = "existing";
      else if (seen.has(k)) dup = "batch";
      seen.add(k);
    }
    return { ...r, errors, dup, include: errors.length === 0 && dup === null };
  });
}

/**
 * Directory bulk upload: grid → review → create. The same two-step flow as
 * Tasks' bulk entry (components/tasks/tasks-bulk-entry.tsx), including its fix:
 * the grid is HIDDEN during review, never unmounted, because it keeps every
 * draft row in its own state and "Back to Grid" must hand them back intact.
 */
export function VendorBulkEntry({
  categories,
  existing,
  onSuccess,
}: {
  categories: string[];
  existing: VendorRow[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const existingKeys = React.useMemo(() => new Set(existing.map((v) => vendorDupKey(v))), [existing]);

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = rows ? rows.length - validCount : 0;
  const dupCount = rows?.filter((r) => r.dup !== null).length ?? 0;
  const selectedCount = rows?.filter((r) => r.include && r.errors.length === 0).length ?? 0;

  function onGridProceed(gridRows: VendorFields[]) {
    if (gridRows.length === 0) {
      setError("Fill at least one vendor - First Name and Category are required.");
      return;
    }
    setError(null);
    setRows(evaluate(gridRows.map((g, i) => ({ ...g, key: i + 1, errors: [], dup: null, include: true })), existingKeys));
  }

  function toggleRow(key: number) {
    setRows((prev) => (prev ? prev.map((r) => (r.key === key && r.errors.length === 0 ? { ...r, include: !r.include } : r)) : prev));
  }
  function edit(key: number, patch: Partial<VendorFields>) {
    setRows((prev) => (prev ? evaluate(prev.map((r) => (r.key === key ? { ...r, ...patch } : r)), existingKeys) : prev));
  }
  function dropRow(key: number) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.key !== key);
      return next.length ? evaluate(next, existingKeys) : null;
    });
  }

  function doCreate() {
    if (!rows) return;
    const payload: VendorFields[] = rows
      .filter((r) => r.include && r.errors.length === 0)
      .map(({ key: _k, errors: _e, dup: _d, include: _i, ...v }) => v);
    if (payload.length === 0) {
      setError("Select at least one valid row to create.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await bulkCreateVendors({ rows: payload });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({
        message: `Added ${res.created} vendor${res.created === 1 ? "" : "s"}${
          res.failed.length ? ` · ${res.failed.length} row${res.failed.length === 1 ? "" : "s"} skipped` : ""
        }.`,
        type: "success",
      });
      router.refresh();
      onSuccess?.();
    });
  }

  const th = "whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.05em]";
  const cellInput = "w-[150px] max-w-full rounded-md border bg-white px-2 py-1 text-[13px] font-semibold text-ink-strong outline-none focus:border-altus-red";

  const review = rows ? (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}>
          <CheckCircle2 size={14} /> {validCount} valid
        </span>
        {dupCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }}>
            <Copy size={13} /> {dupCount} duplicate{dupCount === 1 ? "" : "s"}
          </span>
        )}
        {invalidCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red-deep)" }}>
            <AlertTriangle size={14} /> {invalidCount} need fixing
          </span>
        )}
        <span className="text-[12.5px] font-semibold tabular-nums text-ink-subtle">{selectedCount} selected to create</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-hairline)", overscrollBehaviorY: "auto" }}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--color-surface-soft)" }}>
              {["", "First Name", "Last Name", "Category", "Cell No", "City", "AMC", "Status", ""].map((h, i) => (
                <th key={i} className={th} style={{ color: "var(--color-ink-subtle)", borderBottom: "1px solid var(--color-hairline)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const bad = r.errors.length > 0;
              const isDup = r.dup !== null;
              return (
                <tr
                  key={r.key}
                  style={{
                    borderBottom: "1px solid var(--color-hairline)",
                    background: bad
                      ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)"
                      : isDup
                        ? "color-mix(in srgb, #b45309 6%, transparent)"
                        : r.include
                          ? "transparent"
                          : "var(--color-surface-soft)",
                  }}
                >
                  <td className="px-2.5 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={r.include && !bad}
                      disabled={bad}
                      onChange={() => toggleRow(r.key)}
                      aria-label={`Include row ${r.key}`}
                      className="size-4 cursor-pointer accent-[var(--color-altus-red)] disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    <input
                      value={r.firstName}
                      onChange={(e) => edit(r.key, { firstName: e.target.value })}
                      aria-label={`First name row ${r.key}`}
                      className={cellInput}
                      style={{ borderColor: bad ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
                    />
                    {bad && <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>{r.errors.join(" · ")}</div>}
                  </td>
                  <td className="px-2.5 py-2 align-top text-ink-soft">{r.lastName || "-"}</td>
                  <td className="px-2.5 py-2 align-top">
                    <input
                      value={r.category}
                      onChange={(e) => edit(r.key, { category: e.target.value })}
                      aria-label={`Category row ${r.key}`}
                      className={cellInput}
                      style={{ borderColor: !r.category.trim() ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
                    />
                  </td>
                  <td className="px-2.5 py-2 align-top tabular-nums text-ink-soft">{r.cellNo || "-"}</td>
                  <td className="px-2.5 py-2 align-top text-ink-soft">{r.city || "-"}</td>
                  <td className="px-2.5 py-2 align-top text-ink-soft">{r.amc ? "Yes" : "No"}</td>
                  <td className="px-2.5 py-2 align-top">
                    {isDup ? (
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }}
                        title={r.dup === "existing" ? "A vendor with this name and cell number is already in the Directory" : "Same name and cell number earlier in this upload"}
                      >
                        <Copy size={11} /> {r.dup === "existing" ? "Already listed" : "Repeat"}
                      </span>
                    ) : bad ? (
                      <span className="text-[11.5px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>Fix</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: "var(--color-green-deep)" }}>
                        <Check size={12} /> OK
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => dropRow(r.key)}
                      aria-label={`Remove row ${r.key}`}
                      title="Remove this row"
                      className="grid size-6 place-items-center rounded-md text-altus-red hover:bg-altus-red hover:text-white"
                    >
                      <Trash2 size={12} strokeWidth={2.4} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dupCount > 0 && (
        <p className="mt-2 text-[12px] font-medium text-ink-muted">
          Duplicates are unticked by default. Tick to create anyway, or remove the row.
        </p>
      )}
      {invalidCount > 0 && (
        <p className="mt-1 text-[12px] font-medium text-ink-muted">
          Rows needing fixes are excluded - fix them here or go back to the grid.
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}>
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => { setRows(null); setError(null); }}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-4 py-2 text-[13.5px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong disabled:opacity-60"
        >
          <ArrowLeft size={15} /> Back to Grid
        </button>
        <button
          type="button"
          onClick={doCreate}
          disabled={pending || selectedCount === 0}
          className="inline-flex items-center gap-1.5 rounded-pill px-5 py-2 text-[13.5px] font-bold text-white transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
          {pending ? "Creating…" : `Create ${selectedCount || ""}`.trim()}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className={rows ? "hidden" : undefined}>
        <VendorBulkGrid categories={categories} onProceed={onGridProceed} />
        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red" style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)" }}>
            <AlertTriangle size={15} /> {error}
          </p>
        )}
      </div>
      {review}
    </>
  );
}
