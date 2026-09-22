"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fyLabel } from "@/components/goals/cascade/util";
import {
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  monthKeysOfQuarter,
  monthsOfQuarterKey,
  quarterKeyOfMonthKey,
  quarterOfKey,
  shiftMonthKey,
  shiftQuarterKey,
} from "@/lib/goals/types";
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
        className="w-[132px] truncate bg-transparent text-[13.5px] font-bold text-ink-strong outline-none"
        aria-label="Whose checklist"
      >
        <option value="me">Only me</option>
        <option value="team">Full team · me +{others}</option>
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
 * MCC's period bar (account holder, 2026-09-19: "the month strip is messy and
 * not user friendly — give next / previous, something better, that takes
 * little space"). One line:
 *
 *   [Month | Quarter]   ‹  September 2026 ▾  ›   This month
 *
 * The arrows step a month (or a quarter); the name opens a small picker — the
 * financial year's months, a quarter to a row (or its four quarters), with
 * arrows to change the year — for a jump further than a step. "This month"
 * shows only when away from it.
 *
 * The name moves the moment an arrow is clicked, with a spinner until the
 * month has loaded, and each quick click steps on from the last one — so three
 * quick clicks are three months, not one.
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
  const href = useHref();
  const router = useRouter();
  const isMonth = view === "month";
  const liveQuarter = quarterKeyOfMonthKey(currentMonthKey);
  const atCurrent = isMonth ? monthKey === currentMonthKey : quarterKey === liveQuarter;
  // The month parameter is left off for the current month, so its URL stays clean.
  const monthHref = (mk: string) => href({ m: mk === currentMonthKey ? null : mk });
  const quarterHref = (qk: string) => href({ q: qk });
  const periodHref = (key: string) => (isMonth ? monthHref(key) : quarterHref(key));
  const unit = isMonth ? "month" : "quarter";

  /* Where the arrows have got to while the page is still loading it. */
  const [loading, startLoading] = React.useTransition();
  const [ahead, setAhead] = React.useState<string | null>(null);
  const shownKey = loading && ahead ? ahead : isMonth ? monthKey : quarterKey;
  const stepKey = (n: number) => (isMonth ? shiftMonthKey(shownKey, n) : shiftQuarterKey(shownKey, n));
  const go = (key: string) => {
    setAhead(key);
    startLoading(() => router.push(periodHref(key)));
  };
  // A plain click steps from what is shown; ctrl / cmd / shift / middle click
  // still opens the link in a new tab.
  const stepClick = (n: number) => (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(stepKey(n));
  };
  // Switching keeps your place: a month goes to its own quarter; a quarter to
  // its first month — or to this month, when it is the quarter you are in.
  const toQuarter = href({ view: "quarter", m: null, q: isMonth ? quarterKeyOfMonthKey(monthKey) : quarterKey });
  const toMonth = href({
    view: null,
    q: null,
    m: isMonth
      ? atCurrent
        ? null
        : monthKey
      : quarterKey === liveQuarter
        ? null
        : monthsOfQuarterKey(quarterKey)[0]!,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-hairline-strong" role="group" aria-label="Month or quarter">
        <Link href={toMonth} aria-current={isMonth ? "page" : undefined} className={TOGGLE} style={isMonth ? PILL_ON : PILL_OFF}>
          Month
        </Link>
        <Link
          href={toQuarter}
          aria-current={!isMonth ? "page" : undefined}
          className={`${TOGGLE} border-l border-hairline-strong`}
          style={!isMonth ? PILL_ON : PILL_OFF}
        >
          Quarter
        </Link>
      </div>

      <div
        className="inline-flex items-stretch overflow-hidden rounded-lg border border-hairline-strong bg-surface-card"
        role="group"
        aria-label={`Choose the ${unit}`}
        aria-busy={loading}
      >
        <Link href={periodHref(stepKey(-1))} onClick={stepClick(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit}`} className={STEP}>
          <ChevronLeft size={15} strokeWidth={2.4} />
        </Link>
        <PeriodPicker
          isMonth={isMonth}
          shownKey={shownKey}
          currentMonthKey={currentMonthKey}
          loading={loading}
          onPick={go}
        />
        <Link href={periodHref(stepKey(1))} onClick={stepClick(1)} aria-label={`Next ${unit}`} title={`Next ${unit}`} className={STEP}>
          <ChevronRight size={15} strokeWidth={2.4} />
        </Link>
      </div>

      {!atCurrent && (
        <Link href={isMonth ? href({ m: null }) : quarterHref(liveQuarter)} className="text-[12.5px] font-bold text-ink-soft hover:text-altus-red">
          This {unit}
        </Link>
      )}
    </div>
  );
}

/* The toggle and the stepper, both 32px tall. Their groups clip to rounded
   corners, so the keyboard ring is drawn inside each control, not around it. */
const TOGGLE = "inline-flex h-8 items-center px-3 text-[12.5px] font-bold focus-visible:-outline-offset-2";
/** One arrow of the stepper. */
const STEP =
  "inline-flex h-8 w-8 items-center justify-center text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:-outline-offset-2";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUARTER_RANGE = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

/** "September 2026". */
function monthName(mk: string): string {
  return `${MONTH_FULL[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`;
}

/** "Q2 · Jul–Sep 2026" — Q4's months fall in the next calendar year. */
function quarterName(qk: string): string {
  const q = quarterOfKey(qk);
  const fy = fyStartYearOfKey(qk);
  return `Q${q} · ${QUARTER_RANGE[q - 1]} ${q === 4 ? fy + 1 : fy}`;
}

/**
 * The name between the arrows, and the picker it opens: a financial year —
 * its months a quarter to a row, or its four quarters — with arrows to change
 * the year. The chosen one is filled; the current one carries a dot.
 */
function PeriodPicker({
  isMonth,
  shownKey,
  currentMonthKey,
  loading,
  onPick,
}: {
  isMonth: boolean;
  /** The month ('YYYY-MM') or quarter ('YYYY-Qn') on show — or on its way. */
  shownKey: string;
  currentMonthKey: string;
  loading: boolean;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const shownFy = isMonth ? fyStartYearOfMonthKey(shownKey) : fyStartYearOfKey(shownKey);
  const [fy, setFy] = React.useState(shownFy);
  const liveQuarter = quarterKeyOfMonthKey(currentMonthKey);
  const go = (key: string) => {
    setOpen(false);
    onPick(key);
  };
  const what = isMonth ? "Pick a month" : "Pick a quarter";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // Always opens on the year of what is shown.
        if (o) setFy(shownFy);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={what}
          className="inline-flex h-8 min-w-[176px] items-center justify-center gap-1.5 border-x border-hairline-strong px-3 text-[13px] font-bold tabular-nums text-ink-strong transition-colors hover:bg-surface-soft focus-visible:-outline-offset-2"
        >
          {loading ? (
            <Loader2 size={14} strokeWidth={2.3} className="animate-spin text-ink-subtle" aria-hidden />
          ) : (
            <CalendarDays size={14} strokeWidth={2.3} className="text-ink-subtle" aria-hidden />
          )}
          {isMonth ? monthName(shownKey) : quarterName(shownKey)}
          <ChevronDown size={13} strokeWidth={2.6} className="text-ink-subtle" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[272px] p-3" aria-label={what}>
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setFy((y) => y - 1)} aria-label="Previous financial year" className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-surface-soft">
            <ChevronLeft size={15} />
          </button>
          <span className="text-[13px] font-bold tabular-nums text-ink-strong">{fyLabel(fy)}</span>
          <button type="button" onClick={() => setFy((y) => y + 1)} aria-label="Next financial year" className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-surface-soft">
            <ChevronRight size={15} />
          </button>
        </div>
        {isMonth ? (
          <div className="grid grid-cols-[28px_repeat(3,1fr)] items-center gap-1.5">
            {([1, 2, 3, 4] as const).map((q) => (
              <React.Fragment key={q}>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle">Q{q}</span>
                {monthKeysOfQuarter(fy, q).map((mk) => (
                  <PickCell key={mk} on={mk === shownKey} now={mk === currentMonthKey} name={monthName(mk)} onPick={() => go(mk)}>
                    {MONTH_SHORT[+mk.slice(5, 7) - 1]}
                  </PickCell>
                ))}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {([1, 2, 3, 4] as const).map((q) => {
              const qk = `${fy}-Q${q}`;
              return (
                <PickCell key={qk} on={qk === shownKey} now={qk === liveQuarter} name={quarterName(qk)} onPick={() => go(qk)}>
                  Q{q}
                  <span className="ml-1 font-semibold opacity-75">{QUARTER_RANGE[q - 1]}</span>
                </PickCell>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** One month or quarter in the picker; `name` says it in full — "January 2027". */
function PickCell({ on, now, name, onPick, children }: { on: boolean; now: boolean; name: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={name}
      title={name}
      aria-pressed={on}
      aria-current={now ? "date" : undefined}
      className="relative inline-flex h-8 items-center justify-center rounded-md border text-[12.5px] font-bold transition-colors hover:brightness-95"
      style={on ? PILL_ON : PILL_OFF}
    >
      {children}
      {now && !on && <span className="absolute right-1 top-1 size-1.5 rounded-full" style={{ background: "var(--color-altus-red)" }} aria-hidden />}
    </button>
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
            aria-current={days === d ? "page" : undefined}
            className={`px-3 py-1.5 text-[12.5px] font-bold focus-visible:-outline-offset-2 ${i > 0 ? "border-l border-hairline-strong" : ""}`}
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
