"use client";

import * as React from "react";
import { MultiSelect } from "@/components/ui/multi-select";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import type { RosterMember } from "./util";

export interface TeamMember {
  employeeId?: string;
  name?: string;
}

/**
 * Team-Involved picker (§11b-F). Stores employee ids; resolves them against the
 * LIVE active roster so departed members auto-drop from the view while their id
 * is preserved. Free-text names (from imports) that don't match a roster id show
 * as-is and stay selectable.
 */
export function TeamPicker({
  value,
  roster,
  onChange,
}: {
  value: TeamMember[];
  roster: RosterMember[];
  onChange: (next: TeamMember[]) => void;
}) {
  const options = roster.map((r) => ({ value: r.id, label: r.name }));
  const selectedIds = value.map((m) => m.employeeId).filter((x): x is string => !!x);

  return (
    <MultiSelect
      options={options}
      selected={selectedIds}
      placeholder="Add team…"
      onChange={(ids) => onChange(ids.map((employeeId) => ({ employeeId })))}
    />
  );
}

/** Read-only stacked avatars for a goal's team, resolved against the live roster. */
export function TeamAvatars({
  team,
  roster,
  max = 4,
}: {
  team: TeamMember[] | null;
  roster: RosterMember[];
  max?: number;
}) {
  const nameById = React.useMemo(
    () => new Map(roster.map((r) => [r.id, r.name])),
    [roster],
  );
  const resolved = (team ?? [])
    .map((m) => (m.employeeId ? nameById.get(m.employeeId) : m.name))
    .filter((n): n is string => !!n);

  if (resolved.length === 0) return <span className="text-ink-soft text-[13px]">—</span>;

  const shown = resolved.slice(0, max);
  const extra = resolved.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((name, i) => (
          <span key={i} className="ring-2 ring-surface-card rounded-full" title={name}>
            <EmployeeAvatar name={name} size="sm" />
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="ml-1.5 text-[12px] font-bold text-ink-soft">+{extra}</span>
      )}
    </div>
  );
}
