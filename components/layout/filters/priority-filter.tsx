"use client";
import { Flag } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
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
    <div className="filter-chip">
      <Flag size={16} className="text-ink-subtle" strokeWidth={2} />
      <MultiSelect
        options={OPTIONS}
        selected={selected}
        onChange={onChange}
        placeholder="All Priorities"
        className="min-w-[6.5rem] !text-[14px]"
      />
    </div>
  );
}
