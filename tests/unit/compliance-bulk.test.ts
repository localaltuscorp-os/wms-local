import { describe, it, expect } from "vitest";
import {
  bulkColumns,
  bulkPayload,
  parseDeadlineDay,
  parseMonth,
  parseWeekdays,
  personLabels,
  readComplianceMatrix,
  type BulkPerson,
} from "@/lib/compliance/bulk";

/**
 * WCC / MCC bulk upload (account holder, 2026-09-19): the template's columns,
 * and a filled sheet read back row by row with its problems.
 */

const people: BulkPerson[] = [
  { id: "p-priya", name: "Priya Shah", email: "priya@altus.in" },
  { id: "p-ravi", name: "Ravi Rao", email: "ravi@altus.in" },
  { id: "p-rahul1", name: "Rahul Mehta", email: "rahul.m@altus.in" },
  { id: "p-rahul2", name: "Rahul Mehta", email: "rahul.mehta2@altus.in" },
];

const MCC_HEAD = ["Employee *", "Section", "Compliance *", "Frequency *", "Deadline Day *", "2nd Deadline Day", "3rd Deadline Day", "Due Month", "Target", "Unit"];
const WCC_HEAD = ["Employee *", "Section", "Compliance *", "Frequency *", "Days", "Target", "Unit"];
/** The template's first two rows — a title and a brief — above the header. */
const TITLE_ROWS = [["ALTUS Corp · MCC — Monthly Compliance Checklist · Bulk Upload"], ["One compliance per row"]];

const mcc = (...rows: unknown[][]) => readComplianceMatrix([...TITLE_ROWS, MCC_HEAD, ...rows], { kind: "mcc", people });
const wcc = (...rows: unknown[][]) => readComplianceMatrix([...TITLE_ROWS, WCC_HEAD, ...rows], { kind: "wcc", people });

describe("the template's columns", () => {
  it("are the checklist's own, in order", () => {
    expect(bulkColumns("wcc").map((c) => c.header)).toEqual(["Employee", "Section", "Compliance", "Frequency", "Days", "Mins", "Target", "Unit"]);
    expect(bulkColumns("mcc").map((c) => c.header)).toEqual([
      "Employee", "Section", "Compliance", "Frequency", "Deadline Day", "2nd Deadline Day", "3rd Deadline Day", "Due Month", "Target", "Unit",
    ]);
  });

  it("keep every hint within Excel's 255 characters", () => {
    for (const c of [...bulkColumns("wcc"), ...bulkColumns("mcc")]) expect(c.prompt.length, c.header).toBeLessThanOrEqual(255);
  });

  it("write a shared name with its email, so the pick is never ambiguous", () => {
    const l = personLabels(people);
    expect(l.get("p-priya")).toBe("Priya Shah");
    expect(l.get("p-rahul1")).toBe("Rahul Mehta (rahul.m@altus.in)");
  });
});

describe("cells", () => {
  it("reads days of the week however they are written", () => {
    expect(parseWeekdays("Mon, Wed & Fri")).toEqual({ days: [0, 2, 4] });
    expect(parseWeekdays("Monday/Thursday")).toEqual({ days: [0, 3] });
    expect(parseWeekdays("Mon - Sat")).toEqual({ days: [0, 1, 2, 3, 4, 5] });
    expect(parseWeekdays("mon to fri")).toEqual({ days: [0, 1, 2, 3, 4] });
    expect(parseWeekdays("tue thurs")).toEqual({ days: [1, 3] });
    expect(parseWeekdays("Weds")).toEqual({ days: [2] });
    expect(parseWeekdays("")).toEqual({ days: [] });
    expect(parseWeekdays("Mon, Funday")).toEqual({ error: '"funday" is not a day — use Mon, Tue, Wed, Thu, Fri, Sat, Sun.' });
  });

  it("reads a deadline day as a number, an ordinal, or month-end", () => {
    expect(parseDeadlineDay(5)).toBe(5);
    expect(parseDeadlineDay("15th")).toBe(15);
    expect(parseDeadlineDay("Day 7")).toBe(7);
    expect(parseDeadlineDay("Last day")).toBe(31);
    expect(parseDeadlineDay("month-end")).toBe(31);
    expect(parseDeadlineDay("EOM")).toBe(31);
    expect(parseDeadlineDay("")).toBe("blank");
    expect(parseDeadlineDay(32)).toHaveProperty("error");
    expect(parseDeadlineDay("soon")).toHaveProperty("error");
  });

  it("reads a month as a name, a number or a date in it", () => {
    expect(parseMonth("June")).toBe(6);
    expect(parseMonth("sept")).toBe(9);
    expect(parseMonth("Jun-2026")).toBe(6);
    expect(parseMonth(3)).toBe(3);
    expect(parseMonth("07")).toBe(7);
    expect(parseMonth(46188)).toBe(6); // an Excel date cell: 15-Jun-2026
    expect(parseMonth("2026-12-01")).toBe(12);
    expect(parseMonth("")).toBe("blank");
    expect(parseMonth("Juneteenth")).toHaveProperty("error");
  });
});

describe("reading an MCC sheet", () => {
  it("finds the header under the title rows and gives each row its Excel row number", () => {
    const { rows, error } = mcc(["Priya Shah", "Accounts", "Pay GST", "Monthly", 20, "", "", "", "", ""]);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 4, ownerId: "p-priya", title: "Pay GST", section: "Accounts", frequency: "Monthly", when: "by the 20th", errors: [], warnings: [] });
  });

  it("reads every frequency", () => {
    const { rows } = mcc(
      ["Priya Shah", "", "MIS", "2 times/month", 15, "Last day", "", "", "", ""],
      ["Priya Shah", "", "Bank rec", "3 times/month", 10, 20, "Last day", "", "", ""],
      ["Priya Shah", "", "AC service", "Alternate Month", "Last day", "", "", "February", "", ""],
      ["Priya Shah", "", "TDS return", "Quarterly", "Last day", "", "", "July", "", ""],
      ["Priya Shah", "", "Goal review", "Half Yearly", 15, "", "", "October", "", ""],
      ["Priya Shah", "", "Licence", "Annually", "Last day", "", "", "March", "", ""],
    );
    expect(rows.map((r) => r.errors)).toEqual([[], [], [], [], [], []]);
    expect(rows.map((r) => `${r.frequency} — ${r.when}`)).toEqual([
      "2 times/month — by the 15th & month-end",
      "3 times/month — by the 10th, 20th & month-end",
      "Alternate Month — by month-end · Feb, Apr, Jun, Aug, Oct, Dec",
      "Quarterly — by month-end · Jul, Oct, Jan, Apr",
      "Half Yearly — by the 15th · Oct, Apr",
      "Annually — by the end of March",
    ]);
    expect(bulkPayload(rows[0]!)).toMatchObject({ line: 4, ownerEmployeeId: "p-priya", mccFrequency: "twice_monthly", mccDays: [15, null], mccStartMonth: null });
    expect(bulkPayload(rows[3]!)).toMatchObject({ mccFrequency: "quarterly", mccDays: [null], mccStartMonth: 7 });
  });

  it("accepts the frequency however it is commonly written", () => {
    const { rows } = mcc(
      ["Priya Shah", "", "A", "twice a month", 15, "last", "", "", "", ""],
      ["Priya Shah", "", "B", "every quarter", 5, "", "", "Jun", "", ""],
      ["Priya Shah", "", "C", "YEARLY", 5, "", "", "Jan", "", ""],
      ["Priya Shah", "", "D", "half-yearly", 5, "", "", 4, "", ""],
    );
    expect(rows.map((r) => r.frequency)).toEqual(["2 times/month", "Quarterly", "Annually", "Half Yearly"]);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it("says what each broken row is missing", () => {
    const { rows } = mcc(
      ["", "", "No one", "Monthly", 5, "", "", "", "", ""],
      ["Priya Shah", "", "", "Monthly", 5, "", "", "", "", ""],
      ["Priya Shah", "", "No frequency", "", 5, "", "", "", "", ""],
      ["Priya Shah", "", "Odd frequency", "Fortnightly", 5, "", "", "", "", ""],
      ["Priya Shah", "", "No day", "Monthly", "", "", "", "", "", ""],
      ["Priya Shah", "", "One day short", "2 times/month", 15, "", "", "", "", ""],
      ["Priya Shah", "", "Out of order", "2 times/month", 20, 10, "", "", "", ""],
      ["Priya Shah", "", "No month", "Quarterly", 15, "", "", "", "", ""],
      ["Somebody Else", "", "Stranger", "Monthly", 5, "", "", "", "", ""],
      ["Rahul Mehta", "", "Which Rahul", "Monthly", 5, "", "", "", "", ""],
      ["Priya Shah", "", "Bad target", "Monthly", 5, "", "", "", "2.5", ""],
    );
    expect(rows.map((r) => r.errors[0])).toEqual([
      "Pick the Employee.",
      "Write the Compliance.",
      "Pick the Frequency.",
      '"Fortnightly" is not an MCC frequency — use Monthly, 2 times/month, 3 times/month, Alternate Month, Quarterly, Half Yearly, Annually.',
      "Pick the Deadline Day.",
      "2 times/month needs its 2nd Deadline Day.",
      "The deadline days must be different and in order — e.g. the 15th, then month-end.",
      "Quarterly needs its Due Month — a month it is due in.",
      '"Somebody Else" is not someone you can add compliances for — pick from the Employee list.',
      'Two people are called Rahul Mehta — pick "Name (email)" from the list.',
      "The Target must be a whole number, 1 or more — or blank.",
    ]);
  });

  it("warns about what a row's frequency does not use, and still reads it", () => {
    const [r] = mcc(["Priya Shah", "", "Monthly with extras", "Monthly", 5, 20, "", "June", "", ""]).rows;
    expect(r!.errors).toEqual([]);
    expect(r!.warnings).toEqual(["2nd Deadline Day ignored — Monthly has one deadline a month.", "Due Month ignored — Monthly is due every month."]);
  });

  it("matches people by the dropdown's label, their email, or their name", () => {
    const { rows } = mcc(
      ["Rahul Mehta (rahul.mehta2@altus.in)", "", "A", "Monthly", 5, "", "", "", "", ""],
      ["ravi@altus.in", "", "B", "Monthly", 5, "", "", "", "", ""],
      ["  priya   shah ", "", "C", "Monthly", 5, "", "", "", "", ""],
    );
    expect(rows.map((r) => r.ownerId)).toEqual(["p-rahul2", "p-ravi", "p-priya"]);
  });

  it("refuses the same compliance twice for one person, and skips blank rows", () => {
    const { rows } = mcc(
      ["Priya Shah", "", "Pay GST", "Monthly", 5, "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["Priya Shah", "", "pay  gst", "Monthly", 10, "", "", "", "", ""],
      ["Ravi Rao", "", "Pay GST", "Monthly", 10, "", "", "", "", ""],
    );
    expect(rows.map((r) => [r.line, r.errors])).toEqual([
      [4, []],
      [6, ["The same compliance for Priya Shah as row 4."]],
      [7, []],
    ]);
  });

  it("shows what Done will ask for", () => {
    const { rows } = mcc(
      ["Priya Shah", "", "Visit client sites", "Monthly", 5, "", "", "", 12, "visits"],
      ["Priya Shah", "", "Publish 4 case studies", "Monthly", 5, "", "", "", "", ""],
      ["Priya Shah", "", "File the return", "Monthly", 5, "", "", "", "", ""],
    );
    expect(rows.map((r) => r.counts)).toEqual(["12 visits", "4 (from the title)", null]);
  });

  it("explains a sheet it cannot read", () => {
    expect(readComplianceMatrix([["Name", "Phone"], ["x", "y"]], { kind: "mcc", people }).error).toMatch(/^No header row found/);
    expect(readComplianceMatrix([["Employee", "Compliance", "Section"]], { kind: "mcc", people }).error).toBe(
      "The sheet has no Frequency, Deadline Day columns.",
    );
  });
});

describe("reading a WCC sheet", () => {
  it("reads Mon to Sat, Mon to Sun and Each Day of the Week", () => {
    const { rows } = wcc(
      ["Priya Shah", "Calls", "Call every lead", "Mon to Sat", "", "", ""],
      ["Priya Shah", "", "Check the CCTV", "Mon to Sun", "", "", ""],
      ["Priya Shah", "", "Send 25 emails", "Each Day of the Week", "Mon, Wed, Fri", 25, "emails"],
      ["Priya Shah", "", "Weekly numbers", "Each Day of the Week", "Sat", "", ""],
    );
    expect(rows.map((r) => r.errors)).toEqual([[], [], [], []]);
    expect(rows.map((r) => r.frequency)).toEqual(["Mon to Sat", "Mon to Sun", "Each Day of the Week", "Each Day of the Week"]);
    expect(rows.map((r) => r.when)).toEqual(["Every day but Sunday", "Every day", "Each Mon, Wed & Fri", "Each Sat"]);
    expect(rows.map((r) => r.wcc)).toEqual([
      { mode: "days", weekdays: [0, 1, 2, 3, 4, 5] },
      { mode: "days", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      { mode: "days", weekdays: [0, 2, 4] },
      { mode: "days", weekdays: [5] },
    ]);
    expect(rows[2]!.counts).toBe("25 emails");
    expect(bulkPayload(rows[2]!)).toMatchObject({ wccMode: "days", weekdays: [0, 2, 4], targetQuantity: 25, unit: "emails" });
  });

  it("accepts the older words for the same three", () => {
    const { rows } = wcc(
      ["Priya Shah", "", "A", "Daily", "", "", ""],
      ["Priya Shah", "", "B", "every day", "", "", ""],
      ["Priya Shah", "", "C", "Selected days", "Tue & Thu", "", ""],
    );
    expect(rows.map((r) => r.frequency)).toEqual(["Mon to Sat", "Mon to Sun", "Each Day of the Week"]);
  });

  it("needs Days for Each Day of the Week, says when Mon to Sat / Sun ignore them, and refuses anything else", () => {
    const { rows } = wcc(
      ["Priya Shah", "", "A", "Each Day of the Week", "", "", ""],
      ["Priya Shah", "", "B", "Mon to Sat", "Mon, Tue", "", ""],
      ["Priya Shah", "", "C", "Mon to Sun", "Sun", "", ""],
      ["Priya Shah", "", "D", "Once a week", "Sat", "", ""],
    );
    expect(rows[0]!.errors).toEqual(["Each Day of the Week needs its Days — e.g. Mon, Wed, Fri."]);
    expect(rows[1]!.warnings).toEqual(["Days ignored — Mon to Sat is every day but Sunday."]);
    expect(rows[2]!.warnings).toEqual(["Days ignored — Mon to Sun is every day."]);
    expect(rows[3]!.errors).toEqual(['"Once a week" is not a WCC frequency — use Mon to Sat, Mon to Sun or Each Day of the Week.']);
  });
});

describe("WCC's Mins column (account holder, 2026-09-19)", () => {
  const HEAD = ["Employee *", "Section", "Compliance *", "Frequency *", "Days", "Mins", "Target", "Unit"];
  const read = (...rows: unknown[][]) => readComplianceMatrix([...TITLE_ROWS, HEAD, ...rows], { kind: "wcc", people });

  it("reads minutes however they are written, and blank as none", () => {
    const { rows } = read(
      ["Priya Shah", "", "A", "Mon to Sat", "", 30, "", ""],
      ["Priya Shah", "", "B", "Mon to Sun", "", "1h 30m", "", ""],
      ["Priya Shah", "", "C", "Each Day of the Week", "Mon, Wed", "", "", ""],
      ["Priya Shah", "", "D", "Mon to Sat", "", 30 / 1440, "", ""],
    );
    expect(rows.map((r) => r.errors)).toEqual([[], [], [], []]);
    expect(rows.map((r) => r.minutes)).toEqual([30, 90, null, 30]);
    expect(bulkPayload(rows[0]!)).toMatchObject({ minutes: 30 });
    expect(bulkPayload(rows[2]!)).not.toHaveProperty("minutes");
  });

  it("refuses Mins that are not a whole number of minutes, 1 to 1440", () => {
    const { rows } = read(
      ["Priya Shah", "", "A", "Mon to Sat", "", 0, "", ""],
      ["Priya Shah", "", "B", "Mon to Sat", "", "quick", "", ""],
      ["Priya Shah", "", "C", "Mon to Sat", "", 2000, "", ""],
    );
    for (const r of rows) expect(r.errors).toEqual(["Mins is a whole number of minutes, 1 to 1440 — or leave it blank."]);
  });

  it("matches the column however it is headed, and an older sheet without it still reads", () => {
    const { rows } = readComplianceMatrix(
      [["Employee", "Compliance", "Frequency", "Time (mins)"], ["Priya Shah", "A", "Mon to Sat", 20]],
      { kind: "wcc", people },
    );
    expect(rows[0]!.minutes).toBe(20);
    expect(wcc(["Priya Shah", "", "A", "Mon to Sat", "", "", ""]).rows[0]!.minutes).toBeNull();
  });

  it("has no Mins on MCC", () => {
    expect(bulkColumns("mcc").map((c) => c.field)).not.toContain("mins");
  });
});
