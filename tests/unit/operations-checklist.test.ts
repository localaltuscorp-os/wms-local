import { describe, it, expect } from "vitest";
import {
  CHECK_STATUSES,
  DEFAULT_STATUS,
  checkStatusLabel,
  checklistProgress,
  isCheckStatus,
  isRuledOut,
  isRunStatus,
  readCheckStatus,
  type CheckStatus,
} from "@/lib/operations/checklist";
import {
  OFFSET_MAX,
  OFFSET_MIN,
  PHASE_LABELS,
  addDays,
  compareRows,
  daysBetween,
  formatDMY,
  formatOffset,
  isSunday,
  parseOffset,
  phaseFor,
  targetDate,
  variance,
} from "@/lib/operations/checklist-dates";

/**
 * THE DATE ARITHMETIC IS THE FEATURE.
 *
 * Every deadline on an event checklist is one number — the event date — plus an
 * offset, so a single off-by-one here moves every task in the company's
 * biggest event by a day. These pin the cases that actually break: month ends,
 * leap years, and the timezone shift that only shows up on somebody else's
 * machine.
 */
describe("targetDate", () => {
  it("adds the offset to the event date", () => {
    expect(targetDate("2026-03-14", -3)).toBe("2026-03-11");
    expect(targetDate("2026-03-14", 0)).toBe("2026-03-14");
    expect(targetDate("2026-03-14", 7)).toBe("2026-03-21");
  });

  it("crosses a month boundary backwards", () => {
    expect(targetDate("2026-03-02", -5)).toBe("2026-02-25");
  });

  it("crosses a leap-year February", () => {
    // 2028 is a leap year, so 29 Feb exists and -3 from 2 March is 28 Feb.
    expect(targetDate("2028-03-02", -3)).toBe("2028-02-28");
    expect(targetDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("crosses a non-leap February", () => {
    expect(targetDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("crosses a year boundary", () => {
    expect(targetDate("2026-01-02", -5)).toBe("2025-12-28");
  });

  it("is null without both an event date and an offset", () => {
    // An undated row must stay visibly undated — defaulting it to the event day
    // would quietly claim it happens during the event.
    expect(targetDate(null, -3)).toBeNull();
    expect(targetDate("2026-03-14", null)).toBeNull();
  });

  it("does not shift under a different host timezone", () => {
    // The bug this guards: routing a `date` column through a JS Date turns
    // 14/03 into 13/03 for anyone running west of IST, and it only appears on
    // someone else's machine. The dates below are strings end to end.
    const saved = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(targetDate("2026-03-14", -3)).toBe("2026-03-11");
      process.env.TZ = "Pacific/Kiritimati";
      expect(targetDate("2026-03-14", -3)).toBe("2026-03-11");
    } finally {
      process.env.TZ = saved;
    }
  });
});

describe("phaseFor", () => {
  it("splits purely on the sign of the offset", () => {
    expect(phaseFor(-14)).toBe("before");
    expect(phaseFor(-1)).toBe("before");
    expect(phaseFor(0)).toBe("during");
    expect(phaseFor(1)).toBe("after");
    expect(phaseFor(30)).toBe("after");
  });

  it("treats a missing offset as undated, NOT as the event day", () => {
    expect(phaseFor(null)).toBe("undated");
    expect(phaseFor(undefined)).toBe("undated");
  });

  it("names all four groups", () => {
    expect(PHASE_LABELS.before).toBe("Before Event");
    expect(PHASE_LABELS.during).toBe("During Event");
    expect(PHASE_LABELS.after).toBe("After Event");
    expect(PHASE_LABELS.undated).toBe("Undated");
  });
});

describe("variance", () => {
  const TODAY = "2026-03-20";

  it("is positive when late and negative when early", () => {
    expect(variance("2026-03-11", "2026-03-13")).toBe(2);
    expect(variance("2026-03-11", "2026-03-10")).toBe(-1);
  });

  it("is zero on the day", () => {
    expect(variance("2026-03-11", "2026-03-11")).toBe(0);
  });

  it("reports running lateness on an open row whose target has passed", () => {
    // A three-day-overdue task must not look identical to one not yet due —
    // seeing slippage before it is final is the whole point of the column.
    expect(variance("2026-03-17", null, TODAY)).toBe(3);
  });

  it("shows nothing for an open row that is not yet due", () => {
    expect(variance("2026-03-25", null, TODAY)).toBeNull();
    expect(variance("2026-03-20", null, TODAY)).toBeNull();
  });

  it("shows nothing without a target", () => {
    expect(variance(null, "2026-03-13")).toBeNull();
  });
});

describe("parseOffset", () => {
  it("accepts the three ways people type a signed day count", () => {
    expect(parseOffset("-3")).toBe(-3);
    expect(parseOffset("3")).toBe(3);
    expect(parseOffset("+3")).toBe(3);
    expect(parseOffset(0)).toBe(0);
  });

  it("reads blank as undated, not as zero", () => {
    expect(parseOffset("")).toBeNull();
    expect(parseOffset("   ")).toBeNull();
    expect(parseOffset(null)).toBeNull();
  });

  it("refuses junk and non-integers", () => {
    expect(parseOffset("abc")).toBeNull();
    expect(parseOffset("1.5")).toBeNull();
  });

  it("refuses an offset beyond a year either way — that is a typo", () => {
    expect(parseOffset(String(OFFSET_MIN - 1))).toBeNull();
    expect(parseOffset(String(OFFSET_MAX + 1))).toBeNull();
    expect(parseOffset(String(OFFSET_MIN))).toBe(OFFSET_MIN);
    expect(parseOffset(String(OFFSET_MAX))).toBe(OFFSET_MAX);
  });
});

describe("formatting", () => {
  it("writes dates the way the business does", () => {
    expect(formatDMY("2026-03-14")).toBe("14/03/2026");
    expect(formatDMY("2026-01-02")).toBe("02/01/2026");
    expect(formatDMY(null)).toBe("—");
  });

  it("signs the offset so its direction is never ambiguous", () => {
    expect(formatOffset(-3)).toBe("-3");
    expect(formatOffset(0)).toBe("0");
    expect(formatOffset(5)).toBe("+5");
    expect(formatOffset(null)).toBe("—");
  });
});

describe("addDays / daysBetween", () => {
  it("round-trips", () => {
    const from = "2026-03-14";
    const to = addDays(from, 17);
    expect(daysBetween(from, to)).toBe(17);
  });

  it("counts backwards", () => {
    expect(daysBetween("2026-03-14", "2026-03-11")).toBe(-3);
  });
});

describe("isSunday", () => {
  it("spots a target landing on the default weekly off", () => {
    // 15 March 2026 is a Sunday; the 14th is a Saturday.
    expect(isSunday("2026-03-15")).toBe(true);
    expect(isSunday("2026-03-14")).toBe(false);
    expect(isSunday(null)).toBe(false);
  });
});

describe("compareRows", () => {
  it("orders by offset, then manual order, then title", () => {
    const rows = [
      { offsetDays: 1, sortOrder: 10, title: "after" },
      { offsetDays: -3, sortOrder: 20, title: "early b" },
      { offsetDays: -3, sortOrder: 10, title: "early a" },
      { offsetDays: 0, sortOrder: 10, title: "on the day" },
    ];
    expect([...rows].sort(compareRows).map((r) => r.title)).toEqual([
      "early a",
      "early b",
      "on the day",
      "after",
    ]);
  });

  it("sorts undated rows to the end", () => {
    const rows = [
      { offsetDays: null, sortOrder: 1, title: "undated" },
      { offsetDays: 5, sortOrder: 99, title: "dated" },
    ];
    expect([...rows].sort(compareRows).map((r) => r.title)).toEqual(["dated", "undated"]);
  });
});

describe("checklistProgress", () => {
  const rows = (status: CheckStatus, n: number, approverStatus: string | null = null) =>
    Array.from({ length: n }, () => ({ status, approverStatus }));

  it("excludes rows the approver cancelled or archived from the denominator", () => {
    // Ten items, four of which were called off, is six items of real work.
    const p = checklistProgress([
      ...rows("done", 3),
      ...rows("not_started", 3),
      ...rows("not_started", 3, "cancelled"),
      ...rows("initiated", 1, "archived"),
    ]);
    expect(p.done).toBe(3);
    expect(p.total).toBe(6);
    expect(p.ruledOut).toBe(4);
    expect(p.pct).toBe(50);
  });

  it("reads a checklist with nothing left to do as complete, not as zero", () => {
    expect(checklistProgress(rows("not_started", 2, "cancelled")).pct).toBe(100);
  });

  it("is 100% when everything is done", () => {
    expect(checklistProgress(rows("done", 2)).pct).toBe(100);
  });

  it("counts only Done as done — Initiated and Follow Up are still open", () => {
    const p = checklistProgress([...rows("initiated", 1), ...rows("follow_up", 1), ...rows("done", 2)]);
    expect(p).toMatchObject({ done: 2, total: 4, pct: 50 });
  });
});

describe("the Doer Status vocabulary", () => {
  it("is the WMS Tasks six, and a fresh row is Not Started", () => {
    expect([...CHECK_STATUSES]).toEqual([
      "dont_know",
      "not_started",
      "initiated",
      "follow_up",
      "need_info",
      "done",
    ]);
    expect(DEFAULT_STATUS).toBe("not_started");
    expect(checkStatusLabel("dont_know")).toBe("Not Read");
    expect(checkStatusLabel("need_info")).toBe("Need Info");
  });

  it("still reads the words stored before migration 0237", () => {
    // A database that has not run 0237 must show its rows, not reset them.
    expect(readCheckStatus("Pending")).toBe("not_started");
    expect(readCheckStatus("Done")).toBe("done");
    expect(readCheckStatus("Need Help")).toBe("need_info");
    expect(readCheckStatus("Not Applicable")).toBe("not_started");
    expect(readCheckStatus("initiated")).toBe("initiated");
    expect(readCheckStatus(null)).toBe("not_started");
    expect(readCheckStatus("gibberish")).toBe("not_started");
  });

  it("guards its own type", () => {
    expect(isCheckStatus("done")).toBe(true);
    expect(isCheckStatus("Done")).toBe(false);
    expect(isCheckStatus(null)).toBe(false);
    expect(isRunStatus("active")).toBe(true);
    expect(isRunStatus("archived")).toBe(false);
  });

  it("treats Cancelled and Archived as ruled out, and nothing else", () => {
    expect(isRuledOut("cancelled")).toBe(true);
    expect(isRuledOut("archived")).toBe(true);
    expect(isRuledOut("on_hold")).toBe(false);
    expect(isRuledOut(null)).toBe(false);
  });
});
