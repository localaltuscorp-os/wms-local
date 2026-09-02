import { describe, expect, it } from "vitest";
import {
  canManagerApprove,
  canAdminApprove,
  canManagerSendBack,
  type ApprovalActor,
  type ApprovalTask,
  type ApprovalContext,
} from "@/lib/tasks/approval-permissions";

/**
 * These are a permission boundary, so they get pinned rather than trusted.
 *
 * Two things in particular must not drift: self-approval stays blocked (the
 * segregation-of-duties control), and manager approval now reaches the whole
 * downline rather than direct reports only.
 */

const DOER = "doer-1";
const MANAGER = "mgr-1";
const SKIP_MANAGER = "mgr-2"; // two levels above the doer
const STRANGER = "other-1";

const task = (over: Partial<ApprovalTask> = {}): ApprovalTask => ({
  status: "done",
  approvalLevel: "none",
  doerId: DOER,
  assignerId: MANAGER,
  ...over,
});

const actor = (id: string, over: Partial<ApprovalActor> = {}): ApprovalActor => ({
  id,
  email: `${id}@example.com`,
  isAdmin: false,
  ...over,
});

const ctx = (over: Partial<ApprovalContext> = {}): ApprovalContext => ({
  isDoersManager: false,
  assignerIsAdmin: false,
  assignerIsManager: true,
  ...over,
});

describe("canManagerApprove", () => {
  it("lets the DIRECT manager approve", () => {
    expect(canManagerApprove(actor(MANAGER), task(), ctx({ isDoersManager: true }))).toBe(true);
  });

  it("lets someone further UP the tree approve", () => {
    // The widening: a skip-level manager is not the doer's direct manager, but
    // the doer is in their downline.
    expect(
      canManagerApprove(actor(SKIP_MANAGER), task(), ctx({ isDoersUpline: true })),
    ).toBe(true);
  });

  it("does NOT let an unrelated colleague approve", () => {
    expect(canManagerApprove(actor(STRANGER), task(), ctx())).toBe(false);
  });

  it("BLOCKS self-approval even for an admin", () => {
    // The control. Anyone can self-assign, so allowing this would remove
    // approval as a check entirely.
    const selfTask = task({ doerId: MANAGER, assignerId: MANAGER });
    expect(
      canManagerApprove(actor(MANAGER, { isAdmin: true }), selfTask, ctx({ isDoersManager: true })),
    ).toBe(false);
  });

  it("only accepts work that is done and unapproved", () => {
    const c = ctx({ isDoersManager: true });
    expect(canManagerApprove(actor(MANAGER), task({ status: "initiated" }), c)).toBe(false);
    expect(canManagerApprove(actor(MANAGER), task({ approvalLevel: "manager" }), c)).toBe(false);
  });

  it("requires the task to have come from an admin or a manager", () => {
    expect(
      canManagerApprove(
        actor(MANAGER),
        task(),
        ctx({ isDoersManager: true, assignerIsManager: false, assignerIsAdmin: false }),
      ),
    ).toBe(false);
  });
});

describe("canAdminApprove", () => {
  it("refuses a plain admin — final sign-off is the founder's alone", () => {
    expect(canAdminApprove(actor(MANAGER, { isAdmin: true }), task())).toBe(false);
  });

  it("refuses self-approval", () => {
    expect(canAdminApprove(actor(DOER), task())).toBe(false);
  });
});

describe("canManagerSendBack", () => {
  it("reaches the downline too", () => {
    expect(
      canManagerSendBack(actor(SKIP_MANAGER), task(), ctx({ isDoersUpline: true })),
    ).toBe(true);
  });

  it("still lets the person who handed the task out send it back", () => {
    expect(canManagerSendBack(actor(MANAGER), task(), ctx())).toBe(true);
  });

  it("refuses an unrelated colleague", () => {
    expect(canManagerSendBack(actor(STRANGER), task(), ctx())).toBe(false);
  });
});
