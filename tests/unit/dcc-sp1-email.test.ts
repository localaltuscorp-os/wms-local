import { describe, it, expect } from "vitest";
import { emptyCounts, type Sp1LogRow } from "@/lib/dcc/sp1";
import { countsForAll, countsForPerson, sp1EmailSection, sp1EmailTable } from "@/lib/dcc/sp1-email";

/**
 * The SP1 block of the 10 pm email (DCC-SPEC §10). What matters here is that the
 * email says the same thing as the screen — the same fifteen labels, the same
 * em-dash rule — and that its colours survive Gmail, which strips stylesheets.
 */

const rows: Sp1LogRow[] = [
  { employeeId: "a", logDate: "2026-09-14", disposition: "registered", count: 2 },
  { employeeId: "a", logDate: "2026-09-14", disposition: "ringing", count: 6 },
  { employeeId: "b", logDate: "2026-09-14", disposition: "registered", count: 1 },
];

describe("slicing the day", () => {
  it("takes one person's numbers out of everybody's", () => {
    expect(countsForPerson(rows, "a").registered).toBe(2);
    expect(countsForPerson(rows, "b").registered).toBe(1);
    expect(countsForPerson(rows, "b").ringing).toBe(0);
  });

  it("sums only the people asked for", () => {
    expect(countsForAll(rows, new Set(["a", "b"])).registered).toBe(3);
    expect(countsForAll(rows, new Set(["a"])).registered).toBe(2);
  });
});

describe("the table", () => {
  const html = sp1EmailTable(countsForPerson(rows, "a"), "Asha · Call outcomes");

  it("carries every colour inline, because Gmail strips stylesheets", () => {
    // The bands ARE how the sheet is read; losing them is not cosmetic.
    expect(html).toContain("background:#D9EAD3"); // the green band
    expect(html).toContain("background:#CC0000"); // Not Interested / DND
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
  });

  it("shows the same labels as the screen, sheet spelling included", () => {
    expect(html).toContain("Old Gratuate");
    expect(html).toContain("Connected to Not Connected Ratio");
  });

  it("computes the day from the same formulas", () => {
    // 2 registered + 6 ringing → 2 connected of 8, 25.0%.
    expect(html).toContain("25.0%");
  });
});

describe("a day nobody called", () => {
  it("says so in a sentence instead of printing fifteen zeros", () => {
    const html = sp1EmailSection({
      rows: [],
      people: [{ id: "a", name: "Asha" }],
      dayLabel: "Mon, 14 Sep 2026",
    });
    expect(html).toContain("No calls were logged");
    expect(html).not.toContain("<table");
  });

  it("prints an em-dash rather than 0% when there is no denominator", () => {
    const html = sp1EmailTable(emptyCounts(), "Nobody · Call outcomes");
    expect(html).toContain("—");
    expect(html).not.toContain("0.0%");
  });
});

describe("a team report", () => {
  const html = sp1EmailSection({
    rows,
    people: [
      { id: "a", name: "Asha" },
      { id: "b", name: "Ravi" },
    ],
    dayLabel: "Mon, 14 Sep 2026",
  });

  it("leads with the combined table, then each person", () => {
    // The manager's question is "how did the team do"; making them add up nine
    // tables to answer it is how a daily report stops being read.
    expect(html.indexOf("Everyone · Call outcomes")).toBeLessThan(
      html.indexOf("Asha · Call outcomes"),
    );
    expect(html).toContain("Ravi · Call outcomes");
  });

  it("omits a person who logged nothing", () => {
    const quiet = sp1EmailSection({
      rows,
      people: [
        { id: "a", name: "Asha" },
        { id: "z", name: "Zara" },
      ],
      dayLabel: "Mon, 14 Sep 2026",
    });
    expect(quiet).not.toContain("Zara · Call outcomes");
  });
});
