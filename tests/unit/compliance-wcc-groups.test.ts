import { describe, it, expect } from "vitest";
import { addDays, wccOccurrences, type ComplianceItem } from "@/lib/compliance/schedule";
import { buildComplianceRows, withCarryForward, type ComplianceRow } from "@/lib/compliance/rows";
import { totalMinutes } from "@/lib/compliance/minutes";
import { wccBucketOf, wccDayGroups, wccTeamGroups } from "@/lib/compliance/wcc-groups";
import type { TeamGroup } from "@/lib/compliance/team";

/**
 * WCC's groups (account holder, 2026-09-19):
 *   "All Dailys to be shown first, then all Mondays, then all Tuesdays, then
 *    all Wednesdays — so if something is M and W, the same item will be shown
 *    on Monday as well as Wednesday, as they are two separate compliances.
 *    Do not change anything in frequency."
 *
 * 2026-09-14 is a Monday.
 */

const MON_TO_SAT = 0b0111111;
const MON_TO_SUN = 0b1111111;
const bits = (...days: number[]) => days.reduce((m, d) => m | (1 << d), 0);

const item = (id: string, title: string, weekdays: number, over: Partial<ComplianceItem> = {}): ComplianceItem => ({
  id,
  ownerEmployeeId: "p1",
  title,
  section: null,
  code: null,
  frequency: null,
  weekdays,
  scheduleKind: "scheduled",
  monthDay: null,
  isParticipantList: false,
  sortOrder: null,
  createdById: null,
  activeFrom: null,
  ...over,
});

const ITEMS: ComplianceItem[] = [
  item("calls", "Call every new lead", MON_TO_SAT, { minutes: 30 }),
  item("cctv", "Check the CCTV recordings", MON_TO_SUN, { minutes: 10 }),
  item("proposals", "Send the proposals", bits(0, 2), { minutes: 45 }),
  item("pipeline", "Review the pipeline", bits(1), { minutes: 20 }),
  item("numbers", "Send the weekly numbers", bits(5)),
  item("audit", "Audit the petty cash", 0, { scheduleKind: "weekly", minutes: 15 }),
];

/** The rows a WCC window shows, as the page builds them. */
function rowsFor(from: string, to: string, today: string, items = ITEMS): ComplianceRow[] {
  const occurrences = wccOccurrences(items, addDays(from, -6), to);
  const built = buildComplianceRows({
    occurrences,
    fills: new Map(),
    items: new Map(items.map((i) => [i.id, i])),
    names: new Map([
      ["p1", "Priya"],
      ["p2", "Rohan"],
    ]),
    masters: new Map(),
    today,
    viewer: { id: "p1", isAdmin: false, fillsForAnyone: false, visibleIds: new Set(["p1", "p2"]), canManageFor: () => true },
  });
  return withCarryForward(built, from);
}

const order = (a: ComplianceRow, b: ComplianceRow) => ITEMS.findIndex((i) => i.id === a.itemId) - ITEMS.findIndex((i) => i.id === b.itemId);
const titlesIn = (rows: ComplianceRow[], keys: string[]) => keys.map((k) => rows.find((r) => r.key === k)!.title);

describe("which group a row sits in", () => {
  it("is Daily for Mon to Sat and Mon to Sun, the day itself for chosen days, Once a week for the older weekly kind", () => {
    const rows = rowsFor("2026-09-16", "2026-09-16", "2026-09-16");
    const bucket = (id: string) => wccBucketOf(rows.find((r) => r.itemId === id)!);
    expect(bucket("calls")).toBe("daily");
    expect(bucket("cctv")).toBe("daily");
    expect(bucket("proposals")).toBe(2); // Wednesday's row
    expect(bucket("audit")).toBe("weekly");
  });
});

describe("the whole week (Mon–Sat, looking back from Saturday)", () => {
  const rows = rowsFor("2026-09-14", "2026-09-19", "2026-09-19");
  const groups = wccDayGroups(rows, { today: "2026-09-19", from: "2026-09-14", order });

  it("puts all the Dailys first, then Monday, Tuesday, Wednesday… in order, then Once a week", () => {
    expect(groups.map((g) => g.label)).toEqual([
      "Daily · Mon 14 Sep",
      "Daily · Tue 15 Sep",
      "Daily · Wed 16 Sep",
      "Daily · Thu 17 Sep",
      "Daily · Fri 18 Sep",
      "Daily · Sat 19 Sep · today",
      "Monday · 14 Sep",
      "Tuesday · 15 Sep",
      "Wednesday · 16 Sep",
      "Saturday · 19 Sep · today",
      "Once a week · by Sat 19 Sep",
    ]);
  });

  it("shows a Mon & Wed compliance under Monday and again under Wednesday — two compliances", () => {
    const mon = groups.find((g) => g.label === "Monday · 14 Sep")!;
    const wed = groups.find((g) => g.label === "Wednesday · 16 Sep")!;
    expect(titlesIn(rows, mon.rowKeys)).toEqual(["Send the proposals"]);
    expect(titlesIn(rows, wed.rowKeys)).toEqual(["Send the proposals"]);
    expect(mon.rowKeys[0]).not.toBe(wed.rowKeys[0]);
  });

  it("leaves the Frequency as it is — Mon & Wed still reads Mon & Wed", () => {
    const proposals = rows.filter((r) => r.itemId === "proposals");
    expect(proposals.map((r) => r.schedule)).toEqual(["Mon & Wed", "Mon & Wed"]);
    expect(rows.find((r) => r.itemId === "calls")!.schedule).toBe("Mon to Sat");
  });

  it("keeps each day's Dailys together, in the checklist's order", () => {
    const today = groups.find((g) => g.label === "Daily · Sat 19 Sep · today")!;
    expect(titlesIn(rows, today.rowKeys)).toEqual(["Call every new lead", "Check the CCTV recordings"]);
  });

  it("adds up each group's Mins — every day's Dailys, every Monday's…", () => {
    const mins = (label: string) => {
      const g = groups.find((x) => x.label === label)!;
      return totalMinutes(g.rowKeys.map((k) => rows.find((r) => r.key === k)!));
    };
    expect(mins("Daily · Mon 14 Sep")).toEqual({ total: 40, timed: 2, untimed: 0 });
    expect(mins("Monday · 14 Sep")).toEqual({ total: 45, timed: 1, untimed: 0 });
    expect(mins("Tuesday · 15 Sep")).toEqual({ total: 20, timed: 1, untimed: 0 });
    // Saturday's has no Mins yet — it is counted apart, not as nought.
    expect(mins("Saturday · 19 Sep · today")).toEqual({ total: 0, timed: 0, untimed: 1 });
  });

  it("gives every row one group", () => {
    const placed = groups.flatMap((g) => g.rowKeys);
    expect(placed.sort()).toEqual(rows.map((r) => r.key).sort());
  });
});

describe("today (Wednesday)", () => {
  const rows = rowsFor("2026-09-16", "2026-09-16", "2026-09-16");
  const groups = wccDayGroups(rows, { today: "2026-09-16", from: "2026-09-16", order });

  it("shows today's Dailys first, a Tuesday one carried forward under Tuesday, then today's own", () => {
    expect(groups.map((g) => g.label)).toEqual([
      "Daily · Wed 16 Sep · today",
      "Tuesday · 15 Sep · carried forward",
      "Wednesday · 16 Sep · today",
      "Once a week · by Sat 19 Sep",
    ]);
    const tue = groups.find((g) => g.label.startsWith("Tuesday"))!;
    expect(titlesIn(rows, tue.rowKeys)).toEqual(["Review the pipeline"]);
    expect(rows.find((r) => r.key === tue.rowKeys[0])!.carried).toBe(true);
  });

  it("says a weekly one not done by its day is carried forward, as a day's heading does", () => {
    const weeklyMon = item("stock", "Count the stock", bits(0), { scheduleKind: "weekly" });
    const wed = rowsFor("2026-09-16", "2026-09-16", "2026-09-16", [...ITEMS, weeklyMon]);
    const labels = wccDayGroups(wed, { today: "2026-09-16", from: "2026-09-16", order }).map((g) => g.label);
    expect(labels).toContain("Once a week · by Mon 14 Sep · carried forward");
    expect(labels).toContain("Once a week · by Sat 19 Sep");
  });

  it("carries a row's Mins with it, and lets whoever manages the person set them", () => {
    const calls = rows.find((r) => r.itemId === "calls")!;
    expect(calls.minutes).toBe(30);
    expect(calls.canSetMinutes).toBe(true);
    expect(rows.find((r) => r.itemId === "numbers")?.minutes ?? null).toBeNull();
  });
});

describe("the team view", () => {
  const items = [
    ...ITEMS,
    item("r-calls", "Call the dealers", MON_TO_SAT, { ownerEmployeeId: "p2", minutes: 25 }),
    item("r-visit", "Visit a site", bits(2), { ownerEmployeeId: "p2", minutes: 60 }),
  ];
  const rows = rowsFor("2026-09-16", "2026-09-16", "2026-09-16", items);
  const teams: TeamGroup[] = [
    { key: "you", label: "You", memberIds: ["p1"], leadId: null },
    { key: "team:p2", label: "Rohan's team", memberIds: ["p2"], leadId: "p2" },
    { key: "empty", label: "Nobody here", memberIds: ["p9"], leadId: null },
  ];
  const byItem = (a: ComplianceRow, b: ComplianceRow) => items.findIndex((i) => i.id === a.itemId) - items.findIndex((i) => i.id === b.itemId);
  const out = wccTeamGroups(rows, teams, { today: "2026-09-16", from: "2026-09-16", byItem });

  it("stays team-wise, each team divided Daily first, then each day", () => {
    expect(out.map((t) => t.label)).toEqual(["You", "Rohan's team"]);
    expect(out[1]!.sections.map((s) => s.label)).toEqual(["Daily · Wed 16 Sep · today", "Wednesday · 16 Sep · today"]);
    expect(titlesIn(rows, out[1]!.rowKeys)).toEqual(["Call the dealers", "Visit a site"]);
  });

  it("keys each section to its team, and lists the team's rows section by section", () => {
    expect(out[0]!.sections[0]!.key).toBe("you::daily|2026-09-16");
    expect(out[0]!.rowKeys).toEqual(out[0]!.sections.flatMap((s) => s.rowKeys));
  });

  it("orders a section person by person, in reporting order", () => {
    const both = wccTeamGroups(rows, [{ key: "all", label: "Everyone", memberIds: ["p2", "p1"], leadId: null }], {
      today: "2026-09-16",
      from: "2026-09-16",
      byItem,
    });
    const daily = both[0]!.sections[0]!;
    expect(daily.rowKeys.map((k) => rows.find((r) => r.key === k)!.ownerName)).toEqual(["Rohan", "Priya", "Priya"]);
  });
});
