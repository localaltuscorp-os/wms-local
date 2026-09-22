import { describe, it, expect } from "vitest";
import {
  SP1_CALC_ROWS,
  SP1_DISPOSITIONS,
  SP1_LABEL,
  SP1_TONE,
  asRatio,
  buildSp1Grid,
  describeDay,
  emptyCounts,
  formatCalc,
  isConnected,
  isSp1Disposition,
  metricsOf,
  mondayOf,
  pct,
  shiftDays,
  sp1WorkingDays,
  type Sp1LogRow,
} from "@/lib/dcc/sp1";

/**
 * SP1 (DCC-SPEC §7, §8). Band membership IS the formula — every figure below the
 * fifteen rows is derived from which band an outcome sits in — so these pin the
 * bands, the totals, the week shape and, above all, what happens on a day with
 * no calls.
 */

describe("the row vocabulary", () => {
  it("is the fifteen outcomes, in sheet order", () => {
    expect(SP1_DISPOSITIONS.map((d) => SP1_LABEL[d])).toEqual([
      "Registered",
      "Registered for Next",
      "Verbal Yes",
      "Tentative",
      "Tentative for Next",
      "Call for Next",
      "I will get back if I want",
      "Not Interested",
      "DND",
      "Past Attended",
      "Old Gratuate",
      "No Busy",
      "Ringing",
      "Call Back",
      "Wrong Number",
    ]);
  });

  it("keeps the sheet's spelling of Old Gratuate", () => {
    // Read side by side with the Google Sheet it replaces. A silent correction
    // would make one row look like two different rows across the two documents.
    expect(SP1_LABEL.old_graduate).toBe("Old Gratuate");
  });

  it("gives each outcome the sheet's colour band", () => {
    const byTone = (t: string) => SP1_DISPOSITIONS.filter((d) => SP1_TONE[d] === t);
    expect(byTone("won")).toEqual(["registered", "registered_next", "verbal_yes"]);
    expect(byTone("warm")).toEqual(["tentative", "tentative_next"]);
    expect(byTone("later")).toEqual(["call_next"]);
    expect(byTone("soft")).toEqual(["get_back"]);
    expect(byTone("dead")).toEqual(["not_interested", "dnd"]);
    expect(byTone("past")).toEqual(["past_attended", "old_graduate"]);
    expect(byTone("plain")).toEqual(["no_busy", "ringing", "call_back"]);
    expect(byTone("bad")).toEqual(["wrong_number"]);
  });

  it("rejects an outcome it does not know", () => {
    expect(isSp1Disposition("registered")).toBe(true);
    expect(isSp1Disposition("call_transferred")).toBe(false);
  });
});

describe("Connected is rows 1 to 11", () => {
  it("counts a person who answered, whatever they then said", () => {
    expect(isConnected("not_interested")).toBe(true);
    expect(isConnected("dnd")).toBe(true);
    expect(isConnected("old_graduate")).toBe(true);
  });

  it("does not count a call that reached nobody", () => {
    expect(isConnected("no_busy")).toBe(false);
    expect(isConnected("ringing")).toBe(false);
    expect(isConnected("call_back")).toBe(false);
    // Reached the wrong person, which bought nothing.
    expect(isConnected("wrong_number")).toBe(false);
  });

  it("partitions all fifteen with nothing left over", () => {
    const connected = SP1_DISPOSITIONS.filter(isConnected);
    const not = SP1_DISPOSITIONS.filter((d) => !isConnected(d));
    expect(connected).toHaveLength(11);
    expect(not).toHaveLength(4);
    expect(connected.length + not.length).toBe(SP1_DISPOSITIONS.length);
  });
});

describe("the calculated block", () => {
  const counts = emptyCounts();
  counts.registered = 3;
  counts.verbal_yes = 4;
  counts.tentative = 8;
  counts.not_interested = 10;
  counts.ringing = 12;
  counts.no_busy = 3;
  // connected = 3 + 4 + 8 + 10 = 25 · couldNotConnect = 15 · total = 40

  it("totals calls, connected and could-not-connect", () => {
    const m = metricsOf(counts);
    expect(m.connected).toBe(25);
    expect(m.couldNotConnect).toBe(15);
    expect(m.totalCalls).toBe(40);
  });

  it("computes the five ratios", () => {
    const m = metricsOf(counts);
    expect(pct(m.connectedRatio)).toBe("62.5%");
    expect(pct(m.notConnectedRatio)).toBe("37.5%");
    expect(asRatio(m.connectedToNotConnected)).toBe("1.67 : 1");
    expect(pct(m.registeredToConnected)).toBe("12.0%"); // 3 / 25
    expect(pct(m.tentativeToConnected)).toBe("32.0%"); // 8 / 25
  });

  it("measures Registered alone, not the whole green band", () => {
    // Folding "Verbal Yes" in would quietly inflate the conversion measure.
    const m = metricsOf(counts);
    expect(m.registeredToConnected).toBeCloseTo(3 / 25);
  });

  it("is the eight rows the sheet numbers 16 to 23", () => {
    expect(SP1_CALC_ROWS.map((r) => r.label)).toEqual([
      "Total Calls",
      "Connected",
      "Could Not Connected",
      "Connected Ratio",
      "Not Connected Ratio",
      "Connected to Not Connected Ratio",
      "Registered to Connected Ratio",
      "Tentative to Connected Ratio",
    ]);
    expect(SP1_DISPOSITIONS.length + SP1_CALC_ROWS.length).toBe(23);
  });

  it("formats each row the way its kind is read", () => {
    const m = metricsOf(counts);
    expect(formatCalc(SP1_CALC_ROWS[0], m)).toBe("40");
    expect(formatCalc(SP1_CALC_ROWS[3], m)).toBe("62.5%");
    expect(formatCalc(SP1_CALC_ROWS[5], m)).toBe("1.67 : 1");
  });
});

describe("a day with no calls", () => {
  it("shows an em-dash, never 0% and never NaN", () => {
    /* 0% is the damaging one: it reports a real failure on a day nobody worked,
       and would then be averaged into the weekly total and the ranking. */
    const m = metricsOf(emptyCounts());
    expect(m.totalCalls).toBe(0);
    expect(m.connectedRatio).toBeNull();
    expect(m.registeredToConnected).toBeNull();
    expect(pct(m.connectedRatio)).toBe("—");
    expect(asRatio(m.connectedToNotConnected)).toBe("—");
  });

  it("shows an em-dash when only the denominator is zero", () => {
    // Calls were made, none connected: the total is real, the per-connected
    // ratios have nothing to divide by.
    const c = emptyCounts();
    c.ringing = 9;
    const m = metricsOf(c);
    expect(m.totalCalls).toBe(9);
    expect(pct(m.connectedRatio)).toBe("0.0%"); // a real zero — 0 of 9
    expect(pct(m.registeredToConnected)).toBe("—"); // no denominator
    expect(asRatio(m.connectedToNotConnected)).toBe("0.00 : 1");
  });
});

describe("the week", () => {
  // 2026-09-14 is a Monday on the real calendar.
  it("runs Monday to Saturday and omits Sunday", () => {
    const days = sp1WorkingDays("2026-09-14", 1);
    expect(days).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
    expect(days).not.toContain("2026-09-20"); // the Sunday
    expect(describeDay(days[0]!).weekday).toBe("Monday");
    expect(describeDay(days[5]!).weekday).toBe("Saturday");
  });

  it("starts from the Monday of whatever day it is handed", () => {
    // A Wednesday anchor still produces that week, not three days of it.
    expect(sp1WorkingDays("2026-09-16", 1)[0]).toBe("2026-09-14");
    expect(mondayOf("2026-09-16")).toBe("2026-09-14");
  });

  it("treats Sunday as belonging to the week that just ended", () => {
    expect(mondayOf("2026-09-20")).toBe("2026-09-14");
  });

  it("walks consecutive days across a month boundary", () => {
    expect(shiftDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("names the date the way the sheet does", () => {
    expect(describeDay("2026-09-14")).toEqual({ label: "14-Sep-2026", weekday: "Monday" });
  });
});

describe("the grid", () => {
  const rows: Sp1LogRow[] = [
    { employeeId: "a", logDate: "2026-09-14", disposition: "registered", count: 2 },
    { employeeId: "b", logDate: "2026-09-14", disposition: "registered", count: 3 },
    { employeeId: "a", logDate: "2026-09-15", disposition: "ringing", count: 7 },
    { employeeId: "a", logDate: "2026-09-99", disposition: "registered", count: 99 },
  ];

  it("gives every working day a column and closes the week with a total", () => {
    const cols = buildSp1Grid(sp1WorkingDays("2026-09-14", 1), rows);
    expect(cols.map((c) => c.label)).toEqual([
      "14-Sep-2026",
      "15-Sep-2026",
      "16-Sep-2026",
      "17-Sep-2026",
      "18-Sep-2026",
      "19-Sep-2026",
      "Weekly Total",
    ]);
    expect(cols.at(-1)!.kind).toBe("total");
  });

  it("closes each week separately across a fortnight", () => {
    const cols = buildSp1Grid(sp1WorkingDays("2026-09-14", 2), rows);
    expect(cols.filter((c) => c.kind === "total")).toHaveLength(2);
    expect(cols).toHaveLength(14); // 6 + total, twice
    expect(cols[6]!.label).toBe("Weekly Total");
  });

  it("gives a day with no rows a column of zeros rather than omitting it", () => {
    // A missing column would silently shorten the week and make a blank day
    // look like it never existed.
    const cols = buildSp1Grid(sp1WorkingDays("2026-09-14", 1), rows);
    expect(cols[2]!.metrics.totalCalls).toBe(0);
    expect(cols[2]!.counts.registered).toBe(0);
  });

  it("sums people into one figure per day", () => {
    const cols = buildSp1Grid(["2026-09-14", "2026-09-15"], rows);
    expect(cols[0]!.counts.registered).toBe(5); // 2 + 3
    expect(cols[1]!.counts.ringing).toBe(7);
  });

  it("ignores rows outside the window", () => {
    const cols = buildSp1Grid(["2026-09-14"], rows);
    expect(cols[0]!.counts.registered).toBe(5);
    expect(cols.at(-1)!.counts.registered).toBe(5); // the bogus date is not in the total
  });

  it("recomputes the weekly ratios from summed counts, not by averaging days", () => {
    /* Averaging percentages weights a 3-call day the same as a 60-call one. */
    const many: Sp1LogRow[] = [
      { employeeId: "a", logDate: "2026-09-14", disposition: "registered", count: 1 },
      { employeeId: "a", logDate: "2026-09-14", disposition: "ringing", count: 1 },
      { employeeId: "a", logDate: "2026-09-15", disposition: "ringing", count: 98 },
    ];
    const cols = buildSp1Grid(["2026-09-14", "2026-09-15"], many);
    // Day 1 is 50% connected, day 2 is 0%. The naive average would be 25%.
    expect(pct(cols[0]!.metrics.connectedRatio)).toBe("50.0%");
    expect(pct(cols[1]!.metrics.connectedRatio)).toBe("0.0%");
    expect(pct(cols.at(-1)!.metrics.connectedRatio)).toBe("1.0%"); // 1 of 100
  });

  it("gives the total column no weekday, so the header keeps its shape", () => {
    const cols = buildSp1Grid(["2026-09-14"], rows);
    expect(cols.at(-1)!.weekday).toBe("");
    expect(cols.at(-1)!.date).toBeNull();
  });
});
