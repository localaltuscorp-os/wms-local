import { describe, it, expect } from "vitest";
import {
  selfCorrectionWindow,
  isMonthLocked,
  monthLockInstant,
  toMonth,
  SELF_CORRECTION_WINDOW_MINUTES,
  MONTH_LOCK_DAY,
} from "@/lib/security/attendance-time-rules";

/**
 * The two attendance time rules, tested against the clock rather than the UI.
 *
 * These functions are what the API enforces — the buttons and countdowns in the
 * browser read the same numbers but decide nothing. Every case below is a
 * request the server has to answer correctly whether or not a button was
 * rendered.
 *
 * `now` is passed explicitly throughout, which is the whole reason these are
 * pure: a rule about elapsed time that can only be tested by waiting is a rule
 * nobody tests.
 */

const at = (iso: string) => new Date(iso);

describe("15-minute self-correction window", () => {
  // 10:00 IST = 04:30 UTC. Written in UTC because that is what the database
  // stores and what the function actually compares.
  const punch = at("2026-09-09T04:30:00.000Z");

  it("is open immediately after the punch", () => {
    expect(selfCorrectionWindow(punch, punch).open).toBe(true);
  });

  it("is open at 14 minutes 59 seconds", () => {
    const now = new Date(punch.getTime() + 14 * 60_000 + 59_000);
    expect(selfCorrectionWindow(punch, now).open).toBe(true);
  });

  it("is SHUT at exactly 15 minutes — the boundary is exclusive", () => {
    // A rule stated as "15 minutes" must not grant a sixteenth minute on a tie.
    const now = new Date(punch.getTime() + SELF_CORRECTION_WINDOW_MINUTES * 60_000);
    expect(selfCorrectionWindow(punch, now).open).toBe(false);
  });

  it("is shut long after", () => {
    expect(selfCorrectionWindow(punch, at("2026-09-09T09:00:00.000Z")).open).toBe(false);
  });

  it("reports the deadline as punch + 15 minutes", () => {
    const w = selfCorrectionWindow(punch, punch);
    expect(w.expiresAt.toISOString()).toBe("2026-09-09T04:45:00.000Z");
  });

  it("counts down in whole seconds and never goes negative", () => {
    const half = new Date(punch.getTime() + 7 * 60_000 + 30_000);
    expect(selfCorrectionWindow(punch, half).secondsRemaining).toBe(450);
    const late = new Date(punch.getTime() + 60 * 60_000);
    expect(selfCorrectionWindow(punch, late).secondsRemaining).toBe(0);
  });

  it("measures from the PUNCH, not from when the correction is attempted", () => {
    // The scenario the rule exists for: a punch made this morning is not
    // correctable this evening, no matter when the page was opened.
    const evening = at("2026-09-09T14:00:00.000Z");
    expect(selfCorrectionWindow(punch, evening).open).toBe(false);
  });
});

describe("monthly lock", () => {
  it("locks September on the 3rd of October, 00:00 IST", () => {
    // 2026-10-03T00:00+05:30 === 2026-10-02T18:30Z
    expect(monthLockInstant("2026-09").toISOString()).toBe("2026-10-02T18:30:00.000Z");
  });

  it("leaves September editable through October 2nd", () => {
    expect(isMonthLocked("2026-09-08", at("2026-10-02T17:00:00.000Z"))).toBe(false);
  });

  it("leaves September editable at 23:59 IST on October 2nd", () => {
    // 23:59 IST on the 2nd === 18:29Z. One minute before the lock.
    expect(isMonthLocked("2026-09-08", at("2026-10-02T18:29:00.000Z"))).toBe(false);
  });

  it("locks September at 00:00 IST on October 3rd", () => {
    expect(isMonthLocked("2026-09-08", at("2026-10-02T18:30:00.000Z"))).toBe(true);
  });

  it("keeps September locked forever after", () => {
    expect(isMonthLocked("2026-09-30", at("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("does not lock the CURRENT month", () => {
    // September attendance on 9 September — the ordinary case, and the one a
    // wrong sign in the comparison would break most visibly.
    expect(isMonthLocked("2026-09-09", at("2026-09-09T04:30:00.000Z"))).toBe(false);
  });

  it("evaluates in IST, not UTC", () => {
    // 2026-10-02T19:00Z is 00:30 IST on the 3rd — locked. In UTC it is still
    // the 2nd and would read as unlocked, which is the 5h30m hole this guards.
    expect(isMonthLocked("2026-09-15", at("2026-10-02T19:00:00.000Z"))).toBe(true);
  });

  it("rolls the year for December", () => {
    expect(monthLockInstant("2026-12").toISOString()).toBe("2027-01-02T18:30:00.000Z");
    expect(isMonthLocked("2026-12-31", at("2027-01-02T18:30:00.000Z"))).toBe(true);
    expect(isMonthLocked("2026-12-31", at("2027-01-02T18:00:00.000Z"))).toBe(false);
  });

  it("accepts a full date or a bare month", () => {
    const t = at("2026-10-05T00:00:00.000Z");
    expect(isMonthLocked("2026-09-08", t)).toBe(isMonthLocked("2026-09", t));
  });

  it("uses the configured lock day", () => {
    // Guards against the constant and the arithmetic drifting apart.
    const d = monthLockInstant("2026-09");
    const istDay = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" }).format(d),
    );
    expect(istDay).toBe(MONTH_LOCK_DAY);
  });
});

describe("toMonth", () => {
  it("truncates a date to its month", () => {
    expect(toMonth("2026-09-08")).toBe("2026-09");
  });
  it("leaves a month untouched", () => {
    expect(toMonth("2026-09")).toBe("2026-09");
  });
});
