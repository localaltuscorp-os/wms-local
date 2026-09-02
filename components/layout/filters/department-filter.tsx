"use client";
import { Building2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
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
    <div className="filter-chip">
      <Building2 size={16} className="text-ink-subtle" strokeWidth={2} />
      <MultiSelect
        options={OPTIONS}
        selected={selected}
        onChange={onChange}
        placeholder="All Departments"
        className="min-w-[6.5rem] !text-[14px]"
      />
    </div>
  );
}
