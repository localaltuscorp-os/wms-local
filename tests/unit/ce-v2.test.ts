import { describe, expect, it } from "vitest";
import { canEditAccount, canManageCe, canViewAnyCalendar } from "@/lib/client-engagement/access";
import { accountLabel, categoryNeedsBatch, groupOf } from "@/lib/client-engagement/constants";
import {
  dateInWeek,
  findClash,
  freeGaps,
  freeMinutes,
  mondayOf,
  runsInWeek,
  slotMinutes,
  validateEngagement,
} from "@/lib/client-engagement/schedule";
import { isInactiveAccount } from "@/lib/client-engagement/status";
import { buildCapacity, buildEmpGrid, buildPca, capacityTone } from "@/lib/client-engagement/grids";
import { needsWeeklyReminder, referenceStatus } from "@/lib/client-engagement/references";

const MANAN = { id: "e-manan", email: "manan@unleashed.in", name: "Manan Vasa", isAdmin: true };
const RUCHITA = { id: "e-ruchita", email: "ruchitaambre.altuscorp@gmail.com", name: "Ruchita Ambre", isAdmin: true };
const RASHMI = { id: "e-rashmi", email: "rashmitripathi.altuscorp@gmail.com", name: "Rashmi Tripathi", isAdmin: false };
const OTHER_ADMIN = { id: "e-rohan", email: "rohanchoudhary.altuscorp@gmail.com", name: "Rohan Choudhary", isAdmin: true };

describe("who may transfer", () => {
  it("is Manan and Ruchita", () => {
    expect(canManageCe(MANAN)).toBe(true);
    expect(canManageCe(RUCHITA)).toBe(true);
  });

  it("is nobody else — not Rashmi, not another admin", () => {
    expect(canManageCe(RASHMI)).toBe(false);
    expect(canManageCe(OTHER_ADMIN)).toBe(false);
  });

  it("matches the first name as a whole word only", () => {
    expect(canManageCe({ email: "x@y.z", name: "Mananjay Rao" })).toBe(false);
    expect(canManageCe({ email: "x@y.z", name: "Ruchita" })).toBe(true);
  });

  it("admits the dummy admin only in dummy mode", () => {
    const dummy = { email: "dummy.admin@example.invalid", name: "Dummy Admin" };
    expect(canManageCe(dummy, false)).toBe(false);
    expect(canManageCe(dummy, true)).toBe(true);
  });
});

describe("calendar visibility and editing", () => {
  it("lets admins and super-admins pick anyone", () => {
    expect(canViewAnyCalendar(OTHER_ADMIN, false)).toBe(true);
    expect(canViewAnyCalendar(RASHMI, true)).toBe(true);
    expect(canViewAnyCalendar(RASHMI, false)).toBe(false);
  });

  it("lets the assignee edit their own account, and managers any", () => {
    expect(canEditAccount(RASHMI, "e-rashmi")).toBe(true);
    expect(canEditAccount(RASHMI, "e-jeevan")).toBe(false);
    expect(canEditAccount(RASHMI, null)).toBe(false);
    expect(canEditAccount(RUCHITA, "e-jeevan")).toBe(true);
  });
});

describe("vocabulary", () => {
  it("asks for a batch on PS and BSS only", () => {
    expect(categoryNeedsBatch("ps")).toBe(true);
    expect(categoryNeedsBatch("bss")).toBe(true);
    expect(categoryNeedsBatch("retainer")).toBe(false);
    expect(categoryNeedsBatch("corporate")).toBe(false);
    expect(categoryNeedsBatch("ambassador")).toBe(false);
  });

  it("groups into P / C / A", () => {
    expect(groupOf("ps")).toBe("P");
    expect(groupOf("retainer")).toBe("C");
    expect(groupOf("corporate")).toBe("C");
    expect(groupOf("ambassador")).toBe("A");
  });

  it("prints the batch in brackets", () => {
    expect(accountLabel("ABC Shah", "79")).toBe("ABC Shah (79)");
    expect(accountLabel("Lawrence & Mayo", null)).toBe("Lawrence & Mayo");
  });
});

describe("the working window", () => {
  const base = { callType: "hh", dayOfWeek: "mon", startTime: "10:00", endTime: "10:30", startDate: "2026-09-14", endDate: null };

  it("accepts a call inside 10 AM – 8 PM", () => {
    expect(validateEngagement(base)).toBeNull();
    expect(validateEngagement({ ...base, startTime: "19:30", endTime: "20:00" })).toBeNull();
  });

  it("refuses anything outside it, or backwards", () => {
    expect(validateEngagement({ ...base, startTime: "09:45" })).toMatch(/10 AM and 8 PM/);
    expect(validateEngagement({ ...base, startTime: "19:45", endTime: "20:15" })).toMatch(/10 AM and 8 PM/);
    expect(validateEngagement({ ...base, endTime: "10:00" })).toMatch(/end after/);
  });

  it("refuses an unknown call type — there are four", () => {
    expect(validateEngagement({ ...base, callType: "courtesy" })).toMatch(/call type/);
  });

  it("refuses an end date before the start date", () => {
    expect(validateEngagement({ ...base, endDate: "2026-09-01" })).toMatch(/before the start/);
  });
});

describe("weeks and clashes", () => {
  it("finds the Monday and the weekday's date", () => {
    expect(mondayOf("2026-09-18")).toBe("2026-09-14");
    expect(mondayOf("2026-09-20")).toBe("2026-09-14"); // Sunday belongs to the week before
    expect(dateInWeek("2026-09-14", "fri")).toBe("2026-09-18");
  });

  it("runs a slot only inside its date range", () => {
    const s = { dayOfWeek: "wed", startTime: "11:00", endTime: "11:30", startDate: "2026-09-16", endDate: "2026-09-30" };
    expect(runsInWeek(s, "2026-09-14")).toBe(true);
    expect(runsInWeek(s, "2026-09-07")).toBe(false);
    expect(runsInWeek(s, "2026-10-05")).toBe(false);
    expect(slotMinutes(s)).toBe(30);
  });

  it("catches an overlap on the same day in overlapping ranges", () => {
    const existing = [{ id: "a", dayOfWeek: "mon", startTime: "11:00", endTime: "12:00", startDate: "2026-09-01", endDate: null }];
    const clash = { dayOfWeek: "mon", startTime: "11:30", endTime: "11:45", startDate: "2026-09-14", endDate: null };
    expect(findClash(clash, existing)?.id).toBe("a");
  });

  it("allows back-to-back, other days, disjoint ranges, and editing itself", () => {
    const existing = [{ id: "a", dayOfWeek: "mon", startTime: "11:00", endTime: "12:00", startDate: "2026-09-01", endDate: "2026-09-10" }];
    expect(findClash({ dayOfWeek: "mon", startTime: "12:00", endTime: "12:30", startDate: "2026-09-01", endDate: null }, existing)).toBeNull();
    expect(findClash({ dayOfWeek: "tue", startTime: "11:00", endTime: "12:00", startDate: "2026-09-01", endDate: null }, existing)).toBeNull();
    expect(findClash({ dayOfWeek: "mon", startTime: "11:00", endTime: "12:00", startDate: "2026-09-14", endDate: null }, existing)).toBeNull();
    expect(findClash({ id: "a", dayOfWeek: "mon", startTime: "11:00", endTime: "12:00", startDate: "2026-09-01", endDate: null }, existing)).toBeNull();
  });

  it("works out the free gaps in a day", () => {
    const busy = [{ start: 600, end: 660 }, { start: 690, end: 720 }];
    expect(freeGaps(busy)).toEqual([{ start: 660, end: 690 }, { start: 720, end: 1200 }]);
    expect(freeMinutes(busy)).toBe(600 - 90);
    expect(freeMinutes([])).toBe(600);
  });
});

describe("inactive view", () => {
  it("moves on-hold and non-active lifecycles to Inactive", () => {
    expect(isInactiveAccount({ lifecycleStatus: "active", hhStatus: "standard" })).toBe(false);
    expect(isInactiveAccount({ lifecycleStatus: "active", hhStatus: "fee_recovery" })).toBe(false);
    expect(isInactiveAccount({ lifecycleStatus: "active", hhStatus: "on_hold" })).toBe(true);
    expect(isInactiveAccount({ lifecycleStatus: "churned", hhStatus: "standard" })).toBe(true);
  });
});

describe("grids", () => {
  const monday = "2026-09-14";
  const members = [
    { id: "m-ruchita", name: "Ruchita", activeClientLimit: 5 },
    { id: "m-jeevan", name: "Jeevan", activeClientLimit: 10 },
  ];
  const acct = (id: string, name: string, category: string, assignedTo: string | null, extra: Partial<{ batchCode: string; hhStatus: string }> = {}) => ({
    id,
    fullName: name,
    batchCode: extra.batchCode ?? null,
    category,
    assignedTo,
    lifecycleStatus: "active",
    hhStatus: extra.hhStatus ?? "standard",
  });
  const accounts = [
    acct("a1", "ABC Shah", "ps", "m-ruchita", { batchCode: "79" }),
    acct("a2", "PQR Mehta", "ps", "m-ruchita", { batchCode: "72" }),
    acct("a3", "Held Person", "ps", "m-ruchita", { hhStatus: "on_hold" }),
    acct("a4", "Retainer Co", "retainer", "m-jeevan"),
    acct("a5", "Amb One", "ambassador", null),
  ];
  const slot = (id: string, accountId: string, day: string, start: string, end: string) => ({
    id, accountId, dayOfWeek: day, startTime: start, endTime: end, startDate: "2026-09-01", endDate: null,
  });
  const engagements = [
    slot("e1", "a1", "mon", "10:00", "11:30"),
    slot("e2", "a1", "wed", "10:00", "11:30"),
    slot("e3", "a2", "tue", "12:00", "13:20"),
    slot("e4", "a2", "thu", "12:00", "13:20"),
    slot("e5", "a2", "fri", "12:00", "13:20"),
    slot("e6", "a3", "fri", "15:00", "16:00"), // on hold — not load
  ];

  it("builds the Emp Grid with per-employee totals and a grand total", () => {
    const g = buildEmpGrid(members, accounts, engagements, monday, new Set(["ps"]));
    const ruchita = g.sections.find((s) => s.memberName === "Ruchita")!;
    expect(ruchita.rows.map((r) => [r.sr, r.label, r.minutes, r.calls])).toEqual([
      [1, "ABC Shah (79)", 180, 2],
      [2, "PQR Mehta (72)", 240, 3],
    ]);
    expect(ruchita.total).toEqual({ participants: 2, minutes: 420, engagements: 5 });
    expect(g.sections.find((s) => s.memberName === "Jeevan")!.rows).toEqual([]);
    expect(g.grandTotal).toEqual({ participants: 2, minutes: 420, engagements: 5 });
  });

  it("builds the PCA transpose with an Unassigned column that is always there", () => {
    const { columns, total } = buildPca(members, accounts, engagements, monday);
    expect(columns.map((c) => c.memberName)).toEqual(["Ruchita", "Jeevan", "Unassigned"]);
    const ruchita = columns[0]!.cells;
    expect([ruchita.P.count, ruchita.C.count, ruchita.A.count, ruchita.all.count]).toEqual([2, 0, 0, 2]);
    expect(ruchita.all.minutes).toBe(420);
    expect(columns[2]!.cells.A.count).toBe(1);
    expect(total.all.count).toBe(4); // the on-hold account is not counted
  });

  it("tones capacity green / amber / red", () => {
    expect(capacityTone(3, 10)).toBe("green");
    expect(capacityTone(8, 10)).toBe("amber");
    expect(capacityTone(10, 10)).toBe("amber");
    expect(capacityTone(11, 10)).toBe("red");
    expect(capacityTone(0, 0)).toBe("green");
    expect(capacityTone(1, 0)).toBe("amber");
    const cap = buildCapacity(members, accounts, engagements, monday);
    expect(cap[0]).toMatchObject({ name: "Ruchita", active: 2, limit: 5, tone: "green", weeklyMinutes: 420 });
  });
});

describe("reference pipeline", () => {
  const today = "2026-09-18";
  it("derives status from the counts and the due date", () => {
    expect(referenceStatus({ targetCount: 3, actualCollected: 0, dueDate: null }, today)).toBe("pending");
    expect(referenceStatus({ targetCount: 3, actualCollected: 1, dueDate: null }, today)).toBe("in_progress");
    expect(referenceStatus({ targetCount: 3, actualCollected: 1, dueDate: "2026-09-10" }, today)).toBe("overdue");
    expect(referenceStatus({ targetCount: 3, actualCollected: 3, dueDate: "2026-09-10" }, today)).toBe("completed");
  });

  it("reminds every-week quotas once a week until met", () => {
    const r = { targetCount: 5, actualCollected: 1, dueDate: null, frequency: "every_week", collectorId: "m", lastRemindedOn: null };
    expect(needsWeeklyReminder(r, "2026-09-14")).toBe(true);
    expect(needsWeeklyReminder({ ...r, lastRemindedOn: "2026-09-15" }, "2026-09-14")).toBe(false);
    expect(needsWeeklyReminder({ ...r, lastRemindedOn: "2026-09-08" }, "2026-09-14")).toBe(true);
    expect(needsWeeklyReminder({ ...r, actualCollected: 5 }, "2026-09-14")).toBe(false);
    expect(needsWeeklyReminder({ ...r, frequency: "one_time" }, "2026-09-14")).toBe(false);
    expect(needsWeeklyReminder({ ...r, collectorId: null }, "2026-09-14")).toBe(false);
  });
});
