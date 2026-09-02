import { describe, it, expect } from "vitest";
import { parseTaskFilters, taskFiltersToSearchString } from "@/lib/task-filters";
import {
  FINE_AGING_BUCKETS,
  FINE_BUCKET_SLUGS,
} from "@/lib/transforms/aging-buckets-fine";

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
      activityType: null,
    overdue: false,
    unread: false,
    ageRange: null,
      assigneeMode: "all" as const,
      teams: ["mine"],
      viewerId: null,
    };
    const qs = taskFiltersToSearchString(orig);
    const round = parseTaskFilters(Object.fromEntries(new URLSearchParams(qs)), false);
    expect(round.statuses).toEqual(orig.statuses);
    expect(round.departments).toEqual(orig.departments);
    expect(round.teams).toEqual(orig.teams);
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

describe("overdue param", () => {
  it("parses ?overdue=true and its forgiving spellings", () => {
    for (const v of ["true", "TRUE", "1", "yes"]) {
      expect(parseTaskFilters({ overdue: v }, false).overdue).toBe(true);
    }
  });

  it("is false when absent or not a truthy spelling", () => {
    expect(parseTaskFilters({}, false).overdue).toBe(false);
    expect(parseTaskFilters({ overdue: "false" }, false).overdue).toBe(false);
    expect(parseTaskFilters({ overdue: "" }, false).overdue).toBe(false);
  });

  it("round-trips through taskFiltersToSearchString", () => {
    const parsed = parseTaskFilters(
      { emp: "e1", status: "not_approved", overdue: "true" },
      false,
    );
    const qs = taskFiltersToSearchString(parsed);
    const back = parseTaskFilters(Object.fromEntries(new URLSearchParams(qs)), false);
    expect(back.overdue).toBe(true);
    expect(back.statuses).toEqual(["not_approved"]);
    expect(back.doerIds).toEqual(["e1"]);
  });

  it("drops the param entirely when false, so clean URLs stay clean", () => {
    const qs = taskFiltersToSearchString(parseTaskFilters({}, false));
    expect(qs).not.toContain("overdue");
  });
});

describe("age_range param", () => {
  it("parses every bucket slug back to its bucket key", () => {
    for (const key of FINE_AGING_BUCKETS) {
      const slug = FINE_BUCKET_SLUGS[key];
      expect(parseTaskFilters({ age_range: slug }, false).ageRange).toBe(key);
    }
  });

  it("resolves an unknown or absent slug to null rather than throwing", () => {
    expect(parseTaskFilters({}, false).ageRange).toBeNull();
    expect(parseTaskFilters({ age_range: "not_a_bucket" }, false).ageRange).toBeNull();
    expect(parseTaskFilters({ age_range: "" }, false).ageRange).toBeNull();
  });

  it("round-trips the drill-through URL the chart emits", () => {
    const parsed = parseTaskFilters(
      { age_range: "22_plus", status: "not_approved" },
      false,
    );
    expect(parsed.ageRange).toBe("22 or more days overdue");
    expect(parsed.statuses).toEqual(["not_approved"]);

    const qs = taskFiltersToSearchString(parsed);
    expect(qs).toContain("age_range=22_plus");
    const back = parseTaskFilters(Object.fromEntries(new URLSearchParams(qs)), false);
    expect(back.ageRange).toBe(parsed.ageRange);
    expect(back.statuses).toEqual(parsed.statuses);
  });

  it("omits the param when unset, so clean URLs stay clean", () => {
    expect(taskFiltersToSearchString(parseTaskFilters({}, false))).not.toContain("age_range");
  });
});

describe("team param", () => {
  it("parses a single team and a comma-separated list", () => {
    expect(parseTaskFilters({ team: "mine" }, false).teams).toEqual(["mine"]);
    expect(parseTaskFilters({ team: "Sales,mine" }, false).teams).toEqual(["Sales", "mine"]);
  });

  it("accepts my_team as an alias for the canonical mine", () => {
    expect(parseTaskFilters({ team: "my_team" }, false).teams).toEqual(["mine"]);
    expect(parseTaskFilters({ team: "my_team,Sales" }, false).teams).toEqual(["mine", "Sales"]);
  });

  it("is empty when absent", () => {
    expect(parseTaskFilters({}, false).teams).toEqual([]);
  });

  it("round-trips through taskFiltersToSearchString", () => {
    const parsed = parseTaskFilters({ team: "mine,Sales" }, false);
    const qs = taskFiltersToSearchString(parsed);
    expect(qs).toContain("team=mine%2CSales");
    expect(parseTaskFilters(Object.fromEntries(new URLSearchParams(qs)), false).teams).toEqual([
      "mine",
      "Sales",
    ]);
  });

  it("omits the param when nothing is selected", () => {
    expect(taskFiltersToSearchString(parseTaskFilters({}, false))).not.toContain("team=");
  });
});
