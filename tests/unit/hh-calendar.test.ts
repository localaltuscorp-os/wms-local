import { describe, it, expect } from "vitest";
import {
  callOccurrences,
  dayCodeOf,
  mondayOf,
  planAutoLinks,
  weekDates,
  type CalendarCall,
  type CalendarEntry,
} from "@/lib/hh/calendar";

/**
 * HAND-HOLDING CALENDAR (account holder, 2026-09-15): weekly calls and Daily
 * Compliance, day by day. 2026-09-15 is a Tuesday; 2026-09-20 a Sunday.
 */

describe("the week", () => {
  it("knows the weekday code a weekly call is stored with", () => {
    expect(dayCodeOf("2026-09-15")).toBe("tue");
    expect(dayCodeOf("2026-09-20")).toBe("sun");
  });

  it("starts on Monday, including from a Sunday", () => {
    expect(mondayOf("2026-09-15")).toBe("2026-09-14");
    expect(mondayOf("2026-09-20")).toBe("2026-09-14");
    expect(mondayOf("2026-09-14")).toBe("2026-09-14");
    expect(weekDates("2026-09-28")).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });
});

describe("which weekly calls fall on a date", () => {
  const entry = (id: string, over: Partial<CalendarEntry> = {}): CalendarEntry => ({
    id, personId: "prakash", name: `Participant ${id}`, section: "ps", onHold: false, startDate: null, endDate: null, ...over,
  });
  const call = (id: string, entryId: string, day: string, seq = 1): CalendarCall => ({
    id, entryId, seq, callType: "hh", day, durationMin: 30,
  });

  it("repeats each call on its weekday, every week", () => {
    const calls = [call("c1", "e1", "tue"), call("c2", "e1", "sat", 2)];
    expect(callOccurrences([entry("e1")], calls, "2026-09-15").map((o) => o.callId)).toEqual(["c1"]);
    expect(callOccurrences([entry("e1")], calls, "2026-09-22").map((o) => o.callId)).toEqual(["c1"]);
    expect(callOccurrences([entry("e1")], calls, "2026-09-19").map((o) => o.callId)).toEqual(["c2"]);
  });

  it("only between the entry's start and end dates, inclusive", () => {
    const e = entry("e1", { startDate: "2026-09-15", endDate: "2026-09-22" });
    const calls = [call("c1", "e1", "tue")];
    expect(callOccurrences([e], calls, "2026-09-08")).toHaveLength(0);
    expect(callOccurrences([e], calls, "2026-09-15")).toHaveLength(1);
    expect(callOccurrences([e], calls, "2026-09-22")).toHaveLength(1);
    expect(callOccurrences([e], calls, "2026-09-29")).toHaveLength(0);
  });

  it("not while the entry is on hold, and not for another person's entry", () => {
    const calls = [call("c1", "e1", "tue"), call("c2", "e2", "tue")];
    expect(callOccurrences([entry("e1", { onHold: true })], calls, "2026-09-15")).toHaveLength(0);
    expect(callOccurrences([entry("e2")], calls, "2026-09-15").map((o) => o.callId)).toEqual(["c2"]);
  });
});

describe("linking a Handholding name to its employee", () => {
  const staff = [
    { id: "emp-prakash", name: "Prakash Kumawat" },
    { id: "emp-nandini", name: "Nandini Maurya" },
    { id: "emp-a", name: "Om Jadhav" },
    { id: "emp-b", name: "Om Jadhav" },
  ];

  it("links exact names, ignoring case and spacing", () => {
    expect(
      planAutoLinks(
        [
          { id: "p1", name: "Prakash Kumawat", employeeId: null },
          { id: "p2", name: "nandini  maurya", employeeId: null },
        ],
        staff,
      ),
    ).toEqual([
      { personId: "p1", employeeId: "emp-prakash" },
      { personId: "p2", employeeId: "emp-nandini" },
    ]);
  });

  it("never guesses: first names, ambiguous names and existing links are left alone", () => {
    expect(
      planAutoLinks(
        [
          { id: "p1", name: "Prakash", employeeId: null },
          { id: "p2", name: "Om Jadhav", employeeId: null },
          { id: "p3", name: "Prakash Kumawat", employeeId: "someone-else" },
        ],
        staff,
      ),
    ).toEqual([]);
  });
});
