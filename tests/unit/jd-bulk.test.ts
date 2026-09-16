import { describe, it, expect } from "vitest";
import { jdBulkPayload, jdTemplateMatrix, parseFrequencyText, parseMinutes, parseYesNo, readJdMatrix } from "@/lib/jd/bulk";

/**
 * JOB DESCRIPTION BULK UPLOAD (account holder, 2026-09-15) — every task from an
 * Excel sheet in one go, as Master JD (a position) or personal JD (a person).
 */

const TODAY = "2026-09-15";

describe("frequency typed in words", () => {
  const f = (t: string) => parseFrequencyText(t, TODAY);

  it("reads the everyday patterns", () => {
    expect(f("")).toEqual({ recurrence: { kind: "daily" }, understood: true });
    expect(f("Daily").recurrence).toEqual({ kind: "daily" });
    expect(f("Every weekday").recurrence).toEqual({ kind: "weekdays", days: [0, 1, 2, 3, 4] });
    expect(f("Monday to Friday").recurrence).toEqual({ kind: "weekdays", days: [0, 1, 2, 3, 4] });
    expect(f("Weekly on Saturday").recurrence).toEqual({ kind: "weekdays", days: [5] });
    expect(f("Mon, Wed, Fri").recurrence).toEqual({ kind: "weekdays", days: [0, 2, 4] });
  });

  it("reads monthly, interval, yearly and one-off schedules", () => {
    expect(f("Monthly on the second Saturday").recurrence).toEqual({ kind: "monthly_ordinal", ordinal: 2, weekday: 5 });
    expect(f("First Monday of month").recurrence).toEqual({ kind: "monthly_ordinal", ordinal: 1, weekday: 0 });
    expect(f("Once in 15 days").recurrence).toEqual({ kind: "interval", everyDays: 15, anchor: TODAY });
    expect(f("Fortnightly").recurrence).toEqual({ kind: "interval", everyDays: 14, anchor: TODAY });
    expect(f("Annually on 15 Aug").recurrence).toEqual({ kind: "yearly", month: 8, day: 15 });
    expect(f("Once on 01/10/2026").recurrence).toEqual({ kind: "once", date: "2026-10-01" });
  });

  it("keeps anything else as a custom schedule, words intact", () => {
    expect(f("When the client asks")).toEqual({ recurrence: { kind: "custom", label: "When the client asks" }, understood: false });
  });
});

describe("cells", () => {
  it("reads time as minutes", () => {
    expect(parseMinutes("90")).toBe(90);
    expect(parseMinutes("1h 30m")).toBe(90);
    expect(parseMinutes("1.5 h")).toBe(90);
    expect(parseMinutes("30 min")).toBe(30);
    expect(parseMinutes("1:15")).toBe(75);
    expect(parseMinutes("soon")).toBeNull();
  });

  it("reads yes / no", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("✓")).toBe(true);
    expect(parseYesNo("No")).toBe(false);
    expect(parseYesNo("")).toBe(false);
  });
});

describe("reading a sheet", () => {
  const ctx = {
    positions: [{ id: "pos-ops-exec", title: "Operations · Executive", functionKey: "operations" }],
    people: [
      { id: "emp-neha", name: "Neha Shah" },
      { id: "emp-raj", name: "Raj Ragpasare" },
    ],
    today: TODAY,
  };

  it("reads the template's own example rows as clean", () => {
    const m = jdTemplateMatrix("Neha Shah");
    const { rows, error } = readJdMatrix(m, ctx);
    expect(error).toBeUndefined();
    // The hint row is skipped; the two examples are clean.
    const examples = rows;
    expect(examples).toHaveLength(2);
    expect(examples[0]).toMatchObject({ positionId: "pos-ops-exec", functionKey: "operations", estimatedMinutes: 20, pushDcc: true, errors: [] });
    expect(examples[1]).toMatchObject({ ownerEmployeeId: "emp-neha", functionKey: "operations", estimatedMinutes: 60, pushWms: true, errors: [] });
  });

  it("maps headers by their other names and flags what's wrong per row", () => {
    const { rows } = readJdMatrix(
      [
        ["Job Description", "Seat", "Employee", "Department", "How often", "Duration", "Video", "WMS", "Assigned to"],
        ["Order stationery", "Operations · Executive", "", "", "Monthly", "30", "", "yes", "Raj Ragpasare, Nobody"],
        ["", "Nope Position", "", "", "", "2000", "ftp://x", "", ""],
        ["Book cabs", "", "Neha Shah", "", "", "", "", "", ""],
        ["Pay rent", "Operations · Executive", "Neha Shah", "", "", "", "", "", ""],
      ],
      ctx,
    );
    expect(rows[0]).toMatchObject({ positionId: "pos-ops-exec", pushWms: true, assignIds: ["emp-raj"], errors: [] });
    expect(rows[0]!.warnings.join()).toMatch(/custom schedule/);
    expect(rows[0]!.warnings.join()).toMatch(/Nobody/);
    expect(rows[1]!.errors).toEqual(
      expect.arrayContaining([
        "Task is empty",
        'No position called "Nope Position"',
        'Time "2000" must be 1–960 minutes',
        "Video URL must start with http:// or https://",
      ]),
    );
    expect(rows[2]!.errors).toEqual(["Function is needed for a personal task"]);
    expect(rows[3]!.errors).toEqual(["Fill Position or Person, not both"]);
  });

  it("files rows with no owner under the person being uploaded for", () => {
    const { rows } = readJdMatrix([["Task", "Function"], ["Water the plants", "Admin"]], {
      ...ctx,
      defaultPerson: { id: "emp-neha", name: "Neha Shah" },
    });
    expect(rows[0]).toMatchObject({ ownerEmployeeId: "emp-neha", functionKey: "admin", errors: [] });
    expect(jdBulkPayload(rows[0]!)).toMatchObject({ ownerEmployeeId: "emp-neha", functionKey: "admin", task: "Water the plants" });
  });
});
