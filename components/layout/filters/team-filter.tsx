"use client";
import { Network } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterPill, summarizeSelection } from "./filter-pill";
import { TEAM_ROSTER } from "@/lib/teams/roster";

/**
 * Team scope — the six standing teams, T1 through T6.
 *
 * A team is a MANAGER PLUS THEIR WHOLE BRANCH, resolved from the org chart
 * server-side (`resolveTeamScope`), so the members are deliberately not listed
 * here — they change as the chart changes. T1 (Manan) contains every other
 * team, which is why the list reads top-down rather than alphabetically.
 *
 * This is NOT a duplicate of the Department filter beside it. Department
 * narrows by the DOER's department; Team matches a task whose doer OR INITIATOR
 * is in scope, so it catches work a team handed out as well as work it is
 * doing. Setting both means the intersection.
 *
 * HISTORY: this used to offer "My Team" plus every department. Both are gone
 * from the dropdown, but `resolveTeamScope` still understands them so links and
 * bookmarks saved under the old options keep resolving instead of breaking.
 */

const OPTIONS = TEAM_ROSTER.map((t) => ({ value: t.value, label: t.label }));

export function TeamFilter({
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
          icon={<Network size={16} strokeWidth={2} />}
          name="Team"
          value={summarizeSelection(selectedLabels, "All Teams")}
          tint="#0d9488"
          active={selected.length > 0}
        />
      )}
    />
  );
}
