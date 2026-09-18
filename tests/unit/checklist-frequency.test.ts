import { describe, it, expect } from "vitest";
import {
  currentOccurrence,
  frequencyOf,
  frequencyText,
  reanchorRule,
  repeatText,
  ruleForFrequency,
} from "@/lib/operations/checklist-frequency";

/**
 * THE CHECKLIST'S FREQUENCY AND TARGET DATE (account holder, 2026-09-18).
 *
 * One stored rule feeds two columns: Target Date edits it through Google
 * Calendar's menu, and Frequency (Daily / Weekly / Monthly / Quarterly /
 * Yearly) reads from it. These pin that the two agree, and that a repeating
 * row is measured against the occurrence due now — not the day it was set.
 */

// 2026-09-18 is a Friday, the third Friday of September.
const FRI = "2026-09-18";

describe("Frequency ⇄ rule", () => {
  it("writes the rule each Frequency stands for, about the row's date", () => {
    expect(ruleForFrequency("once", FRI)).toBeNull();
    expect(ruleForFrequency("daily", FRI)).toBe("FREQ=DAILY");
    expect(ruleForFrequency("weekly", FRI)).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(ruleForFrequency("monthly", FRI)).toBe("FREQ=MONTHLY;BYDAY=3FR");
    expect(ruleForFrequency("quarterly", FRI)).toBe("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=18");
    expect(ruleForFrequency("yearly", FRI)).toBe("FREQ=YEARLY");
  });

  it("reads every Frequency back from the rule it wrote", () => {
    for (const f of ["once", "daily", "weekly", "monthly", "quarterly", "yearly"] as const) {
      expect(frequencyOf(ruleForFrequency(f, FRI))).toBe(f);
    }
  });

  it("reads Google's other presets as the Frequency they are", () => {
    expect(frequencyOf("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("weekly");
    expect(frequencyOf("FREQ=MONTHLY;BYMONTHDAY=5")).toBe("monthly");
  });

  it("calls a rule none of the six can name custom, and says it in words", () => {
    expect(frequencyOf("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR")).toBe("custom");
    expect(frequencyText("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR", FRI)).toBe("Every 2 weeks on Fri");
    expect(frequencyText(null, FRI)).toBe("One-time");
    expect(frequencyText("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=18", FRI)).toBe("Quarterly");
  });
});

describe("the line under the date", () => {
  it("speaks Google's preset about the row's date", () => {
    expect(repeatText("FREQ=WEEKLY;BYDAY=FR", FRI)).toBe("Weekly on Friday");
    expect(repeatText("FREQ=MONTHLY;BYDAY=3FR", FRI)).toBe("Monthly on the third Friday");
    expect(repeatText(null, FRI)).toBeNull();
  });
});

describe("moving the date", () => {
  it("moves a preset with it — Weekly on Friday becomes Weekly on Saturday", () => {
    expect(reanchorRule("FREQ=WEEKLY;BYDAY=FR", FRI, "2026-09-19")).toBe("FREQ=WEEKLY;BYDAY=SA");
    expect(reanchorRule("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=18", FRI, "2026-09-25")).toBe(
      "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=25",
    );
  });

  it("keeps a custom rule, which is the user's own sentence", () => {
    const custom = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH";
    expect(reanchorRule(custom, FRI, "2026-09-21")).toBe(custom);
    expect(reanchorRule(null, FRI, "2026-09-21")).toBeNull();
  });
});

describe("the Target Date a repeating row is measured against", () => {
  it("is the row's own date when it does not repeat, or is still ahead", () => {
    expect(currentOccurrence("2026-09-01", null, FRI)).toBe("2026-09-01");
    expect(currentOccurrence("2026-10-01", "FREQ=DAILY", FRI)).toBe("2026-10-01");
  });

  it("is today for a daily row set weeks ago — not weeks overdue", () => {
    expect(currentOccurrence("2026-08-01", "FREQ=DAILY", FRI)).toBe(FRI);
  });

  it("is the latest occurrence on or before the day", () => {
    // Weekly on Monday, asked on a Friday → that week's Monday.
    expect(currentOccurrence("2026-08-03", "FREQ=WEEKLY;BYDAY=MO", FRI)).toBe("2026-09-14");
    // Quarterly on the 5th from 5 Jan → 5 July, the last quarter to have begun.
    expect(currentOccurrence("2026-01-05", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5", FRI)).toBe("2026-07-05");
  });

  it("walks past the generator's 200-date page for an old daily row", () => {
    expect(currentOccurrence("2025-01-01", "FREQ=DAILY", FRI)).toBe(FRI);
  });

  it("stops at the rule's own end", () => {
    expect(currentOccurrence("2026-09-01", "FREQ=DAILY;COUNT=3", FRI)).toBe("2026-09-03");
    expect(currentOccurrence("2026-09-01", "FREQ=DAILY;UNTIL=2026-09-10", FRI)).toBe("2026-09-10");
  });
});
