"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Select, type SelectOption } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import { archiveCategory } from "@/app/(app)/events/masters/actions";
import { readableText } from "./palette";
import { ModalShell } from "./modal-shell";
import type { CategoryVM } from "./types";

const ACCENT = "#E10600";

/**
 * Archiving a category that's still referenced → the admin must resolve the
 * references first: reassign every event/schedule/obligation to another
 * category, or clear the colour on them. In-use count comes from the server.
 */
export function ArchiveCategoryDialog({
  category,
  categories,
  onClose,
  onDone,
}: {
  category: CategoryVM;
  categories: CategoryVM[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = React.useState<"reassign" | "clear">("reassign");
  const [reassignToId, setReassignToId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const targets: SelectOption[] = React.useMemo(
    () =>
      categories
        .filter((c) => c.isActive && c.id !== category.id)
        .map((c) => ({ value: c.id, label: c.name })),
    [categories, category.id],
  );

  async function confirm() {
    if (mode === "reassign" && !reassignToId) {
      fireToast({ message: "Choose a category to reassign to.", type: "error" });
      return;
    }
    setBusy(true);
    const res = await archiveCategory({
      id: category.id,
      mode,
      reassignToId: mode === "reassign" ? reassignToId : null,
    });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `“${category.name}” archived.` });
    onDone();
  }

  const canReassign = targets.length > 0;

  return (
    <ModalShell
      title="Archive Category"
      subtitle={`“${category.name}” is used by ${category.usage} item${category.usage === 1 ? "" : "s"}.`}
      onClose={onClose}
      accent={ACCENT}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            disabled={busy}
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy ? <Spinner size={16} className="text-white" /> : null}
            Archive
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface-soft/60 p-3.5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-altus-red" strokeWidth={2.3} />
          <p className="text-[13.5px] font-medium leading-snug text-ink-muted">
            This colour is still assigned to events, schedules or obligations.
            Choose what happens to them before archiving.
          </p>
        </div>

        <label
          className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors"
          style={{
            borderColor: mode === "reassign" ? ACCENT : "var(--color-hairline)",
            background: mode === "reassign" ? `${ACCENT}0f` : undefined,
          }}
        >
          <input
            type="radio"
            name="archive-mode"
            checked={mode === "reassign"}
            onChange={() => setMode("reassign")}
            disabled={!canReassign}
            className="mt-1 accent-[var(--color-altus-red)]"
          />
          <div className="flex-1">
            <span className="text-[14px] font-bold text-ink-strong">Reassign to Another Category</span>
            <p className="mt-0.5 text-[12.5px] font-medium text-ink-soft">
              Move every referencing item to the category you pick.
            </p>
            {mode === "reassign" ? (
              <div className="mt-2.5">
                {canReassign ? (
                  <Select
                    options={targets}
                    value={reassignToId}
                    onValueChange={setReassignToId}
                    placeholder="Choose a category…"
                  />
                ) : (
                  <p className="text-[12.5px] font-semibold text-altus-red">
                    No other active category to reassign to — use “Clear” instead.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </label>

        <label
          className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors"
          style={{
            borderColor: mode === "clear" ? ACCENT : "var(--color-hairline)",
            background: mode === "clear" ? `${ACCENT}0f` : undefined,
          }}
        >
          <input
            type="radio"
            name="archive-mode"
            checked={mode === "clear"}
            onChange={() => setMode("clear")}
            className="mt-1 accent-[var(--color-altus-red)]"
          />
          <div>
            <span className="text-[14px] font-bold text-ink-strong">Clear the Category</span>
            <p className="mt-0.5 text-[12.5px] font-medium text-ink-soft">
              Leave the items but remove this colour (they fall back to no category).
            </p>
          </div>
        </label>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[12px] font-semibold text-ink-soft">Archiving:</span>
          <span
            className="inline-flex items-center rounded-md px-2.5 py-1 text-[12.5px] font-bold"
            style={{ background: category.color, color: readableText(category.color) }}
          >
            {category.name}
          </span>
        </div>
      </div>
    </ModalShell>
  );
}
