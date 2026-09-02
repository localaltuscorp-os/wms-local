"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fireToast } from "@/lib/toast";
import { createCategory, updateCategory } from "@/app/(app)/events/masters/actions";
import { CATEGORY_PALETTE, HEX_RE, readableText } from "./palette";
import { ModalShell } from "./modal-shell";
import type { CategoryVM } from "./types";

const ACCENT = "#E10600";

/** Create (no `category`) or edit an existing category. */
export function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category: CategoryVM | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(category?.name ?? "");
  const [color, setColor] = React.useState(
    (category?.color ?? CATEGORY_PALETTE[0]!.hex).toLowerCase(),
  );
  const [saving, setSaving] = React.useState(false);
  const editing = category !== null;

  const validHex = HEX_RE.test(color);
  const preview = validHex ? color : "#e5e7eb";
  const fg = validHex ? readableText(color) : "#111111";

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      fireToast({ message: "A category name is required.", type: "error" });
      return;
    }
    if (!validHex) {
      fireToast({ message: "Pick a colour or enter a valid hex (#RRGGBB).", type: "error" });
      return;
    }
    setSaving(true);
    const res = editing
      ? await updateCategory({ id: category!.id, name: trimmed, color })
      : await createCategory({ name: trimmed, color });
    setSaving(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: editing ? "Category updated." : "Category added." });
    onSaved();
  }

  return (
    <ModalShell
      title={editing ? "Edit Category" : "New Category"}
      subtitle="Set the legend name and colour. Text colour is auto-chosen for contrast."
      onClose={onClose}
      accent={ACCENT}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={saving}
            style={{ background: ACCENT }}
          >
            {saving ? <Spinner size={16} className="text-white" /> : null}
            {editing ? "Save Changes" : "Add Category"}
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
            placeholder="e.g. Lead Generation"
            maxLength={80}
            className="h-11 w-full rounded-chip border border-hairline bg-surface-card px-3.5 text-[15px] text-ink-strong outline-none transition-all hover:border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-wide text-ink-soft">
            Colour
          </label>
          <div className="grid grid-cols-8 gap-2">
            {CATEGORY_PALETTE.map((sw) => {
              const active = sw.hex === color;
              return (
                <button
                  key={sw.hex}
                  type="button"
                  title={sw.name}
                  aria-label={sw.name}
                  onClick={() => setColor(sw.hex)}
                  className="relative aspect-square rounded-lg border transition-transform hover:scale-105 focus-visible:outline-2"
                  style={{
                    background: sw.hex,
                    borderColor: active ? "var(--color-ink-strong)" : "rgba(0,0,0,0.12)",
                    boxShadow: active ? "0 0 0 2px var(--color-ink-strong)" : undefined,
                    outlineColor: "var(--color-altus-red)",
                  }}
                >
                  {active ? (
                    <Check
                      size={15}
                      strokeWidth={3}
                      className="absolute inset-0 m-auto"
                      style={{ color: readableText(sw.hex) }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="text-[12.5px] font-semibold text-ink-soft">Custom Hex</span>
            <input
              value={color}
              onChange={(e) => {
                let v = e.target.value.trim().toLowerCase();
                if (v && !v.startsWith("#")) v = `#${v}`;
                setColor(v);
              }}
              placeholder="#E10600"
              spellCheck={false}
              className="h-9 w-32 rounded-chip border border-hairline bg-surface-card px-3 font-mono text-[13px] text-ink-strong outline-none transition-all hover:border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/25"
            />
            {!validHex && color.length > 0 ? (
              <span className="text-[12px] font-medium text-altus-red">Invalid hex</span>
            ) : null}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-wide text-ink-soft">
            Preview
          </label>
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13.5px] font-bold"
            style={{ background: preview, color: fg }}
          >
            {name.trim() || "Category name"}
          </span>
        </div>
      </form>
    </ModalShell>
  );
}
