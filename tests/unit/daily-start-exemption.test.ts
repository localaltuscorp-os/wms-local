import { describe, it, expect, vi, beforeEach } from "vitest";
import { codeOf } from "../fixtures/source-code";

vi.mock("server-only", () => ({}));

/**
 * MANAN'S EXEMPTION FROM THE COMPULSORY DAILY-START GATES.
 *
 * Two things are being asserted, and the second matters more than the first:
 *
 *   1. the exemption WORKS — he is never reported as needing to plan, start his
 *      day, or reach the commitment minimum; and
 *   2. it is CENTRALISED — it lives inside the gate functions, so it cannot
 *      apply on one surface and not another, and nobody else inherits it.
 *
 * The DB reads are mocked to always report the WORST case (nothing planned, day
 * never started). That is deliberate: every assertion below would pass by
 * accident if the fixture happened to look planned, so the fixture is set so
 * that a non-exempt person is definitely blocked.
 */

const { queue } = vi.hoisted(() => ({ queue: [] as unknown[] }));

/**
 * The gate reads through `lib/queries/daily-checklist`, so that is what is
 * stubbed — one layer below the gate and one above the database, which keeps
 * the test about the gate's logic rather than about Drizzle.
 */
vi.mock("@/lib/queries/daily-checklist", () => ({
  todayYmd: () => "2026-09-11",
  // ZERO planned and NOT started: a non-exempt employee is blocked by every
  // gate on these numbers.
  countPlannedItems: vi.fn(async () => {
    queue.push("countPlannedItems");
    return 0;
  }),
  countPlannedWork: vi.fn(async () => {
    queue.push("countPlannedWork");
    return 0;
  }),
  hasStartedDay: vi.fn(async () => {
    queue.push("hasStartedDay");
    return false;
  }),
}));

const {
  needsDailyChecklistPlan,
  needsGoalsPlanCommit,
  needsDailyPlan,
  dailyPlanShortfall,
  MIN_ATTENDANCE_ITEMS,
} = await import("@/lib/daily-checklist/gate");

/** Manan — the one address holding `daily_start.exempt`. */
const MANAN = { id: "manan-uuid", email: "manan@unleashed.in" };
/** An ordinary employee. */
const EMPLOYEE = { id: "emp-uuid", email: "someone.else@altuscorp.com" };
/** A super-admin who is NOT Manan, and a device administrator. Neither is
 *  exempt — the grant is per-person, not per-role. */
const ROHAN = { id: "rohan-uuid", email: "rohanchoudhary.altuscorp@gmail.com" };
const RUCHITA = { id: "ruchita-uuid", email: "ruchitaambre.altuscorp@gmail.com" };

beforeEach(() => {
  queue.length = 0;
});

describe("Manan is not held by any daily-start gate", () => {
  it("is not required to reach the committed-items minimum (the 3/5 wall)", async () => {
    // Both minimums: 3 for an individual contributor, 5 for a manager.
    expect(await needsGoalsPlanCommit(MANAN, 3)).toBe(false);
    expect(await needsGoalsPlanCommit(MANAN, 5)).toBe(false);
  });

  it("is not required to fill the daily checklist", async () => {
    expect(await needsDailyChecklistPlan(MANAN)).toBe(false);
  });

  it("is not required to run Start My Day", async () => {
    // `needsDailyPlan` is the "Start My Day clicked AND 5 items" gate. The
    // fixture says the day was never started, so a non-exempt person fails it.
    expect(await needsDailyPlan(MANAN)).toBe(false);
  });

  it("has no shortfall to report, rather than a shortfall of zero", async () => {
    // "0 of 5" would be a message about a rule he is outside of.
    expect(await dailyPlanShortfall(MANAN)).toEqual({
      have: MIN_ATTENDANCE_ITEMS,
      need: MIN_ATTENDANCE_ITEMS,
      started: true,
    });
  });

  it("short-circuits BEFORE querying — the exemption is not a filter on a result", async () => {
    // If the exemption were applied after the read, it would work but would
    // still cost three queries per request on the hottest path in the app.
    await needsGoalsPlanCommit(MANAN, 5);
    await needsDailyChecklistPlan(MANAN);
    await needsDailyPlan(MANAN);
    await dailyPlanShortfall(MANAN);
    expect(queue).toEqual([]);
  });
});

describe("everybody else is still enforced — the feature is not removed", () => {
  it("an ordinary employee is blocked by all four gates", async () => {
    expect(await needsGoalsPlanCommit(EMPLOYEE, 3)).toBe(true);
    expect(await needsGoalsPlanCommit(EMPLOYEE, 5)).toBe(true);
    expect(await needsDailyChecklistPlan(EMPLOYEE)).toBe(true);
    expect(await needsDailyPlan(EMPLOYEE)).toBe(true);
    expect(await dailyPlanShortfall(EMPLOYEE)).toEqual({
      have: 0,
      need: MIN_ATTENDANCE_ITEMS,
      started: false,
    });
  });

  it("an ordinary employee's gates DO query", async () => {
    await needsDailyChecklistPlan(EMPLOYEE);
    expect(queue).toContain("countPlannedItems");
  });

  it("being a super-admin earns nothing here", async () => {
    // Rohan is a super-admin and a master admin. Neither is the exemption.
    expect(await needsGoalsPlanCommit(ROHAN, 5)).toBe(true);
    expect(await needsDailyPlan(ROHAN)).toBe(true);
  });

  it("holding another capability earns nothing here", async () => {
    // Ruchita holds device.manage and attendance.manage_others.
    expect(await needsGoalsPlanCommit(RUCHITA, 5)).toBe(true);
    expect(await needsDailyPlan(RUCHITA)).toBe(true);
  });

  it("an unknown or blank identity is NOT exempt — the rule fails closed", async () => {
    expect(await needsDailyPlan({ id: "x", email: "" })).toBe(true);
    expect(await needsDailyPlan({ id: "x", email: "   " })).toBe(true);
    // A near-miss on the address must not match.
    expect(await needsDailyPlan({ id: "x", email: "manan@unleashed.in.evil.com" })).toBe(true);
    expect(await needsDailyPlan({ id: "x", email: "xmanan@unleashed.in" })).toBe(true);
  });

  it("matches case-insensitively, since sign-in does", async () => {
    expect(await needsDailyPlan({ id: "x", email: "Manan@Unleashed.IN" })).toBe(false);
    expect(await needsDailyPlan({ id: "x", email: "  manan@unleashed.in  " })).toBe(false);
  });
});

describe("the exemption is centralised, not repeated", () => {
  const gate = codeOf("lib/daily-checklist/gate.ts");

  it("every exported gate consults the ONE predicate", () => {
    // The requirement: "Centralize the exception in the appropriate server-side
    // enforcement logic so it cannot be bypassed inconsistently between
    // frontend and backend." This test is what keeps that true as gates are
    // added — a new gate that forgets `exempt(...)` fails here.
    const names = [...gate.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(names.sort()).toEqual(
      ["dailyPlanShortfall", "needsDailyChecklistPlan", "needsDailyPlan", "needsGoalsPlanCommit"].sort(),
    );
    for (const name of names) {
      const start = gate.indexOf(`export async function ${name}`);
      const after = gate.indexOf("export async function", start + 1);
      const body = gate.slice(start, after === -1 ? gate.length : after);
      expect(body, `${name} must consult exempt()`).toMatch(/exempt\(who\)/);
    }
  });

  it("reads the capability registry rather than naming a person", () => {
    expect(gate).toMatch(/isExemptFromDailyStart/);
    // No email literal in the enforcement logic — the grant lives in one table.
    expect(gate).not.toMatch(/@unleashed\.in|@gmail\.com|@altuscorp\.com/);
  });

  it("the gates REQUIRE an identity, so a caller cannot ask the un-exempted question", () => {
    // The signature is the guarantee. A gate that still accepted a bare id
    // could be called without the information the exemption needs.
    expect(gate).toMatch(/export interface GateSubject/);
    for (const name of ["needsDailyChecklistPlan", "needsGoalsPlanCommit", "needsDailyPlan", "dailyPlanShortfall"]) {
      const start = gate.indexOf(`export async function ${name}`);
      expect(gate.slice(start, start + 140), name).toMatch(/who: GateSubject/);
    }
  });

  it("no UI component decides the exemption for itself", () => {
    // "rather than hardcoding the exception in multiple UI components."
    for (const f of [
      "components/daily-checklist/daily-plan-gate.tsx",
      "components/my-day/my-day-board.tsx",
      "components/goals/plan/plan-board.tsx",
    ]) {
      const src = codeOf(f);
      expect(src, f).not.toMatch(/isExemptFromDailyStart|daily_start\.exempt/);
      expect(src, f).not.toMatch(/manan/i);
    }
  });
});

describe("the server-side call sites pass the identity", () => {
  it("the (app) layout and the hub both hand the gate the employee", () => {
    // These are the two surfaces that actually enforce. If either reverted to
    // `me.id` it would not compile — but this states the intent so the reason
    // is findable.
    const layout = codeOf("app/(app)/layout.tsx");
    const hub = codeOf("app/(app)/hub/page.tsx");
    expect(layout).toMatch(/needsGoalsPlanCommit\(me, minItems\)/);
    expect(layout).toMatch(/needsDailyChecklistPlan\(me\)/);
    expect(hub).toMatch(/needsDailyChecklistPlan\(me\)/);
  });
});
