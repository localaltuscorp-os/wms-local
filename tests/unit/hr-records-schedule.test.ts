import { describe, it, expect } from "vitest";
import {
  clampDay,
  clampInterval,
  describeSchedule,
  isScheduledRunDue,
  nextCronAfter,
  nextScheduledRun,
} from "@/lib/hr/records-export/schedule";

/** The cron's own firing time for an IST calendar day: 03:00 IST = 21:30 UTC the day before. */
const cronOn = (istDate: string) => new Date(new Date(`${istDate}T03:00:00+05:30`).getTime());

const base = { enabled: true, intervalMonths: 1, dayOfMonth: 1, lastCompletedAt: null as Date | null };

describe("HR records Drive schedule", () => {
  it("never runs while switched off", () => {
    expect(isScheduledRunDue({ ...base, enabled: false }, cronOn("2026-10-01"))).toBe(false);
    expect(nextScheduledRun({ ...base, enabled: false }, cronOn("2026-10-01"))).toBeNull();
  });

  it("runs on the chosen day in India time, not UTC", () => {
    // 21:30 UTC on 30 Sep is already 1 Oct in India.
    expect(isScheduledRunDue(base, new Date("2026-09-30T21:30:00Z"))).toBe(true);
    expect(isScheduledRunDue({ ...base, dayOfMonth: 5 }, cronOn("2026-10-04"))).toBe(false);
    expect(isScheduledRunDue({ ...base, dayOfMonth: 5 }, cronOn("2026-10-05"))).toBe(true);
  });

  it("does not run twice in the same cycle", () => {
    const doneOct1 = new Date("2026-10-01T03:04:00+05:30");
    expect(isScheduledRunDue({ ...base, lastCompletedAt: doneOct1 }, cronOn("2026-10-02"))).toBe(false);
    expect(isScheduledRunDue({ ...base, lastCompletedAt: doneOct1 }, cronOn("2026-10-31"))).toBe(false);
    expect(isScheduledRunDue({ ...base, lastCompletedAt: doneOct1 }, cronOn("2026-11-01"))).toBe(true);
  });

  it("counts a manual save as this month's save", () => {
    const manualSep20 = new Date("2026-09-20T15:00:00+05:30");
    expect(isScheduledRunDue({ ...base, lastCompletedAt: manualSep20 }, cronOn("2026-09-21"))).toBe(false);
    expect(isScheduledRunDue({ ...base, lastCompletedAt: manualSep20 }, cronOn("2026-10-01"))).toBe(true);
  });

  it("honours an interval of several months", () => {
    const s = { ...base, intervalMonths: 3, lastCompletedAt: new Date("2026-01-01T03:10:00+05:30") };
    expect(isScheduledRunDue(s, cronOn("2026-03-01"))).toBe(false);
    expect(isScheduledRunDue(s, cronOn("2026-04-01"))).toBe(true);
    expect(nextScheduledRun(s, cronOn("2026-02-10"))?.toISOString()).toBe(cronOn("2026-04-01").toISOString());
  });

  it("catches up straight away after a missed cycle", () => {
    const s = { ...base, dayOfMonth: 20, lastCompletedAt: new Date("2026-07-20T03:10:00+05:30") };
    expect(isScheduledRunDue(s, cronOn("2026-09-02"))).toBe(true);
  });

  it("reports the next run date", () => {
    const now = new Date("2026-09-15T12:00:00+05:30");
    expect(nextScheduledRun({ ...base, dayOfMonth: 20 }, now)?.toISOString()).toBe(cronOn("2026-09-20").toISOString());
    // Due already (never saved, day passed) → the next nightly cron.
    expect(nextScheduledRun({ ...base, dayOfMonth: 1 }, now)?.toISOString()).toBe(nextCronAfter(now).toISOString());
    expect(nextCronAfter(new Date("2026-09-15T21:30:00Z")).toISOString()).toBe("2026-09-16T21:30:00.000Z");
  });

  it("clamps what the form can send", () => {
    expect(clampDay(31)).toBe(28);
    expect(clampDay("0")).toBe(1);
    expect(clampInterval(99)).toBe(12);
    expect(clampInterval("abc")).toBe(1);
    expect(describeSchedule(1, 1)).toBe("Every month on the 1st");
    expect(describeSchedule(3, 22)).toBe("Every 3 months on the 22nd");
    expect(describeSchedule(2, 11)).toBe("Every 2 months on the 11th");
  });
});
