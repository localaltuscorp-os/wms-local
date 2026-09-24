import { describe, it, expect } from "vitest";
import {
  checklistBulkColumns,
  checklistBulkPayload,
  checklistTemplateMatrix,
  parseFrequencyWord,
  parseSheetDate,
  readChecklistMatrix,
  type ChecklistBulkContext,
} from "@/lib/operations/checklist-bulk";

/**
 * Checklist bulk upload (account holder, 2026-09-18): a sheet of tasks onto a
 * checklist or a master, every row checked before anything is saved.
 */

const people = [
  { id: "p1", name: "Rekha Pillai" },
  { id: "p2", name: "Farhan Qureshi" },
  { id: "p3", name: "Amit Shah" },
  { id: "p4", name: "Amit Shah" },
];

const standing: ChecklistBulkContext = {
  target: "run",
  isEvent: false,
  eventDate: null,
  defaultOffset: null,
  today: "2026-09-18",
  people,
  subjects: ["Opening", "Closing"],
  clients: ["Sarvottam"],
};

const eventRun: ChecklistBulkContext = { ...standing, isEvent: true, eventDate: "2026-10-10", defaultOffset: -1 };
const eventMaster: ChecklistBulkContext = { ...standing, target: "master", isEvent: true, defaultOffset: 0 };

describe("dates in a sheet", () => {
  it("reads day-first dates, the way the business writes them", () => {
    expect(parseSheetDate("05/09/2026")).toBe("2026-09-05");
    expect(parseSheetDate("5-9-2026")).toBe("2026-09-05");
    expect(parseSheetDate("18.09.2026")).toBe("2026-09-18");
    expect(parseSheetDate("2026-09-18")).toBe("2026-09-18");
    expect(parseSheetDate("18-Sep-2026")).toBe("2026-09-18");
    expect(parseSheetDate("18 September 2026")).toBe("2026-09-18");
  });

  it("reads a real Excel date cell from its serial, with no timezone slip", () => {
    expect(parseSheetDate(46283)).toBe("2026-09-18");
  });

  it("refuses what is not a date", () => {
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate("next week")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });
});

describe("the Frequency column", () => {
  it("takes the WMS words, blank being One-time", () => {
    expect(parseFrequencyWord("")).toBe("once");
    expect(parseFrequencyWord("One-time")).toBe("once");
    expect(parseFrequencyWord("daily")).toBe("daily");
    expect(parseFrequencyWord("Weekly")).toBe("weekly");
    expect(parseFrequencyWord("every month")).toBe("monthly");
    expect(parseFrequencyWord("Quarterly")).toBe("quarterly");
    expect(parseFrequencyWord("Annually")).toBe("yearly");
    expect(parseFrequencyWord("fortnightly")).toBeNull();
  });
});

describe("a checklist sheet", () => {
  it("has the WMS columns, with Day only on an event checklist", () => {
    expect(checklistBulkColumns("run", false).map((c) => c.header)).toEqual([
      "Client",
      "Subject",
      "Task",
      "Doer",
      "Initiator",
      "Target Date",
      "Frequency",
    ]);
    expect(checklistBulkColumns("run", true).map((c) => c.header)).toContain("Day");
    expect(checklistBulkColumns("master", false).map((c) => c.header)).toEqual([
      "Task",
      "Subject",
      "Doer",
      "Backup",
      "Instructions",
      "File link",
    ]);
  });

  it("reads a clean row: people by name, the roster's spelling, the date and its repeat", () => {
    const { rows, error } = readChecklistMatrix(
      [
        ["Client", "Subject", "Task", "Doer", "Initiator", "Target Date", "Frequency"],
        ["sarvottam", "opening", "Unlock the office", "rekha pillai", "", "18/09/2026", "Weekly"],
      ],
      standing,
    );
    expect(error).toBeUndefined();
    const r = rows[0]!;
    expect(r.errors).toEqual([]);
    expect(r.client).toBe("Sarvottam");
    expect(r.category).toBe("Opening");
    expect(r.doerId).toBe("p1");
    expect(r.initiatorId).toBeNull();
    expect(r.targetDate).toBe("2026-09-18");
    expect(r.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(checklistBulkPayload(r, "run")).toMatchObject({ title: "Unlock the office", targetDate: "2026-09-18", doerId: "p1" });
  });

  it("stops a row whose person is unknown or ambiguous, or whose date is not a date", () => {
    const { rows } = readChecklistMatrix(
      [
        ["Task", "Doer", "Target Date", "Frequency"],
        ["A", "Nobody Known", "", ""],
        ["B", "Amit Shah", "", ""],
        ["C", "", "31/02/2026", ""],
        ["D", "", "", "fortnightly"],
        ["", "Rekha Pillai", "", ""],
      ],
      standing,
    );
    expect(rows.map((r) => r.errors.length > 0)).toEqual([true, true, true, true, true]);
    expect(rows[0]!.errors[0]).toMatch(/no employee called "Nobody Known"/);
    expect(rows[1]!.errors[0]).toMatch(/More than one employee/);
    expect(rows[4]!.errors).toContain("Task is empty");
  });

  it("keeps an unknown subject as typed, with a warning", () => {
    const { rows } = readChecklistMatrix([["Task", "Subject"], ["Tidy the store", "Housekeeping"]], standing);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.category).toBe("Housekeeping");
    expect(rows[0]!.warnings[0]).toMatch(/not in Admin Panel/);
  });

  it("starts a repeating standing row with no date today, and says so", () => {
    const { rows } = readChecklistMatrix([["Task", "Frequency"], ["Water the plants", "Daily"]], standing);
    expect(rows[0]!.targetDate).toBe("2026-09-18");
    expect(rows[0]!.recurrenceRule).toBe("FREQ=DAILY");
    expect(rows[0]!.warnings[0]).toMatch(/set to today/);
  });

  it("skips the template's hint row and blank rows", () => {
    const [header, hints] = checklistTemplateMatrix("run", false);
    const { rows } = readChecklistMatrix([header!, hints!, [], ["", "", "Real task"]], standing);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Real task");
  });
});

describe("an event checklist sheet", () => {
  it("takes a Day, or a Target Date counted from the event", () => {
    const { rows } = readChecklistMatrix(
      [
        ["Task", "Target Date", "Day", "Frequency"],
        ["By day", "", "-3", ""],
        ["By date", "12/10/2026", "", ""],
        ["Neither", "", "", ""],
        ["Both agree", "07/10/2026", "-3", ""],
        ["Both disagree", "07/10/2026", "+2", ""],
      ],
      eventRun,
    );
    expect(rows.map((r) => r.offsetDays)).toEqual([-3, 2, -1, -3, 2]);
    expect(rows.slice(0, 4).every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[4]!.errors[0]).toMatch(/disagree/);
    // A repeat on an event row is spoken about its own day.
    // Displayed as dd-MMM-yyyy since 2026-09-24 (formatDMY): 09/10/2026 cannot
    // be read without knowing whether the sheet is day-first or month-first,
    // and this string is read by people rather than parsed. INPUT is unchanged
    // - the rows above still supply 07/10/2026.
    expect(rows[2]!.when).toMatch(/1 day before the event · 09-Oct-2026/);
  });

  it("refuses a date more than a year from the event", () => {
    const { rows } = readChecklistMatrix([["Task", "Target Date"], ["Far", "01/01/2030"]], eventRun);
    expect(rows[0]!.errors[0]).toMatch(/within a year/);
  });
});

describe("a master sheet", () => {
  it("reads Day, Backup, Instructions and File link, and has no dates", () => {
    const { rows } = readChecklistMatrix(
      [
        ["Task", "Subject", "Day", "Doer", "Backup", "Instructions", "File link"],
        ["Freeze the register", "Closing", "+1", "Rekha Pillai", "Farhan Qureshi", "Before noon", "https://x.test/a"],
        ["No day", "", "", "", "", "", ""],
      ],
      eventMaster,
    );
    const [a, b] = rows;
    expect(a!.errors).toEqual([]);
    expect(a!.offsetDays).toBe(1);
    expect(a!.backupId).toBe("p2");
    expect(checklistBulkPayload(a!, "master")).toEqual({
      title: "Freeze the register",
      category: "Closing",
      offsetDays: 1,
      doerId: "p1",
      backupId: "p2",
      instructions: "Before noon",
      fileLink: "https://x.test/a",
    });
    expect(b!.offsetDays).toBe(0); // the group it was opened from
  });

  it("refuses a backup who is the doer, and a link that is not a web address", () => {
    const { rows } = readChecklistMatrix(
      [
        ["Task", "Doer", "Backup", "File link"],
        ["Same person", "Rekha Pillai", "Rekha Pillai", ""],
        ["Bad link", "", "", "drive/folder"],
      ],
      { ...eventMaster, isEvent: false },
    );
    expect(rows[0]!.errors[0]).toMatch(/backup must be someone other/);
    expect(rows[1]!.errors[0]).toMatch(/http/);
  });
});
