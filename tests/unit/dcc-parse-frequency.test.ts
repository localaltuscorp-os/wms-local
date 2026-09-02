import { describe, it, expect } from "vitest";
import { parseFrequency, scheduledDueOn, isoWeekKey } from "@/lib/dcc/util";

// Bit convention: bit0=Mon … bit6=Sun.
const MON = 1, TUE = 2, WED = 4, THU = 8, FRI = 16, SAT = 32;

describe("parseFrequency — the DCC v2 schedule-kind authority", () => {
  it("Daily → scheduled, Mon-Sat", () => {
    expect(parseFrequency("Daily")).toEqual({ scheduleKind: "scheduled", weekdays: 0b111111, needsReview: false });
  });
  it("explicit ≥2 weekdays (&/,) → scheduled, each due", () => {
    expect(parseFrequency("Wed & Sat")).toEqual({ scheduleKind: "scheduled", weekdays: WED | SAT, needsReview: false });
    expect(parseFrequency("Tue & Fri")).toEqual({ scheduleKind: "scheduled", weekdays: TUE | FRI, needsReview: false });
    expect(parseFrequency("Mon, Wed, Fri")).toEqual({ scheduleKind: "scheduled", weekdays: MON | WED | FRI, needsReview: false });
  });
  it('"Every <single weekday>" → weekly, eligible that day', () => {
    expect(parseFrequency("Every Sat")).toEqual({ scheduleKind: "weekly", weekdays: SAT, needsReview: false });
    expect(parseFrequency("Every Fri")).toEqual({ scheduleKind: "weekly", weekdays: FRI, needsReview: false });
  });
  it('"Fri or Sat" → weekly, ONE slot on either day', () => {
    expect(parseFrequency("Fri or Sat")).toEqual({ scheduleKind: "weekly", weekdays: FRI | SAT, needsReview: false });
  });
  it('"Weekly"/"Every Week" (no day) → weekly, any day', () => {
    expect(parseFrequency("Weekly")).toEqual({ scheduleKind: "weekly", weekdays: 0, needsReview: false });
    expect(parseFrequency("Every Week")).toEqual({ scheduleKind: "weekly", weekdays: 0, needsReview: false });
  });
  it('"Every Month"/"Monthly" → monthly', () => {
    expect(parseFrequency("Every Month").scheduleKind).toBe("monthly");
    expect(parseFrequency("Monthly").scheduleKind).toBe("monthly");
  });
  it('"Adhoc" → adhoc; "As per HH call scheduled" → event', () => {
    expect(parseFrequency("Adhoc")).toEqual({ scheduleKind: "adhoc", weekdays: null, needsReview: false });
    expect(parseFrequency("As per HH call scheduled")).toEqual({ scheduleKind: "event", weekdays: null, needsReview: false });
  });
  it("blank / garbage → adhoc + needsReview (non-blocking)", () => {
    expect(parseFrequency("")).toEqual({ scheduleKind: "adhoc", weekdays: null, needsReview: true });
    expect(parseFrequency("   ")).toEqual({ scheduleKind: "adhoc", weekdays: null, needsReview: true });
    expect(parseFrequency("asdf")).toEqual({ scheduleKind: "adhoc", weekdays: null, needsReview: true });
  });
});

describe("scheduledDueOn — only scheduled non-participant items count daily", () => {
  const sat = new Date(2026, 6, 4); // Sat 4 Jul 2026
  const fri = new Date(2026, 6, 3);
  it("scheduled Wed&Sat is due Sat, not Fri", () => {
    const it = { id: "x", weekdays: WED | SAT, scheduleKind: "scheduled" };
    expect(scheduledDueOn(it, sat)).toBe(true);
    expect(scheduledDueOn(it, fri)).toBe(false);
  });
  it("weekly / monthly / adhoc / event / participant are never daily-due", () => {
    for (const kind of ["weekly", "monthly", "adhoc", "event"]) {
      expect(scheduledDueOn({ id: "x", weekdays: SAT, scheduleKind: kind }, sat)).toBe(false);
    }
    expect(scheduledDueOn({ id: "x", weekdays: 0b111111, scheduleKind: "scheduled", isParticipantList: true }, sat)).toBe(false);
  });
  it("legacy null/0 mask stays always-due (parity with isDueOn)", () => {
    expect(scheduledDueOn({ id: "x", weekdays: null, scheduleKind: "scheduled" }, fri)).toBe(true);
    expect(scheduledDueOn({ id: "x", weekdays: 0, scheduleKind: null }, fri)).toBe(true);
  });
});

describe("isoWeekKey", () => {
  it("Fri and Sat of the same ISO week share a key", () => {
    expect(isoWeekKey(new Date(2026, 6, 3))).toBe(isoWeekKey(new Date(2026, 6, 4)));
  });
});
