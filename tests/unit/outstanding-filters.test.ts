import { describe, it, expect } from "vitest";
import {
  parseOutstandingFilters,
  applyOutstandingFilters,
  type OutstandingFilters,
} from "@/lib/outstanding/filters";

describe("parseOutstandingFilters", () => {
  it("reads comma-separated params into the right arrays, empty for unset", () => {
    const f = parseOutstandingFilters({
      emp: "a,b",
      status: "overdue",
      month: "03",
      entity: "Cash",
    });
    expect(f.employees).toEqual(["a", "b"]);
    expect(f.statuses).toEqual(["overdue"]);
    expect(f.months).toEqual(["03"]);
    expect(f.entities).toEqual(["Cash"]);
    expect(f.years).toEqual([]);
    expect(f.cycles).toEqual([]);
    expect(f.modes).toEqual([]);
    expect(f.pdcOnly).toBe(false);
  });

  it("parses pdc=1 into pdcOnly true", () => {
    expect(parseOutstandingFilters({ pdc: "1" }).pdcOnly).toBe(true);
    expect(parseOutstandingFilters({ pdc: "0" }).pdcOnly).toBe(false);
    expect(parseOutstandingFilters({}).pdcOnly).toBe(false);
  });
});

describe("applyOutstandingFilters", () => {
  const f = (over: Partial<OutstandingFilters> = {}): OutstandingFilters => ({
    employees: [], entities: [], months: [], years: [],
    cycles: [], modes: [], statuses: [], pdcOnly: false, ...over,
  });

  it("drops rows that don't match the status filter", () => {
    const rows = [
      { dueDate: "2026-01-15", state: "overdue" },
      { dueDate: "2026-01-15", state: "not_due" },
    ];
    const out = applyOutstandingFilters(rows, f({ statuses: ["overdue"] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("overdue");
  });

  it("keeps a due_soon row when statuses=['due_soon']", () => {
    const rows = [
      { dueDate: "2026-03-10", state: "due_soon" },
      { dueDate: "2026-03-10", state: "not_due" },
    ];
    const out = applyOutstandingFilters(rows, f({ statuses: ["due_soon"] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("due_soon");
  });

  it("filters by month-of-year, any year", () => {
    // A row dueDate "2026-03-15" passes months=["03"], fails months=["04"].
    const row = { dueDate: "2026-03-15", state: "overdue" };
    expect(applyOutstandingFilters([row], f({ months: ["03"] }))).toHaveLength(1);
    expect(applyOutstandingFilters([row], f({ months: ["04"] }))).toHaveLength(0);
    // Matches across years (month-only semantics).
    const rows = [
      { dueDate: "2025-03-01", state: "overdue" },
      { dueDate: "2026-03-31", state: "overdue" },
      { dueDate: "2026-02-28", state: "overdue" },
    ];
    expect(
      applyOutstandingFilters(rows, f({ months: ["03"] })).map((r) => r.dueDate),
    ).toEqual(["2025-03-01", "2026-03-31"]);
  });

  it("pdcOnly keeps only rows with pdcReceived === false", () => {
    const rows = [
      { dueDate: "2026-01-01", state: "overdue", pdcReceived: false },
      { dueDate: "2026-01-01", state: "overdue", pdcReceived: true },
      { dueDate: "2026-01-01", state: "overdue" }, // undefined → excluded
    ];
    const out = applyOutstandingFilters(rows, f({ pdcOnly: true }));
    expect(out).toHaveLength(1);
    expect(out[0]!.pdcReceived).toBe(false);
  });

  it("excludes rows missing/null on a field that has an active filter", () => {
    const rows = [
      { dueDate: "2026-01-01", state: "overdue", responsibleName: "Manan" },
      { dueDate: "2026-01-01", state: "overdue" }, // responsibleName absent
      { dueDate: "2026-01-01", state: "overdue", responsibleName: null },
    ];
    const out = applyOutstandingFilters(rows, f({ employees: ["Manan"] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.responsibleName).toBe("Manan");
  });
});
