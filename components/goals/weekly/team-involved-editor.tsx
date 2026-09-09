"use client";

import * as React from "react";
import { Plus, X, Check, Users } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import { setWeeklyTeamInvolved } from "@/app/(app)/goals/weekly/actions";
import type { RosterMember, TeamMember } from "./types";

/**
 * Team Involved editor — stored `team_involved` holds employee ids; this resolves
 * them LIVE against the active roster (§11b-F). Departed / inactive members are
 * dropped from the avatar strip (their id stays on the row for history until the
 * next save). Managers/owners add or remove members inline; each mutation writes
 * the full resolved set back.
 */
export function TeamInvolvedEditor({
  goalId,
  stored,
  roster,
  canEdit,
}: {
  goalId: string;
  stored: TeamMember[];
  roster: RosterMember[];
  canEdit: boolean;
}) {
  const byId = React.useMemo(
    () => new Map(roster.map((r) => [r.id, r])),
    [roster],
  );

  // Resolve stored ids → only the ACTIVE members are shown (departed auto-drop).
  const resolved = React.useMemo(() => {
    return stored
      .map((m): TeamMember | null => {
        if (m.employeeId) {
          const person = byId.get(m.employeeId);
          if (person && person.isActive) return { employeeId: person.id, name: person.name };
          return null; // departed / unknown → drop from live view
        }
        if (m.name) return { name: m.name };
        return null;
      })
      .filter((x): x is TeamMember => x !== null);
  }, [stored, byId]);

  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const selectedIds = new Set(resolved.map((m) => m.employeeId).filter(Boolean) as string[]);

  function save(next: TeamMember[]) {
    startTransition(async () => {
      const res = await setWeeklyTeamInvolved({ id: goalId, members: next });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }

  function toggle(person: RosterMember) {
    if (selectedIds.has(person.id)) {
      save(resolved.filter((m) => m.employeeId !== person.id));
    } else {
      save([...resolved, { employeeId: person.id, name: person.name }]);
    }
  }

  function remove(id: string) {
    save(resolved.filter((m) => m.employeeId !== id));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {resolved.length === 0 && !canEdit && (
        <span className="text-[12px] text-ink-soft">—</span>
      )}
      <div className="flex -space-x-1.5">
        {resolved.map((m, i) =>
          m.employeeId ? (
            <span
              key={m.employeeId}
              className="group/av relative"
              title={m.name}
              style={{ zIndex: resolved.length - i }}
            >
              <EmployeeAvatar name={m.name ?? "?"} size="sm" className="ring-2 ring-surface-card" />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(m.employeeId!)}
                  disabled={pending}
                  aria-label={`Remove ${m.name}`}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-ink-strong text-white group-hover/av:flex"
                >
                  <X size={9} strokeWidth={3} />
                </button>
              )}
            </span>
          ) : (
            <span
              key={`name-${i}`}
              title={m.name}
              className="inline-flex items-center rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-medium text-ink-muted"
            >
              {m.name}
            </span>
          ),
        )}
      </div>

      {canEdit && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className="wg-btn inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline-strong text-ink-soft hover:border-ink-soft hover:text-ink-strong"
              aria-label="Add team member"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
              <Users size={14} className="text-ink-soft" />
              <span className="text-[12px] font-semibold text-ink-strong">Team Involved</span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {roster.filter((r) => r.isActive).length === 0 && (
                <p className="px-3 py-4 text-[12px] text-ink-soft">No people in scope.</p>
              )}
              {roster
                .filter((r) => r.isActive)
                .map((person) => {
                  const on = selectedIds.has(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggle(person)}
                      disabled={pending}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-soft"
                    >
                      <EmployeeAvatar name={person.name} size="sm" />
                      <span className="flex-1 truncate text-[13px] text-ink-strong">
                        {person.name}
                      </span>
                      {on && <Check size={15} className="text-[var(--goals-accent,#E10600)]" strokeWidth={2.5} />}
                    </button>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
