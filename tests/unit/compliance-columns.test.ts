import { describe, it, expect } from "vitest";
import {
  DEFAULT_ORDER,
  columnLabel,
  moveColumn,
  reconcileOrder,
  sortRows,
  visibleColumns,
} from "@/lib/compliance/columns";
import type { ComplianceRow } from "@/lib/compliance/rows";

/**
 * WCC / MCC columns (account holder, 2026-09-18): every heading sorts, and a
 * column can be dragged anywhere — like the Tasks table.
 */

const row = (key: string, over: Partial<ComplianceRow>): ComplianceRow => ({
  key,
  itemId: key,
  ownerId: "p",
  ownerName: "Priya",
  kind: "wcc",
  mode: "day",
  title: `Task ${key}`,
  section: null,
  schedule: "Daily",
  scheduleKind: "scheduled",
  weekdays: 63,
  monthDay: null,
  deadline: "2026-09-18",
  doerStatus: null,
  doneAt: null,
  actual: null,
  variance: null,
  running: false,
  doerNotes: null,
  approver: "pending",
  approverNotes: null,
  fromMaster: null,
  canFill: true,
  approverChoices: [],
  canApproverNotes: false,
  canManage: false,
  ...over,
});

describe("column order", () => {
  it("moves a column to where it is dropped, either way", () => {
    const right = moveColumn(DEFAULT_ORDER, "compliance", "deadline");
    expect(right.indexOf("compliance")).toBe(right.indexOf("deadline") + 1);
    const left = moveColumn(DEFAULT_ORDER, "approverNotes", "compliance");
    expect(left.indexOf("approverNotes")).toBe(left.indexOf("compliance") - 1);
    expect(left).toHaveLength(DEFAULT_ORDER.length);
  });

  it("never moves the actions column, and keeps it last", () => {
    expect(moveColumn(DEFAULT_ORDER, "actions", "sr")).toEqual(DEFAULT_ORDER);
    expect(moveColumn(DEFAULT_ORDER, "sr", "actions")).toEqual(DEFAULT_ORDER);
  });

  it("reconciles a stored order: unknown and repeats dropped, missing appended", () => {
    const saved = ["deadline", "sr", "gone-column", "compliance", "sr"];
    const out = reconcileOrder(saved);
    expect(out.slice(0, 4)).toEqual(["deadline", "sr", "compliance", "employee"]);
    expect(out).not.toContain("gone-column");
    expect(new Set(out).size).toBe(DEFAULT_ORDER.length);
    expect(out[out.length - 1]).toBe("actions");
    expect(reconcileOrder(null)).toEqual(DEFAULT_ORDER);
  });

  it("shows Employee only in the team view", () => {
    expect(visibleColumns(DEFAULT_ORDER, false)).not.toContain("employee");
    expect(visibleColumns(DEFAULT_ORDER, true)).toContain("employee");
  });

  it("writes every heading out in full", () => {
    expect(columnLabel("compliance", "wcc")).toBe("Weekly Compliance");
    expect(columnLabel("compliance", "mcc")).toBe("Monthly Compliance");
    expect(columnLabel("var", "wcc")).toBe("+/- Days");
    expect(columnLabel("approverNotes", "mcc")).toBe("Approver Notes");
  });
});

describe("sorting within a group", () => {
  const rows = [
    row("a", { title: "Banana", variance: 2, doerStatus: "done", deadline: "2026-09-16" }),
    row("b", { title: "apple", variance: null, doerStatus: null, deadline: "2026-09-18" }),
    row("c", { title: "Cherry", variance: -1, doerStatus: "initiated", deadline: "2026-09-17" }),
  ];
  const keys = (r: ComplianceRow[]) => r.map((x) => x.key);

  it("is the checklist's own order with no sort, and S. No. reverses it", () => {
    expect(keys(sortRows(rows, null))).toEqual(["a", "b", "c"]);
    expect(keys(sortRows(rows, { key: "sr", dir: "desc" }))).toEqual(["c", "b", "a"]);
  });

  it("sorts text A–Z ignoring case, and dates in order", () => {
    expect(keys(sortRows(rows, { key: "compliance", dir: "asc" }))).toEqual(["b", "a", "c"]);
    expect(keys(sortRows(rows, { key: "deadline", dir: "desc" }))).toEqual(["b", "c", "a"]);
  });

  it("keeps blanks last in both directions", () => {
    expect(keys(sortRows(rows, { key: "var", dir: "asc" }))).toEqual(["c", "a", "b"]);
    expect(keys(sortRows(rows, { key: "var", dir: "desc" }))).toEqual(["a", "c", "b"]);
  });

  it("puts outstanding work first by Doer Status — not filled before Done", () => {
    expect(keys(sortRows(rows, { key: "doerStatus", dir: "asc" }))).toEqual(["b", "c", "a"]);
  });

  it("never reorders the rows it was given", () => {
    sortRows(rows, { key: "compliance", dir: "desc" });
    expect(keys(rows)).toEqual(["a", "b", "c"]);
  });
});
