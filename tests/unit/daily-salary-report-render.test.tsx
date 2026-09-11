// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { computeDayCode } from "@/lib/attendance/status";
import {
  resolveEffectiveConfig,
  toAttendanceSchedule,
} from "@/lib/attendance/effective-config";
import { payrollMonthFor } from "@/lib/attendance/payroll-month";
import { computeScheduleHourlySalary } from "@/lib/salary/compute";
import { buildDayLedger, type DayLedger, type LedgerDayInput } from "@/lib/salary/day-ledger";
import { DailySalaryReport } from "@/components/salary/daily-salary-report";

/**
 * THE DAILY SALARY REPORT, rendered.
 *
 * The arithmetic is proven in daily-salary-report.test.ts. What is left is the
 * behaviour a reader actually touches, and every claim below is one the spec
 * makes and a screenshot cannot check:
 *
 *   §2   only one week is expanded at a time, and opening another closes it
 *   §9   a day expands INLINE, several at once, with no modal and no navigation
 *   §12  the filters really narrow the rows, combine, and empty weeks vanish
 *   §13  sorting reorders the visible rows
 *   §4   times render in 24 hours, dates stay compact
 *   §14  a desktop table AND a compact small-screen list both exist
 *
 * These are rendered against a REAL graded month built through the real engine,
 * not a hand-written ledger object, so a change to the pipeline that alters the
 * shape of the data shows up here too.
 */

const FULL_TIME = {
  workerType: "full_time",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "19:00:00",
  weeklyOff: 0,
};
const CFG = resolveEffectiveConfig(FULL_TIME);
const SCHED = toAttendanceSchedule(CFG);
const MONTH = "2026-08";
const EOM = "2026-08-31";

/**
 * August 2026 for a full-timer: 9h days, Sundays off, one holiday, one paid and
 * one unpaid leave, one half day, one absence, one long day, and a WFH day.
 * Enough variety that every filter has something to find.
 */
function fixture(): DayLedger {
  const holidays = new Set(["2026-08-15"]);
  const leave: Record<string, "paid" | "unpaid"> = {
    "2026-08-11": "paid",
    "2026-08-12": "unpaid",
  };
  const remote: Record<string, string> = { "2026-08-10": "wfh" };
  const minutes: Record<string, number> = {
    "2026-08-18": 5 * 60, // half day
    "2026-08-19": 0, // absent
    "2026-08-20": 10 * 60 + 30, // overtime
  };

  const days: LedgerDayInput[] = Array.from({ length: 31 }, (_, i) => {
    const logDate = `${MONTH}-${String(i + 1).padStart(2, "0")}`;
    const weekday = new Date(`${logDate}T00:00:00Z`).getUTCDay();
    const isWeeklyOff = weekday === 0;
    const isHoliday = holidays.has(logDate);
    const onLeave = isHoliday ? null : (leave[logDate] ?? null);
    const worked = minutes[logDate] ?? 9 * 60;
    const punchable = !isWeeklyOff && !isHoliday && !onLeave && worked > 0;
    const inAt = punchable ? "10:21" : null;
    const outAt = punchable
      ? `${String(Math.floor((10 * 60 + 21 + worked) / 60)).padStart(2, "0")}:${String((10 * 60 + 21 + worked) % 60).padStart(2, "0")}`
      : null;
    const g = computeDayCode(
      { inAt, outAt },
      SCHED,
      { isWeeklyOff, isHoliday, leave: onLeave },
      "23:59",
    );
    return {
      logDate,
      weekday,
      code: g.code,
      dayValue: g.dayValue,
      workedMinutes: g.workedMinutes,
      inAt,
      outAt,
      isWeeklyOff,
      late: g.late,
      leftEarly: g.leftEarly,
      lateWaived: g.lateWaived,
      remoteMode: remote[logDate] ?? null,
    };
  });

  const { recon, hours } = payrollMonthFor(days, {
    month: MONTH,
    cfg: CFG,
    refTodayISO: EOM,
  });
  const b = computeScheduleHourlySalary({
    monthlySalary: 54_000,
    monthlyTargetHours: hours.targetHours,
    payableHoursRaw: hours.payableMinutesRaw / 60,
    dailyTargetHours: CFG.dailyTargetMinutes / 60,
    chargeableHalfDays: recon.chargeableHalfDays,
    unpaidLeaveDays: hours.unpaidLeaveDays,
    overtimeHours: 0,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  });
  return buildDayLedger({
    month: MONTH,
    monthLabel: "August 2026",
    days,
    cfg: {
      dailyTargetMinutes: CFG.dailyTargetMinutes,
      weeklyTargetMinutes: CFG.weeklyTargetMinutes,
    },
    recon,
    hours,
    pay: {
      mode: "hours_schedule",
      hourlyRate: b.hourlyRate ?? 0,
      gross: b.gross,
      overtimeAmount: b.overtimeAmount ?? 0,
      monthlySalary: 54_000,
    },
    refTodayISO: EOM,
  });
}

const LEDGER = fixture();

afterEach(cleanup);

/** The desktop table's data rows, for whichever week is expanded. */
function tableRows(): HTMLElement[] {
  const table = document.querySelector("table");
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).filter(
    (tr) => tr.querySelectorAll("td").length === 10,
  ) as HTMLElement[];
}

const weekButton = (n: number): HTMLElement =>
  screen.getByRole("button", { name: new RegExp(`^Week ${n}\\b`) });

/**
 * Expand week `n` if it is not already open.
 *
 * Idempotent on purpose: only one week is open at a time, so clicking a week
 * that is already expanded CLOSES it. A test reaching for two days in the same
 * week would otherwise shut the table it was about to read.
 */
function openWeek(n: number): void {
  const btn = weekButton(n);
  if (btn.getAttribute("aria-expanded") !== "true") fireEvent.click(btn);
}

/** The week number holding `date`. */
const weekOf = (date: string): number =>
  LEDGER.weeks.find((w) => w.days.some((d) => d.date === date))!.index;

/**
 * The DESKTOP table's expand control for a day.
 *
 * Scoped to the `<table>` deliberately. Both layouts render at once and
 * Tailwind hides one with CSS, which jsdom does not apply — so an unscoped
 * query finds the same button twice, once per layout. (A screen reader does not
 * see both: `display: none` removes a node from the accessibility tree.)
 */
function expandButton(dateLabel: string): HTMLElement {
  const table = document.querySelector("table");
  if (!table) throw new Error("no week is expanded");
  return within(table as HTMLElement).getByRole("button", {
    name: new RegExp(`details for ${dateLabel}`),
  });
}

/* ── the frame ───────────────────────────────────────────────────────────── */

describe("the report renders", () => {
  it("titles itself and names the month and the rate", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    expect(screen.getByText("Daily Salary Report")).toBeTruthy();
    expect(screen.getByText(/August 2026/)).toBeTruthy();
    // The rate every EARNED cell is a multiple of, stated once at the top.
    expect(screen.getByText(/\/hour/)).toBeTruthy();
  });

  it("shows every week of the month as its own accordion (spec §2)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    for (const w of LEDGER.weeks) {
      const btn = weekButton(w.index);
      expect(btn.textContent).toContain(w.rangeLabel);
    }
    // August 2026 opens on a Saturday, so the first week is a two-day portion.
    expect(weekButton(1).textContent).toContain("01 Aug – 02 Aug");
  });

  it("carries every column the spec names, with WORK HOURS spelled that way", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    for (const h of [
      "Date",
      "Day",
      "Status",
      "Check-in",
      "Check-out",
      "Work Hours",
      "Balance",
      "Adj.",
      "Earned",
    ]) {
      expect(screen.getByRole("columnheader", { name: h }), h).toBeTruthy();
    }
    // "Worked / Target" is explicitly NOT the wording (spec §3).
    expect(screen.queryByText(/Worked \/ Target/)).toBeNull();
  });

  it("offers a desktop table AND a compact small-screen list (spec §14)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    // One table, hidden below `md`…
    const table = document.querySelector("table")!;
    expect(table.closest("div")!.className).toContain("max-md:hidden");
    // …and a list that only exists below it, so a phone never drags a table.
    expect(document.querySelector(".md\\:hidden")).toBeTruthy();
  });
});

/* ── week accordions (spec §2) ───────────────────────────────────────────── */

describe("week accordions", () => {
  it("opens exactly one week, and switching closes the previous one", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const open = () =>
      LEDGER.weeks.filter((w) => weekButton(w.index).getAttribute("aria-expanded") === "true");

    // A fully-elapsed month opens on week 1.
    expect(open().map((w) => w.index)).toEqual([1]);

    fireEvent.click(weekButton(3));
    expect(open().map((w) => w.index)).toEqual([3]);

    fireEvent.click(weekButton(4));
    expect(open().map((w) => w.index)).toEqual([4]);
  });

  it("closes on a second click, leaving none open", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    expect(weekButton(1).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(weekButton(1));
    expect(weekButton(1).getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("table")).toBeNull();
  });

  it("keeps a closed week very compact — a summary line, not a table", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    fireEvent.click(weekButton(1)); // close everything
    const btn = weekButton(2);
    // Hours over required, a signed balance, and the day counts. No rows.
    expect(btn.textContent).toMatch(/\d+h.*\/.*\d+h/);
    expect(btn.textContent).toMatch(/[+-]\d/);
    expect(btn.textContent).toMatch(/full day/i);
    expect(document.querySelector("table")).toBeNull();
  });

  it("shows a WEEK TOTAL under the expanded week (spec §11)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    expect(screen.getByText("Week total")).toBeTruthy();
    const row = screen.getByText("Week total").parentElement!;
    for (const label of ["Work hours", "Balance", "Adjustment", "Earned"]) {
      expect(within(row).getByText(label), label).toBeTruthy();
    }
  });
});

/* ── the day rows (spec §3, §4, §5) ──────────────────────────────────────── */

describe("day rows", () => {
  /** Expand the week holding `date` and return its row. */
  function rowFor(date: string): HTMLElement {
    openWeek(weekOf(date));
    const day = LEDGER.days.find((d) => d.date === date)!;
    const row = tableRows().find((tr) =>
      tr.querySelector("td")!.textContent!.includes(day.dateLabel),
    );
    if (!row) throw new Error(`no row for ${date}`);
    return row;
  }

  it("writes times in 24 hours and dates compactly (spec §4)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const row = rowFor("2026-08-10");
    const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent!.trim());
    expect(cells[0]).toBe("10 Aug"); // no year, no month name in full
    expect(cells[1]).toBe("Mon");
    expect(cells[3]).toBe("10:21");
    expect(cells[4]).toBe("19:21");
    // Nothing anywhere reads as 12-hour.
    expect(document.body.textContent).not.toMatch(/\d\s?(AM|PM|am|pm)\b/);
  });

  it('writes WORK HOURS as "actual / required" (spec §3)', () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const cells = Array.from(rowFor("2026-08-10").querySelectorAll("td"));
    expect(cells[5]!.textContent).toBe("9h / 9h");
  });

  it("shows a holiday with no hours, no balance and no deduction (spec §10)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const cells = Array.from(rowFor("2026-08-15").querySelectorAll("td")).map(
      (c) => c.textContent!.trim(),
    );
    expect(cells[2]).toBe("Holiday");
    expect(cells[3]).toBe("—"); // check-in
    expect(cells[4]).toBe("—"); // check-out
    expect(cells[5]).toBe("— / —"); // work hours
    expect(cells[6]).toBe("—"); // balance
    expect(cells[7]).toBe("—"); // adjustment
  });

  it("shows unpaid leave with its deduction, and paid leave without one", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const unpaid = Array.from(rowFor("2026-08-12").querySelectorAll("td")).map(
      (c) => c.textContent!.trim(),
    );
    expect(unpaid[2]).toBe("Unpaid Leave");
    expect(unpaid[7]).toMatch(/^−₹/); // a real deduction, negative

    const paid = Array.from(rowFor("2026-08-11").querySelectorAll("td")).map(
      (c) => c.textContent!.trim(),
    );
    expect(paid[2]).toBe("Paid Leave");
    expect(paid[7]).toBe("—"); // no deduction at all
  });

  it("names the remote-work type in the Status field (spec §5)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const status = rowFor("2026-08-10").querySelectorAll("td")[2]!;
    expect(status.textContent).toContain("Full Day");
    expect(status.textContent).toContain("Work From Home");
  });

  it("labels a long day Overtime and colours the surplus green (spec §5, §6)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const cells = Array.from(rowFor("2026-08-20").querySelectorAll("td"));
    expect(cells[2]!.textContent).toContain("Overtime");
    const balance = cells[6]!.querySelector("span")!;
    expect(balance.textContent).toMatch(/^\+/);
    // jsdom normalises an inline hex to rgb(), so compare on that.
    expect(balance.getAttribute("style")).toContain("rgb(21, 128, 61)");
  });

  it("colours a deficit red and leaves a square day neutral (spec §6)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const short = rowFor("2026-08-18").querySelectorAll("td")[6]!.querySelector("span")!;
    expect(short.textContent).toMatch(/^-/);
    expect(short.getAttribute("style")).toContain("--color-altus-red");

    const square = rowFor("2026-08-10").querySelectorAll("td")[6]!.querySelector("span")!;
    expect(square.textContent).toBe("+0h");
    expect(square.getAttribute("style")).toContain("--color-ink-muted");
  });

  it("tints the row rather than filling it (spec §5)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const absent = rowFor("2026-08-19");
    const style = absent.getAttribute("style") ?? "";
    expect(style).toContain("color-mix");
    // A tint over the surface, not an opaque wall of colour.
    expect(style).toContain("transparent");
  });
});

/* ── expanding a day (spec §9) ───────────────────────────────────────────── */

describe("expanding a day", () => {
  it("opens inline, with no dialog and no navigation", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    openWeek(weekOf("2026-08-03"));
    const before = tableRows().length;
    fireEvent.click(expandButton("03 Aug"));
    expect(expandButton("03 Aug").getAttribute("aria-label")).toContain("Hide");
    expect(screen.queryByRole("dialog")).toBeNull();
    // A detail row appeared inside the same table.
    expect(document.querySelectorAll("table tbody tr").length).toBe(before + 1);
  });

  it("shows the day's own workings, compactly", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    openWeek(weekOf("2026-08-03"));
    fireEvent.click(expandButton("03 Aug"));
    for (const label of [
      "Attendance",
      "Required",
      "Worked",
      "Difference",
      "Salary earning",
      "Adjustment",
    ]) {
      // Both layouts render the detail, so assert presence rather than unicity.
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
  });

  it("allows several days open at once in one week (spec §9)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    openWeek(weekOf("2026-08-03"));
    fireEvent.click(expandButton("03 Aug"));
    fireEvent.click(expandButton("04 Aug"));
    expect(expandButton("03 Aug").getAttribute("aria-label")).toContain("Hide");
    expect(expandButton("04 Aug").getAttribute("aria-label")).toContain("Hide");
  });

  it("explains WHY a special day cost or earned nothing", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    openWeek(weekOf("2026-08-15")); // the week with the holiday
    fireEvent.click(expandButton("15 Aug"));
    expect(screen.getAllByText(/No hours were required/).length).toBeGreaterThan(0);
  });

  it("closes again on a second click", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    openWeek(weekOf("2026-08-03"));
    fireEvent.click(expandButton("03 Aug"));
    expect(expandButton("03 Aug").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(expandButton("03 Aug"));
    expect(expandButton("03 Aug").getAttribute("aria-expanded")).toBe("false");
  });
});

/* ── filters (spec §12) ──────────────────────────────────────────────────── */

describe("filters", () => {
  const statusSelect = () => screen.getByLabelText("Status") as HTMLSelectElement;
  const weekSelect = () => screen.getByLabelText("Week") as HTMLSelectElement;

  it("offers only the statuses the month actually contains", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const values = Array.from(statusSelect().options).map((o) => o.value);
    expect(values).toContain("half_day");
    expect(values).toContain("unpaid_leave");
    expect(values).toContain("holiday");
    // No comp-off happened, so it is not offered (§12: do not invent statuses).
    expect(values).not.toContain("comp_off");
  });

  it("really narrows the rows", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    fireEvent.change(statusSelect(), { target: { value: "half_day" } });
    const statuses = tableRows().map((tr) => tr.querySelectorAll("td")[2]!.textContent);
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s) => s!.includes("Half Day"))).toBe(true);
  });

  it("drops weeks the filter empties instead of showing hollow accordions", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const allWeeks = LEDGER.weeks.length;
    fireEvent.change(statusSelect(), { target: { value: "unpaid_leave" } });
    const shown = LEDGER.weeks.filter(
      (w) => screen.queryByRole("button", { name: new RegExp(`^Week ${w.index}\\b`) }) !== null,
    );
    expect(shown.length).toBe(1);
    expect(shown.length).toBeLessThan(allWeeks);
  });

  it("combines a status and a week (the spec's own example)", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const halfDayWeek = LEDGER.weeks.find((w) =>
      w.days.some((d) => d.date === "2026-08-18"),
    )!.index;

    fireEvent.change(statusSelect(), { target: { value: "half_day" } });
    fireEvent.change(weekSelect(), { target: { value: String(halfDayWeek) } });
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]!.querySelector("td")!.textContent).toBe("18 Aug");

    // The same status in a week that has none: handled cleanly, not an empty
    // accordion (§12).
    fireEvent.change(weekSelect(), { target: { value: "1" } });
    expect(screen.getByText("No days match these filters.")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
  });

  it("filters by work type, and only offers types that occurred", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const place = screen.getByLabelText("Work type") as HTMLSelectElement;
    const values = Array.from(place.options).map((o) => o.value);
    expect(values).toContain("wfh");
    expect(values).not.toContain("client_site"); // nobody was at a client site
    fireEvent.change(place, { target: { value: "wfh" } });
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]!.querySelector("td")!.textContent).toBe("10 Aug");
  });

  it("says a filter is on, and offers a clear way back to All", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    fireEvent.change(statusSelect(), { target: { value: "half_day" } });

    const clear = screen.getByRole("button", { name: "All" });
    // The total relabels itself, so a subset is never presented as the month.
    expect(screen.getByText("Filtered total")).toBeTruthy();

    fireEvent.click(clear);
    expect(screen.getByText("Month total")).toBeTruthy();
    expect(statusSelect().value).toBe("all");
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
  });

  it("recomputes the week total over the rows it is showing", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    fireEvent.change(statusSelect(), { target: { value: "half_day" } });
    const shown = tableRows();
    const earned = shown
      .map((tr) => tr.querySelectorAll("td")[8]!.textContent!.replace(/[₹,]/g, ""))
      .reduce((s, v) => s + Number(v), 0);
    const totalText = screen
      .getByText("Week total")
      .parentElement!.textContent!.match(/Earned\s*₹([\d,.]+)/)?.[1];
    expect(Number(totalText!.replace(/,/g, ""))).toBeCloseTo(earned, 0);
  });
});

/* ── sorting (spec §13) ──────────────────────────────────────────────────── */

describe("sorting", () => {
  it("offers all six orders the spec lists", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const labels = Array.from(
      (screen.getByLabelText("Sort") as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(labels).toEqual([
      "Date — Oldest First",
      "Date — Newest First",
      "Hours — Highest First",
      "Hours — Lowest First",
      "Earning — Highest First",
      "Earning — Lowest First",
    ]);
  });

  it("reorders the visible rows", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    openWeek(2); // a full 7-day week
    const dates = () => tableRows().map((tr) => tr.querySelector("td")!.textContent);

    const asc = dates();
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "date_desc" } });
    expect(dates()).toEqual([...asc].reverse());

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "hours_desc" } });
    const worked = tableRows().map((tr) => {
      const cell = tr.querySelectorAll("td")[5]!.textContent!.split("/")[0]!.trim();
      // A day that owed no hours and worked none renders — on both sides.
      if (cell === "\u2014") return 0;
      const h = /(\d+)h/.exec(cell);
      const m = /(\d+)m/.exec(cell);
      return Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0);
    });
    // Descending, and the Sunday that worked nothing is at the bottom.
    expect(worked).toEqual([...worked].sort((a, b) => b - a));
    expect(worked[worked.length - 1]).toBe(0);
  });
});

/* ── the workings (spec §16, §17) ────────────────────────────────────────── */

describe("the workings", () => {
  it("offers to show how the days add up to the gross, and does", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    const gross = LEDGER.reconciliation!.gross;
    const toggle = screen.getByRole("button", { name: /How these days add up to/ });
    expect(toggle.textContent).toContain(
      gross.toLocaleString("en-IN", { maximumFractionDigits: 2 }).split(".")[0],
    );

    fireEvent.click(toggle);
    expect(screen.getByText("Hours earned across the month")).toBeTruthy();
    expect(screen.getByText(/Gross for August 2026/)).toBeTruthy();
    // And it says where the numbers came from.
    expect(screen.getByText(/produced your payslip/)).toBeTruthy();
  });

  it("names the month-level effects rather than absorbing them", () => {
    render(<DailySalaryReport ledger={LEDGER} />);
    fireEvent.click(screen.getByRole("button", { name: /How these days add up to/ }));
    // This fixture has unpaid leave, so there is a per-day adjustment line.
    expect(screen.getByText("Adjustments on individual days")).toBeTruthy();
  });
});

/* ── a month with no money view ──────────────────────────────────────────── */

describe("a month whose pay does not break down by day", () => {
  const bare = (): DayLedger => {
    const l = fixture();
    return {
      ...l,
      mode: "attendance_only",
      // Both rates AND the flag: `hasMoney` is what the view reads, and leaving
      // it true while blanking the rates is precisely the inconsistency the
      // flag was introduced to make impossible to express by accident.
      hourlyRate: null,
      dailyRate: null,
      hasMoney: false,
      reconciliation: null,
      moneyNote: "Your pay is a fixed monthly retainer.",
      days: l.days.map((d) => ({ ...d, earned: null, adjustment: null })),
      weeks: l.weeks.map((w) => ({
        ...w,
        days: w.days.map((d) => ({ ...d, earned: null, adjustment: null })),
        totals: { ...w.totals, earned: null, adjustment: null },
      })),
      totals: { ...l.totals, earned: null, adjustment: null },
    };
  };

  it("explains itself, shows the attendance, and offers no workings", () => {
    render(<DailySalaryReport ledger={bare()} />);
    expect(screen.getByText(/fixed monthly retainer/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /How these days add up/ })).toBeNull();
    // The attendance is still all there.
    expect(tableRows().length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Work Hours" })).toBeTruthy();
  });

  it("shows the money columns as unknown, never as ₹0", () => {
    render(<DailySalaryReport ledger={bare()} />);
    const earned = tableRows().map((tr) => tr.querySelectorAll("td")[8]!.textContent!.trim());
    expect(earned.every((v) => v === "—")).toBe(true);
    expect(earned.some((v) => v === "₹0")).toBe(false);
  });
});
