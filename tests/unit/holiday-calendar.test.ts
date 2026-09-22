import { describe, it, expect } from "vitest";
import {
  carouselNeighbours,
  groupByMonth,
  mergeCalendar,
  monthsWithHolidays,
  printYearFor,
  quartersOfYear,
  resolveCarouselMonth,
  upcomingFrom,
  yearsInRange,
  workingYearOf,
  workingYearSpan,
  workingYearsWithHolidays,
  holidaysInWorkingYear,
  resolveWorkingYear,
  type CalendarHoliday,
} from "@/lib/hr/holiday-calendar";

// 15 Sep 2026: Ganpati Day 1 (14-Sep) has just passed, 23-Sep is still ahead.
const TODAY = "2026-09-15";

describe("mergeCalendar", () => {
  it("merges published and ad-hoc days, one per date, sorted", () => {
    const list = mergeCalendar([2026], [{ holidayDate: "2026-09-30", label: "Office Offsite" }]);
    const isos = list.map((h) => h.iso);
    expect(isos).toEqual([...isos].sort());
    const offsite = list.find((h) => h.iso === "2026-09-30");
    expect(offsite?.adHoc).toBe(true);
    expect(offsite?.day).toBe("Wednesday");
  });

  it("lets the published name win when an ad-hoc row repeats a published date", () => {
    const list = mergeCalendar([2026], [{ holidayDate: "2026-01-26", label: "Duplicate" }]);
    const day = list.filter((h) => h.iso === "2026-01-26");
    expect(day).toHaveLength(1);
    expect(day[0]?.name).toBe("Republic Day");
    expect(day[0]?.adHoc).toBe(false);
  });
});

describe("upcomingFrom", () => {
  it("hides past holidays and keeps today's", () => {
    const list = mergeCalendar([2026], [{ holidayDate: TODAY, label: "Today Off" }]);
    const up = upcomingFrom(list, TODAY);
    expect(up.every((h) => h.iso >= TODAY)).toBe(true);
    expect(up.some((h) => h.iso === TODAY)).toBe(true);
    expect(up.some((h) => h.iso === "2026-09-14")).toBe(false);
  });
});

describe("carousel months", () => {
  const up = upcomingFrom(mergeCalendar([2026, 2027], []), TODAY);
  const months = monthsWithHolidays(up);

  it("only lists months that have an upcoming holiday", () => {
    for (const m of months) {
      expect(up.some((h) => h.year === m.year && h.month === m.month)).toBe(true);
    }
  });

  it("snaps an empty or past month forward to the next month with holidays", () => {
    expect(resolveCarouselMonth({ year: 2026, month: 8 }, months)).toEqual(months[0]);
    expect(resolveCarouselMonth(null, months)).toEqual(months[0]);
  });

  it("clamps a month past the last holiday to the last month", () => {
    expect(resolveCarouselMonth({ year: 2099, month: 1 }, months)).toEqual(months[months.length - 1]);
    expect(resolveCarouselMonth({ year: 2026, month: 9 }, [])).toBeNull();
  });

  it("steps across the year boundary without stopping on empty months", () => {
    const lastOf2026 = [...months].reverse().find((m) => m.year === 2026)!;
    const { prev, next } = carouselNeighbours(months, lastOf2026);
    expect(next?.year).toBe(2027);
    expect(prev === null || prev.year === 2026).toBe(true);
    expect(carouselNeighbours(months, months[0]!).prev).toBeNull();
  });

  it("groups the All upcoming view by month", () => {
    const groups = groupByMonth(up);
    expect(groups.map((g) => g.key)).toEqual(months);
    expect(groups.reduce((n, g) => n + g.holidays.length, 0)).toBe(up.length);
  });
});

describe("print year", () => {
  it("prints today's calendar year, clamped to the published range", () => {
    expect(printYearFor(TODAY)).toBe(2026);
    expect(printYearFor("2020-05-01")).toBe(2026);
    expect(printYearFor("2031-05-01")).toBe(2028);
  });

  it("puts past and ad-hoc days of that year into quarters", () => {
    const list = mergeCalendar([2026], [{ holidayDate: "2026-02-02", label: "Ad-hoc" }]);
    const quarters = quartersOfYear(list, 2026);
    const all = quarters.flatMap((q) => q.holidays.map((h) => h.iso));
    expect(all).toContain("2026-01-26");
    expect(all).toContain("2026-02-02");
    expect(quarters[0]?.span).toBe("Jan – Mar");
  });
});

describe("yearsInRange", () => {
  it("lists every calendar year a range touches", () => {
    expect(yearsInRange("2026-11-01", "2028-02-01")).toEqual([2026, 2027, 2028]);
    expect(yearsInRange("2027-01-01", "2026-01-01")).toEqual([]);
  });
});

describe("working years run April to March", () => {
  it("puts January–March in the previous working year", () => {
    expect(workingYearOf("2027-01-26")).toBe(2026);
    expect(workingYearOf("2027-03-31")).toBe(2026);
  });

  it("starts the new working year on 1 April", () => {
    expect(workingYearOf("2027-04-01")).toBe(2027);
    expect(workingYearOf("2026-12-31")).toBe(2026);
  });

  it("labels the span the tab covers", () => {
    expect(workingYearSpan(2026)).toBe("Apr 2026 – Mar 2027");
  });

  it("finds the working years that have holidays, and filters to one", () => {
    const list = [
      { iso: "2026-12-31" },
      { iso: "2027-01-26" },
      { iso: "2027-04-14" },
    ] as unknown as CalendarHoliday[];
    expect(workingYearsWithHolidays(list)).toEqual([2026, 2027]);
    expect(holidaysInWorkingYear(list, 2026).map((h) => h.iso)).toEqual(["2026-12-31", "2027-01-26"]);
  });

  it("falls back to the first working year when the requested one is empty", () => {
    expect(resolveWorkingYear(2030, [2026, 2027])).toBe(2026);
    expect(resolveWorkingYear(2027, [2026, 2027])).toBe(2027);
    expect(resolveWorkingYear(null, [])).toBeNull();
  });
});
