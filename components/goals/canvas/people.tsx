"use client";

/**
 * Goals Canvas — SHARED PEOPLE ATOMS.
 *
 * Team avatar stack + the roster multi-picker, extracted from peek-panel.tsx
 * (Phase 3) so the ParentContextPanel, GoalContainer and the peek panel all
 * share ONE copy. Keyboard-native (checkbox list), zero queries.
 */

import * as React from "react";
import { GOALS_ACCENT, GOALS_ACCENT_DEEP } from "@/components/goals/cascade/util";
import type { RosterMember } from "./types";

export type TeamMember = { employeeId?: string; name?: string };

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

const AV_COLORS = ["#1d4ed8", "#0891b2", "#7c3aed", "#b45309", "#be123c", "#15803d"];

export function TeamAvatarStack({ team, size = 6 }: { team: TeamMember[]; size?: number }) {
  if (team.length === 0) return null;
  const cls = size === 5 ? "size-5 text-[8px]" : "size-6 text-[9px]";
  return (
    <div className="flex -space-x-1.5">
      {team.slice(0, 6).map((t, i) => (
        <span
          key={t.employeeId ?? t.name ?? i}
          title={t.name ?? ""}
          className={`inline-flex ${cls} items-center justify-center rounded-full font-black text-white ring-2 ring-white`}
          style={{ background: AV_COLORS[i % AV_COLORS.length] }}
        >
          {initialsOf(t.name ?? "?")}
        </span>
      ))}
      {team.length > 6 && (
        <span className={`inline-flex ${cls} items-center justify-center rounded-full bg-surface-soft font-black text-ink-muted ring-2 ring-white`}>
          +{team.length - 6}
        </span>
      )}
    </div>
  );
}

/** Roster multi-picker (checkbox list, keyboard-native). */
export function TeamPicker({
  roster,
  team,
  onDone,
  onCancel,
}: {
  roster: RosterMember[];
  team: TeamMember[];
  onDone: (next: TeamMember[]) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = React.useState<Set<string>>(
    () => new Set(team.map((t) => t.employeeId).filter((id): id is string => !!id)),
  );
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div
      className="mt-2.5 rounded-xl border p-2.5"
      style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="max-h-[180px] overflow-y-auto">
        {roster.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-surface-card"
          >
            <input
              type="checkbox"
              checked={sel.has(r.id)}
              onChange={() => toggle(r.id)}
              style={{ accentColor: `var(--module-accent, ${GOALS_ACCENT})` }}
            />
            <span className="truncate text-ink-strong">{r.name}</span>
          </label>
        ))}
        {roster.length === 0 && <p className="px-1.5 py-1 text-[12.5px] text-ink-subtle">No teammates to pick.</p>}
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink-strong"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onDone(roster.filter((r) => sel.has(r.id)).map((r) => ({ employeeId: r.id, name: r.name })))}
          className="rounded-lg px-3 py-1.5 text-[12px] font-black text-white"
          style={{ background: `linear-gradient(135deg, var(--module-accent, ${GOALS_ACCENT}), var(--module-accent-deep, ${GOALS_ACCENT_DEEP}))` }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
