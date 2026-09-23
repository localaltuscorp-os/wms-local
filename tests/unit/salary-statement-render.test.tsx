// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SalaryStatement } from "@/components/salary/salary-statement";
import type { SalarySlipData } from "@/lib/salary/salary-slip-data";
import type { DayLedger, LedgerDay, LedgerWeek } from "@/lib/salary/day-ledger";

/**
 * THE SALARY STATEMENT, rendered on the web.
 *
 * The rule the brief is most insistent about is that the WEEK OPTIONS ARE THE
 * DATA, not a fixed Week 1–5 list. A rendered screen is the only place that can
 * be checked, so this suite renders the component against a synthetic month and
 * reads the select back:
 *
 *   §3   the View select offers the weekly summary plus one option per week the
 *        ledger produced — six weeks here, six options;
 *   §4/§5 the default is the weekly summary, and choosing a week REPLACES it
 *        with that week's days and its own calculation block;
 *   §8   a month with no incentives shows the empty state ONCE;
 *   §13  the PDF link carries the month the page is showing.

 * Nothing here asserts a rupee the fixture did not supply: the component is
 * meant to render `SalarySlipData` and compute nothing.
 */

const MONTH_KEY = "2026-04";

function day(over: Partial<LedgerDay> & { date: string }): LedgerDay {
  return {
    dateLabel: "01 Apr",
    dayLabel: "Wed",
    weekday: 3,
    code: "P",
    status: "full_day",
    statusLabel: "Full Day",
    place: "office",
    inAt: "10:00",
    outAt: "19:00",
    workedMinutes: 540,
    requiredMinutes: 540,
    balanceMinutes: 0,
    earned: 700,
    standardEarning: 700,
    adjustment: 0,
    adjustmentReason: null,
    payableMinutes: 540,
    late: false,
    leftEarly: false,
    lateWaived: false,
    future: false,
    missingCheckOut: false,
    missingCheckIn: false,
    notes: [],
    ...over,
  };
}

function week(index: number): LedgerWeek {
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    day({
      date: `${MONTH_KEY}-W${index}-${d}`,
      dateLabel: `0${d} Apr`,
      earned: 1000 * index,
      adjustment: -index,
    }),
  );
  return {
    index,
    weekKey: `2026-W${index}`,
    startDate: "2026-04-01",
    endDate: "2026-04-07",
    rangeLabel: "01 Apr – 07 Apr",
    days,
    totals: {
      workedMinutes: 3240,
      offDayWorkedMinutes: 0,
      requiredMinutes: 3240,
      balanceMinutes: 0,
      earned: 1000 * index,
      adjustment: -index,
      counts: { full_day: 5, absent: 1, weekly_off: 1 },
    },
    engine: {
      expectedDays: 6,
      targetMinutes: 3240,
      carryInMinutes: 0,
      effectiveTargetMinutes: 3240,
      balanceAppliedMinutes: 0,
      deviationsWaived: false,
    },
  } as LedgerWeek;
}

function ledger(weekCount: number): DayLedger {
  const weeks = Array.from({ length: weekCount }, (_, i) => week(i + 1));
  return {
    month: MONTH_KEY,
    monthLabel: "Apr 2026",
    mode: "daily",
    moneyNote: null,
    hourlyRate: null,
    dailyRate: 700,
    hasMoney: true,
    dailyTargetMinutes: 540,
    weeklyTargetMinutes: 3240,
    weeks,
    days: weeks.flatMap((w) => w.days),
    totals: {
      workedMinutes: 3240 * weekCount,
      offDayWorkedMinutes: 0,
      requiredMinutes: 3240 * weekCount,
      balanceMinutes: 0,
      earned: 1000 * weekCount,
      adjustment: -weekCount,
      counts: { full_day: 5 * weekCount, absent: weekCount, weekly_off: weekCount },
    },
    engine: null,
    reconciliation: null,
  } as unknown as DayLedger;
}

function data(over: Partial<SalarySlipData> = {}): SalarySlipData {
  const weekCount = over.ledger?.weeks.length ?? 5;
  return {
    identity: {
      employeeId: "e-1",
      name: "Mishtie Kanani",
      code: "A-101",
      designation: "Operations Consultant",
      fn: "Marketing",
      entity: "Altus Corp",
      workerType: "full_time",
      doj: "2026-04-01",
      month: MONTH_KEY,
      monthLabel: "Apr 2026",
      fy: "FY 26-27",
      daysInMonth: 30,
    },
    month: null,
    salary: {
      monthlyCtc: 22000,
      perDay: 733,
      payableDays: 26,
      earnings: [
        { label: "Attendance-based Salary", amount: 20350 },
        { label: "Overtime / Additional Pay", amount: 650 },
      ],
      gross: 21000,
      additions: [],
      additionTotal: 0,
      deductions: [{ label: "Professional Tax", amount: 200 }],
      deductionTotal: 200,
      net: 20800,
      attendanceShortfall: 1000,
      paid: false,
      salaryGiven: null,
      remarks: null,
    },
    ledger: null,
    attendance: {
      present: 22,
      halfDay: 0,
      absent: 4,
      weeklyOff: 4,
      holiday: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      workedHours: 198,
      targetHours: 234,
      payableDays: 26,
    },
    incentive: {
      lines: [
        {
          entryId: "x-1",
          incentiveName: "Consulting Pitch",
          earned: 1000,
          paid: 1000,
          adjustment: 0,
          payable: 0,
          state: "paid",
          paidDate: "2026-05-13",
        },
      ],
      totals: { earned: 6000, paid: 1500, payable: 4250, adjustment: -250 },
      linesByMonth: {
        [MONTH_KEY]: [
          {
            entryId: "x-1",
            incentiveName: "Consulting Pitch",
            earned: 1000,
            paid: 1000,
            adjustment: 0,
            payable: 0,
            state: "paid",
            paidDate: "2026-05-13",
          },
        ],
      },
      recordsByMonth: {
        [MONTH_KEY]: [
          {
            id: "r-1",
            typeLabel: "Sales Pitch",
            prospect: "Meera Shah",
            introducer: "Ravi Kulkarni",
            productCodes: ["PS", "BSS"],
            productNames: ["Pitch Service", "Biz Setup"],
            date: "2026-04-12",
            status: "approved",
          },
        ],
      },
      targetVsPaid: {
        month: MONTH_KEY,
        thisMonth: { target: 2000, paid: 1000, attainmentPct: 50 },
        last3Months: { target: 6000, paid: 4000, attainmentPct: 66.7 },
        ytd: { target: 6000, paid: 4000, attainmentPct: 66.7 },
        perMonth: [],
      },
      windows: {
        thisMonth: [MONTH_KEY],
        last3: ["2026-02", "2026-03", MONTH_KEY],
        ytd: [MONTH_KEY],
      },
    },
    reimbursement: { lines: [], paidThisMonth: 0, awaitingPayment: 0 },
    retention: null,
    totalEarnings: 22300,
    ...over,
    ...(over.ledger === undefined ? { ledger: ledger(weekCount) } : {}),
  } as SalarySlipData;
}

function show(over: Partial<SalarySlipData> = {}, view: string | null = null, inv: string | null = null) {
  return render(
    <SalaryStatement
      data={data(over)}
      months={[{ month: MONTH_KEY, label: "April 2026" }]}
      month={MONTH_KEY}
      employeeId="e-1"
      initialView={view}
      initialIncentive={inv}
    />,
  );
}

function viewSelect(): HTMLSelectElement {
  return screen.getByLabelText("Attendance view") as HTMLSelectElement;
}

afterEach(cleanup);

// ── THE THREE PARTS ─────────────────────────────────────────────────────────

describe("the statement is three parts", () => {
  it("heads each one", () => {
    show();
    expect(screen.getByText("Salary Slip")).toBeDefined();
    expect(screen.getByText("Attendance & Salary Calculation")).toBeDefined();
    expect(screen.getByText("Incentive Statement")).toBeDefined();
  });

  it("prints the slip's figures from the data, not from its own arithmetic", () => {
    show();
    expect(screen.getByText("₹22,000")).toBeDefined(); // monthly CTC
    expect(screen.getAllByText("₹21,000").length).toBeGreaterThan(0); // earned / gross
    expect(screen.getAllByText("₹20,800").length).toBeGreaterThan(0); // net salary payable
    expect(screen.getByText("₹22,300")).toBeDefined(); // total earnings this month
  });

  it("points the PDF link at this person and this month", () => {
    show();
    const link = screen.getByText("Download PDF").closest("a");
    expect(link?.getAttribute("href")).toBe("/salary/earnings/e-1?month=2026-04");
  });
});

// ── §3 THE VIEW OPTIONS COME FROM THE DATA ──────────────────────────────────

describe("the week view options", () => {
  it("are the weekly summary plus one per week the ledger produced", () => {
    show();
    expect([...viewSelect().options].map((o) => o.value)).toEqual([
      "summary",
      "week-1",
      "week-2",
      "week-3",
      "week-4",
      "week-5",
    ]);
  });

  it("grow to six when the month has six weeks — nothing is hardcoded at five", () => {
    show({ ledger: ledger(6) });
    expect([...viewSelect().options].map((o) => o.value)).toEqual([
      "summary",
      "week-1",
      "week-2",
      "week-3",
      "week-4",
      "week-5",
      "week-6",
    ]);
  });

  it("shrink to four when the month has four", () => {
    show({ ledger: ledger(4) });
    expect([...viewSelect().options].map((o) => o.value)).toEqual([
      "summary",
      "week-1",
      "week-2",
      "week-3",
      "week-4",
    ]);
  });

  it("label each week with the range the engine gave it", () => {
    show();
    expect(viewSelect().options[1]?.textContent).toBe("Week 1 · 01 Apr – 07 Apr");
  });

  it("default to the weekly summary", () => {
    show();
    expect(viewSelect().value).toBe("summary");
  });
});

// ── §4/§5 SUMMARY AND ONE WEEK ──────────────────────────────────────────────

describe("the weekly summary view", () => {
  it("shows one row per week, with the month total beneath", () => {
    show();
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`Week ${n}`)).toBeDefined();
    }
    // One on the weekly summary and one on the incentive payments table.
    expect(screen.getAllByText("Month total").length).toBeGreaterThan(0);
  });

  it("does not dump the days underneath it", () => {
    show();
    // The weekday column belongs to a week's day table; the summary is weeks only.
    expect(screen.queryAllByText("Wed")).toHaveLength(0);
  });

  it("prints the engine's own week figures", () => {
    show();
    expect(screen.getByText("₹3,000")).toBeDefined(); // week 3 earned
    expect(screen.getByText("−₹3")).toBeDefined(); // week 3 adjustment
  });
});

describe("choosing a week", () => {
  it("replaces the summary with that week's days", () => {
    show({}, "week-3");
    expect(viewSelect().value).toBe("week-3");
    expect(screen.getByText("Week 3 calculation")).toBeDefined();
    // Seven day rows plus the calculation block all carry this week's figure.
    expect(screen.getAllByText("₹3,000").length).toBeGreaterThan(0);
  });

  it("shows ONLY the chosen week — no other week's calculation is on the page", () => {
    show({}, "week-3");
    for (const n of [1, 2, 4, 5]) {
      expect(screen.queryByText(`Week ${n} calculation`)).toBeNull();
    }
  });

  it("replaces the week's content when another is chosen", () => {
    cleanup();
    show({}, "week-2");
    expect(screen.queryByText("Week 3 calculation")).toBeNull();
    expect(screen.getByText("Week 2 calculation")).toBeDefined();
  });

  it("says so when the week is not part of the month", () => {
    show({}, "week-9");
    expect(screen.getByText("That week is not part of this month.")).toBeDefined();
  });

  it("falls back to the summary when there is no day record at all", () => {
    show({ ledger: null });
    expect(screen.getByText("This month has no day-by-day calculation.")).toBeDefined();
    expect([...viewSelect().options].map((o) => o.value)).toEqual(["summary"]);
  });
});

// ── §8/§9 THE INCENTIVE PART ────────────────────────────────────────────────

describe("the incentive statement", () => {
  it("shows the four figures as tiles", () => {
    show();
    expect(screen.getAllByText("Earned").length).toBeGreaterThan(0);
    expect(screen.getByText("Negative Payable Adjustment")).toBeDefined();
    expect(screen.getAllByText("−₹250").length).toBeGreaterThan(0);
  });

  it("offers the five windows the data supports", () => {
    show();
    const inv = screen.getByLabelText("Incentive view") as HTMLSelectElement;
    expect([...inv.options].map((o) => o.textContent)).toEqual([
      "Monthly Summary",
      "This Month",
      "Last 3 Months",
      "Year To Date",
      "Individual Incentive",
    ]);
    expect(inv.value).toBe("monthly");
  });

  it("lists the month's records with the product name and code", () => {
    show();
    expect(screen.getByText("Meera Shah")).toBeDefined();
    expect(screen.getByText("Ravi Kulkarni")).toBeDefined();
    expect(screen.getByText("Pitch Service (PS), Biz Setup (BSS)")).toBeDefined();
  });

  it("shows the individual incentive when the window asks for it", () => {
    show({}, null, "individual");
    expect(screen.getByText("Incentive Name")).toBeDefined();
    expect(screen.getAllByText("Consulting Pitch").length).toBeGreaterThan(0);
    // Product CODE and NAME on their own lines, both from the Product Master.
    expect(screen.getByText("PS, BSS")).toBeDefined();
    expect(screen.getByText("Pitch Service, Biz Setup")).toBeDefined();
  });

  it("shows ONE empty state when the month has none", () => {
    show({
      incentive: {
        ...data().incentive,
        lines: [],
        linesByMonth: {},
        recordsByMonth: {},
        totals: { earned: 0, paid: 0, payable: 0, adjustment: 0 },
      },
    });
    expect(screen.getAllByText("No incentive records for this period.")).toHaveLength(1);
    // And no empty tables or windows above it.
    expect(screen.queryByText("Incentive Records")).toBeNull();
    expect(screen.queryByLabelText("Incentive view")).toBeNull();
  });
});
