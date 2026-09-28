import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Employee } from "@/db/schema";
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

/**
 * WHO MAY MANAGE CLIENT ENGAGEMENT.
 *
 * Until 2026-09-28 this was a hardcoded two-email allowlist (Manan, Ruchita).
 * It is now a ROLE — super-admin or HR staff, via `isHrStaff` — same as
 * `canPublishPolicies` for firm policies (tests/unit/policy-access.test.ts),
 * for the same reason: mocked here rather than exercised against a real
 * database, since the department lookup itself is `isHrStaff`'s job, not
 * this module's.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/hr/access", () => ({ isHrStaff: vi.fn() }));

const { canEditAccount, canManageCe, canViewAnyCalendar } = await import("@/lib/client-engagement/access-server");
const { isHrStaff } = await import("@/lib/hr/access");
const hrStaff = vi.mocked(isHrStaff);

beforeEach(() => hrStaff.mockReset());

const person = (email: string | null, name: string, isAdmin = false): Employee => ({ id: `e-${name}`, email, name, isAdmin }) as unknown as Employee;

const MANAN = person("manan@unleashed.in", "Manan Vasa", true);
const RUCHITA = person("ruchitaambre.altuscorp@gmail.com", "Ruchita Ambre", true);
const RASHMI = person("rashmitripathi.altuscorp@gmail.com", "Rashmi Tripathi", false);
const OTHER_ADMIN = person("rohanchoudhary.altuscorp@gmail.com", "Rohan Choudhary", true);

describe("who may manage — assign, transfer, add, delete", () => {
  it("is whoever isHrStaff admits — super-admins and HR staff", async () => {
    hrStaff.mockResolvedValue(true);
    expect(await canManageCe(MANAN)).toBe(true);
    expect(await canManageCe(RUCHITA)).toBe(true);
  });

  it("is nobody else — not Rashmi, not a plain admin isHrStaff refuses", async () => {
    hrStaff.mockResolvedValue(false);
    expect(await canManageCe(RASHMI)).toBe(false);
    expect(await canManageCe(OTHER_ADMIN)).toBe(false);
  });

  it("reads the ROLE and never the name", async () => {
    // There was a first-name fallback here once, and a hardcoded address list
    // after that. Both admitted whoever the code happened to name; neither
    // reacted to who is actually HR staff today.
    hrStaff.mockResolvedValue(false);
    for (const name of ["Ruchita", "Ruchita Nair", "Manan Rao", "Mananjay Rao"]) {
      expect(await canManageCe(person("x@y.z", name))).toBe(false);
    }
    hrStaff.mockResolvedValue(true);
    expect(await canManageCe(person("someone.new@altuscorp.in", "Someone New"))).toBe(true);
  });

  it("admits the dummy admin only in dummy mode", async () => {
    hrStaff.mockResolvedValue(false);
    const dummy = person("dummy.admin@example.invalid", "Dummy Admin");
    expect(await canManageCe(dummy, false)).toBe(false);
    expect(await canManageCe(dummy, true)).toBe(true);
  });
});

describe("calendar visibility and editing", () => {
  it("lets admins and super-admins pick anyone", async () => {
    hrStaff.mockResolvedValue(false);
    expect(await canViewAnyCalendar(OTHER_ADMIN, false)).toBe(true); // OTHER_ADMIN.isAdmin
    expect(await canViewAnyCalendar(RASHMI, true)).toBe(true); // isSuperAdmin flag
    expect(await canViewAnyCalendar(RASHMI, false)).toBe(false);
  });

  it("lets the assignee edit their own account, and managers any", async () => {
    hrStaff.mockResolvedValue(false);
    expect(await canEditAccount(RASHMI, RASHMI.id)).toBe(true);
    expect(await canEditAccount(RASHMI, "e-jeevan")).toBe(false);
    expect(await canEditAccount(RASHMI, null)).toBe(false);
    hrStaff.mockResolvedValue(true);
    expect(await canEditAccount(RUCHITA, "e-jeevan")).toBe(true);
  });
});

describe("vocabulary", () => {
  it("asks for a batch on PS and BSS only — not OS", () => {
    expect(categoryNeedsBatch("ps")).toBe(true);
    expect(categoryNeedsBatch("bss")).toBe(true);
    expect(categoryNeedsBatch("os")).toBe(false);
    expect(categoryNeedsBatch("retainer")).toBe(false);
    expect(categoryNeedsBatch("corporate")).toBe(false);
    expect(categoryNeedsBatch("ambassador")).toBe(false);
  });

  it("groups into P / C / A, OS alongside PS and BSS", () => {
    expect(groupOf("ps")).toBe("P");
    expect(groupOf("os")).toBe("P");
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

  it("builds the PCA transpose with an Unassigned column that is always there, leading the list", () => {
    const { columns, total } = buildPca(members, accounts, engagements, monday);
    expect(columns.map((c) => c.memberName)).toEqual(["Unassigned", "Ruchita", "Jeevan"]);
    const ruchita = columns[1]!.cells;
    expect([ruchita.P.count, ruchita.C.count, ruchita.A.count, ruchita.all.count]).toEqual([2, 0, 0, 2]);
    expect(ruchita.all.minutes).toBe(420);
    expect(columns[0]!.cells.A.count).toBe(1);
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
