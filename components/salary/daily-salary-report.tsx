"use client";

import * as React from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Info,
  ListFilter,
  RotateCcw,
} from "lucide-react";
import {
  applyLedgerView,
  hm,
  inr,
  isFiltered,
  signedHm,
  signedInr,
  viewTotals,
  DAY_STATUS_FILTER_ORDER,
  DAY_STATUS_LABELS,
  LEDGER_FILTER_NONE,
  LEDGER_SORT_LABELS,
  WORK_PLACE_FILTER_ORDER,
  WORK_PLACE_LABELS,
  type DayLedger,
  type DayStatus,
  type LedgerDay,
  type LedgerFilter,
  type LedgerSort,
  type LedgerTotals,
  type LedgerWeekView,
  type WorkPlace,
} from "@/lib/salary/day-ledger";
import { balanceColor, dayStatusStyle, GAIN_COLOR } from "@/lib/attendance/day-code-view";

/**
 * DAILY SALARY REPORT — the employee's own month, day by day.
 *
 * ── IT EXPLAINS; IT DOES NOT CALCULATE ─────────────────────────────────────
 * Every number rendered here was computed on the server by
 * `lib/salary/day-ledger.ts`, which in turn ATTRIBUTES figures the payroll
 * engine had already produced. This component formats, groups and filters. It
 * does no arithmetic on money beyond summing rows that were built to sum, and
 * even the filtering and the per-week totals come from pure functions in that
 * module so they are unit-tested rather than eyeballed.
 *
 * That division is the point. An employee reading their own pay is entitled to
 * a breakdown that matches their payslip to the rupee, and the only way to
 * promise that is for the browser to have no opinion of its own.
 *
 * ── COMPACTNESS (spec §14) ─────────────────────────────────────────────────
 * A month is 28–31 days and a person wants to scan it, so a day is ONE table
 * row, not a card. Ten columns fit a desktop content area comfortably; below
 * `md` the same rows render as two tight lines with the secondary columns moved
 * into the expanded detail, which is what stops a 750px table from being
 * dragged sideways on a phone.
 *
 * ── COLOUR (spec §5) ───────────────────────────────────────────────────────
 * From `lib/attendance/day-code-view.ts` — the same palette the Attendance
 * page's calendar reads. A light row tint plus strong status text, never a
 * saturated row.
 */
export function DailySalaryReport({ ledger }: { ledger: DayLedger }) {
  const [filter, setFilter] = React.useState<LedgerFilter>(LEDGER_FILTER_NONE);
  const [sort, setSort] = React.useState<LedgerSort>("date_asc");
  const [openDays, setOpenDays] = React.useState<ReadonlySet<string>>(new Set());
  const [showWorkings, setShowWorkings] = React.useState(false);

  const views = React.useMemo(
    () => applyLedgerView(ledger, filter, sort),
    [ledger, filter, sort],
  );

  /**
   * Which week opens by default.
   *
   * The CURRENT week for a month in progress — that is the one somebody opening
   * their salary page mid-month wants — and the first week for a month that is
   * over, where there is no "now" to land on and the top of the month is where
   * reading starts.
   */
  const defaultWeek = React.useMemo(() => {
    const hasFuture = ledger.days.some((d) => d.future);
    if (!hasFuture) return ledger.weeks[0]?.index ?? null;
    const current = [...ledger.weeks].reverse().find((w) => w.days.some((d) => !d.future));
    return current?.index ?? ledger.weeks[0]?.index ?? null;
  }, [ledger]);

  const [openWeek, setOpenWeek] = React.useState<number | null>(defaultWeek);

  // ONE WEEK AT A TIME (spec §2). If a filter hides whatever was open, fall
  // through to the first week still on screen rather than showing a collapsed
  // list with nothing expanded.
  //
  // `null` is honoured rather than replaced: it means the reader CLOSED the
  // week, and reviving the first one would make the accordion refuse to shut.
  const activeWeek =
    openWeek == null || views.some((w) => w.index === openWeek)
      ? openWeek
      : (views[0]?.index ?? null);

  const total = React.useMemo(
    () => viewTotals(views, ledger.hasMoney),
    [views, ledger.hasMoney],
  );
  const narrowed = isFiltered(filter);

  const toggleDay = (date: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <section className="wg-rise rounded-3xl border border-hairline bg-surface-card p-5 max-md:p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.07em] text-ink-muted">
          <CalendarRange size={15} className="text-ink-subtle" /> Daily Salary Report
        </h2>
        <p className="text-[12px] font-semibold text-ink-subtle">
          {ledger.monthLabel}
          {/* NAME THE RATE THE MONTH WAS ACTUALLY PRICED AT. A full-timer is
              paid by the calendar day and an hourly shift by the hour, so
              printing "/hour" on both would misdescribe one of them. */}
          {ledger.dailyRate != null ? (
            <>
              {" · "}
              <span className="text-ink-muted">{inr(ledger.dailyRate)}/day</span>
            </>
          ) : ledger.hourlyRate != null ? (
            <>
              {" · "}
              <span className="text-ink-muted">{inr(ledger.hourlyRate)}/hour</span>
            </>
          ) : null}
        </p>
      </header>

      {ledger.moneyNote && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-soft px-3 py-2.5 text-[12.5px] text-ink-soft">
          <Info size={14} className="mt-0.5 shrink-0 text-ink-subtle" />
          {ledger.moneyNote}
        </p>
      )}

      <MonthStrip ledger={ledger} />

      <FilterBar
        ledger={ledger}
        filter={filter}
        sort={sort}
        onFilter={setFilter}
        onSort={setSort}
      />

      {views.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-strong px-4 py-8 text-center text-[13px] text-ink-subtle">
          No days match these filters.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {views.map((w) => (
            <WeekAccordion
              key={w.weekKey}
              week={w}
              ledger={ledger}
              open={w.index === activeWeek}
              onToggle={() => setOpenWeek(w.index === activeWeek ? null : w.index)}
              openDays={openDays}
              onToggleDay={toggleDay}
            />
          ))}
        </div>
      )}

      {/* The totals of what is ON SCREEN. When a filter is on, that is not the
          month — so it says so, rather than quietly relabelling a subset. */}
      {views.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 rounded-2xl bg-surface-soft px-4 py-3">
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-muted">
            {narrowed ? "Filtered total" : "Month total"}
          </span>
          <TotalsLine totals={total} hasMoney={ledger.hasMoney} />
        </div>
      )}

      {ledger.reconciliation && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWorkings((v) => !v)}
            aria-expanded={showWorkings}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-hairline px-4 py-2.5 text-left transition-colors hover:bg-surface-soft/60"
          >
            <span className="text-[12.5px] font-bold text-ink-soft">
              How these days add up to {inr(ledger.reconciliation.gross)}
            </span>
            {showWorkings ? (
              <ChevronUp size={15} className="shrink-0 text-ink-subtle" />
            ) : (
              <ChevronDown size={15} className="shrink-0 text-ink-subtle" />
            )}
          </button>
          {showWorkings && <Workings ledger={ledger} />}
        </div>
      )}
    </section>
  );
}

/* ── The month strip (spec §15) ────────────────────────────────────────────── */

/**
 * A compact strip of the figures the table needs to be READ, plus the engine's
 * own month-level hours.
 *
 * Deliberately NOT a second copy of the salary summary above it (spec §15:
 * "Do not duplicate information unnecessarily"). Day counts, leave counts and
 * the final salary all live in that summary; what is here is either new — the
 * hourly rate every EARNED cell is a multiple of, the whole payable hours the
 * money was actually computed on — or the anchor the rows sum to.
 */
function MonthStrip({ ledger }: { ledger: DayLedger }) {
  const t = ledger.totals;
  const e = ledger.engine;
  const chips: { label: string; value: string; color?: string; hint?: string }[] = [
    {
      label: "Hours worked",
      value: `${hm(t.workedMinutes)} / ${hm(t.requiredMinutes)}`,
      hint: "against the hours required so far",
    },
    {
      label: "Balance",
      value: signedHm(t.balanceMinutes),
      color: balanceColor(t.balanceMinutes),
    },
    {
      label: "Month target",
      value: hm(e.targetMinutes),
      // On the daily model hours do not price anything — they decide each day's
      // STATUS, and the status is what earns. Saying "what your rate divides by"
      // here would describe the retired hourly engine.
      hint:
        ledger.dailyRate != null
          ? "the hours this month asked of you"
          : "what your hourly rate divides by",
    },
  ];
  if (ledger.hasMoney && ledger.dailyRate == null) {
    chips.push({
      label: "Payable hours",
      value: `${e.payableHours}h`,
      hint: "whole hours, after netting the month",
    });
  }
  if (t.offDayWorkedMinutes > 0) {
    chips.push({
      label: "Worked on days off",
      value: hm(t.offDayWorkedMinutes),
      color: GAIN_COLOR,
      hint: "credited at your daily target, not added to the target",
    });
  }
  if (t.adjustment != null && t.adjustment !== 0) {
    chips.push({
      label: "Adjustments",
      value: signedInr(t.adjustment),
      color: balanceColor(t.adjustment),
      // The Σ of the ADJ. column, and it needs saying WHAT it is a sum of: this
      // is a comparison with a normal month, not a deduction taken off the pay
      // above it. The two baselines differ because the pay models do — see THE
      // `ADJ.` COLUMN in lib/salary/day-ledger.ts.
      hint:
        ledger.dailyRate != null
          ? "how these days compare with a full daily rate each"
          : "how these days compare with your scheduled hours",
    });
  }

  return (
    <div className="mt-3 grid grid-cols-3 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-2">
      {chips.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface-soft px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-ink-subtle">
            {c.label}
          </div>
          <div
            className="mt-0.5 text-[15px] font-black leading-none tabular-nums"
            style={{ color: c.color ?? "var(--color-ink-strong)" }}
          >
            {c.value}
          </div>
          {c.hint && <div className="mt-1 text-[10.5px] leading-tight text-ink-subtle">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Filters + sort (spec §12, §13) ───────────────────────────────────────── */

function FilterBar({
  ledger,
  filter,
  sort,
  onFilter,
  onSort,
}: {
  ledger: DayLedger;
  filter: LedgerFilter;
  sort: LedgerSort;
  onFilter: (f: LedgerFilter) => void;
  onSort: (s: LedgerSort) => void;
}) {
  // Only offer what the month actually contains. A Status list padded out with
  // eleven values the employee cannot select is a worse control than a short
  // one, and offering "Comp Off" for a month with none invites the reader to
  // wonder what they missed.
  const statuses = React.useMemo(() => {
    const present = new Set(ledger.days.map((d) => d.status));
    return DAY_STATUS_FILTER_ORDER.filter((s) => present.has(s));
  }, [ledger.days]);
  const places = React.useMemo(() => {
    const present = new Set(ledger.days.map((d) => d.place));
    return WORK_PLACE_FILTER_ORDER.filter((p) => present.has(p) && p !== "office");
  }, [ledger.days]);

  return (
    <div className="my-3 flex flex-wrap items-center gap-2">
      <ListFilter size={14} className="shrink-0 text-ink-subtle" />

      <Select
        label="Status"
        value={filter.status}
        onChange={(v) => onFilter({ ...filter, status: v as DayStatus | "all" })}
        options={[
          { value: "all", label: "All statuses" },
          ...statuses.map((s) => ({ value: s, label: DAY_STATUS_LABELS[s] })),
        ]}
      />

      <Select
        label="Week"
        value={filter.week === "all" ? "all" : String(filter.week)}
        onChange={(v) => onFilter({ ...filter, week: v === "all" ? "all" : Number(v) })}
        options={[
          { value: "all", label: "All weeks" },
          ...ledger.weeks.map((w) => ({
            value: String(w.index),
            label: `Week ${w.index} · ${w.rangeLabel}`,
          })),
        ]}
      />

      {places.length > 0 && (
        <Select
          label="Work type"
          value={filter.place}
          onChange={(v) => onFilter({ ...filter, place: v as WorkPlace | "all" })}
          options={[
            { value: "all", label: "All work types" },
            { value: "office", label: WORK_PLACE_LABELS.office },
            ...places.map((p) => ({ value: p, label: WORK_PLACE_LABELS[p] })),
          ]}
        />
      )}

      <div className="ml-auto flex items-center gap-2">
        {isFiltered(filter) && (
          <button
            type="button"
            onClick={() => onFilter(LEDGER_FILTER_NONE)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:text-ink-strong"
          >
            <RotateCcw size={12} strokeWidth={2.6} /> All
          </button>
        )}
        <Select
          label="Sort"
          value={sort}
          onChange={(v) => onSort(v as LedgerSort)}
          options={Object.entries(LEDGER_SORT_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
    </div>
  );
}

/** A compact native select — keyboard- and touch-native, and it needs no JS. */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-hairline bg-surface-soft py-1.5 pl-2.5 pr-7 text-[12px] font-bold text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-altus-red)_45%,transparent)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </div>
  );
}

/* ── Week accordion (spec §2, §11) ────────────────────────────────────────── */

function WeekAccordion({
  week,
  ledger,
  open,
  onToggle,
  openDays,
  onToggleDay,
}: {
  week: LedgerWeekView;
  ledger: DayLedger;
  open: boolean;
  onToggle: () => void;
  openDays: ReadonlySet<string>;
  onToggleDay: (date: string) => void;
}) {
  const panelId = `wk-${week.weekKey}`;
  const t = week.totals;
  const hasMoney = ledger.hasMoney;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors max-md:px-3 ${
          open ? "bg-surface-soft" : "hover:bg-surface-soft/60"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[12px] font-black uppercase tracking-[0.08em] text-ink-strong">
              Week {week.index}
            </span>
            <span className="text-[12px] font-semibold text-ink-subtle">· {week.rangeLabel}</span>
          </span>
          <span className="mt-1 block truncate text-[11.5px] text-ink-muted">
            <CountSummary counts={t.counts} />
            {week.hiddenDays > 0 && (
              <span className="text-ink-subtle"> · {week.hiddenDays} hidden by filter</span>
            )}
          </span>
        </span>

        {/* Closed-state figures, kept VERY compact (spec §2). */}
        <span className="shrink-0 text-right">
          <span className="block text-[12.5px] font-bold tabular-nums text-ink-strong">
            {hm(t.workedMinutes)} <span className="text-ink-subtle">/ {hm(t.requiredMinutes)}</span>
          </span>
          <span
            className="block text-[11.5px] font-bold tabular-nums"
            style={{ color: balanceColor(t.balanceMinutes) }}
          >
            {signedHm(t.balanceMinutes)}
          </span>
        </span>

        {hasMoney && (
          <span className="shrink-0 text-right max-sm:hidden">
            <span className="block text-[13px] font-black tabular-nums text-ink-strong">
              {inr(t.earned ?? 0)}
            </span>
            {t.adjustment != null && t.adjustment !== 0 && (
              <span
                className="block text-[11px] font-bold tabular-nums"
                style={{ color: balanceColor(t.adjustment) }}
              >
                {signedInr(t.adjustment)}
              </span>
            )}
          </span>
        )}

        {open ? (
          <ChevronUp size={16} className="shrink-0 text-ink-subtle" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-ink-subtle" />
        )}
      </button>

      {open && (
        <div id={panelId}>
          <DayTable
            days={week.days}
            ledger={ledger}
            openDays={openDays}
            onToggleDay={onToggleDay}
          />
          <DayList
            days={week.days}
            ledger={ledger}
            openDays={openDays}
            onToggleDay={onToggleDay}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-solid border-hairline-strong bg-surface-soft px-4 py-2.5 max-md:px-3">
            <span className="text-[10.5px] font-black uppercase tracking-[0.1em] text-ink-muted">
              Week total
            </span>
            <TotalsLine totals={t} hasMoney={hasMoney} />
          </div>
        </div>
      )}
    </div>
  );
}

/** "5 working · 1 half day · 1 holiday" — the closed week's one-line shape. */
function CountSummary({ counts }: { counts: Partial<Record<DayStatus, number>> }) {
  const parts = DAY_STATUS_FILTER_ORDER.filter((s) => (counts[s] ?? 0) > 0).map(
    (s) => `${counts[s]} ${DAY_STATUS_LABELS[s].toLowerCase()}`,
  );
  return <>{parts.join(" · ") || "no days"}</>;
}

/** The week/month total line — the same four figures the table columns carry. */
function TotalsLine({ totals, hasMoney }: { totals: LedgerTotals; hasMoney: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] tabular-nums">
      <span className="text-ink-muted">
        Work hours{" "}
        <b className="text-ink-strong">
          {hm(totals.workedMinutes)} / {hm(totals.requiredMinutes)}
        </b>
      </span>
      <span className="text-ink-muted">
        Balance{" "}
        <b style={{ color: balanceColor(totals.balanceMinutes) }}>
          {signedHm(totals.balanceMinutes)}
        </b>
      </span>
      {hasMoney && (
        <>
          <span className="text-ink-muted">
            Adjustment{" "}
            <b style={{ color: balanceColor(totals.adjustment ?? 0) }}>
              {signedInr(totals.adjustment)}
            </b>
          </span>
          <span className="text-ink-muted">
            Earned <b className="text-ink-strong">{inr(totals.earned ?? 0)}</b>
          </span>
        </>
      )}
    </span>
  );
}

/* ── The day rows: a table on desktop, two lines on a phone (spec §14) ────── */

const TH =
  "px-2 py-1.5 text-left text-[10px] font-black uppercase tracking-[0.08em] text-ink-subtle";
const TD = "px-2 py-1.5 align-middle text-[12.5px]";

function DayTable({
  days,
  ledger,
  openDays,
  onToggleDay,
}: {
  days: LedgerDay[];
  ledger: DayLedger;
  openDays: ReadonlySet<string>;
  onToggleDay: (date: string) => void;
}) {
  const hasMoney = ledger.hasMoney;
  return (
    // `overflow-x-auto` is a safety net, not the plan: ten columns fit a desktop
    // content area, and below `md` this table is replaced entirely by DayList.
    <div className="overflow-x-auto max-md:hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-solid border-hairline">
            <th scope="col" className={TH}>Date</th>
            <th scope="col" className={TH}>Day</th>
            <th scope="col" className={TH}>Status</th>
            <th scope="col" className={TH}>Check-in</th>
            <th scope="col" className={TH}>Check-out</th>
            <th scope="col" className={TH}>Work Hours</th>
            <th scope="col" className={`${TH} text-right`}>Balance</th>
            <th
              scope="col"
              className={`${TH} text-right`}
              title="How this day compares with a normal working day: negative when leave or a short day cost you pay, positive when extra hours added it."
            >
              Adj.
            </th>
            <th scope="col" className={`${TH} text-right`}>Earned</th>
            <th scope="col" className={TH}>
              <span className="sr-only">Expand</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const st = dayStatusStyle(d.status);
            const isOpen = openDays.has(d.date);
            return (
              <React.Fragment key={d.date}>
                <tr
                  className="border-b border-solid border-hairline/60"
                  style={{ background: st.rowTint, opacity: d.future ? 0.65 : 1 }}
                >
                  <td className={`${TD} font-bold tabular-nums text-ink-strong`}>{d.dateLabel}</td>
                  <td className={`${TD} text-ink-muted`}>{d.dayLabel}</td>
                  <td className={TD}>
                    <span className="font-black" style={{ color: st.accent }}>
                      {d.statusLabel}
                    </span>
                    {d.place !== "office" && (
                      <span className="ml-1.5 rounded-pill bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
                        {WORK_PLACE_LABELS[d.place]}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} tabular-nums text-ink-soft`}>{d.inAt ?? "—"}</td>
                  <td className={`${TD} tabular-nums text-ink-soft`}>{d.outAt ?? "—"}</td>
                  <td className={`${TD} tabular-nums`}>
                    <WorkHours day={d} />
                  </td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>
                    {d.balanceMinutes == null ? (
                      <span className="text-ink-subtle">—</span>
                    ) : (
                      <span style={{ color: balanceColor(d.balanceMinutes) }}>
                        {signedHm(d.balanceMinutes)}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>
                    <span
                      style={{
                        color:
                          d.adjustment && d.adjustment !== 0
                            ? balanceColor(d.adjustment)
                            : "var(--color-ink-subtle)",
                      }}
                    >
                      {signedInr(d.adjustment)}
                    </span>
                  </td>
                  <td className={`${TD} text-right font-black tabular-nums text-ink-strong`}>
                    {/* `earned` is null on a day the month has not reached. That is
                        "nothing yet", not "₹0", and printing a zero on next
                        Tuesday's row is a different and wrong statement. */}
                    {hasMoney && d.earned != null ? (
                      inr(d.earned)
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className={`${TD} w-8`}>
                    <ExpandButton open={isOpen} onClick={() => onToggleDay(d.date)} day={d} />
                  </td>
                </tr>
                {isOpen && (
                  <tr style={{ background: st.rowTint }}>
                    <td colSpan={10} className="px-2 pb-2.5 pt-0">
                      <DayDetail day={d} ledger={ledger} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same days on a small screen.
 *
 * Two lines each, with check-in / check-out and the adjustment moved into the
 * expanded detail — "Collapse secondary information into the expanded day view
 * if necessary" (spec §14). Never a horizontally-dragged table.
 */
function DayList({
  days,
  ledger,
  openDays,
  onToggleDay,
}: {
  days: LedgerDay[];
  ledger: DayLedger;
  openDays: ReadonlySet<string>;
  onToggleDay: (date: string) => void;
}) {
  const hasMoney = ledger.hasMoney;
  return (
    <div className="md:hidden">
      {days.map((d) => {
        const st = dayStatusStyle(d.status);
        const isOpen = openDays.has(d.date);
        return (
          <div
            key={d.date}
            className="border-b border-solid border-hairline/60 px-3 py-2"
            style={{ background: st.rowTint, opacity: d.future ? 0.65 : 1 }}
          >
            <div className="flex items-center gap-2">
              <span className="w-[52px] shrink-0 text-[12.5px] font-bold tabular-nums text-ink-strong">
                {d.dateLabel}
              </span>
              <span className="w-[30px] shrink-0 text-[11.5px] text-ink-muted">{d.dayLabel}</span>
              <span
                className="min-w-0 flex-1 truncate text-[12px] font-black"
                style={{ color: st.accent }}
              >
                {d.statusLabel}
                {d.place !== "office" && (
                  <span className="ml-1 text-[10.5px] font-bold text-ink-muted">
                    · {WORK_PLACE_LABELS[d.place]}
                  </span>
                )}
              </span>
              <ExpandButton open={isOpen} onClick={() => onToggleDay(d.date)} day={d} />
            </div>
            <div className="mt-0.5 flex items-center gap-3 pl-[82px] text-[11.5px] tabular-nums max-[380px]:pl-0">
              <span className="text-ink-soft">
                <WorkHours day={d} />
              </span>
              {d.balanceMinutes != null && (
                <span className="font-bold" style={{ color: balanceColor(d.balanceMinutes) }}>
                  {signedHm(d.balanceMinutes)}
                </span>
              )}
              {hasMoney && d.earned != null && (
                <span className="ml-auto font-black text-ink-strong">{inr(d.earned)}</span>
              )}
            </div>
            {isOpen && <DayDetail day={d} ledger={ledger} />}
          </div>
        );
      })}
    </div>
  );
}

/** "8h 42m / 9h" — actual over required, with "/" as the spec asks (§3). */
function WorkHours({ day }: { day: LedgerDay }) {
  return (
    <>
      <span className="font-bold text-ink-strong">
        {day.requiredMinutes == null && day.workedMinutes === 0 ? "—" : hm(day.workedMinutes)}
      </span>
      <span className="text-ink-subtle">
        {" / "}
        {day.requiredMinutes == null ? "—" : hm(day.requiredMinutes)}
      </span>
    </>
  );
}

function ExpandButton({
  open,
  onClick,
  day,
}: {
  open: boolean;
  onClick: () => void;
  day: LedgerDay;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} details for ${day.dateLabel}`}
      className="grid size-6 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
    >
      {open ? <ChevronUp size={14} strokeWidth={2.6} /> : <ChevronDown size={14} strokeWidth={2.6} />}
    </button>
  );
}

/**
 * The expanded day (spec §9) — inline, compact, and no modal.
 *
 * A short definition list rather than a card, so a day's detail costs a couple
 * of lines and several can be open at once without the week turning into a
 * scroll. Everything in it is a fact the ENGINE decided; the `notes` are its
 * reasons, generated server-side beside the figures they explain.
 */
function DayDetail({ day, ledger }: { day: LedgerDay; ledger: DayLedger }) {
  const hasMoney = ledger.hasMoney;
  const rows: [string, React.ReactNode][] = [
    [
      "Attendance",
      day.inAt || day.outAt ? `${day.inAt ?? "—"} → ${day.outAt ?? "—"}` : "No punches recorded",
    ],
    ["Required", day.requiredMinutes == null ? "— (no hours owed)" : hm(day.requiredMinutes)],
    ["Worked", hm(day.workedMinutes)],
    [
      "Difference",
      day.balanceMinutes == null ? (
        "—"
      ) : (
        <span style={{ color: balanceColor(day.balanceMinutes) }}>
          {signedHm(day.balanceMinutes)}
        </span>
      ),
    ],
  ];
  if (hasMoney) {
    rows.push(
      [
        "Paid hours",
        day.payableMinutes > 0 ? hm(day.payableMinutes) : "—",
      ],
      ["Salary earning", day.earned == null ? "—" : inr(day.earned)],
    );
    // The BASELINE, spelled out. Without it "−₹145.85" is a number the employee
    // has to reverse-engineer; with it the subtraction is on screen.
    if (day.standardEarning != null) {
      rows.push(
        ["A normal day", inr(day.standardEarning)],
        [
          "This day vs normal",
          <span
            key="adj"
            style={{
              color: day.adjustment ? balanceColor(day.adjustment) : "var(--color-ink-muted)",
            }}
          >
            {day.adjustment ? signedInr(day.adjustment) : "Same as a normal day"}
          </span>,
        ],
      );
    } else if (day.adjustment) {
      rows.push([
        "Adjustment",
        <span key="adj" style={{ color: balanceColor(day.adjustment) }}>
          {signedInr(day.adjustment)}
        </span>,
      ]);
    }
  }

  return (
    <div className="mt-1.5 rounded-xl border border-solid border-hairline bg-surface-card/70 px-3 py-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px] sm:grid-cols-[auto_1fr_auto_1fr] sm:gap-x-5">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="font-semibold text-ink-subtle">{k}</dt>
            <dd className="font-bold tabular-nums text-ink-strong">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      {(day.adjustmentReason || day.notes.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 border-t border-solid border-hairline pt-1.5 text-[11.5px] leading-snug text-ink-soft">
          {day.adjustmentReason && <li>{day.adjustmentReason}</li>}
          {day.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── The workings (spec §16, §17) ─────────────────────────────────────────── */

/**
 * How the rows above become the gross on the payslip.
 *
 * This block is the report's honesty. The pay model is month-level — hours are
 * netted across the whole month, rounded down to whole hours and capped at the
 * monthly salary — so a per-day attribution cannot be the entire story, and
 * pretending otherwise would mean a table that quietly disagrees with the
 * payslip. Every month-level effect is therefore named and priced, and the
 * lines add up to the authoritative figure.
 *
 * `residual` is shown only when it is large enough to matter. Ordinarily it is
 * a few paise of rounding drift from the visible rows; a rupee or more means
 * the attribution has diverged from the engine, and hiding that would defeat
 * the purpose of showing the workings at all.
 */
function Workings({ ledger }: { ledger: DayLedger }) {
  const r = ledger.reconciliation;
  if (!r) return null;
  const lines: { label: string; value: number; hint?: string }[] = [
    { label: "Hours earned across the month", value: r.attributedEarned },
  ];
  if (r.attributedAdjustment !== 0) {
    lines.push({
      label: "Adjustments on individual days",
      value: r.attributedAdjustment,
      hint: "chargeable half-days and approved unpaid leave",
    });
  }
  if (r.chargesBeyondEarnings !== 0) {
    lines.push({
      label: "Charges the month could not absorb",
      value: r.chargesBeyondEarnings,
      hint: "pay never goes below zero",
    });
  }
  if (r.surplusNotPayable !== 0) {
    lines.push({
      label: "Surplus hours not payable",
      value: -r.surplusNotPayable,
      hint: "extra hours offset short weeks in the same month rather than becoming pay",
    });
  }
  if (r.roundedDownToWholeHours !== 0) {
    lines.push({
      label: "Rounded down to whole hours",
      value: -r.roundedDownToWholeHours,
      hint: "part-hours are not paid",
    });
  }
  if (r.cappedAtMonthlySalary !== 0) {
    lines.push({
      label: "Capped at your monthly salary",
      value: -r.cappedAtMonthlySalary,
    });
  }
  if (r.additionalHoursPay !== 0) {
    lines.push({ label: "Additional hours pay", value: r.additionalHoursPay });
  }
  if (Math.abs(r.residual) >= 0.5) {
    lines.push({ label: "Rounding", value: r.residual });
  }

  return (
    <div className="mt-2 rounded-2xl border border-hairline bg-surface-soft px-4 py-3">
      <dl className="space-y-0.5">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4 py-0.5">
            <dt className="text-[12px] text-ink-soft">
              {l.label}
              {l.hint && <span className="block text-[10.5px] text-ink-subtle">{l.hint}</span>}
            </dt>
            <dd
              className="shrink-0 text-[12.5px] font-bold tabular-nums"
              style={{
                color:
                  l.value < 0 ? "var(--color-altus-red)" : l.value > 0 ? GAIN_COLOR : undefined,
              }}
            >
              {l.value < 0 ? "− " : "+ "}
              {inr(l.value)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-solid border-hairline-strong pt-2">
        <span className="text-[12.5px] font-black text-ink-strong">
          Gross for {ledger.monthLabel}
        </span>
        <span className="text-[15px] font-black tabular-nums text-ink-strong">
          {inr(r.gross)}
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-ink-subtle">
        Every figure comes from the payroll calculation that produced your payslip — this report
        only shows which day each part of it came from.
      </p>
    </div>
  );
}
