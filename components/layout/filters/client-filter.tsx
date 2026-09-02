"use client";
import { Building2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";

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
    <MultiSelect
      options={options}
      selected={selected}
      onChange={onChange}
      renderTrigger={({ selectedLabels }) => (
        <FilterPill
          icon={<Building2 size={16} strokeWidth={2} />}
          name="Client"
          value={summarizeSelection(selectedLabels, "All Clients")}
          tint="#3b82f6"
          active={selected.length > 0}
        />
      )}
    />
  );
}
