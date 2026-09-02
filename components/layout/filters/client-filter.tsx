"use client";
import { Building2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";

// Distinct task clients, passed in from the server (free-text values on
// tasks.client). Mirrors SubjectFilter.
export function ClientFilter({
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
      <Building2 size={16} className="text-ink-subtle" strokeWidth={2} />
      <MultiSelect
        options={options}
        selected={selected}
        onChange={onChange}
        placeholder="All Clients"
        className="min-w-[6.5rem] !text-[14px]"
      />
    </div>
  );
}
