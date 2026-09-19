import { describe, it, expect } from "vitest";
import {
  checkFillWindow,
  isDailyMask,
  mccOccurrences,
  wccOccurrences,
  wccOpenUntil,
  type ComplianceItem,
} from "@/lib/compliance/schedule";
import { mccDeadlinesIn } from "@/lib/compliance/mcc-frequency";
import { buildComplianceRows, summarise, withCarryForward, type FillLike, type Viewer } from "@/lib/compliance/rows";

/**
 * CARRY FORWARD, THEN LAPSE (account holder, 2026-09-19).
 *
 *  · Daily — its own day only: yesterday's Done or Need Info cannot be changed today.
 *  · On chosen days — not Done, carried forward to the day before the next
 *    chosen day, never past Saturday: everything lapses on Sunday.
 *  · MCC — carried forward to the day before the next deadline, the last of
 *    the month to month-end: 1st, 5th, 10th, 15th → 1–4, 5–9, 10–14, 15–end.
 */

// 2026-09-14 is a Monday … 2026-09-20 a Sunday.
const MON = "2026-09-14", TUE = "2026-09-15", WED = "2026-09-16", THU = "2026-09-17", FRI = "2026-09-18", SAT = "2026-09-19", SUN = "2026-09-20";
const bits = (...days: number[]) => days.reduce((m, d) => m | (1 << d), 0); // Monday = 0

describe("how long a WCC row stays open", () => {
  it("a daily one — Mon to Sat, Mon to Sun — only on its own day", () => {
    const monToSat = bits(0, 1, 2, 3, 4, 5);
    const monToSun = bits(0, 1, 2, 3, 4, 5, 6);
    for (const d of [MON, TUE, FRI, SAT]) expect(wccOpenUntil("scheduled", monToSat, d)).toBe(d);
    expect(wccOpenUntil("scheduled", monToSun, SUN)).toBe(SUN);
    expect(wccOpenUntil("scheduled", 0, WED)).toBe(WED); // no days set = every day
    expect([monToSat, monToSun, 0].every(isDailyMask)).toBe(true);
    expect(isDailyMask(bits(0, 2, 4))).toBe(false);
  });

  it("Tue & Fri: Tuesday's carries Wed and Thu and lapses on Friday; Friday's lapses on Sunday", () => {
    const tueFri = bits(1, 4);
    expect(wccOpenUntil("scheduled", tueFri, TUE)).toBe(THU);
    expect(wccOpenUntil("scheduled", tueFri, FRI)).toBe(SAT);
  });

  it("one day a week: carried to Saturday — everything lapses on Sunday", () => {
    expect(wccOpenUntil("scheduled", bits(1), TUE)).toBe(SAT);
    expect(wccOpenUntil("scheduled", bits(5), SAT)).toBe(SAT);
  });

  it("a Sunday row keeps its own day", () => {
    expect(wccOpenUntil("scheduled", bits(6), SUN)).toBe(SUN);
    expect(wccOpenUntil("scheduled", bits(5, 6), SAT)).toBe(SAT);
  });

  it("Mon to Fri picked by day: each day its own, Friday's carried to Saturday", () => {
    const monToFri = bits(0, 1, 2, 3, 4);
    expect(wccOpenUntil("scheduled", monToFri, MON)).toBe(MON);
    expect(wccOpenUntil("scheduled", monToFri, FRI)).toBe(SAT);
  });

  it("an older once-a-week: the week, lapsing on Sunday", () => {
    expect(wccOpenUntil("weekly", 0, SAT)).toBe(SAT);
    expect(wccOpenUntil("weekly", bits(6), SUN)).toBe(SUN);
  });
});

describe("how long an MCC row stays open", () => {
  it("1st, 5th, 10th and 15th: 1st–4th, 5th–9th, 10th–14th, 15th–month-end", () => {
    const open = mccDeadlinesIn({ frequency: "thrice_monthly", days: [1, 5, 10, 15], startMonth: null }, "2026-09");
    expect(open.map((d) => [d.deadline, d.openUntil])).toEqual([
      ["2026-09-01", "2026-09-04"],
      ["2026-09-05", "2026-09-09"],
      ["2026-09-10", "2026-09-14"],
      ["2026-09-15", "2026-09-30"],
    ]);
  });

  it("Monthly: carried to month-end, then it lapses for the month", () => {
    expect(mccDeadlinesIn({ frequency: "monthly", days: [1], startMonth: null }, "2026-09")[0]!.openUntil).toBe("2026-09-30");
    expect(mccDeadlinesIn({ frequency: "monthly", days: [20], startMonth: null }, "2026-02")[0]!.openUntil).toBe("2026-02-28");
  });

  it("Quarterly: carried to the end of the month it is due", () => {
    expect(mccDeadlinesIn({ frequency: "quarterly", days: [15], startMonth: 6 }, "2026-09")[0]!.openUntil).toBe("2026-09-30");
  });
});

describe("the server's check", () => {
  const w = (today: string, canEditPast = false) => checkFillWindow({ opensOn: TUE, openUntil: THU, today, canEditPast });

  it("lets a row be filled while it is open", () => {
    expect(w(TUE)).toEqual({ ok: true });
    expect(w(THU)).toEqual({ ok: true });
  });

  it("refuses a row that has lapsed, and one not open yet", () => {
    expect(w(FRI)).toEqual({ ok: false, error: "This one lapsed on Fri 18 Sep — what was filled can no longer be changed." });
    expect(w(MON)).toEqual({ ok: false, error: "This one is not open yet — it can be filled from Tue 15 Sep." });
  });

  it("lets the past-entry editor correct a lapsed row — but never fill one not open", () => {
    expect(w(FRI, true)).toEqual({ ok: true });
    expect(w(MON, true).ok).toBe(false);
  });
});

/* ── Rows ──────────────────────────────────────────────────────────────── */

const item = (over: Partial<ComplianceItem>): ComplianceItem => ({
  id: "i1",
  ownerEmployeeId: "p1",
  title: "Send the proposals",
  section: null,
  code: null,
  frequency: null,
  weekdays: bits(1, 4), // Tue & Fri
  scheduleKind: "scheduled",
  monthDay: null,
  isParticipantList: false,
  sortOrder: 1,
  createdById: null,
  activeFrom: null,
  ...over,
});

const fill = (over: Partial<FillLike>): FillLike => ({
  itemId: "i1",
  entryDate: TUE,
  status: null,
  doerStatus: null,
  doneAt: null,
  note: null,
  approverStatus: null,
  approverNotes: null,
  updatedAt: null,
  ...over,
});

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  id: "p1",
  isAdmin: false,
  fillsForAnyone: false,
  visibleIds: new Set(["p1"]),
  canManageFor: () => true,
  ...over,
});

function tuesdayRow(today: string, f: FillLike | null, it = item({}), v = viewer()) {
  const occ = wccOccurrences([it], TUE, TUE);
  return buildComplianceRows({
    occurrences: occ,
    fills: new Map(f ? [[occ[0]!.key, f]] : []),
    items: new Map([[it.id, it]]),
    names: new Map([["p1", "Priya"]]),
    masters: new Map(),
    today,
    viewer: v,
  })[0]!;
}

describe("a row, day by day", () => {
  it("on its day: open, nothing carried", () => {
    expect(tuesdayRow(TUE, null)).toMatchObject({ openUntil: THU, carried: false, locked: false, lapsed: false, canFill: true });
  });

  it("not Done by its day: carried forward, still fillable, lateness counting", () => {
    expect(tuesdayRow(WED, null)).toMatchObject({ carried: true, locked: false, canFill: true, variance: 1, running: true });
    expect(tuesdayRow(THU, fill({ doerStatus: "need_info", status: "Pending" }))).toMatchObject({ carried: true, canFill: true });
  });

  it("not Done when the next one comes: lapsed, frozen, no running lateness", () => {
    expect(tuesdayRow(FRI, null)).toMatchObject({ lapsed: true, locked: true, carried: false, canFill: false, variance: null, running: false });
    expect(tuesdayRow(FRI, fill({ doerStatus: "need_info", status: "Pending" }))).toMatchObject({ lapsed: true, canFill: false });
  });

  it("Done, then its time passes: locked, but not lapsed", () => {
    const r = tuesdayRow(FRI, fill({ doerStatus: "done", status: "Done", doneAt: "2026-09-15T12:00:00.000Z" }));
    expect(r).toMatchObject({ locked: true, lapsed: false, carried: false, canFill: false, variance: 0 });
  });

  it("a daily one: yesterday's Need Info is frozen today", () => {
    const daily = item({ weekdays: bits(0, 1, 2, 3, 4, 5) });
    expect(tuesdayRow(WED, fill({ doerStatus: "need_info", status: "Pending" }), daily)).toMatchObject({ locked: true, lapsed: true, canFill: false });
    expect(tuesdayRow(WED, fill({ doerStatus: "done", status: "Done", doneAt: "2026-09-15T12:00:00.000Z" }), daily)).toMatchObject({
      locked: true,
      lapsed: false,
      canFill: false,
    });
  });

  it("stays open for the past-entry editor", () => {
    expect(tuesdayRow(FRI, null, item({}), viewer({ fillsForAnyone: true, editsPast: true }))).toMatchObject({ lapsed: true, canFill: true });
  });

  it("an MCC row of next month is not open yet", () => {
    const monthly = item({ scheduleKind: "monthly", weekdays: 0, monthDay: 5 });
    const occ = mccOccurrences([monthly], ["2026-10"]);
    const [r] = buildComplianceRows({
      occurrences: occ,
      fills: new Map(),
      items: new Map([[monthly.id, monthly]]),
      names: new Map([["p1", "Priya"]]),
      masters: new Map(),
      today: "2026-09-19",
      viewer: viewer(),
    });
    expect(r).toMatchObject({ notYetOpen: true, canFill: false, opensOn: "2026-10-01", openUntil: "2026-10-31" });
  });
});

describe("the WCC window", () => {
  it("brings in the rows carried forward into it — and the ones Done within it", () => {
    const it2 = item({ id: "i2", weekdays: bits(0, 1, 2, 3, 4, 5) }); // daily: never carries
    const occ = wccOccurrences([item({}), it2], MON, WED);
    const fills = new Map<string, FillLike>();
    const rows = buildComplianceRows({
      occurrences: occ,
      fills,
      items: new Map([["i1", item({})], ["i2", it2]]),
      names: new Map([["p1", "Priya"]]),
      masters: new Map(),
      today: WED,
      viewer: viewer(),
    });
    // Today (Wednesday): Tuesday's Tue & Fri row is carried in; yesterday's daily one is not.
    expect(withCarryForward(rows, WED).map((r) => `${r.itemId} ${r.deadline}`)).toEqual(["i1 2026-09-15", "i2 2026-09-16"]);

    const doneToday = buildComplianceRows({
      occurrences: occ,
      fills: new Map([[occ[0]!.key, fill({ doerStatus: "done", status: "Done", doneAt: "2026-09-16T06:00:00.000Z" })]]),
      items: new Map([["i1", item({})], ["i2", it2]]),
      names: new Map([["p1", "Priya"]]),
      masters: new Map(),
      today: WED,
      viewer: viewer(),
    });
    // Marked Done today, it stays in today's view; Done on its own day, it would not.
    expect(withCarryForward(doneToday, WED).some((r) => r.itemId === "i1")).toBe(true);
    const doneOnTheDay = doneToday.map((r) => (r.itemId === "i1" ? { ...r, actual: TUE } : r));
    expect(withCarryForward(doneOnTheDay, WED).some((r) => r.itemId === "i1")).toBe(false);
  });

  it("counts what is carried and what lapsed", () => {
    const carried = tuesdayRow(WED, null);
    const lapsed = { ...tuesdayRow(FRI, null), key: "x" };
    expect(summarise([carried, lapsed], FRI)).toMatchObject({ carried: 1, lapsed: 1 });
  });
});
