import { describe, it, expect } from "vitest";
import {
  computeInitiatorScorecard,
  PER_REPORT_PER_DAY,
  type InitiatorEmployee,
  type InitiatedTask,
} from "@/lib/transforms/initiator-scorecard";

// Org used by these tests:
//   Manan (founder, no manager)
//   Jeevan (manager) → Pratik, Purvi        Pratik → Sagar   (Jeevan's DOWNLINE)
//   Rohan  (manager) → Hardik
const emps: InitiatorEmployee[] = [
  { id: "manan", name: "Manan Vasa", managerId: null, email: "manan@unleashed.in" },
  { id: "jeevan", name: "Jeevan", managerId: null, email: "jeevan@x.in" },
  { id: "rohan", name: "Rohan", managerId: null, email: "rohan@x.in" },
  { id: "pratik", name: "Pratik", managerId: "jeevan", email: "pratik@x.in" },
  { id: "purvi", name: "Purvi", managerId: "jeevan", email: "purvi@x.in" },
  { id: "sagar", name: "Sagar", managerId: "pratik", email: "sagar@x.in" },
  { id: "hardik", name: "Hardik", managerId: "rohan", email: "hardik@x.in" },
];
const isFounder = (e: string | null) => e === "manan@unleashed.in";

describe("computeInitiatorScorecard", () => {
  it("classifies every task into exactly one channel; only Direct scores", () => {
    const tasks: InitiatedTask[] = [
      { initiatorId: "jeevan", doerId: "pratik" }, // direct
      { initiatorId: "jeevan", doerId: "pratik" }, // direct
      { initiatorId: "jeevan", doerId: "purvi" },  // direct
      { initiatorId: "jeevan", doerId: "sagar" },  // DOWNLINE (under Pratik)
      { initiatorId: "jeevan", doerId: "rohan" },  // counterpart (peer manager)
      { initiatorId: "jeevan", doerId: "hardik" }, // counterpart (other team)
      { initiatorId: "jeevan", doerId: "manan" },  // founder (upward)
      { initiatorId: "jeevan", doerId: "jeevan" }, // SELF
    ];
    const cards = computeInitiatorScorecard(tasks, emps, 3, isFounder); // 3 working days
    const jeevan = cards.find((c) => c.managerId === "jeevan")!;

    expect(jeevan.directReports).toBe(2);
    expect(jeevan.totalInitiated).toBe(8);
    expect(jeevan.toDirectReports).toBe(3);
    expect(jeevan.toDownline).toBe(1);
    expect(jeevan.toCounterparts).toBe(2);
    expect(jeevan.toFounderMgmt).toBe(1);
    expect(jeevan.toSelf).toBe(1);

    // The five channels are mutually exclusive and exhaustive.
    expect(
      jeevan.toDirectReports + jeevan.toDownline + jeevan.toCounterparts +
        jeevan.toFounderMgmt + jeevan.toSelf,
    ).toBe(jeevan.totalInitiated);

    // Target = 5 × workingDays × directReports.
    expect(jeevan.target).toBe(PER_REPORT_PER_DAY * 3 * 2); // 30
    expect(jeevan.actual).toBe(3);
    expect(jeevan.attainmentPct).toBe(Math.round((3 / 30) * 100));
    expect(jeevan.workingDays).toBe(3);
    expect(jeevan.perReportPerDay).toBe(PER_REPORT_PER_DAY);
  });

  it("uses 5 tasks per report per working day", () => {
    expect(PER_REPORT_PER_DAY).toBe(5);
    const [card] = computeInitiatorScorecard([], [
      { id: "m", name: "M", managerId: null, email: null },
      { id: "r", name: "R", managerId: "m", email: null },
    ], 4, isFounder);
    expect(card!.target).toBe(5 * 4 * 1); // 20
    expect(card!.perReport[0]!.goal).toBe(5 * 4);
  });

  it("attributes downline tasks to the branch they landed in", () => {
    const tasks: InitiatedTask[] = [
      { initiatorId: "jeevan", doerId: "sagar" },
      { initiatorId: "jeevan", doerId: "sagar" },
      { initiatorId: "jeevan", doerId: "purvi" },
    ];
    const jeevan = computeInitiatorScorecard(tasks, emps, 2, isFounder)
      .find((c) => c.managerId === "jeevan")!;

    const pratik = jeevan.perReport.find((r) => r.employeeId === "pratik")!;
    const purvi = jeevan.perReport.find((r) => r.employeeId === "purvi")!;

    // Sagar sits under Pratik, so both downline tasks belong to Pratik's branch.
    expect(pratik.reportCount).toBe(1);
    expect(pratik.downlineGiven).toBe(2);
    expect(pratik.given).toBe(0);

    // Purvi manages nobody and got her task directly.
    expect(purvi.reportCount).toBe(0);
    expect(purvi.downlineGiven).toBe(0);
    expect(purvi.given).toBe(1);
  });

  it("a self-assigned task is never counted as a counterpart", () => {
    const jeevan = computeInitiatorScorecard(
      [{ initiatorId: "jeevan", doerId: "jeevan" }],
      emps, 1, isFounder,
    ).find((c) => c.managerId === "jeevan")!;
    expect(jeevan.toSelf).toBe(1);
    expect(jeevan.toCounterparts).toBe(0);
    expect(jeevan.actual).toBe(0); // self-assignment is not delegation
  });

  it("only people with ≥1 direct report are managers", () => {
    const cards = computeInitiatorScorecard([], emps, 3, isFounder);
    expect(cards.map((c) => c.managerId).sort()).toEqual(["jeevan", "pratik", "rohan"]);
  });

  it("survives a cyclic manager chain instead of hanging", () => {
    const cyclic: InitiatorEmployee[] = [
      { id: "a", name: "A", managerId: "b", email: null },
      { id: "b", name: "B", managerId: "a", email: null },
    ];
    const cards = computeInitiatorScorecard(
      [{ initiatorId: "a", doerId: "b" }],
      cyclic, 1, isFounder,
    );
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.managerId === "a")!.toDirectReports).toBe(1);
  });
});
