import { describe, it, expect } from "vitest";
import {
  COLUMNS,
  DEFAULT_ORDER,
  columnDef,
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
  scheduleDetail: null,
  scheduleKind: "scheduled",
  weekdays: 63,
  monthDay: null,
  mcc: null,
  deadline: "2026-09-18",
  doerStatus: null,
  doneAt: null,
  actual: null,
  variance: null,
  running: false,
  opensOn: "2026-09-18",
  openUntil: "2026-09-18",
  locked: false,
  lapsed: false,
  carried: false,
  notYetOpen: false,
  quantity: null,
  completedQuantity: null,
  targetNumber: null,
  unit: null,
  minutes: null,
  doerNotes: null,
  approver: "pending",
  approverNotes: null,
  fromMaster: null,
  canFill: true,
  approverChoices: [],
  canApproverNotes: false,
  canManage: false,
  canSetMinutes: false,
  ...over,
});

describe("column order", () => {
  it("moves an ordinary column to where it is dropped, either way", () => {
    const right = moveColumn(DEFAULT_ORDER, "frequency", "deadline");
    expect(right.indexOf("frequency")).toBe(right.indexOf("deadline") + 1);
    const left = moveColumn(DEFAULT_ORDER, "approverNotes", "frequency");
    expect(left.indexOf("approverNotes")).toBe(left.indexOf("frequency") - 1);
    expect(left).toHaveLength(DEFAULT_ORDER.length);
  });

  it("keeps selection, identity and delete rails fixed", () => {
    expect(moveColumn(DEFAULT_ORDER, "select", "frequency")).toEqual(DEFAULT_ORDER);
    expect(moveColumn(DEFAULT_ORDER, "sr", "frequency")).toEqual(DEFAULT_ORDER);
    expect(moveColumn(DEFAULT_ORDER, "frequency", "compliance")).toEqual(DEFAULT_ORDER);
    expect(moveColumn(DEFAULT_ORDER, "section", "frequency")).toEqual(DEFAULT_ORDER);
    expect(moveColumn(DEFAULT_ORDER, "delete", "sr")).toEqual(DEFAULT_ORDER);
    expect(moveColumn(DEFAULT_ORDER, "sr", "delete")).toEqual(DEFAULT_ORDER);
  });

  it("reconciles a stored order: unknown and repeats dropped, a missing column after the one it follows", () => {
    const saved = ["deadline", "sr", "gone-column", "edit", "compliance", "sr"];
    const out = reconcileOrder(saved);
    expect(out.slice(0, 4)).toEqual(["select", "sr", "compliance", "section"]);
    expect(out.indexOf("mins")).toBe(out.indexOf("deadline") + 1);
    expect(out.indexOf("frequency")).toBe(out.indexOf("employee") + 1);
    expect(out).not.toContain("gone-column");
    expect(out).not.toContain("edit");
    expect(new Set(out).size).toBe(DEFAULT_ORDER.length);
    expect(out[out.length - 1]).toBe("delete");
    expect(reconcileOrder(null)).toEqual(DEFAULT_ORDER);
  });

  it("shows Employee only in the team view", () => {
    expect(visibleColumns(DEFAULT_ORDER, false, "wcc")).not.toContain("employee");
    expect(visibleColumns(DEFAULT_ORDER, true, "wcc")).toContain("employee");
  });

  it("writes every heading out in full", () => {
    expect(columnLabel("compliance", "wcc")).toBe("Weekly Compliance");
    expect(columnLabel("compliance", "mcc")).toBe("Monthly Compliance");
    expect(columnLabel("section", "wcc")).toBe("Section");
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

  it("sorts Quantity Done by the share of the target reached, shortest first, blanks last", () => {
    const t = (target: number) => ({ target, unit: null, source: "target" as const });
    const q = [
      row("full", { quantity: t(10), completedQuantity: 10, doerStatus: "done" }),
      row("none", { quantity: null }),
      row("short", { quantity: t(25), completedQuantity: 18, doerStatus: "done" }),
      row("open", { quantity: t(5), completedQuantity: null }),
    ];
    expect(keys(sortRows(q, { key: "qty", dir: "asc" }))).toEqual(["short", "full", "none", "open"]);
    expect(keys(sortRows(q, { key: "qty", dir: "desc" }))).toEqual(["full", "short", "none", "open"]);
  });
});

describe("the Quantity Done column", () => {
  it("sits beside the Doer Status, and a stored order gains it without losing its own", () => {
    expect(DEFAULT_ORDER.indexOf("qty")).toBe(DEFAULT_ORDER.indexOf("doerStatus") + 1);
    expect(columnLabel("qty", "wcc")).toBe("Quantity Done");
    const before = DEFAULT_ORDER.filter((k) => k !== "qty");
    const out = reconcileOrder(before);
    expect(out.filter((k) => k !== "qty")).toEqual(before);
    expect(out).toContain("qty");
  });
});

describe("WCC's Mins, where Deadline was (account holder, 2026-09-19)", () => {
  it("WCC shows Mins and no Deadline; MCC keeps its Deadline and has no Mins", () => {
    const wcc = visibleColumns(DEFAULT_ORDER, false, "wcc");
    expect(wcc).toContain("mins");
    expect(wcc).not.toContain("deadline");
    expect(wcc.indexOf("mins")).toBe(wcc.indexOf("frequency") + 1);
    const mcc = visibleColumns(DEFAULT_ORDER, false, "mcc");
    expect(mcc).toContain("deadline");
    expect(mcc).not.toContain("mins");
    expect(columnLabel("mins", "wcc")).toBe("Mins");
  });

  it("puts Mins where a person keeps Deadline in the order they saved, the rest untouched", () => {
    const before = ["sr", "compliance", "deadline", "frequency", "doerStatus", "qty", "actual", "var", "approver", "doerNotes", "approverNotes", "employee"];
    const out = reconcileOrder(before);
    expect(out.indexOf("mins")).toBe(out.indexOf("deadline") + 1);
    expect(out.filter((k) => !["select", "section", "mins", "edit", "delete"].includes(k))).toEqual(before);
    // …so on WCC, Mins stands exactly where Deadline stood.
    const shown = visibleColumns(out, false, "wcc");
    expect(shown.slice(0, 6)).toEqual(["select", "sr", "compliance", "section", "mins", "frequency"]);
  });

  it("sorts by Mins, blanks last both ways", () => {
    const m = [row("a", { minutes: 30 }), row("b", { minutes: null }), row("c", { minutes: 5 })];
    const keys = (r: ComplianceRow[]) => r.map((x) => x.key);
    expect(keys(sortRows(m, { key: "mins", dir: "asc" }))).toEqual(["c", "a", "b"]);
    expect(keys(sortRows(m, { key: "mins", dir: "desc" }))).toEqual(["a", "c", "b"]);
  });
});

describe("MCC's Frequency is the day alone (account holder, 2026-09-19)", () => {
  const keys = (r: ComplianceRow[]) => r.map((x) => x.key);

  it("is narrow and numeric on MCC, and WCC's is as it was", () => {
    expect(columnDef("frequency", "mcc").width).toBeLessThan(COLUMNS.frequency.width);
    expect(columnDef("frequency", "mcc").sortKind).toBe("number");
    expect(columnDef("frequency", "wcc")).toBe(COLUMNS.frequency);
    expect(columnDef("mins", "mcc")).toBe(COLUMNS.mins);
  });

  it("sorts MCC by the day it is due — the 2nd before the 10th — whatever the frequency", () => {
    const m = [
      row("q", { kind: "mcc", schedule: "Quarterly", deadline: "2026-09-10" }),
      row("m", { kind: "mcc", schedule: "Monthly", deadline: "2026-09-30" }),
      row("a", { kind: "mcc", schedule: "Annually", deadline: "2026-09-02" }),
    ];
    expect(keys(sortRows(m, { key: "frequency", dir: "asc" }))).toEqual(["a", "q", "m"]);
    expect(keys(sortRows(m, { key: "frequency", dir: "desc" }))).toEqual(["m", "q", "a"]);
  });

  it("still sorts WCC's by its words", () => {
    const w = [row("t", { schedule: "Tue & Thu" }), row("m", { schedule: "Mon to Sat" })];
    expect(keys(sortRows(w, { key: "frequency", dir: "asc" }))).toEqual(["m", "t"]);
  });
});
