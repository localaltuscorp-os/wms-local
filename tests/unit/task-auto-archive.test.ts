import { describe, expect, it, vi } from "vitest";

// The module is `server-only` and pulls in the db; the shim is the same one
// every other server-module test in this suite uses.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {}, tasks: {}, taskEvents: {} }));

const { workingDaysBetween, isEligibleForAutoArchive, AUTO_ARCHIVE_WORKING_DAYS } = await import(
  "@/lib/tasks/auto-archive"
);

/**
 * The window is the whole feature, and it fails silently: a task archived two
 * days early or five days late looks exactly like a task archived on time. The
 * only way that surfaces is arithmetic pinned here.
 *
 * All dates UTC. 2026-08-24 is a Monday.
 */
const d = (iso: string) => new Date(iso);

describe("workingDaysBetween", () => {
  it("counts nothing on the day of approval", () => {
    expect(workingDaysBetween(d("2026-08-24T09:00:00Z"), d("2026-08-24T23:59:00Z"))).toBe(0);
  });

  it("counts whole days, not elapsed hours", () => {
    // Approved 09:00 Monday, asked at 08:00 Tuesday — 23 hours, but one day.
    expect(workingDaysBetween(d("2026-08-24T09:00:00Z"), d("2026-08-25T08:00:00Z"))).toBe(1);
    // ...and still one at 23:00 the same Tuesday.
    expect(workingDaysBetween(d("2026-08-24T09:00:00Z"), d("2026-08-25T23:00:00Z"))).toBe(1);
  });

  it("skips Saturday and Sunday", () => {
    // Mon 24th → Mon 31st is 7 calendar days but only 5 working ones.
    expect(workingDaysBetween(d("2026-08-24T09:00:00Z"), d("2026-08-31T09:00:00Z"))).toBe(5);
  });

  it("does not count the weekend it starts on", () => {
    // Approved on a Saturday; Sunday adds nothing, Monday is the first.
    expect(workingDaysBetween(d("2026-08-29T12:00:00Z"), d("2026-08-31T12:00:00Z"))).toBe(1);
  });
});

describe("isEligibleForAutoArchive", () => {
  it("needs a full seven working days", () => {
    const approved = d("2026-08-24T09:00:00Z"); // Monday
    // Mon 24 → Tue 1 Sep is 6 working days: not yet.
    expect(isEligibleForAutoArchive(approved, d("2026-09-01T09:00:00Z"))).toBe(false);
    // Wed 2 Sep is the 7th.
    expect(isEligibleForAutoArchive(approved, d("2026-09-02T09:00:00Z"))).toBe(true);
  });

  it("stays eligible once past the line", () => {
    const approved = d("2026-08-24T09:00:00Z");
    expect(isEligibleForAutoArchive(approved, d("2026-10-01T09:00:00Z"))).toBe(true);
  });

  it("is never eligible on the day of approval", () => {
    expect(isEligibleForAutoArchive(d("2026-08-24T09:00:00Z"), d("2026-08-24T23:59:59Z"))).toBe(
      false,
    );
  });

  it("spans two weekends for a mid-week approval, as Mon-Fri counting implies", () => {
    // Approved Thursday 27 Aug. Seven Mon-Fri days lands on Monday 7 Sep —
    // ELEVEN calendar days later. That is what excluding Saturdays costs, and
    // it is the number to compare against the company's own Mon-Sat week.
    const approved = d("2026-08-27T10:00:00Z");
    expect(isEligibleForAutoArchive(approved, d("2026-09-06T10:00:00Z"))).toBe(false);
    expect(isEligibleForAutoArchive(approved, d("2026-09-07T10:00:00Z"))).toBe(true);
  });

  it("uses the exported constant rather than a hardcoded 7", () => {
    expect(AUTO_ARCHIVE_WORKING_DAYS).toBe(7);
  });
});
