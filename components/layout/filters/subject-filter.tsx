"use client";
import { Tag } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";

export function SubjectFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const opts = options.map((s) => ({ value: s, label: s }));
  return (
    <MultiSelect
      options={opts}
      selected={selected}
      onChange={onChange}
      renderTrigger={({ selectedLabels }) => (
        <FilterPill
          icon={<Tag size={16} strokeWidth={2} />}
          name="Subject"
          value={summarizeSelection(selectedLabels, "All Subjects")}
          tint="#0ea5e9"
          active={selected.length > 0}
        />
      )}
    />
  );
}
