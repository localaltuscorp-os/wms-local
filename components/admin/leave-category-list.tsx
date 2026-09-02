"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2, Pencil, Plus, Undo2, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { DataTable } from "@/components/admin/ui/data-table";
import type { LeaveCategoryRow } from "@/lib/attendance/leave-categories";
import {
  saveLeaveCategoryAction,
  setLeaveCategoryActiveAction,
} from "@/app/(admin)/admin/leave-categories/actions";

/**
 * Admin · Leave Categories — the dropdown an employee picks from when applying.
 *
 * RETIRE, NOT DELETE, and the UI says so out loud. "Delete" would imply the
 * category disappears from the leaves that used it, which is exactly what must
 * NOT happen: a leave taken under "Family Duties" keeps saying so. The button
 * reads Retire, and a retired row stays visible in the table behind a filter so
 * nobody concludes it was destroyed.
 */
export function LeaveCategoryList({ rows }: { rows: LeaveCategoryRow[] }) {
  const [editing, setEditing] = React.useState<LeaveCategoryRow | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      {!adding && !editing && (
        <div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13.5px] font-bold text-white transition-colors"
            style={{ background: "var(--color-altus-red)" }}
          >
            <Plus size={15} strokeWidth={2.6} /> Add leave category
          </button>
        </div>
      )}

      {(adding || editing) && (
        <CategoryForm
          initial={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      <DataTable
        rows={rows}
        getRowKey={(r) => r.id}
        searchText={(r) => r.name}
        initialSort={{ key: "order", dir: "asc" }}
        filters={[
          {
            label: "Status",
            options: [
              { value: "active", label: "In the dropdown" },
              { value: "retired", label: "Retired" },
            ],
            match: (r, v) => (v === "active" ? r.isActive : !r.isActive),
          },
        ]}
        columns={[
          {
            key: "name",
            label: "Category",
            sortValue: (r) => r.name.toLowerCase(),
            render: (r) => (
              <span className="inline-flex items-center gap-2">
                <span className="font-semibold text-ink-strong">{r.name}</span>
                {!r.isActive && (
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11.5px] font-bold text-ink-subtle">
                    Retired
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "order",
            label: "Order",
            align: "right",
            sortValue: (r) => r.sortOrder,
            render: (r) => <span className="tabular-nums text-ink-subtle">{r.sortOrder}</span>,
          },
        ]}
        rowActions={(r) => <RowActions row={r} onEdit={() => setEditing(r)} />}
      />
    </div>
  );
}

function RowActions({ row, onEdit }: { row: LeaveCategoryRow; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await setLeaveCategoryActiveAction({ id: row.id, isActive: !row.isActive });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: row.isActive ? `"${row.name}" retired.` : `"${row.name}" is back in the dropdown.`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold"
      >
        <Pencil size={13} strokeWidth={2.6} /> Rename
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : row.isActive ? (
          <ArchiveRestore size={13} strokeWidth={2.6} />
        ) : (
          <Undo2 size={13} strokeWidth={2.6} />
        )}
        {row.isActive ? "Retire" : "Restore"}
      </button>
    </span>
  );
}

function CategoryForm({
  initial,
  onDone,
}: {
  initial: LeaveCategoryRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [sortOrder, setSortOrder] = React.useState(
    initial ? String(initial.sortOrder) : "",
  );
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await saveLeaveCategoryAction({
        id: initial?.id,
        name,
        // Blank means "put it at the end" — resolved server-side, so the admin
        // never has to know what the current highest number is.
        ...(sortOrder.trim() ? { sortOrder: Number(sortOrder) } : {}),
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: initial ? "Category renamed." : "Category added." });
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-surface-card flex flex-wrap items-end gap-3 rounded-[16px] p-4"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <span className="text-ink-muted text-[12.5px] font-bold">Category name</span>
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="e.g. Paternity Leave"
          className="rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px]"
        />
      </label>

      <label className="flex w-[130px] flex-col gap-1.5">
        <span className="text-ink-muted text-[12.5px] font-bold">Order</span>
        <input
          type="number"
          min={0}
          max={10000}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="Last"
          className="rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px] tabular-nums"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {initial ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-ink-muted hover:text-ink-strong inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[13.5px] font-bold"
        >
          <X size={14} strokeWidth={2.6} /> Cancel
        </button>
      </div>
    </form>
  );
}
