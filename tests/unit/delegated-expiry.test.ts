import { describe, it, expect } from "vitest";
import {
  DELEGATED_ACCESS_DURATIONS,
  DELEGATED_ACCESS_FLOOR_LABEL,
  DELEGATED_ACCESS_MAX_MINUTES,
  delegatedExpiry,
  delegatedExpiryBasis,
  delegationState,
  isDelegationLive,
  isValidDelegatedDuration,
  istClockLabel,
  istFloorFor,
} from "@/lib/auth/delegated-expiry";

/**
 * THE EXPIRY RULE for temporary delegated access.
 *
 *     expiry = max(start + selectedDuration, same-day 20:30 IST)
 *
 * The brief is emphatic that this is NOT "whichever happens first", so the two
 * worked examples it gives are asserted verbatim below, and there is a test
 * whose only job is to fail if somebody ever turns the max into a min.
 *
 * IST is UTC+05:30, so 20:30 IST == 15:00 UTC on the same date. Every instant
 * here is written in UTC with the IST equivalent in a comment, because that is
 * the pair a reader has to hold in mind to check the arithmetic.
 */

/** 20:30 IST on `yyyy-mm-dd`, as a UTC instant. */
const floorUtc = (day: string) => new Date(`${day}T15:00:00.000Z`);
/** An IST wall-clock time on `yyyy-mm-dd`, as a UTC instant. */
function ist(day: string, hh: number, mm = 0): Date {
  const utcMinutes = hh * 60 + mm - (5 * 60 + 30);
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + utcMinutes * 60_000);
}

describe("delegated access expiry — the 20:30 floor", () => {
  it("the brief's first example: 18:00 + 1 hour expires at 20:30, not 19:00", () => {
    const start = ist("2026-09-10", 18, 0);
    const expiry = delegatedExpiry(start, 60);

    expect(expiry.toISOString()).toBe(floorUtc("2026-09-10").toISOString());
    expect(istClockLabel(expiry)).toBe("20:30 IST");
    // And it is LATER than what the manager picked — the whole point.
    expect(expiry.getTime()).toBeGreaterThan(start.getTime() + 60 * 60_000);
    expect(delegatedExpiryBasis(start, 60)).toBe("evening_floor");
  });

  it("the brief's second example: 18:00 + 4 hours expires at 22:00, not 20:30", () => {
    const start = ist("2026-09-10", 18, 0);
    const expiry = delegatedExpiry(start, 240);

    expect(istClockLabel(expiry)).toBe("22:00 IST");
    expect(expiry.getTime()).toBeGreaterThan(floorUtc("2026-09-10").getTime());
    expect(delegatedExpiryBasis(start, 240)).toBe("selected_duration");
  });

  it("is a FLOOR and never a CAP — the later time always wins", () => {
    // The regression this whole file exists for. Every duration from 15 minutes
    // to 12 hours, started across the working day: the answer must never be
    // earlier than either candidate.
    const day = "2026-09-10";
    for (const hour of [0, 6, 9, 12, 15, 18, 20, 21, 23]) {
      for (const minutes of [15, 30, 60, 120, 240, 480, 720]) {
        const start = ist(day, hour, 0);
        const expiry = delegatedExpiry(start, minutes);
        const selected = start.getTime() + minutes * 60_000;
        const floor = istFloorFor(start).getTime();

        expect(expiry.getTime()).toBeGreaterThanOrEqual(selected);
        expect(expiry.getTime()).toBeGreaterThanOrEqual(floor);
        expect(expiry.getTime()).toBe(Math.max(selected, floor));
      }
    }
  });

  it("a grant that starts after 20:30 just uses its duration", () => {
    // 21:00 + 1h → max(22:00, 20:30) → 22:00. No special case needed; the floor
    // is simply already past and loses.
    const start = ist("2026-09-10", 21, 0);
    expect(istClockLabel(delegatedExpiry(start, 60))).toBe("22:00 IST");
    expect(delegatedExpiryBasis(start, 60)).toBe("selected_duration");
  });

  it("a grant started in the small hours is floored to THAT evening", () => {
    // 02:00 IST on the 11th + 1h = 03:00, so the floor wins: 20:30 on the 11th,
    // the same working evening. Crucially NOT the 10th — this is the assertion
    // that catches a UTC-vs-IST day slip, since 02:00 IST is 20:30 UTC the
    // PREVIOUS day.
    const start = ist("2026-09-11", 2, 0);
    const expiry = delegatedExpiry(start, 60);
    expect(expiry.toISOString()).toBe(floorUtc("2026-09-11").toISOString());
  });

  it("resolves the floor on the IST day, not the UTC day", () => {
    // 23:30 IST on the 10th is 18:00 UTC on the 10th — same UTC day, so this
    // one passes either way. Its partner below does not.
    expect(istFloorFor(ist("2026-09-10", 23, 30)).toISOString()).toBe(
      floorUtc("2026-09-10").toISOString(),
    );
    // 05:00 IST on the 11th is 23:30 UTC on the 10th. A UTC-based floor would
    // answer "the 10th" and be a day early.
    expect(istFloorFor(ist("2026-09-11", 5, 0)).toISOString()).toBe(
      floorUtc("2026-09-11").toISOString(),
    );
  });

  it("exactly 20:30 counts as reaching the floor, not as falling short", () => {
    // 19:30 + 1h lands exactly on 20:30. `>=` means the duration is credited
    // rather than the floor being re-applied; either way the instant is the
    // same, so this pins the BASIS, which is what the UI explains.
    const start = ist("2026-09-10", 19, 30);
    expect(delegatedExpiry(start, 60).toISOString()).toBe(
      floorUtc("2026-09-10").toISOString(),
    );
    expect(delegatedExpiryBasis(start, 60)).toBe("selected_duration");
  });

  it("the floor label and the numbers cannot drift apart", () => {
    expect(DELEGATED_ACCESS_FLOOR_LABEL).toBe("20:30");
    expect(istClockLabel(floorUtc("2026-09-10"))).toBe("20:30 IST");
  });

  it("every duration the Admin Panel offers is a valid duration", () => {
    for (const d of DELEGATED_ACCESS_DURATIONS) {
      expect(isValidDelegatedDuration(d.minutes)).toBe(true);
      expect(d.minutes).toBeLessThanOrEqual(DELEGATED_ACCESS_MAX_MINUTES);
    }
  });

  it("rejects durations the DB CHECK would also reject", () => {
    // Mirrors `duration_minutes > 0 AND duration_minutes <= 1440` in 0218, so a
    // bad value is refused with a message instead of a constraint error.
    expect(isValidDelegatedDuration(0)).toBe(false);
    expect(isValidDelegatedDuration(-30)).toBe(false);
    expect(isValidDelegatedDuration(1441)).toBe(false);
    expect(isValidDelegatedDuration(1440)).toBe(true);
    expect(isValidDelegatedDuration(1.5)).toBe(false);
    expect(isValidDelegatedDuration(Number.NaN)).toBe(false);
  });
});

describe("delegated access liveness", () => {
  const expiresAt = ist("2026-09-10", 20, 30);

  it("is live before expiry and dead after it", () => {
    expect(isDelegationLive({ expiresAt, revokedAt: null }, ist("2026-09-10", 20, 29))).toBe(true);
    expect(isDelegationLive({ expiresAt, revokedAt: null }, ist("2026-09-10", 20, 31))).toBe(false);
  });

  it("treats the exact expiry instant as expired", () => {
    // `now < expiresAt`. A grant is not live AT its expiry — the alternative
    // leaves a one-tick window whose behaviour depends on clock resolution.
    expect(isDelegationLive({ expiresAt, revokedAt: null }, expiresAt)).toBe(false);
  });

  it("REVOCATION does not wait for the clock", () => {
    // The security-critical case: revoked at 18:00, asked at 18:01, with the
    // timer still hours away.
    const revokedAt = ist("2026-09-10", 18, 0);
    expect(isDelegationLive({ expiresAt, revokedAt }, ist("2026-09-10", 18, 1))).toBe(false);
    expect(delegationState({ expiresAt, revokedAt }, ist("2026-09-10", 18, 1))).toBe("revoked");
  });

  it("reports revoked in preference to expired, so the audit reason is the true one", () => {
    const revokedAt = ist("2026-09-10", 18, 0);
    // Long past expiry AND revoked — the interesting fact is the revocation.
    expect(delegationState({ expiresAt, revokedAt }, ist("2026-09-12", 9, 0))).toBe("revoked");
    expect(delegationState({ expiresAt, revokedAt: null }, ist("2026-09-12", 9, 0))).toBe("expired");
    expect(delegationState({ expiresAt, revokedAt: null }, ist("2026-09-10", 12, 0))).toBe("live");
  });
});

describe("istClockLabel", () => {
  it("renders the org clock in 24-hour form", () => {
    expect(istClockLabel(ist("2026-09-10", 0, 0))).toBe("00:00 IST");
    expect(istClockLabel(ist("2026-09-10", 9, 5))).toBe("09:05 IST");
    expect(istClockLabel(ist("2026-09-10", 20, 30))).toBe("20:30 IST");
    expect(istClockLabel(ist("2026-09-10", 23, 59))).toBe("23:59 IST");
  });
});
