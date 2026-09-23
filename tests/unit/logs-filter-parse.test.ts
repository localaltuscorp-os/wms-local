import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  filtersToParams,
  parseLogFilters,
} from "@/lib/logs/filters";

/**
 * The Logs URL is the single source of filter state. The parser must accept
 * every filter at once (none disables another), reject junk silently, and the
 * writer must round-trip what the parser read.
 */
describe("parseLogFilters", () => {
  it("reads every filter simultaneously", () => {
    const f = parseLogFilters({
      q: "om",
      fn: "f1,f2",
      emp: "e1",
      ent: "ent1",
      node: "wms,wms.tasks.kanban",
      event: "UPDATE,APPROVE",
      status: "SUCCESS,DENIED",
      from: "2026-09-22T04:00:00.000Z",
      to: "2026-09-22T13:00:00.000Z",
      sort: "person",
      page: "3",
      ps: "100",
    });
    expect(f.q).toBe("om");
    expect(f.functionIds).toEqual(["f1", "f2"]);
    expect(f.employeeIds).toEqual(["e1"]);
    expect(f.entityIds).toEqual(["ent1"]);
    expect(f.nodes).toEqual(["wms", "wms.tasks.kanban"]);
    expect(f.eventTypes).toEqual(["UPDATE", "APPROVE"]);
    expect(f.statuses).toEqual(["SUCCESS", "DENIED"]);
    expect(f.from).toBe("2026-09-22T04:00:00.000Z");
    expect(f.to).toBe("2026-09-22T13:00:00.000Z");
    expect(f.sort).toBe("person");
    expect(f.page).toBe(3);
    expect(f.pageSize).toBe(100);
  });

  it("drops invalid event types and node keys", () => {
    const f = parseLogFilters({ event: "UPDATE,NOT_A_TYPE", node: "wms,no.such.node" });
    expect(f.eventTypes).toEqual(["UPDATE"]);
    expect(f.nodes).toEqual(["wms"]);
  });

  it("rejects a bogus date and a bogus page number", () => {
    const f = parseLogFilters({ from: "not-a-date", page: "0", ps: "999" });
    expect(f.from).toBeNull();
    expect(f.page).toBe(1);
    expect(f.pageSize).toBe(50); // 999 is not in the allowed page sizes
  });

  it("defaults to empty filters", () => {
    expect(parseLogFilters({})).toEqual(EMPTY_FILTERS);
  });
});

describe("filtersToParams round-trip", () => {
  it("reproduces the filters it was given", () => {
    const original = parseLogFilters({
      q: "x",
      fn: "f1",
      emp: "e1,e2",
      ent: "ent1",
      node: "admin.system.logs",
      event: "EXPORT",
      status: "SUCCESS",
      from: "2026-09-22T04:00:00.000Z",
      sort: "oldest",
      page: "2",
      ps: "25",
    });
    const round = parseLogFilters(Object.fromEntries(filtersToParams(original).entries()));
    expect(round).toEqual(original);
  });

  it("omits default values from the URL", () => {
    const sp = filtersToParams(EMPTY_FILTERS);
    expect(sp.toString()).toBe("");
  });
});

describe("activeFilterCount", () => {
  it("counts active selections", () => {
    const f = parseLogFilters({ fn: "a,b,c", event: "UPDATE", q: "x", from: "2026-09-22T00:00:00Z" });
    // q(1) + three functions(3) + event(1) + date range(1) = 6
    expect(activeFilterCount(f)).toBe(6);
  });
});
