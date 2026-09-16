import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECURRENCE,
  frequencyOptionsFor,
  describeRecurrence,
  isDueOn,
  isRecurrence,
  nthWeekdayOfMonth,
  readRecurrence,
  toDccSchedule,
  weekdayOf,
  type Recurrence,
} from "@/lib/jd/recurrence";

/**
 * FOUR OF THE TEN FREQUENCIES CANNOT BE A WEEKDAY MASK.
 *
 * "Once in 15 Days", "Once in 30 Days", "Monthly on 2nd Saturday" and "First
 * Monday of Month" are not sets of weekdays, which is the whole reason the JD
 * carries its own recurrence model rather than reusing the DCC one. These pin
 * the four, and the projection back down.
 */

describe("the frequency menu", () => {
  it("offers Google Calendar's seven, in order, spoken about the start date", () => {
    /* Changed 2026-09-12 on the account holder's instruction, from a ten-option
       list of the firm's own patterns to the vocabulary people already know
       from their calendar; changed again 2026-09-16 so the list NAMES THE DAY
       PICKED rather than a fixed Saturday. 2026-09-16 is a Wednesday, and the
       third Wednesday of its month. */
    expect(frequencyOptionsFor("2026-09-16").map((o) => o.label)).toEqual([
      "Does not repeat",
      "Daily",
      "Weekly on Wednesday",
      "Monthly on the third Wednesday",
      "Annually on September 16",
      "Every weekday (Monday to Friday)",
      "Custom…",
    ]);
  });

  it("re-speaks itself when the start date moves", () => {
    // The whole point of deriving the list: a fixed one is right 1 day in 7.
    expect(frequencyOptionsFor("2026-09-19").map((o) => o.label)).toContain(
      "Weekly on Saturday",
    );
    // 2026-09-26 is the LAST Saturday of September, not the fourth-and-nothing-
    // else — a fifth weekday does not exist in most months.
    expect(frequencyOptionsFor("2026-09-26").map((o) => o.label)).toContain(
      "Monthly on the last Saturday",
    );
  });

  it("maps presets to the STRUCTURED shapes, not to the equivalent RRULE", () => {
    /* FREQ=DAILY is seven days a week; this firm's Daily is Mon–Sat, because a
       task firing on the weekly off becomes an overdue row nobody can clear.
       Only Custom needs the richer grammar. */
    const byId = (id: string) =>
      frequencyOptionsFor("2026-09-16").find((o) => o.id === id)!.value;
    expect(byId("daily")).toEqual({ kind: "daily" });
    expect(byId("weekly")).toEqual({ kind: "weekdays", days: [2] }); // Wednesday
    expect(byId("monthly")).toEqual({ kind: "monthly_ordinal", ordinal: 3, weekday: 2 });
    expect(byId("yearly")).toEqual({ kind: "yearly", month: 9, day: 16 });
    expect(byId("weekday")).toEqual({ kind: "weekdays", days: [0, 1, 2, 3, 4] });
    // "Does not repeat" is the start date itself — never a blank that can
    // never come due.
    expect(byId("none")).toEqual({ kind: "once", date: "2026-09-16" });
  });

  it("still UNDERSTANDS the five patterns that left the menu", () => {
    /* Mon-Wed-Fri, Tue-Sat, Once in 15/30 Days and First Monday of Month were
       offered until this change and are STORED on live rows. They are shapes,
       not menu entries — dropping the shapes as well would have turned every one
       of those job descriptions into "Unknown" the day this shipped. */
    const mwf: Recurrence = { kind: "weekdays", days: [0, 2, 4] };
    expect(describeRecurrence(mwf)).toBe("Mon-Wed-Fri");
    expect(isDueOn(mwf, "2026-03-09")).toBe(true); // a Monday

    const d15: Recurrence = { kind: "interval", everyDays: 15, anchor: "2026-03-01" };
    expect(describeRecurrence(d15)).toContain("Once in 15 days");
    expect(isDueOn(d15, "2026-03-16")).toBe(true);

    const firstMonday: Recurrence = { kind: "monthly_ordinal", ordinal: 1, weekday: 0 };
    expect(isDueOn(firstMonday, "2026-03-02")).toBe(true);
  });
});

describe("Does not repeat", () => {
  it("fires on its one day and never again", () => {
    const r: Recurrence = { kind: "once", date: "2026-03-12" };
    expect(isDueOn(r, "2026-03-12")).toBe(true);
    expect(isDueOn(r, "2026-03-13")).toBe(false);
    expect(isDueOn(r, "2027-03-12")).toBe(false);
  });

  it("is never due while its date is missing", () => {
    // A half-filled form must not fire daily. The action rejects it too; this is
    // the second line of defence, for a row written before that rule existed.
    expect(isDueOn({ kind: "once", date: "" }, "2026-03-12")).toBe(false);
  });

  it("reads as the date, not as a rule", () => {
    expect(describeRecurrence({ kind: "once", date: "2026-03-12" })).toBe(
      "Does not repeat — 12/03/2026",
    );
  });
});

describe("Annually on [Date]", () => {
  it("fires on the same day and month every year", () => {
    const r: Recurrence = { kind: "yearly", month: 9, day: 12 };
    expect(isDueOn(r, "2026-09-12")).toBe(true);
    expect(isDueOn(r, "2027-09-12")).toBe(true);
    expect(isDueOn(r, "2026-09-11")).toBe(false);
    expect(isDueOn(r, "2026-10-12")).toBe(false);
  });

  it("falls back to 28 February for a 29th in a common year", () => {
    /* The alternative is skipping three years in four, which is never what
       anybody setting an annual job meant. */
    const leapDay: Recurrence = { kind: "yearly", month: 2, day: 29 };
    expect(isDueOn(leapDay, "2028-02-29")).toBe(true); // a leap year
    expect(isDueOn(leapDay, "2027-02-28")).toBe(true); // falls back
    expect(isDueOn(leapDay, "2027-03-01")).toBe(false);
    expect(isDueOn(leapDay, "2028-02-28")).toBe(false); // the 29th exists
  });

  it("reads in words", () => {
    expect(describeRecurrence({ kind: "yearly", month: 9, day: 12 })).toBe(
      "Annually on 12 September",
    );
  });

  it("is pushed to the DCC as ad-hoc — its mask cannot hold a yearly rule", () => {
    expect(toDccSchedule({ kind: "yearly", month: 9, day: 12 }).scheduleKind).toBe("adhoc");
    expect(toDccSchedule({ kind: "once", date: "2026-09-12" }).scheduleKind).toBe("adhoc");
  });
});

describe("weekdayOf", () => {
  it("is Monday-based, matching the DCC bit order", () => {
    // 9 March 2026 is a Monday.
    expect(weekdayOf("2026-03-09")).toBe(0);
    expect(weekdayOf("2026-03-14")).toBe(5); // Saturday
    expect(weekdayOf("2026-03-15")).toBe(6); // Sunday
  });
});

describe("isDueOn — weekday patterns", () => {
  it("fires daily Monday to Saturday, never Sunday", () => {
    // A "daily" task that fires on the org's weekly off produces an overdue row
    // nobody can clear.
    const r: Recurrence = { kind: "daily" };
    expect(isDueOn(r, "2026-03-09")).toBe(true); // Mon
    expect(isDueOn(r, "2026-03-14")).toBe(true); // Sat
    expect(isDueOn(r, "2026-03-15")).toBe(false); // Sun
  });

  it("fires only on the named days", () => {
    const mwf: Recurrence = { kind: "weekdays", days: [0, 2, 4] };
    expect(isDueOn(mwf, "2026-03-09")).toBe(true); // Mon
    expect(isDueOn(mwf, "2026-03-10")).toBe(false); // Tue
    expect(isDueOn(mwf, "2026-03-11")).toBe(true); // Wed
    expect(isDueOn(mwf, "2026-03-13")).toBe(true); // Fri
  });

  it("covers Tue-Sat", () => {
    const r: Recurrence = { kind: "weekdays", days: [1, 2, 3, 4, 5] };
    expect(isDueOn(r, "2026-03-09")).toBe(false); // Mon
    expect(isDueOn(r, "2026-03-10")).toBe(true); // Tue
    expect(isDueOn(r, "2026-03-14")).toBe(true); // Sat
  });
});

describe("isDueOn — interval", () => {
  it("counts from the anchor and drifts across weekdays", () => {
    // That drift is what "once in 15 days" means, as opposed to "every other
    // Friday" — which is why a weekday mask cannot express it.
    const r: Recurrence = { kind: "interval", everyDays: 15, anchor: "2026-01-31" };
    expect(isDueOn(r, "2026-01-31")).toBe(true);
    expect(isDueOn(r, "2026-02-15")).toBe(true);
    expect(isDueOn(r, "2026-03-02")).toBe(true);
    expect(isDueOn(r, "2026-02-14")).toBe(false);
  });

  it("handles a 30-day cycle across a month end", () => {
    const r: Recurrence = { kind: "interval", everyDays: 30, anchor: "2026-01-31" };
    expect(isDueOn(r, "2026-03-02")).toBe(true); // 31 Jan + 30 days
  });

  it("never fires before its anchor", () => {
    const r: Recurrence = { kind: "interval", everyDays: 15, anchor: "2026-03-01" };
    expect(isDueOn(r, "2026-02-14")).toBe(false);
  });
});

describe("nthWeekdayOfMonth", () => {
  it("finds the 2nd Saturday", () => {
    // March 2026 starts on a Sunday: Saturdays are 7, 14, 21, 28.
    expect(nthWeekdayOfMonth(2026, 3, 2, 5)).toBe("2026-03-14");
  });

  it("finds the first Monday", () => {
    expect(nthWeekdayOfMonth(2026, 3, 1, 0)).toBe("2026-03-02");
  });

  it("is correct in a month that STARTS on the weekday in question", () => {
    // August 2026 starts on a Saturday, so the 1st is the first Saturday and
    // the 8th is the second — the off-by-one this guards.
    expect(nthWeekdayOfMonth(2026, 8, 1, 5)).toBe("2026-08-01");
    expect(nthWeekdayOfMonth(2026, 8, 2, 5)).toBe("2026-08-08");
  });

  it("finds the last one", () => {
    expect(nthWeekdayOfMonth(2026, 3, -1, 5)).toBe("2026-03-28");
  });

  it("still finds a 4th in a 28-day February", () => {
    // Feb 2026 is exactly four weeks starting on a Sunday, so EVERY weekday
    // occurs exactly four times — the 4th always resolves, and the boundary
    // worth pinning is that the last one is not mistaken for a fifth.
    expect(nthWeekdayOfMonth(2026, 2, 4, 0)).toBe("2026-02-23"); // Monday
    expect(nthWeekdayOfMonth(2026, 2, 4, 6)).toBe("2026-02-22"); // Sunday
    expect(nthWeekdayOfMonth(2026, 2, -1, 6)).toBe("2026-02-22"); // same day
  });

  it("refuses a month outside 1-12 rather than computing nonsense", () => {
    expect(nthWeekdayOfMonth(2026, 0, 1, 0)).toBeNull();
    expect(nthWeekdayOfMonth(2026, 13, 1, 0)).toBeNull();
  });
});

describe("isDueOn — monthly ordinal", () => {
  it("fires on exactly one day a month", () => {
    const r: Recurrence = { kind: "monthly_ordinal", ordinal: 2, weekday: 5 };
    expect(isDueOn(r, "2026-03-14")).toBe(true);
    expect(isDueOn(r, "2026-03-07")).toBe(false); // 1st Saturday
    expect(isDueOn(r, "2026-03-21")).toBe(false); // 3rd Saturday
  });
});

describe("isDueOn — custom", () => {
  it("never fires automatically", () => {
    // A rule nobody has encoded must not silently fire every day; it shows in
    // the Bank and is pushed by hand.
    expect(isDueOn({ kind: "custom", label: "when the auditor calls" }, "2026-03-09")).toBe(
      false,
    );
  });
});

describe("toDccSchedule", () => {
  it("projects daily onto a Mon-Sat mask", () => {
    const s = toDccSchedule({ kind: "daily" });
    expect(s.scheduleKind).toBe("scheduled");
    expect(s.weekdays).toBe(0b0111111);
  });

  it("calls one named day a weekly slot and several a schedule", () => {
    expect(toDccSchedule({ kind: "weekdays", days: [5] }).scheduleKind).toBe("weekly");
    expect(toDccSchedule({ kind: "weekdays", days: [0, 2, 4] }).scheduleKind).toBe("scheduled");
  });

  it("sets the right bits", () => {
    // bit 0 = Monday, so Mon+Wed+Fri is 0b010101 = 21.
    expect(toDccSchedule({ kind: "weekdays", days: [0, 2, 4] }).weekdays).toBe(21);
  });

  it("sends what the mask CANNOT express to adhoc rather than faking it", () => {
    // Forcing an interval into a weekday pattern would be a lie the punch-out
    // gate then enforces daily.
    expect(
      toDccSchedule({ kind: "interval", everyDays: 15, anchor: "2026-01-01" }).scheduleKind,
    ).toBe("adhoc");
    expect(toDccSchedule({ kind: "custom", label: "x" }).scheduleKind).toBe("adhoc");
  });

  it("maps a monthly ordinal onto the monthly kind", () => {
    expect(
      toDccSchedule({ kind: "monthly_ordinal", ordinal: 2, weekday: 5 }).scheduleKind,
    ).toBe("monthly");
  });
});

describe("describeRecurrence", () => {
  it("says what each kind means in a sentence", () => {
    expect(describeRecurrence({ kind: "daily" })).toBe("Daily (Mon–Sat)");
    expect(describeRecurrence({ kind: "weekdays", days: [0] })).toBe("Every Monday");
    expect(describeRecurrence({ kind: "weekdays", days: [0, 2, 4] })).toBe("Mon-Wed-Fri");
    expect(describeRecurrence({ kind: "monthly_ordinal", ordinal: 2, weekday: 5 })).toBe(
      "2nd Saturday of the month",
    );
  });
});

describe("readRecurrence", () => {
  it("falls back rather than throwing on an unreadable row", () => {
    // The column is jsonb, so Postgres accepts anything — a row written by a
    // future version must not crash the Bank.
    expect(readRecurrence(null)).toEqual(DEFAULT_RECURRENCE);
    expect(readRecurrence({ kind: "nonsense" })).toEqual(DEFAULT_RECURRENCE);
    expect(readRecurrence("daily")).toEqual(DEFAULT_RECURRENCE);
  });

  it("passes a valid recurrence through untouched", () => {
    const r: Recurrence = { kind: "weekdays", days: [1, 3] };
    expect(readRecurrence(r)).toEqual(r);
    expect(isRecurrence(r)).toBe(true);
  });
});

describe("the Custom dialog's rule (kind: rrule)", () => {
  // 2026-09-16 is a Wednesday.
  const anchor = "2026-09-16";
  const r = (rule: string): Recurrence => ({ kind: "rrule", rule, anchor });

  it("never fires before the start date", () => {
    expect(isDueOn(r("FREQ=DAILY"), "2026-09-15")).toBe(false);
    expect(isDueOn(r("FREQ=DAILY"), "2026-09-16")).toBe(true);
  });

  it("KEEPS FIRING PAST THE GENERATOR'S 200-OCCURRENCE CAP", () => {
    /* This is why isDueOn matches the pattern directly instead of generating
       occurrences and checking membership: lib/recurrence/rrule.ts caps itself
       at 200 to stop a runaway rule spawning rows, so a daily job anchored a
       year back would answer "not due" for every day after the 200th — the push
       job would simply stop, silently, in month seven. */
    expect(isDueOn(r("FREQ=DAILY"), "2028-09-16")).toBe(true); // ~730 days out
  });

  it("counts a weekly INTERVAL in weeks, not in days", () => {
    // Every 2 weeks on Mon + Thu. Both days of an ACTIVE week must fire — a
    // day-based interval would drop the Thursday of every one.
    const every2 = r("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH");
    expect(isDueOn(every2, "2026-09-17")).toBe(true); // Thu, anchor week
    expect(isDueOn(every2, "2026-09-21")).toBe(false); // Mon, skipped week
    expect(isDueOn(every2, "2026-09-28")).toBe(true); // Mon, active week
    expect(isDueOn(every2, "2026-10-01")).toBe(true); // Thu, active week
  });

  it("honours UNTIL", () => {
    const until = r("FREQ=DAILY;UNTIL=2026-09-20");
    expect(isDueOn(until, "2026-09-20")).toBe(true);
    expect(isDueOn(until, "2026-09-21")).toBe(false);
  });

  it("honours COUNT, with the start date as occurrence #1", () => {
    const thrice = r("FREQ=DAILY;COUNT=3");
    expect(isDueOn(thrice, "2026-09-16")).toBe(true); // #1
    expect(isDueOn(thrice, "2026-09-18")).toBe(true); // #3
    expect(isDueOn(thrice, "2026-09-19")).toBe(false); // #4 — past the end
  });

  it("counts weekly occurrences across a PARTIAL first week", () => {
    /* The anchor is a Wednesday, so the Monday of its own week never happened
       and must not be counted against the total. Mon+Wed, 3 times → Wed 16th,
       Mon 21st, Wed 23rd, then stop. */
    const three = r("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3");
    expect(isDueOn(three, "2026-09-16")).toBe(true); // #1 Wed
    expect(isDueOn(three, "2026-09-21")).toBe(true); // #2 Mon
    expect(isDueOn(three, "2026-09-23")).toBe(true); // #3 Wed
    expect(isDueOn(three, "2026-09-28")).toBe(false); // #4 — past the end
  });

  it("matches a monthly nth-weekday and a monthly day-of-month", () => {
    expect(isDueOn(r("FREQ=MONTHLY;BYDAY=3WE"), "2026-10-21")).toBe(true);
    expect(isDueOn(r("FREQ=MONTHLY;BYDAY=3WE"), "2026-10-14")).toBe(false);
    expect(isDueOn(r("FREQ=MONTHLY;BYMONTHDAY=16"), "2026-11-16")).toBe(true);
  });

  it("skips a month that has no such day rather than pulling the date back", () => {
    // The 31st in a 30-day month does not happen — same as the generator.
    const d31: Recurrence = { kind: "rrule", rule: "FREQ=MONTHLY;BYMONTHDAY=31", anchor: "2026-01-31" };
    expect(isDueOn(d31, "2026-03-31")).toBe(true);
    expect(isDueOn(d31, "2026-04-30")).toBe(false);
  });

  it("speaks the dialog's own sentence in the Bank", () => {
    expect(describeRecurrence(r("FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH;COUNT=13"))).toBe(
      "Every 3 weeks on Tue, Thu, 13 times",
    );
  });

  it("projects a plain weekly rule onto the DCC mask, and everything else to adhoc", () => {
    // Mon + Thu = bits 0 and 3.
    expect(toDccSchedule(r("FREQ=WEEKLY;BYDAY=MO,TH"))).toMatchObject({
      scheduleKind: "scheduled",
      weekdays: 0b0001001,
    });
    // An INTERVAL has nowhere to live in a 7-bit mask, so it must NOT be
    // flattened into "every week" — the gate would then enforce the lie daily.
    expect(toDccSchedule(r("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"))).toMatchObject({
      scheduleKind: "adhoc",
      weekdays: null,
    });
  });

  it("is a recognised shape, so the Bank does not fall back on it", () => {
    expect(isRecurrence(r("FREQ=DAILY"))).toBe(true);
    expect(readRecurrence(r("FREQ=DAILY"))).toEqual(r("FREQ=DAILY"));
  });

  it("never comes due on an unreadable rule", () => {
    // A rule the generator cannot read must fire NEVER, not every day.
    expect(isDueOn(r("nonsense"), "2026-09-16")).toBe(false);
    expect(isDueOn(r(""), "2026-09-16")).toBe(false);
  });
});
