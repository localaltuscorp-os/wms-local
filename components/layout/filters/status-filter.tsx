"use client";
import { CircleDot } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

// Status options carry the admin-overridable human labels (resolved on the
// server), so unlike Priority/Department this filter takes its options as a
// prop rather than building them from a static enum map.
export function StatusFilter({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="filter-chip">
      <CircleDot size={16} className="text-ink-subtle" strokeWidth={2} />
      <MultiSelect
        options={options}
        selected={selected}
        onChange={onChange}
        placeholder="All Status"
        className="min-w-[6.5rem] !text-[14px]"
      />
    </div>
  );
}
