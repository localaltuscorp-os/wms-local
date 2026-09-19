"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { MonthWindowNav } from "@/components/goals/board/month-window-nav";
import { fyLabel } from "@/components/goals/cascade/util";
import { quarterKeyOfMonthKey, shiftMonthKey, shiftQuarterKey } from "@/lib/goals/types";
import type { PickerOption } from "@/lib/queries/compliance-board";

/** The current URL with some params changed (null removes one). */
function useHref() {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  return React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      return (qs ? `${pathname}?${qs}` : pathname) as Route;
    },
    [pathname, params],
  );
}

/**
 * WHOSE CHECKLIST — only yours, the full team (team-wise), or one person.
 *
 * Offered only to someone with a team: a Team Lead sees their own people, Manan
 * Sir everybody below him. Somebody with no team sees their own checklist and
 * no picker at all.
 */
export function ScopePicker({ picker, who, meId }: { picker: PickerOption[]; who: string; meId: string }) {
  const router = useRouter();
  const href = useHref();
  if (picker.length === 0) return null;

  const groups: { label: string; people: PickerOption[] }[] = [];
  for (const p of picker) {
    if (p.id === meId) continue;
    const last = groups[groups.length - 1];
    if (last && last.label === p.group) last.people.push(p);
    else groups.push({ label: p.group, people: [p] });
  }
  const others = picker.filter((p) => p.id !== meId).length;

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-3 py-1.5">
      <Users size={15} className="text-ink-subtle" aria-hidden />
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">Showing</span>
      <select
        value={who}
        onChange={(e) => router.push(href({ who: e.target.value === "me" ? null : e.target.value }))}
        className="max-w-[260px] bg-transparent text-[13.5px] font-bold text-ink-strong outline-none"
        aria-label="Whose checklist"
      >
        <option value="me">Only me</option>
        <option value="team">Full team — me and {others} below me</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

const PILL =
  "inline-flex h-8 items-center rounded-lg border px-3 text-[12.5px] font-bold transition-colors";
const PILL_ON = { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)", color: "#fff" };
const PILL_OFF = { background: "var(--color-surface-card)", borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" };

/**
 * MCC's period bar — Month or Quarter, as the Goals boards do it.
 *
 *   Month   — the Goals month strip: the previous quarter, this one and the
 *             next, each month under its quarter and its financial year, with
 *             arrows to walk further either way.
 *   Quarter — the four quarters of a financial year, Q1 (Apr–Jun) to Q4
 *             (Jan–Mar), with arrows to step the year.
 */
export function MccPeriodBar({
  view,
  monthKey,
  quarterKey,
  currentMonthKey,
}: {
  view: "month" | "quarter";
  monthKey: string;
  quarterKey: string;
  currentMonthKey: string;
}) {
  const router = useRouter();
  const href = useHref();
  const liveQuarter = quarterKeyOfMonthKey(currentMonthKey);
  const selectedQuarter = quarterKeyOfMonthKey(monthKey);
  /* The previous quarter as the "past" reveal, and whichever quarter the chosen
     month sits in when it has been walked outside the window. */
  const extra = [shiftQuarterKey(liveQuarter, -1), selectedQuarter];
  const fy = Number(quarterKey.slice(0, 4));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex overflow-hidden rounded-lg border border-hairline-strong" role="group" aria-label="Month or quarter">
        <Link href={href({ view: null, q: null })} aria-pressed={view === "month"} className="px-3 py-1.5 text-[12.5px] font-bold" style={view === "month" ? PILL_ON : PILL_OFF}>
          Month
        </Link>
        <Link href={href({ view: "quarter", m: null, q: quarterKey })} aria-pressed={view === "quarter"} className="border-l border-hairline-strong px-3 py-1.5 text-[12.5px] font-bold" style={view === "quarter" ? PILL_ON : PILL_OFF}>
          Quarter
        </Link>
      </div>

      {view === "month" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ m: shiftMonthKey(monthKey, -1) })} aria-label="Previous month" className={PILL} style={PILL_OFF}>
            <ChevronLeft size={15} />
          </Link>
          <MonthWindowNav
            anchorQuarterKey={liveQuarter}
            extraQuarterKeys={extra}
            selectedKey={monthKey}
            currentMonthKey={currentMonthKey}
            countOf={() => null}
            onPick={(mk) => router.push(href({ m: mk === currentMonthKey ? null : mk }))}
          />
          <Link href={href({ m: shiftMonthKey(monthKey, 1) })} aria-label="Next month" className={PILL} style={PILL_OFF}>
            <ChevronRight size={15} />
          </Link>
          {monthKey !== currentMonthKey && (
            <Link href={href({ m: null })} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
              This month
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ q: `${fy - 1}-Q${quarterKey.slice(-1)}` })} aria-label="Previous financial year" className={PILL} style={PILL_OFF}>
            <ChevronLeft size={15} />
          </Link>
          <span className="text-[12.5px] font-bold tabular-nums text-ink-strong">{fyLabel(fy)}</span>
          <Link href={href({ q: `${fy + 1}-Q${quarterKey.slice(-1)}` })} aria-label="Next financial year" className={PILL} style={PILL_OFF}>
            <ChevronRight size={15} />
          </Link>
          {([1, 2, 3, 4] as const).map((q) => {
            const key = `${fy}-Q${q}`;
            const on = key === quarterKey;
            const label = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"][q - 1];
            return (
              <Link key={key} href={href({ q: key })} aria-pressed={on} className={PILL} style={on ? PILL_ON : PILL_OFF}>
                Q{q}
                <span className="ml-1.5 font-semibold opacity-80">{label}</span>
                {key === liveQuarter && !on && <span className="ml-1.5 size-1.5 rounded-full" style={{ background: "var(--color-altus-red)" }} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** WCC's window — Today, 3 days or 6 days — and arrows to walk it back. */
export function WccViewBar({ days, end, today }: { days: 1 | 3 | 6; end: string; today: string }) {
  const href = useHref();
  const shift = (n: number) => {
    const t = Date.parse(`${end}T00:00:00Z`) + n * 86_400_000;
    const next = new Date(t).toISOString().slice(0, 10);
    return next >= today ? null : next;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-hairline-strong" role="group" aria-label="How many days">
        {([1, 3, 6] as const).map((d, i) => (
          <Link
            key={d}
            href={href({ days: d === 1 ? null : String(d) })}
            aria-pressed={days === d}
            className={`px-3 py-1.5 text-[12.5px] font-bold ${i > 0 ? "border-l border-hairline-strong" : ""}`}
            style={days === d ? PILL_ON : PILL_OFF}
          >
            {d === 1 ? "Today" : `${d} days`}
          </Link>
        ))}
      </div>
      <Link href={href({ end: shift(-days) })} aria-label="Earlier" className={PILL} style={PILL_OFF}>
        <ChevronLeft size={15} />
      </Link>
      <Link
        href={href({ end: shift(days) })}
        aria-label="Later"
        aria-disabled={end >= today}
        className={`${PILL} ${end >= today ? "pointer-events-none opacity-40" : ""}`}
        style={PILL_OFF}
      >
        <ChevronRight size={15} />
      </Link>
      {end < today && (
        <Link href={href({ end: null })} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          Back to today
        </Link>
      )}
    </div>
  );
}
