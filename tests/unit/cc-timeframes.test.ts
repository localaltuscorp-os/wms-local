import { describe, expect, it } from "vitest";
import {
  ccMonthKeys,
  ccDayLabel,
  ccPeriodColumns,
  ccPeriodKind,
  ccTimeframe,
} from "@/lib/compliance/cc-timeframes";

describe("Employees Compliance Checklist timeframes", () => {
  it("defaults an unknown view to the current daily checklist", () => {
    expect(ccTimeframe(undefined)).toBe("daily");
    expect(ccTimeframe("not-a-view")).toBe("daily");
    expect(ccTimeframe("consolidated")).toBe("consolidated");
  });

  it("builds exactly the requested tracking columns", () => {
    const date = "2026-10-01";
    expect(ccPeriodColumns("daily", date, 2026).map((p) => p.label)).toEqual([
      "THU",
    ]);
    expect(ccPeriodColumns("daily", date, 2026)[0]?.detail).toBe("01-Oct-2026");
    expect(ccDayLabel(date)).toBe("Thu · 01-Oct-2026");
    expect(ccPeriodColumns("weekly", date, 2026).map((p) => p.label)).toEqual([
      "WK-1",
      "WK-2",
      "WK-3",
      "WK-4",
      "WK-5",
      "WK-6",
      "WK-7",
    ]);
    expect(ccPeriodColumns("monthly", date, 2026).map((p) => p.label)).toEqual([
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ]);
    expect(ccPeriodColumns("quarterly", date, 2026).map((p) => p.label)).toEqual([
      "Q1", "Q2", "Q3", "Q4",
    ]);
    expect(ccPeriodColumns("half_yearly", date, 2026).map((p) => p.label)).toEqual([
      "H1", "H2",
    ]);
    expect(ccPeriodColumns("yearly", date, 2026).map((p) => p.label)).toEqual([
      "FULL YEAR",
    ]);
  });

  it("keeps CC data separated from the pre-existing WCC and MCC cells", () => {
    expect(ccPeriodKind("daily")).toBe("daily");
    expect(ccPeriodKind("half_yearly")).toBe("half_yearly");
    expect(ccMonthKeys(2026)).toHaveLength(12);
    expect(ccMonthKeys(2026)[0]).toBe("2026-01");
    expect(ccMonthKeys(2026)[11]).toBe("2026-12");
  });
});
