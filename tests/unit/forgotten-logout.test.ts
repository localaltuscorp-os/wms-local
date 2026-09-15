import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isSystemAutoPunchOut,
  AUTO_PUNCH_OUT_STAMP,
} from "@/lib/attendance/auto-punch-out";
import { computeDayCode } from "@/lib/attendance/status";
import { forgottenLogoutHalfDayOn } from "@/lib/goals/flag";

/**
 * FORGOTTEN LOGOUT → AUTOMATIC HALF DAY.
 *
 * Three separable things, tested separately:
 *
 *   · the STAMP — what marks a row as the system's, and what does not;
 *   · the GRADE — that such a day comes out Half Day and a normal day does not;
 *   · the SCHEDULE — that 23:59 Asia/Kolkata is what the cron entry actually
 *     means, since a wrong UTC offset here is silent and costs a whole day.
 *
 * The cron's own idempotency comes from `onConflictDoNothing` against the
 * (employee, day, kind) unique index — a database guarantee, exercised against
 * real Postgres rather than asserted against a mock.
 */

describe("the system auto-punch-out stamp", () => {
  it("recognises the row the job writes", () => {
    expect(isSystemAutoPunchOut(AUTO_PUNCH_OUT_STAMP)).toBe(true);
  });

  it("does NOT match a human admin correction", () => {
    // Same source, same reason — but a person picked them, and `recordedById`
    // is what says so. This is the distinction the whole rule turns on: a
    // manager's fix must not stay floored at half a day.
    expect(
      isSystemAutoPunchOut({
        source: "admin",
        reason: "forgot",
        recordedById: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(false);
  });

  it("does NOT match an ordinary self-punch", () => {
    expect(isSystemAutoPunchOut({ source: "self", reason: null, recordedById: null })).toBe(false);
  });

  it("does NOT match an admin correction for a different reason", () => {
    expect(
      isSystemAutoPunchOut({ source: "admin", reason: "correction", recordedById: null }),
    ).toBe(false);
  });

  it("requires all three conditions, not any of them", () => {
    for (const row of [
      { source: "admin", reason: null, recordedById: null },
      { source: "self", reason: "forgot", recordedById: null },
      { source: null, reason: null, recordedById: null },
    ]) {
      expect(isSystemAutoPunchOut(row)).toBe(false);
    }
  });
});

/* ── Grading ──────────────────────────────────────────────────────────────── */

const sched = {
  officialStart: "10:00",
  officialEnd: "19:00",
  lateAfter: "10:15",
  earlyBefore: "19:30",
  fullDayMinutes: 450,
  halfDayMinutes: 270,
} as never;

describe("how a forgotten logout grades", () => {
  it("Case 1 — checked in, no check-out at all → Half Day", () => {
    // Before the job runs. The day is already half, not zero: the person came in.
    const r = computeDayCode({ inAt: "10:00", outAt: null }, sched, {} as never, "23:59");
    expect(r.code).toBe("H/D");
    expect(r.dayValue).toBe(0.5);
  });

  it("Case 1 — after the job writes its out-punch → still Half Day", () => {
    // The job stamps the out AT THE CLOCK-IN TIME, so worked === 0. Without
    // `autoClosed` the ordinary three-tier rule would call that ABSENT — the
    // opposite of what the policy promises. This is the assertion that catches
    // it if the grader link is ever broken.
    const r = computeDayCode(
      { inAt: "10:00", outAt: "10:00" },
      sched,
      { autoClosed: true } as never,
      "23:59",
    );
    expect(r.code).toBe("H/D");
    expect(r.dayValue).toBe(0.5);
  });

  it("proves the autoClosed flag is what saves it", () => {
    // The same zero-minute pair WITHOUT the flag grades Absent. If this ever
    // starts returning H/D the previous test stops proving anything.
    const r = computeDayCode({ inAt: "10:00", outAt: "10:00" }, sched, {} as never, "23:59");
    expect(r.code).not.toBe("H/D");
  });

  it("Case 2 — a normal checked-in/checked-out day is untouched", () => {
    // A full 9 hours. The existing calculation applies and nothing about the
    // forgotten-logout rule reaches it.
    const r = computeDayCode({ inAt: "10:00", outAt: "19:30" }, sched, {} as never, "23:59");
    expect(r.code).toBe("P");
    expect(r.dayValue).toBe(1);
  });

  it("Case 5 — an admin correction releases the half-day floor", () => {
    // Ruchita re-times the check-out to 19:30. Her row carries `recordedById`,
    // so `autoClosed` is false and the day grades on its real hours again.
    expect(
      isSystemAutoPunchOut({ source: "admin", reason: "forgot", recordedById: "ruchita" }),
    ).toBe(false);
    const r = computeDayCode(
      { inAt: "10:00", outAt: "19:30" },
      sched,
      { autoClosed: false } as never,
      "23:59",
    );
    expect(r.code).toBe("P");
  });
});

/* ── Schedule ─────────────────────────────────────────────────────────────── */

describe("the schedule really is 23:59 Asia/Kolkata", () => {
  const cronUtcHour = 18;
  const cronUtcMinute = 29;

  it("18:29 UTC is 23:59 in Asia/Kolkata", () => {
    const d = new Date(Date.UTC(2026, 8, 9, cronUtcHour, cronUtcMinute));
    const ist = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    expect(ist).toBe("23:59");
  });

  it("still lands on the SAME IST day it is closing", () => {
    // The one-minute margin matters. A midnight run would resolve "today" to
    // the next day and close nothing at all.
    const d = new Date(Date.UTC(2026, 8, 9, cronUtcHour, cronUtcMinute));
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    expect(day).toBe("2026-09-09");
  });

  it("matches the schedule committed in vercel.json", async () => {
    // The rule is only as real as the cron entry. A schedule edited in one place
    // and not the other is exactly the kind of drift nobody notices until a
    // month of attendance has graded wrong.
    const { readFileSync } = await import("node:fs");
    const cfg = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const entry = cfg.crons.find((c) => c.path === "/api/cron/attendance-autoout");
    expect(entry?.schedule).toBe(`${cronUtcMinute} ${cronUtcHour} * * *`);
  });
});

/* ── The policy switch ────────────────────────────────────────────────────── */

describe("the forgotten-logout policy switch", () => {
  afterEach(() => {
    delete process.env.FORGOTTEN_LOGOUT_HALF_DAY;
  });

  it("is ON by default", () => {
    // It replaced a flag hard-coded to `false`, which made the job a nightly
    // no-op. A required rule must not wait for someone to remember it.
    delete process.env.FORGOTTEN_LOGOUT_HALF_DAY;
    expect(forgottenLogoutHalfDayOn()).toBe(true);
  });

  it("only disables on the exact value 'off'", () => {
    for (const v of ["", "false", "no", "OFF", "0"]) {
      process.env.FORGOTTEN_LOGOUT_HALF_DAY = v;
      expect(forgottenLogoutHalfDayOn()).toBe(true);
    }
    process.env.FORGOTTEN_LOGOUT_HALF_DAY = "off";
    expect(forgottenLogoutHalfDayOn()).toBe(false);
  });
});
