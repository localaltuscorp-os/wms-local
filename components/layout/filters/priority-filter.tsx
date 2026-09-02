"use client";
import { Flag } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";
import { TASK_PRIORITIES, PRIORITY_LABELS } from "@/db/enums";

const OPTIONS = TASK_PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
}));

export function PriorityFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <MultiSelect
      options={OPTIONS}
      selected={selected}
      onChange={onChange}
      renderTrigger={({ selectedLabels }) => (
        <FilterPill
          icon={<Flag size={16} strokeWidth={2} />}
          name="Priority"
          value={summarizeSelection(selectedLabels, "All Priorities")}
          tint="#f59e0b"
          active={selected.length > 0}
        />
      )}
    />
  );
}
