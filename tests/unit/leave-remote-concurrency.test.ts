import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const leaveActions = readFileSync(
  path.join(root, "app/(app)/attendance/leave/actions.ts"),
  "utf8",
);
const remoteWork = readFileSync(
  path.join(root, "lib/attendance/remote-work.ts"),
  "utf8",
);

describe("leave and remote-work decision safety", () => {
  it("serializes paid leave balance check and approval", () => {
    expect(leaveActions).toContain("db.transaction(async (tx)");
    expect(leaveActions).toContain("pg_advisory_xact_lock");
    expect(leaveActions).toContain("getLeaveBalance(current.employeeId, todayISO(), tx)");
    expect(leaveActions).toContain('eq(leaveRequests.status, "pending")');
  });

  it("keeps leave decisions final and exposes explicit revoke", () => {
    expect(leaveActions).toContain("export async function revokeLeave");
    expect(leaveActions).toContain('eq(leaveRequests.status, "approved")');
    expect(leaveActions).toContain('eventType: "leave_revoked"');
    expect(leaveActions).toContain("Approved leave cannot be cancelled. Use Revoke.");
  });

  it("makes remote recurrence all-or-nothing", () => {
    expect(remoteWork).toContain("return await db.transaction(async (tx)");
    expect(remoteWork).toContain("const existing = await tx");
    expect(remoteWork).toContain("const [row] = await tx");
  });

  it("does not report remote approval success after a lost pending race", () => {
    expect(remoteWork).toContain(".returning({ id: remoteWorkRequests.id })");
    expect(remoteWork).toContain("This request was already decided by another approver.");
  });
});
