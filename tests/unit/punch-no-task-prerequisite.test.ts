import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * THE 5-TASK PREREQUISITE IS GONE (2026-09-09).
 *
 * Clocking in no longer requires MIN_ATTENDANCE_ITEMS things planned, and
 * clocking out no longer requires them closed out.
 *
 * These assertions read the punch SOURCES rather than calling them. That is
 * deliberate: both punch paths are server modules wired to the database, next/
 * headers and a dozen collaborators, so exercising them here would mean mocking
 * so much that the mock, not the code, would decide the result. What actually
 * needs guaranteeing is narrow and structural - that neither punch path consults
 * the planning gates at all - and that is exactly what a source check can prove.
 *
 * The rule was WITHDRAWN, not switched off, so there is no flag to flip back:
 * a re-introduction would have to re-add these calls, and this test fails the
 * moment one appears in either path.
 */

const ROOT = join(__dirname, "..", "..");

/** Source with comments stripped - a mention in prose must not fail the test. */
function code(rel: string): string {
  const p = join(ROOT, rel);
  expect(existsSync(p), `${rel} should exist`).toBe(true);
  return readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const PUNCH_PATHS = [
  "app/(app)/attendance/actions.ts",
  "app/api/mobile/attendance/punch/route.ts",
];

/** Everything that existed to make the punch wait on the daily plan. */
const PLAN_GATE_SYMBOLS = [
  "needsDailyPlan",
  "dailyPlanShortfall",
  "needsGoalActuals",
  "unloggedGoalLabels",
  "isDayClosedOut",
  "punchPlanGateOn",
  "checkoutCloseoutGateOn",
  "MIN_ATTENDANCE_ITEMS",
];

describe("the punch no longer depends on the daily plan", () => {
  for (const rel of PUNCH_PATHS) {
    for (const sym of PLAN_GATE_SYMBOLS) {
      it(`${rel} does not use ${sym}`, () => {
        expect(code(rel)).not.toContain(sym);
      });
    }
  }

  it("the attendance page no longer redirects an unplanned employee to /my-day", () => {
    const src = code("app/(app)/attendance/page.tsx");
    expect(src).not.toContain("punchPlanGateOn");
    expect(src).not.toContain("hasStartedDay");
    expect(src).not.toContain('redirect("/my-day")');
  });

  it("no punch refusal names a destination to be detoured through", () => {
    // `redirectTo` was the close-out gate's hook for pushing the browser to
    // /my-day. It is gone from the result type, so no refusal can navigate.
    expect(code("app/(app)/attendance/actions.ts")).not.toContain("redirectTo");
    expect(existsSync(join(ROOT, "lib/attendance/closeout-gate.ts"))).toBe(false);
  });

  it("the mobile app is never told a plan or close-out is outstanding", () => {
    const src = code("app/api/mobile/attendance/punch/route.ts");
    expect(src).not.toContain("needsPlan");
    expect(src).not.toContain("needsCloseout");
  });
});

describe("what the punch deliberately still enforces", () => {
  const src = code("app/(app)/attendance/actions.ts");

  it("still resolves and validates the device", () => {
    expect(src).toContain("resolveWebDevice");
  });

  it("still applies the office-network and geofence rules", () => {
    expect(src).toContain("evaluateOfficeIp");
  });

  it("still keeps the week-loss acknowledgement and the frozen-month guard", () => {
    expect(src).toContain("weekLossAckGateOn");
    expect(src).toContain("assertMonthEditable");
  });
});

describe("admin approval is gone from device registration", () => {
  it("no approveDevice server action remains", () => {
    expect(code("app/(app)/attendance/devices/actions.ts")).not.toContain(
      "export async function approveDevice",
    );
  });

  it("revokeDevice survives — retiring a device is still a real power", () => {
    expect(code("app/(app)/attendance/devices/actions.ts")).toContain(
      "export async function revokeDevice",
    );
  });

  it("the admin devices screen offers no Approve control", () => {
    const ui = code("components/attendance/devices-client.tsx");
    expect(ui).not.toContain("approveDevice");
    expect(ui).toContain("revokeDevice");
  });
});
