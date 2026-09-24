import { describe, it, expect } from "vitest";
import {
  byFrequency,
  computeComplianceDashboard,
  computeKpis,
  computePeople,
  isDue,
  isLate,
  minutesLoad,
  mostMissed,
  statusBreakdown,
} from "@/lib/compliance/dashboard";
import type { ComplianceRow } from "@/lib/compliance/rows";

/**
 * THE DASHBOARD'S ARITHMETIC.
 *
 * These numbers are read as a judgement of people, so the cases that matter are
 * the ones where a careless fold would quietly libel somebody: counting work
 * that is not due yet, treating Abandoned as Done, or scoring a person 0%
 * because nothing was asked of them in the window.
 */

/** A row with everything switched off; each test turns on only what it means. */
function row(over: Partial<ComplianceRow> = {}): ComplianceRow {
  return {
    ownerId: "p1",
    ownerName: "Asha",
    doerStatus: null,
    variance: null,
    minutes: null,
    notYetOpen: false,
    carried: false,
    lapsed: false,
    title: "A compliance",
    schedule: "Mon to Sat",
    ...over,
  } as ComplianceRow;
}

describe("isDue — what counts as this window's workload", () => {
  it("excludes a compliance whose period has not begun", () => {
    // Counting it would make everyone look behind on work nobody has asked for.
    expect(isDue(row({ notYetOpen: true }))).toBe(false);
  });

  it("includes an ordinary open row", () => {
    expect(isDue(row())).toBe(true);
  });
});

describe("isLate — filled, but after the deadline", () => {
  it("is late when a done row closed past its deadline", () => {
    expect(isLate(row({ doerStatus: "done", variance: 3 }))).toBe(true);
  });

  it("is NOT late when it closed on or before the deadline", () => {
    expect(isLate(row({ doerStatus: "done", variance: 0 }))).toBe(false);
    expect(isLate(row({ doerStatus: "done", variance: -2 }))).toBe(false);
  });

  it("is NOT late when the row was never done, however old it is", () => {
    // An unfilled row is Not Filled; calling it "late" would double-count it.
    expect(isLate(row({ doerStatus: null, variance: 9 }))).toBe(false);
  });

  it("treats a done row with no measurable variance as on time", () => {
    // Null variance is absence of evidence, not evidence of lateness — and
    // on-time + late must add up to done.
    const k = computeKpis([row({ doerStatus: "done", variance: null })]);
    expect(k.onTime + k.late).toBe(k.done);
    expect(k.late).toBe(0);
  });
});

describe("computeKpis", () => {
  it("counts nothing, and divides by nothing, without producing NaN", () => {
    const k = computeKpis([]);
    expect(k.due).toBe(0);
    expect(k.ratePct).toBe(0);
    expect(k.onTimePct).toBe(0);
  });

  it("does not let a not-yet-open row inflate the denominator", () => {
    const k = computeKpis([row({ doerStatus: "done" }), row({ notYetOpen: true })]);
    expect(k.due).toBe(1);
    expect(k.ratePct).toBe(100);
  });

  it("never scores Abandoned as Done", () => {
    // Abandoned is accounted for — not carried, not lapsed — but it is not an
    // achievement and must not lift the compliance rate.
    const k = computeKpis([row({ doerStatus: "abandoned" }), row({ doerStatus: "done" })]);
    expect(k.done).toBe(1);
    expect(k.abandoned).toBe(1);
    expect(k.ratePct).toBe(50);
  });

  it("counts an unfilled row that is also carried on BOTH counts", () => {
    // They are states of different things — the status, and the row's clock —
    // so they are independent tallies rather than slices of one pie.
    const k = computeKpis([row({ doerStatus: null, carried: true })]);
    expect(k.notFilled).toBe(1);
    expect(k.carried).toBe(1);
  });

  it("sums compliance minutes, treating an unset Mins as zero", () => {
    const k = computeKpis([row({ minutes: 30 }), row({ minutes: null }), row({ minutes: 55 })]);
    expect(k.minutes).toBe(85);
  });

  it("rounds the rate to a whole percent", () => {
    const k = computeKpis([row({ doerStatus: "done" }), row(), row()]);
    expect(k.ratePct).toBe(33);
  });
});

describe("computePeople — the leaderboard", () => {
  it("omits somebody with nothing due rather than scoring them 0%", () => {
    // A person who was asked for nothing is not a bad performer; a red 0% row
    // would draw the eye to a non-event.
    const people = computePeople([
      row({ ownerId: "a", ownerName: "Asha", doerStatus: "done" }),
      row({ ownerId: "b", ownerName: "Bala", notYetOpen: true }),
    ]);
    expect(people.map((p) => p.ownerId)).toEqual(["a"]);
  });

  it("ranks a bigger clean sheet above a smaller one at the same rate", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => row({ ownerId: "a", ownerName: "Asha", doerStatus: "done" })),
      row({ ownerId: "b", ownerName: "Bala", doerStatus: "done" }),
    ];
    expect(computePeople(rows).map((p) => p.ownerId)).toEqual(["a", "b"]);
  });

  it("sorts by rate first, worst last", () => {
    const rows = [
      row({ ownerId: "a", ownerName: "Asha", doerStatus: null }),
      row({ ownerId: "b", ownerName: "Bala", doerStatus: "done" }),
    ];
    expect(computePeople(rows).map((p) => p.ownerId)).toEqual(["b", "a"]);
  });
});

describe("computeComplianceDashboard — both checklists", () => {
  it("keeps WCC and MCC apart, and folds them for the combined figure", () => {
    const d = computeComplianceDashboard(
      [row({ doerStatus: "done" })],
      [row({ doerStatus: null })],
    );
    expect(d.wcc.due).toBe(1);
    expect(d.mcc.due).toBe(1);
    expect(d.combined.due).toBe(2);
    expect(d.combined.ratePct).toBe(50);
  });

  it("scores a person across BOTH checklists in one row", () => {
    // Splitting the leaderboard would let somebody look diligent on the weekly
    // board while never filling a monthly one.
    const d = computeComplianceDashboard(
      [row({ ownerId: "a", ownerName: "Asha", doerStatus: "done" })],
      [row({ ownerId: "a", ownerName: "Asha", doerStatus: null })],
    );
    expect(d.people).toHaveLength(1);
    expect(d.people[0]).toMatchObject({ ownerId: "a", due: 2, done: 1, ratePct: 50 });
  });
});


describe("statusBreakdown — the Doer Status column, counted", () => {
  it("presents untouched rows as Not Read", () => {
    // Reminder logic still distinguishes a null database value, but the board
    // intentionally has no separate Not Filled status or dashboard slice.
    const out = statusBreakdown([row({ doerStatus: null }), row({ doerStatus: "dont_know" })]);
    expect(out).toEqual([{ status: "dont_know", label: "Not Read", count: 2 }]);
  });

  it("drops statuses nobody is in, rather than plotting empty bars", () => {
    const out = statusBreakdown([row({ doerStatus: "done" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ status: "done", count: 1 });
  });

  it("ignores rows that are not due yet", () => {
    expect(statusBreakdown([row({ notYetOpen: true, doerStatus: "done" })])).toEqual([]);
  });
});

describe("mostMissed — what keeps breaking", () => {
  it("groups by title, so one compliance given to nine people is one row", () => {
    const rows = [
      row({ itemId: "i1", title: "Review the DCC", doerStatus: null }),
      row({ itemId: "i2", title: "Review the DCC", doerStatus: null }),
      row({ itemId: "i3", title: "Review the DCC", doerStatus: "done" }),
    ];
    const out = mostMissed(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "Review the DCC", missed: 2, due: 3 });
  });

  it("does not count Abandoned as missed — it was a decision", () => {
    expect(mostMissed([row({ doerStatus: "abandoned" })])).toEqual([]);
  });

  it("omits compliances that were never missed", () => {
    expect(mostMissed([row({ doerStatus: "done" })])).toEqual([]);
  });

  it("breaks a tie on count by the worse rate", () => {
    // 2 missed of 2 is a worse story than 2 missed of 10, and ranks above it.
    const rows = [
      ...Array.from({ length: 2 }, () => row({ title: "Small", doerStatus: null })),
      ...Array.from({ length: 2 }, () => row({ title: "Big", doerStatus: null })),
      ...Array.from({ length: 8 }, () => row({ title: "Big", doerStatus: "done" })),
    ];
    expect(mostMissed(rows).map((m) => m.title)).toEqual(["Small", "Big"]);
  });

  it("honours the limit", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ title: `C${i}`, doerStatus: null }));
    expect(mostMissed(rows, 5)).toHaveLength(5);
  });
});

describe("minutesLoad — workload, not performance", () => {
  it("sums Mins per person, heaviest first", () => {
    const out = minutesLoad([
      row({ ownerId: "a", ownerName: "Asha", minutes: 30 }),
      row({ ownerId: "a", ownerName: "Asha", minutes: 25 }),
      row({ ownerId: "b", ownerName: "Bala", minutes: 90 }),
    ]);
    expect(out.map((l) => [l.ownerName, l.minutes])).toEqual([["Bala", 90], ["Asha", 55]]);
  });

  it("omits people with no Mins recorded instead of showing them at zero", () => {
    // A zero bar would read as "does nothing", which is not what a missing
    // Mins value means.
    expect(minutesLoad([row({ ownerId: "a", minutes: null })])).toEqual([]);
  });
});

describe("byFrequency — which cadence people cannot keep", () => {
  it("rates each schedule and puts the worst first", () => {
    const rows = [
      row({ schedule: "Mon to Sat", doerStatus: "done" }),
      row({ schedule: "Mon to Sat", doerStatus: "done" }),
      row({ schedule: "Quarterly", doerStatus: null }),
      row({ schedule: "Quarterly", doerStatus: "done" }),
    ];
    const out = byFrequency(rows);
    expect(out.map((f) => f.schedule)).toEqual(["Quarterly", "Mon to Sat"]);
    expect(out[0]).toMatchObject({ ratePct: 50, done: 1, due: 2 });
    expect(out[1]).toMatchObject({ ratePct: 100 });
  });

  it("labels a blank schedule rather than dropping the rows", () => {
    expect(byFrequency([row({ schedule: "" })])[0]?.schedule).toBe("—");
  });
});

describe("computeComplianceDashboard — the assembled page data", () => {
  it("takes the minutes load from WCC only", () => {
    // Mins is a WCC column; folding MCC in would add zeroes and make the
    // weekly load look lighter than it is.
    const d = computeComplianceDashboard(
      [row({ ownerId: "a", ownerName: "Asha", minutes: 20 })],
      [row({ ownerId: "b", ownerName: "Bala", minutes: 999 })],
    );
    expect(d.minutesLoad.map((l) => l.ownerName)).toEqual(["Asha"]);
  });

  it("builds every section from the same combined rows", () => {
    const d = computeComplianceDashboard([row({ doerStatus: "done" })], [row({ doerStatus: null })]);
    expect(d.status.reduce((n, s) => n + s.count, 0)).toBe(d.combined.due);
    expect(d.byFrequency.reduce((n, f) => n + f.due, 0)).toBe(d.combined.due);
  });
});
