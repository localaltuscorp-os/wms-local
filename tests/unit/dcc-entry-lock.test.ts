import { describe, it, expect } from "vitest";
import {
  checkDccEntryWindow,
  DCC_FUTURE_ENTRY_BLOCKED,
  DCC_PAST_ENTRY_LOCKED,
  isDccDayOpen,
} from "@/lib/dcc/entry-lock";
import { canEditPastDccEntries } from "@/lib/security/capabilities";

/**
 * DCC ENTRIES LOCK AT MIDNIGHT (account holder, 2026-09-15).
 *
 * A person may change their own entry until 11:59 pm IST that day; only Manan
 * Sir may change a past day, for anyone; nobody fills a day that has not begun.
 */

const TODAY = "2026-09-15";

describe("the entry window", () => {
  it("is open all of today for everyone", () => {
    expect(checkDccEntryWindow({ date: TODAY, today: TODAY, canEditPast: false })).toEqual({ ok: true });
  });

  it("closes yesterday for an ordinary employee", () => {
    expect(checkDccEntryWindow({ date: "2026-09-14", today: TODAY, canEditPast: false })).toEqual({
      ok: false,
      error: DCC_PAST_ENTRY_LOCKED,
    });
  });

  it("keeps every past day open for the past-entry editor", () => {
    expect(isDccDayOpen("2026-09-14", TODAY, true)).toBe(true);
    expect(isDccDayOpen("2026-04-01", TODAY, true)).toBe(true);
  });

  it("refuses a future day, even for the past-entry editor", () => {
    expect(checkDccEntryWindow({ date: "2026-09-16", today: TODAY, canEditPast: true })).toEqual({
      ok: false,
      error: DCC_FUTURE_ENTRY_BLOCKED,
    });
  });

  it("compares calendar days, so the lock turns over exactly at midnight", () => {
    // 23:59 IST on the 15th is still "2026-09-15"; 00:00 on the 16th is not.
    expect(isDccDayOpen("2026-09-15", "2026-09-15", false)).toBe(true);
    expect(isDccDayOpen("2026-09-15", "2026-09-16", false)).toBe(false);
  });
});

describe("who may change a past entry", () => {
  it("is Manan Sir", () => {
    expect(canEditPastDccEntries("manan@unleashed.in")).toBe(true);
    expect(canEditPastDccEntries("  MANAN@unleashed.in ")).toBe(true);
  });

  it("is not the other super-admin, an admin, or nobody", () => {
    expect(canEditPastDccEntries("rohanchoudhary.altuscorp@gmail.com")).toBe(false);
    expect(canEditPastDccEntries("vinalpatil.altuscorp@gmail.com")).toBe(false);
    expect(canEditPastDccEntries("")).toBe(false);
    expect(canEditPastDccEntries(null)).toBe(false);
  });
});
