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
    // Through `lib/security/device-access.ts`, which gates the WHOLE app, not
    // the retired punch-only `resolveWebDevice`. Two implementations of one
    // rule is what that module was written to remove — see the tombstone in
    // lib/attendance/web-device.ts.
    expect(src).toContain("resolveDeviceContext");
  });

  it("still applies the office-network and geofence rules", () => {
    expect(src).toContain("evaluateOfficeIp");
  });

  it("still keeps the week-loss acknowledgement and the frozen-month guard", () => {
    expect(src).toContain("weekLossAckGateOn");
    expect(src).toContain("assertMonthEditable");
  });
});

/**
 * DEVICE APPROVAL IS BACK, under migration 0215.
 *
 * These assertions used to state the opposite, because 0214 briefly made the
 * cap "two approved devices of ANY kind" and removed the approval step with it.
 * 0215 supersedes that: the rule is one approved LAPTOP and one approved PHONE,
 * `lib/security/device-access.ts` enrols a device as `pending` once its kind's
 * slot is taken, and something has to be able to grant it. So `approveDevice`
 * exists again and the admin screen offers the control.
 */
describe("device approval under the 0215 per-kind cap", () => {
  it("approveDevice exists — a pending device needs a way to be granted", () => {
    expect(code("app/(app)/attendance/devices/actions.ts")).toContain(
      "export async function approveDevice",
    );
  });

  it("revokeDevice survives — retiring a device is still a real power", () => {
    expect(code("app/(app)/attendance/devices/actions.ts")).toContain(
      "export async function revokeDevice",
    );
  });

  it("the admin devices screen offers both controls", () => {
    const ui = code("components/attendance/devices-client.tsx");
    expect(ui).toContain("approveDevice");
    expect(ui).toContain("revokeDevice");
  });

  it("enrolment writes `pending` when the kind's slot is taken", () => {
    expect(code("lib/security/device-access.ts")).toContain(
      'status: slotFree ? "approved" : "pending"',
    );
  });
});
