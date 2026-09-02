"use client";
import { Users2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";
import { DEPARTMENTS } from "@/db/enums";

const OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));

export function DepartmentFilter({
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
          icon={<Users2 size={16} strokeWidth={2} />}
          name="Department"
          value={summarizeSelection(selectedLabels, "All Departments")}
          tint="#8b5cf6"
          active={selected.length > 0}
        />
      )}
    />
  );
}
