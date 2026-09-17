import { describe, it, expect } from "vitest";
import {
  DCC_SCHEDULE_CHOICES,
  FULL_WEEK_MASK,
  WORKING_WEEK_MASK,
  bitsOf,
  describeSchedule,
  isCompleteSchedule,
  maskOf,
  nextDueOnOrAfter,
  resolveSchedule,
  scheduleOf,
  type DccSchedule,
} from "@/lib/dcc/frequency";
import { parseFrequency, scheduledDueOn } from "@/lib/dcc/util";

/**
 * PICKING WHEN A COMPLIANCE IS DUE.
 *
 * The bug being closed: the add form wrote `frequency` text only, leaving
 * `weekdays` NULL — which `scheduledDueOn` reads as "due every day". So "Every
 * Friday" produced a compliance due seven days a week. These tests hold the
 * three values together.
 */

const MON = "2026-09-14";
const FRI = "2026-09-18";
const SUN = "2026-09-20";

const dueOn = (mask: number, ymd: string) =>
  scheduledDueOn(
    { weekdays: mask, scheduleKind: "scheduled", isParticipantList: false },
    new Date(`${ymd}T00:00:00Z`),
  );

describe("a picked schedule writes all three values", () => {
  it("makes every working day mean Monday to Saturday, not Sunday", () => {
    const r = resolveSchedule({ choice: "working", weekdays: [] });
    expect(r.frequency).toBe("Daily");
    expect(r.weekdays).toBe(WORKING_WEEK_MASK);
    expect(r.scheduleKind).toBe("scheduled");
    expect(dueOn(r.weekdays, MON)).toBe(true);
    expect(dueOn(r.weekdays, SUN)).toBe(false);
  });

  it("makes every day include Sunday", () => {
    const r = resolveSchedule({ choice: "everyday", weekdays: [] });
    expect(r.weekdays).toBe(FULL_WEEK_MASK);
    expect(dueOn(r.weekdays, SUN)).toBe(true);
  });

  it("is due on the chosen days and no others", () => {
    // THE ORIGINAL BUG, stated as a test: a Friday-only compliance must not be
    // due on Monday. It used to be, because `weekdays` was never written.
    const r = resolveSchedule({ choice: "days", weekdays: [4] });
    expect(r.weekdays).toBe(maskOf([4]));
    expect(dueOn(r.weekdays, FRI)).toBe(true);
    expect(dueOn(r.weekdays, MON)).toBe(false);
  });

  it("never leaves the mask null, whatever is picked", () => {
    for (const choice of DCC_SCHEDULE_CHOICES) {
      const r = resolveSchedule({ choice, weekdays: [0, 2, 4] });
      expect(r.weekdays).toBeGreaterThan(0);
      expect(r.needsReview).toBe(false);
    }
  });
});

describe("the stored text reads back as the same schedule", () => {
  // The importer and the position master still go through `parseFrequency`, so
  // a row this form writes must land in the same place when re-parsed.
  const cases: DccSchedule[] = [
    { choice: "working", weekdays: [] },
    { choice: "everyday", weekdays: [] },
    { choice: "days", weekdays: [4] },
    { choice: "days", weekdays: [0, 2, 4] },
    { choice: "days", weekdays: [5, 6] },
    { choice: "days", weekdays: [0, 1, 2, 3, 4, 5, 6] },
  ];

  for (const s of cases) {
    it(`round-trips ${s.choice} ${s.weekdays.join("/") || "-"}`, () => {
      const r = resolveSchedule(s);
      const back = parseFrequency(r.frequency);
      expect(back.scheduleKind).toBe("scheduled");
      expect(back.weekdays).toBe(r.weekdays);
      expect(back.needsReview).toBe(false);
    });
  }
});

describe("a schedule with no day is refused, not silently daily", () => {
  it("reports itself incomplete", () => {
    expect(isCompleteSchedule({ choice: "days", weekdays: [] })).toBe(false);
    expect(describeSchedule({ choice: "days", weekdays: [] })).toMatch(/never be due/i);
    expect(nextDueOnOrAfter({ choice: "days", weekdays: [] }, MON)).toBeNull();
  });

  it("counts the presets as complete without any day picked", () => {
    expect(isCompleteSchedule({ choice: "working", weekdays: [] })).toBe(true);
    expect(isCompleteSchedule({ choice: "everyday", weekdays: [] })).toBe(true);
  });
});

describe("next due", () => {
  it("is today when today is a due day", () => {
    expect(nextDueOnOrAfter({ choice: "working", weekdays: [] }, MON)).toBe(MON);
  });

  it("skips forward to the next chosen day", () => {
    expect(nextDueOnOrAfter({ choice: "days", weekdays: [4] }, MON)).toBe(FRI);
  });

  it("wraps into next week rather than giving up", () => {
    // Monday-only, asked on a Friday: the answer is the following Monday.
    expect(nextDueOnOrAfter({ choice: "days", weekdays: [0] }, FRI)).toBe("2026-09-21");
  });
});

describe("opening the edit form on an existing row", () => {
  it("prefers the mask the board obeys over the text", () => {
    // A row whose text and column disagree is exactly what the old writer
    // produced. The column wins, because that is what actually happened.
    expect(scheduleOf({ frequency: "Every Friday", weekdays: WORKING_WEEK_MASK })).toEqual({
      choice: "working",
      weekdays: [],
    });
  });

  it("falls back to the text when the column was never written", () => {
    expect(scheduleOf({ frequency: "Mon & Wed", weekdays: null })).toEqual({
      choice: "days",
      weekdays: [0, 2],
    });
  });

  it("round-trips a chosen-days row through the form and back", () => {
    const original = { choice: "days", weekdays: [1, 3] } as DccSchedule;
    const row = resolveSchedule(original);
    expect(scheduleOf({ frequency: row.frequency, weekdays: row.weekdays })).toEqual(original);
  });

  it("reads Sunday-inclusive rows as every day", () => {
    expect(bitsOf(FULL_WEEK_MASK)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(scheduleOf({ frequency: null, weekdays: FULL_WEEK_MASK }).choice).toBe("everyday");
  });
});
