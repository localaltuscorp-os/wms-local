import { describe, it, expect } from "vitest";
import { parseTaskFilters, taskFiltersToSearchString } from "@/lib/task-filters";

const ME = "33333333-3333-3333-3333-333333333333";

describe("parseTaskFilters", () => {
  it("returns empties for no params", () => {
    const f = parseTaskFilters({}, /*archived*/ false);
    expect(f.statuses).toEqual([]);
    expect(f.doerIds).toEqual([]);
    expect(f.priorities).toEqual([]);
    expect(f.archived).toBe(false);
    expect(f.assigneeMode).toBe("all");
  });

  it("treats the 'archived' status chip as the archived flag, not a real status", () => {
    const f = parseTaskFilters({ status: "archived" }, /*archived*/ false);
    expect(f.archived).toBe(true);
    expect(f.statuses).toEqual([]); // 'archived' is not a real TaskStatus
  });

  it("keeps real statuses while the 'archived' chip flips archived on", () => {
    const f = parseTaskFilters({ status: "done,archived" }, false);
    expect(f.archived).toBe(true);
    expect(f.statuses).toEqual(["done"]);
  });

  it("stays active when the archived chip is absent", () => {
    const f = parseTaskFilters({ status: "done" }, false);
    expect(f.archived).toBe(false);
  });

  it("parses comma-separated multi-values", () => {
    const f = parseTaskFilters(
      {
        status: "need_help,not_started",
        prio: "imp_urgent,not_imp_urgent",
        dept: "Sales,Marketing",
        emp: "11111111-1111-1111-1111-111111111111",
        initiator: "22222222-2222-2222-2222-222222222222",
        subj: "Loan,Followup",
      },
      false,
    );
    expect(f.statuses).toEqual(["need_help", "not_started"]);
    expect(f.priorities).toEqual(["imp_urgent", "not_imp_urgent"]);
    expect(f.departments).toEqual(["Sales", "Marketing"]);
    expect(f.doerIds).toEqual(["11111111-1111-1111-1111-111111111111"]);
    expect(f.initiatorIds).toEqual(["22222222-2222-2222-2222-222222222222"]);
    expect(f.subjects).toEqual(["Loan", "Followup"]);
    expect(f.assigneeMode).toBe("specific");
  });

  it("ignores invalid values silently", () => {
    const f = parseTaskFilters(
      { status: "made_up,need_help", prio: "fake_quad", dept: "Bogus" },
      false,
    );
    expect(f.statuses).toEqual(["need_help"]);
    expect(f.priorities).toEqual([]);
    expect(f.departments).toEqual([]);
  });

  it("round-trips through toSearchString", () => {
    const orig = {
      startDate: null,
      endDate: null,
      statuses: ["need_help" as const],
      doerIds: [],
      initiatorIds: [],
      departments: ["Sales" as const],
      priorities: ["imp_urgent" as const],
      subjects: [],
      clients: [],
      taskId: null,
      archived: false,
      assigneeMode: "all" as const,
    };
    const qs = taskFiltersToSearchString(orig);
    const round = parseTaskFilters(Object.fromEntries(new URLSearchParams(qs)), false);
    expect(round.statuses).toEqual(orig.statuses);
    expect(round.departments).toEqual(orig.departments);
    expect(round.priorities).toEqual(orig.priorities);
    expect(round.assigneeMode).toBe("all");
  });
});

describe("parseTaskFilters — default-to-me scoping", () => {
  it("non-admin with no `emp` param defaults to [me.id] (mode=default)", () => {
    const f = parseTaskFilters({}, false, { defaultDoerId: ME });
    expect(f.doerIds).toEqual([ME]);
    expect(f.assigneeMode).toBe("default");
  });

  it("admin (no defaultDoerId) with no `emp` param sees all (mode=all)", () => {
    const f = parseTaskFilters({}, false);
    expect(f.doerIds).toEqual([]);
    expect(f.assigneeMode).toBe("all");
  });

  it("non-admin with `emp=all` explicitly shows all (mode=all)", () => {
    const f = parseTaskFilters({ emp: "all" }, false, { defaultDoerId: ME });
    expect(f.doerIds).toEqual([]);
    expect(f.assigneeMode).toBe("all");
  });

  it("non-admin with explicit `emp=<id>` respects the param (mode=specific)", () => {
    const other = "44444444-4444-4444-4444-444444444444";
    const f = parseTaskFilters({ emp: other }, false, { defaultDoerId: ME });
    expect(f.doerIds).toEqual([other]);
    expect(f.assigneeMode).toBe("specific");
  });

  it("non-admin with empty `emp=` string falls back to all (not default)", () => {
    // Empty string means "the user cleared it"; treat as explicit "all".
    const f = parseTaskFilters({ emp: "" }, false, { defaultDoerId: ME });
    expect(f.doerIds).toEqual([]);
    expect(f.assigneeMode).toBe("all");
  });

  it("non-admin with `emp=<id1>,<id2>` parses both IDs (mode=specific)", () => {
    const id1 = "55555555-5555-5555-5555-555555555555";
    const id2 = "66666666-6666-6666-6666-666666666666";
    const f = parseTaskFilters({ emp: `${id1},${id2}` }, false, {
      defaultDoerId: ME,
    });
    expect(f.doerIds).toEqual([id1, id2]);
    expect(f.assigneeMode).toBe("specific");
  });

  it("round-trips emp=all through toSearchString", () => {
    const orig = parseTaskFilters({ emp: "all" }, false, { defaultDoerId: ME });
    const qs = taskFiltersToSearchString(orig);
    // The sentinel must survive serialization.
    expect(qs).toContain("emp=all");
    const round = parseTaskFilters(
      Object.fromEntries(new URLSearchParams(qs)),
      false,
      { defaultDoerId: ME },
    );
    expect(round.assigneeMode).toBe("all");
    expect(round.doerIds).toEqual([]);
  });
});

describe("default date range", () => {
  it("defaults start to 2026-01-01 and end to today when params absent", () => {
    const f = parseTaskFilters({}, false);
    expect(f.startDate?.toISOString().slice(0, 10)).toBe("2026-01-01");
    const today = new Date().toISOString().slice(0, 10);
    expect(f.endDate?.toISOString().slice(0, 10)).toBe(today);
  });
  it("respects explicit start/end params", () => {
    const f = parseTaskFilters({ start: "2026-03-05", end: "2026-03-10" }, false);
    expect(f.startDate?.toISOString().slice(0, 10)).toBe("2026-03-05");
    expect(f.endDate?.toISOString().slice(0, 10)).toBe("2026-03-10");
  });
});
