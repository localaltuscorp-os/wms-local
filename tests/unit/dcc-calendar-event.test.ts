import { describe, it, expect } from "vitest";
import { buildPersonReports, type ReportEmployee, type ReportItem } from "@/lib/dcc/daily-report";
import {
  buildDccCalendarEvent,
  dccEventHash,
  DESCRIPTION_MAX,
  planDccCalendarAction,
} from "@/lib/dcc/calendar-event";
import { isSameGoogleAccount, normalizeGoogleEmail } from "@/lib/google/account-match";

/**
 * DCC IN GOOGLE CALENDAR (account holder, 2026-09-15): one all-day event per
 * person per day, listing every KPI with its status.
 * 2026-09-15 is a Tuesday; 2026-09-30 the last day of the month.
 */

const DAY = "2026-09-15";
const APP = "https://os.altuscorp.in/";
const SURESH: ReportEmployee = { id: "suresh", name: "Suresh", managerId: "rohan", address: null };

const kpi = (id: string, over: Partial<ReportItem> = {}): ReportItem => ({
  id,
  ownerEmployeeId: "suresh",
  section: "Self Hygiene",
  code: null,
  title: `KPI ${id}`,
  frequency: "Daily",
  weekdays: 0b111111,
  scheduleKind: "scheduled",
  isParticipantList: false,
  activeFrom: null,
  ...over,
});

function reportFor(items: ReportItem[], entries: Parameters<typeof buildPersonReports>[2], day = DAY) {
  return buildPersonReports([SURESH], items, entries, day)[0]!;
}

describe("the day's event", () => {
  const report = reportFor(
    [kpi("a", { code: "A1" }), kpi("b"), kpi("c"), kpi("w", { frequency: "Every Sat", weekdays: 0b100000 })],
    [
      { itemId: "a", status: "Done", valueNumber: "14", note: null },
      { itemId: "b", status: "Not done", valueNumber: null, note: "client away" },
      { itemId: "w", status: "Done", valueNumber: null, note: null },
    ],
  );
  const ev = buildDccCalendarEvent(report, DAY, APP);

  it("is an all-day event on that day, ending the next (Google's end date is exclusive)", () => {
    expect(ev.start).toEqual({ date: "2026-09-15" });
    expect(ev.end).toEqual({ date: "2026-09-16" });
    expect(ev.transparency).toBe("transparent");
    expect(ev.reminders).toEqual({ useDefault: false, overrides: [] });
  });

  it("rolls the end date over a month boundary", () => {
    const monthEnd = buildDccCalendarEvent(reportFor([kpi("a")], [], "2026-09-30"), "2026-09-30", APP);
    expect(monthEnd.end).toEqual({ date: "2026-10-01" });
  });

  it("carries the score in the title", () => {
    expect(ev.summary).toBe("DCC · 1/3 done · 1 not done · 1 not filled");
  });

  it("lists every KPI with its status, value and note, and marks a KPI filled on a non-due day", () => {
    expect(ev.description).toContain("✅ A1 · KPI a — Done · 14");
    expect(ev.description).toContain('❌ KPI b — Not done · "client away"');
    expect(ev.description).toContain("⬜ KPI c — Not filled");
    expect(ev.description).toContain("✅ KPI w — Done (not due today)");
    expect(ev.description).toContain("Open in WMS: https://os.altuscorp.in/dcc");
    expect(ev.source.url).toBe("https://os.altuscorp.in/dcc");
  });

  it("stays inside Google's description limit however many KPIs there are", () => {
    const many = Array.from({ length: 400 }, (_, i) => kpi(`k${i}`, { title: `A long KPI title number ${i} `.repeat(3) }));
    const big = buildDccCalendarEvent(reportFor(many, []), DAY, APP);
    expect(big.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(big.description).toMatch(/…and \d+ more KPIs\. Open WMS for the full list\./u);
    expect(big.description.endsWith("Open in WMS: https://os.altuscorp.in/dcc")).toBe(true);
  });

  it("fingerprints the same content the same way, and a change differently", () => {
    expect(dccEventHash(buildDccCalendarEvent(report, DAY, APP))).toBe(dccEventHash(ev));
    const ticked = reportFor([kpi("a", { code: "A1" }), kpi("b"), kpi("c")], [{ itemId: "c", status: "Done", valueNumber: null, note: null }]);
    expect(dccEventHash(buildDccCalendarEvent(ticked, DAY, APP))).not.toBe(dccEventHash(ev));
  });
});

describe("what a sync does with one day", () => {
  const ev = buildDccCalendarEvent(reportFor([kpi("a")], []), DAY, APP);
  const desired = { event: ev, hash: dccEventHash(ev) };
  const NOW = new Date("2026-09-15T10:00:00Z");
  const EARLIER = new Date("2026-09-15T09:59:00Z");
  const LATER = new Date("2026-09-15T10:00:01Z");

  it("creates an event the first time", () => {
    expect(planDccCalendarAction(desired, null, NOW)).toMatchObject({ kind: "create" });
  });

  it("updates a changed day and leaves an unchanged one alone", () => {
    expect(planDccCalendarAction(desired, { googleEventId: "g1", syncedHash: "old", snapshotAt: EARLIER }, NOW)).toMatchObject({ kind: "update", eventId: "g1" });
    expect(planDccCalendarAction(desired, { googleEventId: "g1", syncedHash: desired.hash, snapshotAt: EARLIER }, NOW)).toEqual({ kind: "skip" });
  });

  it("removes the event when the day has nothing left to show", () => {
    expect(planDccCalendarAction(null, { googleEventId: "g1", syncedHash: "x", snapshotAt: EARLIER }, NOW)).toEqual({ kind: "delete", eventId: "g1" });
    expect(planDccCalendarAction(null, null, NOW)).toEqual({ kind: "skip" });
  });

  it("never lets a slower sync overwrite one that read newer data", () => {
    expect(planDccCalendarAction(desired, { googleEventId: "g1", syncedHash: "newer", snapshotAt: LATER }, NOW)).toEqual({ kind: "skip" });
    expect(planDccCalendarAction(null, { googleEventId: "g1", syncedHash: "newer", snapshotAt: LATER }, NOW)).toEqual({ kind: "skip" });
  });
});

describe("the Altus account check", () => {
  it("matches the employee's address the way Gmail does", () => {
    expect(isSameGoogleAccount("Shreya.Randhe.AltusCorp@googlemail.com", ["shreyarandhe.altuscorp@gmail.com"])).toBe(true);
    expect(isSameGoogleAccount("shreyarandhe.altuscorp+cal@gmail.com", ["shreyarandhe.altuscorp@gmail.com"])).toBe(true);
    expect(isSameGoogleAccount("manan@unleashed.in", [null, "MANAN@unleashed.in"])).toBe(true);
  });

  it("refuses a different or missing account", () => {
    expect(isSameGoogleAccount("shreya.personal@gmail.com", ["shreyarandhe.altuscorp@gmail.com"])).toBe(false);
    expect(isSameGoogleAccount(null, ["shreyarandhe.altuscorp@gmail.com"])).toBe(false);
    // Dots only fold on Gmail, not on a company domain.
    expect(isSameGoogleAccount("man.an@unleashed.in", ["manan@unleashed.in"])).toBe(false);
    expect(normalizeGoogleEmail("not-an-email")).toBeNull();
  });
});
