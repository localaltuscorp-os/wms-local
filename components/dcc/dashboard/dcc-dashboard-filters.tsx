"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ClipboardCheck, Loader2, RotateCcw, Trophy, Users } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PeriodRangePicker } from "@/components/dashboard/exec/period-range-picker";
import { SECTION_CONTROL } from "@/components/dashboard/section-chrome";
import { Avatar } from "@/components/ui/avatar";
import type { ActivityPeriod } from "@/lib/dashboard/manager-activity-contract";

export interface RosterPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The DCC dashboard's filter row — the first row of the sticky band.
 *
 * NOT the WMS FilterBar: that bar is wired to task filters (priority, subject,
 * doer/initiator) that mean nothing for a KPI checklist. This keeps the two
 * filters a DCC is read by — the window and the people — in the same place and
 * the same control recipe.
 *
 * The URL is the state, so a filtered view can be bookmarked or pasted to
 * someone and opens exactly as it was shared.
 */
export function DccDashboardFilters({
  roster,
  selectedIds,
  period,
  custom,
  meId,
  isDefault,
}: {
  roster: RosterPerson[];
  selectedIds: string[];
  period: ActivityPeriod;
  custom: { from: string; to: string } | null;
  meId: string;
  isDefault: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const push = React.useCallback(
    (next: { period: ActivityPeriod; custom: { from: string; to: string } | null; emp: string[] }) => {
      const sp = new URLSearchParams();
      sp.set("period", next.period);
      if (next.period === "custom" && next.custom) {
        sp.set("start", next.custom.from);
        sp.set("end", next.custom.to);
      }
      if (next.emp.length > 0) sp.set("emp", next.emp.join(","));
      startTransition(() => {
        router.replace(`/dcc/dashboard?${sp.toString()}` as Route, { scroll: false });
      });
    },
    [router],
  );

  return (
    <PageShell as="div" width="full" py={false}>
      <div className="flex flex-wrap items-center gap-2.5 px-6 py-3 md:px-8">
        <PeriodRangePicker
          period={period}
          custom={custom}
          controlClassName={SECTION_CONTROL}
          onChange={(p, c) => push({ period: p, custom: c, emp: selectedIds })}
        />

        {roster.length > 1 && (
          <PeoplePicker
            roster={roster}
            selectedIds={selectedIds}
            meId={meId}
            onApply={(ids) => push({ period, custom, emp: ids })}
          />
        )}

        {!isDefault && (
          <button
            type="button"
            className={SECTION_CONTROL}
            onClick={() => push({ period: "month", custom: null, emp: [] })}
          >
            <RotateCcw size={13} strokeWidth={2.4} /> Reset
          </button>
        )}

        {pending && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500" role="status">
            <Loader2 size={13} className="animate-spin" /> Updating…
          </span>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          <Link href={"/dcc/ranking" as Route} className={SECTION_CONTROL}>
            <Trophy size={13} strokeWidth={2.4} /> Ranking
          </Link>
          <Link href={"/dcc" as Route} className={SECTION_CONTROL}>
            <ClipboardCheck size={13} strokeWidth={2.4} /> My DCC
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

/** Pick people, then Apply — a checklist commits once, not on every tick. */
function PeoplePicker({
  roster,
  selectedIds,
  meId,
  onApply,
}: {
  roster: RosterPerson[];
  selectedIds: string[];
  meId: string;
  onApply: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Set<string>>(new Set(selectedIds));
  const [query, setQuery] = React.useState("");

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((p) => p.name.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  const label =
    selectedIds.length === 0
      ? "All people"
      : selectedIds.length === 1
        ? selectedIds[0] === meId
          ? "Only me"
          : (roster.find((p) => p.id === selectedIds[0])?.name ?? "1 person")
        : `${selectedIds.length} people`;

  const toggle = (id: string) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(new Set(selectedIds));
          setQuery("");
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" className={SECTION_CONTROL}>
          <Users size={14} strokeWidth={2.4} />
          {label}
          <ChevronDown size={13} strokeWidth={2.8} className="opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 flex w-[280px] flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            aria-label="Search people"
            className="mb-1.5 h-9 rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
          />
          <div className="flex gap-1.5 px-0.5 pb-1.5">
            <button
              type="button"
              onClick={() => setDraft(new Set())}
              className="rounded-md px-2 py-1 text-[11.5px] font-bold text-slate-600 hover:bg-slate-100"
            >
              All people
            </button>
            {roster.some((p) => p.id === meId) && (
              <button
                type="button"
                onClick={() => setDraft(new Set([meId]))}
                className="rounded-md px-2 py-1 text-[11.5px] font-bold text-slate-600 hover:bg-slate-100"
              >
                Only me
              </button>
            )}
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {shown.map((p) => {
              const on = draft.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded border ${
                      on ? "border-transparent bg-[var(--color-altus-red)] text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    {on && <Check size={11} strokeWidth={3.5} />}
                  </span>
                  <Avatar name={p.name} avatarUrl={p.avatarUrl} size={22} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    {p.id === meId ? " (You)" : ""}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="px-2 py-4 text-center text-[12.5px] font-semibold text-slate-400">Nobody matches.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onApply([...draft]);
              setOpen(false);
            }}
            className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-slate-800"
          >
            {draft.size === 0 ? "Show everyone" : `Show ${draft.size} ${draft.size === 1 ? "person" : "people"}`}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
