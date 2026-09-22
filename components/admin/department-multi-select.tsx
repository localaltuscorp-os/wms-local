"use client";

import { Star } from "lucide-react";
import { SelectAllBar } from "@/components/ui/select-all-bar";

export interface DepartmentOption {
  id: string;
  name: string;
}

interface Props {
  options: DepartmentOption[];
  selectedIds: string[];
  primaryId: string | null;
  onChange: (selectedIds: string[], primaryId: string | null) => void;
}

/**
 * Checkbox list for assigning a person to several Functions, with a star
 * to mark exactly one as primary.  Checking the first department auto-marks
 * it primary; unchecking the primary moves the star to the first remaining
 * selection.
 */
export function DepartmentMultiSelect({
  options,
  selectedIds,
  primaryId,
  onChange,
}: Props) {
  function toggle(id: string) {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      const next = selectedIds.filter((x) => x !== id);
      const nextPrimary =
        primaryId === id ? (next[0] ?? null) : primaryId;
      onChange(next, nextPrimary);
    } else {
      const next = [...selectedIds, id];
      const nextPrimary = primaryId ?? id;
      onChange(next, nextPrimary);
    }
  }

  function setPrimary(id: string) {
    if (!selectedIds.includes(id)) return;
    onChange(selectedIds, id);
  }

  if (options.length === 0) {
    return (
      <p className="text-[13px] text-[#64748B]">
        No Functions yet — create them in{" "}
        <span className="font-medium">/admin/functions</span> first.
      </p>
    );
  }

  return (
    <div className="slim-scroll rounded-md border border-[#CBD5E1] divide-y divide-[#EEF2F6] max-h-56 overflow-y-auto">
      {/* Every Function in one click, then untick the one or two that don't
          apply. The star follows: selecting all keeps the primary already set,
          or falls to the first Function; clearing leaves nobody primary. */}
      <SelectAllBar
        compact
        className="sticky top-0 z-10 bg-white"
        count={selectedIds.length}
        total={options.length}
        emptyLabel="No Functions"
        onSelectAll={() => onChange(options.map((o) => o.id), primaryId ?? options[0]?.id ?? null)}
        onClear={() => onChange([], null)}
      />
      {options.map((opt) => {
        const checked = selectedIds.includes(opt.id);
        const isPrimary = primaryId === opt.id;
        return (
          <div
            key={opt.id}
            className="flex items-center justify-between gap-2 px-3 py-2"
          >
            <label className="flex items-center gap-2.5 text-[15px] text-[#334155] cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.id)}
                className="h-4 w-4 shrink-0"
              />
              <span className="truncate">{opt.name}</span>
            </label>
            <button
              type="button"
              onClick={() => setPrimary(opt.id)}
              disabled={!checked}
              aria-pressed={isPrimary}
              title={
                isPrimary
                  ? "Primary Function"
                  : checked
                    ? "Set as primary"
                    : "Select first to set primary"
              }
              className="inline-flex items-center gap-1 text-[12px] font-semibold shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: isPrimary ? "#A80400" : "#94A3B8" }}
            >
              <Star
                size={14}
                strokeWidth={2.2}
                fill={isPrimary ? "#A80400" : "none"}
              />
              {isPrimary ? "Primary" : ""}
            </button>
          </div>
        );
      })}
    </div>
  );
}
