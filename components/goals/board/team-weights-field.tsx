"use client";

import * as React from "react";
import { Plus, X, Users, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import type { RosterMember } from "@/components/goals/cascade/util";
import { cn } from "@/lib/utils";

export interface TeamMemberWeight {
  employeeId?: string;
  name?: string;
  /** This member's own weight (share of the goal). */
  weight?: number;
}

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

/**
 * Pick team members for a goal and give EACH member their OWN weight. Members
 * come from `roster`; the value is the goals.team_involved array (now carrying a
 * per-member `weight`). Used in the goal composer + edit drawer.
 */
export function TeamWeightsField({
  value,
  roster,
  onChange,
  disabled,
}: {
  value: TeamMemberWeight[];
  roster: RosterMember[];
  onChange: (next: TeamMemberWeight[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedIds = new Set(value.map((m) => m.employeeId).filter(Boolean) as string[]);
  const filtered = roster.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  function addMember(r: RosterMember) {
    if (selectedIds.has(r.id)) return;
    onChange([...value, { employeeId: r.id, name: r.name, weight: 100 }]);
  }
  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function setWeightAt(i: number, w: number) {
    onChange(value.map((m, idx) => (idx === i ? { ...m, weight: w } : m)));
  }

  const totalWeight = value.reduce((s, m) => s + (m.weight ?? 0), 0);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map((m, i) => (
            <div
              key={m.employeeId ?? m.name ?? i}
              className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2"
              style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
            >
              <Avatar name={m.name ?? "?"} size={26} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-strong">
                {m.name ?? "Member"}
              </span>
              <label className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-subtle">wt</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={m.weight ?? 100}
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const w = raw === "" ? 0 : Math.max(0, Math.min(1000, Math.round(Number(raw) || 0)));
                    setWeightAt(i, w);
                  }}
                  aria-label={`Weight for ${m.name ?? "member"}`}
                  className={cn(
                    "h-8 w-[64px] rounded-md border bg-white px-2 text-right text-[13.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red disabled:opacity-60",
                    "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                    FOCUS_RING,
                  )}
                  style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                />
              </label>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                aria-label={`Remove ${m.name ?? "member"}`}
                className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-altus-red/10 hover:text-altus-red disabled:opacity-50"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>
          ))}
          {value.length > 1 && (
            <p className="pl-1 text-[11.5px] font-semibold text-ink-subtle">
              Total member weight: <span className="tabular-nums text-ink-soft">{totalWeight}</span>
            </p>
          )}
        </div>
      )}

      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold text-altus-red-deep transition-colors hover:bg-altus-red/[0.05] disabled:opacity-50",
              FOCUS_RING,
            )}
            style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 40%, transparent)" }}
          >
            <Plus size={15} strokeWidth={2.6} /> Add team member
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[210] w-[280px] rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-2.5 pb-2">
            <Users size={14} className="shrink-0 text-ink-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="h-8 flex-1 border-0 bg-transparent text-[13.5px] outline-none"
            />
          </div>
          <div className="mt-1.5 max-h-64 overflow-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[13px] text-ink-subtle">No people found.</p>
            ) : (
              filtered.map((r) => {
                const on = selectedIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => (on ? onChange(value.filter((m) => m.employeeId !== r.id)) : addMember(r))}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/[0.04]"
                    style={on ? { background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)" } : undefined}
                  >
                    <Avatar name={r.name} size={24} />
                    <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", on ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                      {r.name}
                    </span>
                    {on && <Check size={15} strokeWidth={3} className="shrink-0 text-altus-red" />}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
