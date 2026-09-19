import { describe, it, expect } from "vitest";
import {
  formatDeadline,
  kindOf,
  matchFills,
  mccDeadline,
  mccOccurrences,
  periodFor,
  scheduleText,
  wccOccurrences,
  type ComplianceItem,
} from "@/lib/compliance/schedule";
import { approverStatusOf, doerStatusOf, legacyStatusFor } from "@/lib/compliance/status";
import { downlineOf, teamGroups } from "@/lib/compliance/team";
import { buildComplianceRows, summarise, varianceOf, type FillLike } from "@/lib/compliance/rows";
import { buildFounderEmail, gridCell, planDailyReminders, type DueCompliance } from "@/lib/compliance/reminders";

/**
 * WCC / MCC (account holder, 2026-09-18) — DCC rebuilt the Accounts way, with
 * the WMS Doer and Approver Status, the actual date against a deadline, and
 * the 10 pm reminders.
 */

// 2026-09-14 is a Monday; 2026-09-18 a Friday.
const item = (over: Partial<ComplianceItem>): ComplianceItem => ({
  id: "i1",
  ownerEmployeeId: "p1",
  title: "Call every lead",
  section: null,
  code: null,
  frequency: null,
  weekdays: 0b0111111,
  scheduleKind: "scheduled",
  monthDay: null,
  isParticipantList: false,
  sortOrder: 1,
  createdById: null,
  activeFrom: null,
  ...over,
});

const fill = (over: Partial<FillLike>): FillLike => ({
  itemId: "i1",
  entryDate: "2026-09-18",
  status: null,
  doerStatus: null,
  doneAt: null,
  note: null,
  approverStatus: null,
  approverNotes: null,
  updatedAt: null,
  ...over,
});

describe("which checklist a compliance is on", () => {
  it("puts daily and weekly ones on WCC, monthly ones on MCC, the rest on neither", () => {
    expect(kindOf({ scheduleKind: "scheduled", isParticipantList: false })).toBe("wcc");
    expect(kindOf({ scheduleKind: "weekly", isParticipantList: false })).toBe("wcc");
    expect(kindOf({ scheduleKind: "monthly", isParticipantList: false })).toBe("mcc");
    expect(kindOf({ scheduleKind: "adhoc", isParticipantList: false })).toBeNull();
    expect(kindOf({ scheduleKind: "scheduled", isParticipantList: true })).toBeNull();
  });
});

describe("WCC rows", () => {
  it("gives a daily compliance one row per working day, the deadline that day", () => {
    const rows = wccOccurrences([item({})], "2026-09-12", "2026-09-14"); // Sat, Sun, Mon
    expect(rows.map((r) => r.deadline)).toEqual(["2026-09-12", "2026-09-14"]); // no Sunday
    expect(rows.every((r) => r.mode === "day" && r.periodStart === r.deadline)).toBe(true);
  });

  it("gives a weekly one a single row, due by its last allowed day, shown from its first", () => {
    const weekly = item({ scheduleKind: "weekly", weekdays: 0b0000110 }); // Tue or Wed
    // Monday: the week is not open yet.
    expect(wccOccurrences([weekly], "2026-09-14", "2026-09-14")).toEqual([]);
    const open = wccOccurrences([weekly], "2026-09-15", "2026-09-15");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ deadline: "2026-09-16", periodStart: "2026-09-14", periodEnd: "2026-09-20", mode: "week" });
    // Any day of the week → due by Saturday.
    expect(wccOccurrences([item({ scheduleKind: "weekly", weekdays: 0 })], "2026-09-18", "2026-09-18")[0]?.deadline).toBe("2026-09-19");
  });

  it("does not invent rows from before the compliance existed", () => {
    expect(wccOccurrences([item({ activeFrom: "2026-09-14" })], "2026-09-12", "2026-09-14").map((r) => r.deadline)).toEqual([
      "2026-09-14",
    ]);
  });
});

describe("MCC rows", () => {
  it("gives a monthly one a row per month, due on its day", () => {
    const rows = mccOccurrences([item({ scheduleKind: "monthly", weekdays: 0, monthDay: 7 })], ["2026-09", "2026-10"]);
    expect(rows.map((r) => r.deadline)).toEqual(["2026-09-07", "2026-10-07"]);
    expect(rows[0]).toMatchObject({ periodStart: "2026-09-01", periodEnd: "2026-09-30", mode: "month" });
  });

  it("falls on the month's last day when none is set, and clamps a 31st", () => {
    expect(mccDeadline("2026-09", null)).toBe("2026-09-30");
    expect(mccDeadline("2026-09", 31)).toBe("2026-09-30");
    expect(mccDeadline("2028-02", 30)).toBe("2028-02-29");
  });
});

describe("matching a fill to its row", () => {
  it("takes the day's fill for a daily row, and the latest in the period otherwise", () => {
    const daily = wccOccurrences([item({})], "2026-09-18", "2026-09-18");
    expect(matchFills(daily, [fill({ entryDate: "2026-09-17" })]).size).toBe(0);
    expect(matchFills(daily, [fill({ entryDate: "2026-09-18" })]).size).toBe(1);

    const monthly = mccOccurrences([item({ scheduleKind: "monthly", monthDay: 25 })], ["2026-09"]);
    const m = matchFills(monthly, [fill({ entryDate: "2026-09-03", note: "early" }), fill({ entryDate: "2026-09-10", note: "later" })]);
    expect(m.get(monthly[0]!.key)?.note).toBe("later");
  });

  it("works the period out from the compliance, not from the browser", () => {
    expect(periodFor({ scheduleKind: "weekly" }, "2026-09-16")).toEqual({ mode: "week", start: "2026-09-14", end: "2026-09-20" });
    expect(periodFor({ scheduleKind: "monthly" }, "2026-09-07")).toEqual({ mode: "month", start: "2026-09-01", end: "2026-09-30" });
    expect(periodFor({ scheduleKind: "scheduled" }, "2026-09-18")).toEqual({ mode: "day", start: "2026-09-18", end: "2026-09-18" });
  });
});

describe("Doer Status — the WMS six, bridged to the old DCC words", () => {
  it("reads the old words, and nothing as not filled", () => {
    expect(doerStatusOf(fill({ status: "Done" }))).toBe("done");
    expect(doerStatusOf(fill({ status: "Pending" }))).toBe("initiated");
    expect(doerStatusOf(fill({ status: "Not done" }))).toBe("not_started");
    expect(doerStatusOf(fill({ status: null }))).toBeNull();
    expect(doerStatusOf(null)).toBeNull();
    expect(approverStatusOf(fill({ status: "NA" }))).toBe("cancelled");
  });

  it("writes the old word beside every new status, so DCC's readers keep working", () => {
    expect(legacyStatusFor("done", null)).toBe("Done");
    expect(legacyStatusFor("follow_up", null)).toBe("Pending");
    expect(legacyStatusFor("not_started", null)).toBe("Not done");
    expect(legacyStatusFor("done", "cancelled")).toBe("NA");
    expect(legacyStatusFor(null, null)).toBeNull();
  });

  it("trusts a later change from the Android app over a stale Doer Status", () => {
    expect(doerStatusOf(fill({ doerStatus: "done", status: "Done" }))).toBe("done");
    expect(doerStatusOf(fill({ doerStatus: "done", status: "Not done" }))).toBe("not_started");
  });
});

describe("+/- days", () => {
  it("is actual minus deadline — positive late, negative early", () => {
    expect(varianceOf("2026-09-10", "2026-09-12", "2026-09-18")).toEqual({ days: 2, running: false });
    expect(varianceOf("2026-09-10", "2026-09-08", "2026-09-18")).toEqual({ days: -2, running: false });
  });

  it("counts an open row's lateness up, and says nothing before the deadline", () => {
    expect(varianceOf("2026-09-15", null, "2026-09-18")).toEqual({ days: 3, running: true });
    expect(varianceOf("2026-09-25", null, "2026-09-18")).toEqual({ days: null, running: false });
  });
});

describe("rows and the report", () => {
  const people = new Map([
    ["p1", "Priya"],
    ["tl", "Tara"],
  ]);
  const rowsFor = (viewerId: string, visible: string[], f: FillLike | null) => {
    const occ = wccOccurrences([item({ createdById: "tl" })], "2026-09-15", "2026-09-15");
    return buildComplianceRows({
      occurrences: occ,
      fills: new Map(f ? [[occ[0]!.key, f]] : []),
      items: new Map([["i1", item({ createdById: "tl" })]]),
      names: people,
      masters: new Map(),
      today: "2026-09-18",
      viewer: { id: viewerId, isAdmin: false, fillsForAnyone: false, visibleIds: new Set(visible), canManageFor: () => true },
    });
  };

  it("records the actual date in IST and measures it against the deadline", () => {
    const [r] = rowsFor("p1", ["p1"], fill({ entryDate: "2026-09-15", doerStatus: "done", status: "Done", doneAt: "2026-09-16T19:00:00.000Z" }));
    // 19:00 UTC on the 16th is 00:30 on the 17th in IST.
    expect(r!.actual).toBe("2026-09-17");
    expect(r!.variance).toBe(2);
  });

  it("lets the doer fill but never rule; lets the Team Lead rule but not fill", () => {
    const [own] = rowsFor("p1", ["p1"], fill({ entryDate: "2026-09-15", doerStatus: "done", status: "Done" }));
    expect(own!.canFill).toBe(true);
    expect(own!.approverChoices).toEqual([]);
    const [lead] = rowsFor("tl", ["tl", "p1"], fill({ entryDate: "2026-09-15", doerStatus: "done", status: "Done" }));
    expect(lead!.canFill).toBe(false);
    expect(lead!.approverChoices).toContain("approved");
  });

  it("holds Approved until the doer has marked it Done", () => {
    const [lead] = rowsFor("tl", ["tl", "p1"], fill({ entryDate: "2026-09-15", doerStatus: "initiated", status: "Pending" }));
    expect(lead!.approverChoices).not.toContain("approved");
    expect(lead!.approverChoices).toContain("on_hold");
  });

  it("summarises filled, on time and late", () => {
    const late = rowsFor("p1", ["p1"], fill({ entryDate: "2026-09-15", doerStatus: "done", status: "Done", doneAt: "2026-09-17T06:00:00.000Z" }));
    const empty = rowsFor("p1", ["p1"], null);
    expect(summarise([...late, ...empty.map((r) => ({ ...r, key: "x" }))], "2026-09-18")).toMatchObject({
      due: 2,
      filled: 1,
      notFilled: 1,
      done: 1,
      late: 1,
      avgLate: 2,
    });
  });
});

describe("team-wise", () => {
  const people = [
    { id: "m", name: "Manan", managerId: null },
    { id: "a", name: "Aarti", managerId: "m" },
    { id: "a1", name: "Zoya", managerId: "a" },
    { id: "a2", name: "Bina", managerId: "a" },
    { id: "r", name: "Rekha", managerId: "m" },
  ];

  it("puts the viewer first, each Team Lead with their team, then those with no team", () => {
    const g = teamGroups("m", people);
    expect(g.map((x) => x.label)).toEqual(["You", "Aarti's team", "Reporting directly to Manan"]);
    expect(g[1]!.memberIds).toEqual(["a", "a2", "a1"]);
    expect(g[2]!.memberIds).toEqual(["r"]);
  });

  it("finds everyone below a Team Lead", () => {
    expect(downlineOf("m", people).sort()).toEqual(["a", "a1", "a2", "r"]);
    expect(downlineOf("a", people).sort()).toEqual(["a1", "a2"]);
  });
});

describe("the 10:01 pm reminder", () => {
  const people = [
    { id: "tl", name: "Tara Lead", managerId: null, address: "tara@x.in" },
    { id: "p1", name: "Priya Shah", managerId: "tl", address: "priya@x.in" },
    { id: "p2", name: "Ravi Rao", managerId: "tl", address: "ravi@x.in" },
  ];
  const due = (ownerId: string, filled: boolean, kind: "wcc" | "mcc" = "wcc"): DueCompliance => ({
    ownerId,
    kind,
    title: `${ownerId} task`,
    deadline: "2026-09-18",
    filled,
  });

  it("emails each person with something unfilled today, and their Team Lead once", () => {
    const plan = planDailyReminders({
      people,
      due: [due("p1", false), due("p1", false, "mcc"), due("p2", true), due("tl", true)],
      day: "2026-09-18",
      siteUrl: null,
    });
    expect(plan.map((p) => `${p.kind}:${p.recipientId}`)).toEqual(["self:p1", "lead:tl"]);
    expect(plan[0]!.to).toBe("priya@x.in");
    expect(plan[0]!.html).toContain("p1 task");
    expect(plan[1]!.html).toContain("Priya Shah");
    expect(plan[1]!.html).not.toContain("Ravi Rao");
  });

  it("sends nothing when everyone has updated", () => {
    expect(planDailyReminders({ people, due: [due("p1", true)], day: "2026-09-18", siteUrl: null })).toEqual([]);
  });
});

describe("Manan Sir's grid", () => {
  it("reads NA with nothing due, ✓ when all filled, ✗ n otherwise, and · for the future", () => {
    const d = (filled: boolean): DueCompliance => ({ ownerId: "p", kind: "wcc", title: "t", deadline: "2026-09-16", filled });
    expect(gridCell([], "2026-09-16", "2026-09-18")).toEqual({ kind: "na" });
    expect(gridCell([d(true)], "2026-09-16", "2026-09-18")).toEqual({ kind: "ok", due: 1 });
    expect(gridCell([d(true), d(false)], "2026-09-16", "2026-09-18")).toEqual({ kind: "no", missing: 1, due: 2 });
    expect(gridCell([d(false)], "2026-09-19", "2026-09-18")).toEqual({ kind: "future" });
  });

  it("names who did not fill in the last 3 days, with a week grid and a month grid", () => {
    const people = [
      { id: "m", name: "Manan", managerId: null },
      { id: "a", name: "Aarti", managerId: "m" },
      { id: "a1", name: "Zoya", managerId: "a" },
    ];
    const email = buildFounderEmail({
      founder: { id: "m", name: "Manan", managerId: null, address: "manan@x.in" },
      groups: teamGroups("m", people),
      names: new Map(people.map((p) => [p.id, p.name])),
      due: [
        { ownerId: "a1", kind: "wcc", title: "Calls", deadline: "2026-09-16", filled: false },
        { ownerId: "a1", kind: "mcc", title: "GST", deadline: "2026-09-17", filled: true },
      ],
      today: "2026-09-17",
      weekDates: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      monthDates: Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`),
      last3: ["2026-09-15", "2026-09-16", "2026-09-17"],
      previewFor: null,
    });
    expect(email.to).toBe("manan@x.in");
    expect(email.subject).toContain("1 person did not fill");
    expect(email.html).toContain("Zoya");
    expect(email.html).toContain("Wed 16 Sep (1 WCC)");
    expect(email.html).toContain("Aarti's team");
    expect(email.html).toContain(">NA<");
    expect(email.html).toContain("✗ 1");
    expect(email.html).toContain("MCC — Sep-2026");
  });
});

describe("words", () => {
  it("writes the deadline as DD-MMM-YYYY", () => {
    expect(formatDeadline("2026-09-07")).toBe("07-Sep-2026");
  });

  it("says how often in plain words", () => {
    expect(scheduleText({ scheduleKind: "scheduled", weekdays: 0b0111111, monthDay: null })).toBe("Daily");
    expect(scheduleText({ scheduleKind: "scheduled", weekdays: 0b0001001, monthDay: null })).toBe("Mon & Thu");
    expect(scheduleText({ scheduleKind: "weekly", weekdays: 0, monthDay: null })).toBe("Weekly (any day)");
    expect(scheduleText({ scheduleKind: "monthly", weekdays: 0, monthDay: 7 })).toBe("Monthly by the 7th");
    expect(scheduleText({ scheduleKind: "monthly", weekdays: 0, monthDay: null })).toBe("Monthly by month-end");
  });
});
