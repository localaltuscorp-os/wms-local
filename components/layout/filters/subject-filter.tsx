"use client";
import { Tag } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

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
    <div className="filter-chip">
      <Tag size={16} className="text-ink-subtle" strokeWidth={2} />
      <MultiSelect
        options={opts}
        selected={selected}
        onChange={onChange}
        placeholder="All Subjects"
        className="min-w-[6.5rem] !text-[14px]"
      />
    </div>
  );
}
