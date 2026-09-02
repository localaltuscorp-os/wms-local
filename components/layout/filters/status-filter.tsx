"use client";
import { CircleDot } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";

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
    <MultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      renderTrigger={({ selectedLabels }) => (
        <FilterPill
          icon={<CircleDot size={16} strokeWidth={2} />}
          name="Doer Status"
          value={summarizeSelection(selectedLabels, "All Statuses")}
          tint="#16a34a"
          active={selected.length > 0}
        />
      )}
    />
  );
}
