import { describe, it, expect } from "vitest";
import {
  APPROVER_REFUSAL_DOER,
  APPROVER_REFUSAL_NOT_DONE,
  APPROVER_REFUSAL_WHO,
  approverShown,
  approverStored,
  canRuleOn,
  canSetApproverStatus,
  selectableApproverChoices,
  type ApproverActor,
} from "@/lib/status/approver-status";

/**
 * APPROVER / INITIATOR STATUS (account holder, 2026-09-15) — one rule for WMS
 * Tasks, Goals and Projects: the initiator, the doer's manager or an admin
 * rules on the work; the doer never does.
 */

const actor = (over: Partial<ApproverActor> = {}): ApproverActor => ({
  isAdmin: false,
  isInitiator: false,
  isDoersManager: false,
  isDoer: false,
  ...over,
});

describe("who may set the Approver / Initiator Status", () => {
  it("the initiator, the doer's manager and an admin", () => {
    for (const a of [actor({ isInitiator: true }), actor({ isDoersManager: true }), actor({ isAdmin: true })]) {
      expect(canSetApproverStatus(a, "approved", "done")).toEqual({ ok: true });
      expect(canRuleOn(a)).toBe(true);
    }
  });

  it("never the doer — not even a doer who is also an admin", () => {
    expect(canSetApproverStatus(actor({ isDoer: true, isAdmin: true }), "approved", "done")).toEqual({ ok: false, reason: APPROVER_REFUSAL_DOER });
    expect(canRuleOn(actor({ isDoer: true, isInitiator: true }))).toBe(false);
  });

  it("nobody else", () => {
    expect(canSetApproverStatus(actor(), "on_hold", "initiated")).toEqual({ ok: false, reason: APPROVER_REFUSAL_WHO });
  });
});

describe("when each ruling is allowed", () => {
  const manager = actor({ isDoersManager: true });

  it("Approved and Not Approved wait for the Doer Status to be Done", () => {
    expect(canSetApproverStatus(manager, "approved", "follow_up")).toEqual({ ok: false, reason: APPROVER_REFUSAL_NOT_DONE });
    expect(canSetApproverStatus(manager, "not_approved", null)).toEqual({ ok: false, reason: APPROVER_REFUSAL_NOT_DONE });
  });

  it("On Hold, Cancelled and Pending can be set at any point", () => {
    expect(canSetApproverStatus(manager, "on_hold", "initiated").ok).toBe(true);
    expect(canSetApproverStatus(manager, "cancelled", "not_started").ok).toBe(true);
    expect(canSetApproverStatus(manager, "pending", "initiated").ok).toBe(true);
    expect(selectableApproverChoices(manager, "initiated")).toEqual(["pending", "on_hold", "cancelled"]);
    expect(selectableApproverChoices(manager, "done")).toEqual(["pending", "approved", "not_approved", "on_hold", "cancelled"]);
  });

  it("refuses a value that isn't an Approver / Initiator Status", () => {
    expect(canSetApproverStatus(manager, "transferred", "done").ok).toBe(false);
    expect(canSetApproverStatus(manager, "done", "done").ok).toBe(false);
  });
});

describe("storing and showing", () => {
  it("Pending is no ruling at all", () => {
    expect(approverStored("pending")).toBeNull();
    expect(approverStored("on_hold")).toBe("on_hold");
    expect(approverShown(null)).toBe("pending");
  });

  it("keeps showing a legacy Transferred verdict", () => {
    expect(approverShown("transferred")).toBe("transferred");
    expect(approverShown("something-else")).toBe("pending");
  });
});
