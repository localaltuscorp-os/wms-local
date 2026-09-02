"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Select, type SelectOption } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { createBatchType, updateBatchType } from "@/app/(app)/events/masters/actions";
import { ModalShell } from "./modal-shell";
import type { BatchTypeVM, CategoryVM } from "./types";

const ACCENT = "#E10600";
const NONE = "__none__";

/** Create (no `batchType`) or edit a batch/section type. */
export function BatchTypeEditor({
  batchType,
  categories,
  onClose,
  onSaved,
}: {
  batchType: BatchTypeVM | null;
  categories: CategoryVM[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(batchType?.name ?? "");
  const [categoryId, setCategoryId] = React.useState(batchType?.defaultCategoryId ?? NONE);
  const [saving, setSaving] = React.useState(false);
  const editing = batchType !== null;

  const options: SelectOption[] = React.useMemo(
    () => [
      { value: NONE, label: "No default colour" },
      ...categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      fireToast({ message: "A batch type name is required.", type: "error" });
      return;
    }
    const defaultCategoryId = categoryId === NONE ? null : categoryId;
    setSaving(true);
    const res = editing
      ? await updateBatchType({ id: batchType!.id, name: trimmed, defaultCategoryId })
      : await createBatchType({ name: trimmed, defaultCategoryId });
    setSaving(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: editing ? "Batch type updated." : "Batch type added." });
    onSaved();
  }

  return (
    <ModalShell
      title={editing ? "Edit Batch Type" : "New Batch Type"}
      subtitle="Batch types (PS / BSS / Conclave …) drive the auto-blocking schedules."
      onClose={onClose}
      accent={ACCENT}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving} style={{ background: ACCENT }}>
            {saving ? <Spinner size={16} className="text-white" /> : null}
            {editing ? "Save Changes" : "Add Batch Type"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-5"
      >
        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-wide text-ink-soft">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. PS Batch Schedule"
            maxLength={80}
            className="h-11 w-full rounded-chip border border-hairline bg-surface-card px-3.5 text-[15px] text-ink-strong outline-none transition-all hover:border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-wide text-ink-soft">
            Default category
          </label>
          <Select
            options={options}
            value={categoryId}
            onValueChange={setCategoryId}
            placeholder="No default colour"
          />
          <p className="mt-1.5 text-[12px] font-medium text-ink-soft">
            New schedules of this type pre-fill with this category&apos;s colour.
          </p>
        </div>
      </form>
    </ModalShell>
  );
}
