import { describe, it, expect } from "vitest";
import {
  mapSummaryRows,
  monthFromCell,
  payableDaysFromSummary,
  type AltusLogMonthRow,
} from "@/lib/salary/altus-log-import";

const HEADER_ROW = [
  "S.No",
  "FY",
  "Month",
  "Employee Name",
  "Designation",
  "Company Name",
  "Present",
  "Holiday",
  "Weekly off",
  "Present on Holiday (Full Day)",
  "Present on Holiday (Half Day)",
  "Half day",
  "Absent",
  "No of Days In this month",
  "Total No Days Worked",
];

const SAMPADA_ROW = [
  1,
  "FY 22-23",
  "2022-03-31",
  "Sampada More",
  "Senior Facilitator",
  "Altus Corp",
  26,
  0,
  4,
  0,
  0,
  0,
  0,
  30,
  30,
];

describe("monthFromCell", () => {
  it("parses a JS Date (UTC) to YYYY-MM", () => {
    expect(monthFromCell(new Date(Date.UTC(2026, 3, 30)))).toBe("2026-04");
  });

  it("parses a YYYY-MM-DD string to YYYY-MM (first 7 chars)", () => {
    expect(monthFromCell("2022-03-31")).toBe("2022-03");
  });

  it("passes through a YYYY-MM string", () => {
    expect(monthFromCell("2022-03")).toBe("2022-03");
  });

  it("falls back to new Date() for other parseable date strings", () => {
    expect(monthFromCell("2022-03-31T00:00:00Z")).toBe("2022-03");
  });

  it("returns null for garbage", () => {
    expect(monthFromCell("garbage")).toBeNull();
  });

  it("returns null for empty/nullish", () => {
    expect(monthFromCell("")).toBeNull();
    expect(monthFromCell(null)).toBeNull();
    expect(monthFromCell(undefined)).toBeNull();
  });
});

describe("payableDaysFromSummary", () => {
  const base: AltusLogMonthRow = {
    fy: "FY 22-23",
    month: "2022-03",
    employeeName: "Test",
    designation: null,
    entity: null,
    present: 0,
    holiday: 0,
    weeklyOff: 0,
    holidayPresentFull: 0,
    holidayPresentHalf: 0,
    halfDay: 0,
    absent: 0,
    daysInMonth: 30,
    totalWorked: 0,
  };

  it("sums full present + weekly off (Sampada: 26 + 4 = 30)", () => {
    expect(
      payableDaysFromSummary({ ...base, present: 26, weeklyOff: 4 }),
    ).toBe(30);
  });

  it("counts half days at 0.5 (20 present + 4 W/O + 2 half = 25)", () => {
    expect(
      payableDaysFromSummary({
        ...base,
        present: 20,
        weeklyOff: 4,
        halfDay: 2,
      }),
    ).toBe(25);
  });

  it("counts holiday-present full at 2x and half-on-holiday at 1.5x (+2 + 3 = +5)", () => {
    const withHolidayWork = payableDaysFromSummary({
      ...base,
      present: 10,
      holidayPresentFull: 1,
      holidayPresentHalf: 2,
    });
    expect(withHolidayWork).toBe(10 + 2 + 3);
  });

  it("ignores absent (contributes 0)", () => {
    expect(
      payableDaysFromSummary({ ...base, present: 10, absent: 5 }),
    ).toBe(10);
  });
});

describe("mapSummaryRows", () => {
  it("maps the Sampada row correctly", () => {
    const [row] = mapSummaryRows([HEADER_ROW, SAMPADA_ROW]);
    expect(row).toBeDefined();
    if (!row) return;
    expect(row).toEqual({
      fy: "FY 22-23",
      month: "2022-03",
      employeeName: "Sampada More",
      designation: "Senior Facilitator",
      entity: "Altus Corp",
      present: 26,
      holiday: 0,
      weeklyOff: 4,
      holidayPresentFull: 0,
      holidayPresentHalf: 0,
      halfDay: 0,
      absent: 0,
      daysInMonth: 30,
      totalWorked: 30,
    });
    expect(payableDaysFromSummary(row)).toBe(30);
  });

  it("skips the header row and blank-name rows", () => {
    const blankNameRow = [
      2,
      "FY 22-23",
      "2022-04-30",
      "   ",
      "Designation",
      "Altus Corp",
      20,
      0,
      4,
      0,
      0,
      0,
      0,
      30,
      24,
    ];
    const rows = mapSummaryRows([HEADER_ROW, blankNameRow, SAMPADA_ROW]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.employeeName).toBe("Sampada More");
  });

  it("skips rows with an unparseable month", () => {
    const badMonthRow = [
      3,
      "FY 22-23",
      "garbage",
      "Someone Else",
      "Designation",
      "Altus Corp",
      20,
      0,
      4,
      0,
      0,
      0,
      0,
      30,
      24,
    ];
    expect(mapSummaryRows([HEADER_ROW, badMonthRow])).toHaveLength(0);
  });

  it("accepts a JS Date in the month column and coerces numbers/blanks", () => {
    const dateRow = [
      4,
      "FY 25-26",
      new Date(Date.UTC(2026, 3, 30)),
      "Date Person",
      "",
      null,
      "22",
      null,
      4,
      0,
      0,
      0,
      0,
      30,
      26,
    ];
    const [row] = mapSummaryRows([HEADER_ROW, dateRow]);
    expect(row?.month).toBe("2026-04");
    expect(row?.present).toBe(22);
    expect(row?.holiday).toBe(0);
    expect(row?.designation).toBeNull();
    expect(row?.entity).toBeNull();
  });
});
