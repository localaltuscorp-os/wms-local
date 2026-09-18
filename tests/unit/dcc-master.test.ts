import { describe, it, expect } from "vitest";
import {
  describeSchedule,
  masterKpiFields,
  MASTER_SORT_BASE,
  planMasterSync,
  type LinkedItem,
  type MasterItem,
} from "@/lib/dcc/master";

/**
 * DCC MASTERS (account holder, 2026-09-15): a master DCC per position (the
 * designation), live-linked to everyone who holds it.
 */

const INTERN = "d-intern";
const OPS = "d-ops";

const master = (id: string, over: Partial<MasterItem> = {}): MasterItem => ({
  id,
  designationId: INTERN,
  section: "Self Hygiene",
  code: null,
  title: `Master ${id}`,
  frequency: "Daily",
  targetNumber: null,
  unit: null,
  sortOrder: 1,
  isActive: true,
  createdById: "manan",
  ...over,
});

const linkedFrom = (m: MasterItem, owner: string, itemId: string, over: Partial<LinkedItem> = {}): LinkedItem => ({
  ...masterKpiFields(m),
  itemId,
  masterItemId: m.id,
  ownerEmployeeId: owner,
  archived: false,
  ...over,
});

describe("applying a master to its position", () => {
  it("gives every holder each active master KPI, and nobody else", () => {
    const m = master("m1");
    const ops = planMasterSync(
      [{ id: "daniel", designationId: INTERN }, { id: "krish", designationId: INTERN }, { id: "rohan", designationId: OPS }, { id: "rudra", designationId: null }],
      [m, master("retired", { isActive: false })],
      [],
    );
    expect(ops).toEqual([
      { kind: "create", ownerEmployeeId: "daniel", masterItemId: "m1", createdById: "manan", fields: masterKpiFields(m) },
      { kind: "create", ownerEmployeeId: "krish", masterItemId: "m1", createdById: "manan", fields: masterKpiFields(m) },
    ]);
  });

  it("reads the frequency into the board's schedule and sorts master KPIs first", () => {
    expect(masterKpiFields(master("m", { frequency: "Wed & Sat", sortOrder: 3 }))).toMatchObject({
      scheduleKind: "scheduled",
      weekdays: 0b100100,
      sortOrder: MASTER_SORT_BASE + 3,
    });
  });

  it("does nothing when everyone is already in step", () => {
    const m = master("m1", { targetNumber: "5" });
    const ops = planMasterSync([{ id: "daniel", designationId: INTERN }], [m], [linkedFrom(m, "daniel", "k1", { targetNumber: "5.00" })]);
    expect(ops).toEqual([]);
  });
});

describe("when the master changes", () => {
  it("updates every holder's linked KPI in place, keeping its history", () => {
    const before = master("m1");
    const after = master("m1", { title: "Renamed", frequency: "Every Sat" });
    const ops = planMasterSync([{ id: "daniel", designationId: INTERN }], [after], [linkedFrom(before, "daniel", "k1")]);
    expect(ops).toEqual([{ kind: "update", itemId: "k1", ownerEmployeeId: "daniel", fields: masterKpiFields(after) }]);
  });

  it("archives the KPI when the master item is retired, and restores it when it comes back", () => {
    const m = master("m1");
    const holders = [{ id: "daniel", designationId: INTERN }];
    expect(planMasterSync(holders, [{ ...m, isActive: false }], [linkedFrom(m, "daniel", "k1")])).toEqual([
      { kind: "archive", itemId: "k1", ownerEmployeeId: "daniel" },
    ]);
    expect(planMasterSync(holders, [m], [linkedFrom(m, "daniel", "k1", { archived: true })])).toEqual([
      { kind: "update", itemId: "k1", ownerEmployeeId: "daniel", fields: masterKpiFields(m) },
    ]);
  });
});

describe("when a person changes position or leaves", () => {
  it("swaps the old position's master KPIs for the new one's", () => {
    const intern = master("mi");
    const ops = master("mo", { designationId: OPS });
    const plan = planMasterSync([{ id: "daniel", designationId: OPS }], [intern, ops], [linkedFrom(intern, "daniel", "k1")]);
    expect(plan).toEqual([
      { kind: "create", ownerEmployeeId: "daniel", masterItemId: "mo", createdById: "manan", fields: masterKpiFields(ops) },
      { kind: "archive", itemId: "k1", ownerEmployeeId: "daniel" },
    ]);
  });

  it("archives the master KPIs of someone no longer active", () => {
    const m = master("m1");
    expect(planMasterSync([], [m], [linkedFrom(m, "gone", "k1")])).toEqual([{ kind: "archive", itemId: "k1", ownerEmployeeId: "gone" }]);
  });
});

describe("reading a frequency back to the author", () => {
  it("names the tray the KPI will land in", () => {
    expect(describeSchedule("Daily")).toEqual({ label: "Daily checklist · Mon–Sat", warn: false });
    expect(describeSchedule("Wed & Sat")).toEqual({ label: "Daily checklist · Wed, Sat", warn: false });
    expect(describeSchedule("Every Sat")).toEqual({ label: "This Week · Sat", warn: false });
    expect(describeSchedule("Monthly")).toEqual({ label: "This Month", warn: false });
    expect(describeSchedule("Adhoc")).toEqual({ label: "When It Happens", warn: false });
  });

  it("warns when the frequency is missing or not understood", () => {
    expect(describeSchedule("")).toMatchObject({ warn: true });
    expect(describeSchedule("whenever I feel like it")).toMatchObject({ warn: true });
  });
});
