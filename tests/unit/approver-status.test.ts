import { describe, it, expect } from "vitest";
import {
  APPROVER_REFUSAL_DOER,
  APPROVER_REFUSAL_NOT_DONE,
  APPROVER_REFUSAL_WHO,
  APPROVER_REFUSAL_SELF_RAISED,
  approverDisplay,
  approverShown,
  approverStored,
  canRuleOn,
  canSetApproverStatus,
  selectableApproverChoices,
  type ApproverActor,
} from "@/lib/status/approver-status";

/**
 * INITIATOR STATUS (account holder, 2026-09-15, revised 2026-09-16) — one rule
 * for WMS Tasks, Goals and Projects: the initiator, the doer's manager or an
 * admin rules on the work; the doer never does. Work somebody raised for
 * themselves has no approver at all — it reads "Not Applicable" and only an
 * admin may overrule.
 */

const actor = (over: Partial<ApproverActor> = {}): ApproverActor => ({
  isAdmin: false,
  isInitiator: false,
  isDoersManager: false,
  isDoer: false,
  isSelfRaised: false,
  ...over,
});

describe("who may set the Initiator Status", () => {
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
    expect(selectableApproverChoices(manager, "initiated")).toEqual([
      "pending", "on_hold", "archived", "cancelled",
    ]);
    expect(selectableApproverChoices(manager, "done")).toEqual([
      "pending", "approved", "not_approved", "on_hold", "archived", "cancelled",
    ]);
  });

  it("refuses a value that isn't an Initiator Status", () => {
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

describe("Archived — the sixth verdict (account holder, 2026-09-16)", () => {
  const manager = actor({ isDoersManager: true });

  it("is offered alongside the rest, and needs no Done first", () => {
    // Like On Hold and Cancelled, Archived is a decision about the work, not a
    // judgement of finished work — so it does not wait for the Doer Status.
    expect(canSetApproverStatus(manager, "archived", "not_started").ok).toBe(true);
    expect(selectableApproverChoices(manager, "initiated")).toContain("archived");
  });

  it("stores as itself and shows as itself", () => {
    expect(approverStored("archived")).toBe("archived");
    expect(approverShown("archived")).toBe("archived");
  });
});

describe("self-raised work has no approver", () => {
  /* Raised by the person doing it: nobody is waiting on a ruling, so the column
     reads "Not Applicable". Goals used to let the raiser approve their own
     goal; Tasks never did. Both now agree. */
  const selfRaised = (over = {}) => actor({ isSelfRaised: true, isDoer: true, ...over });

  it("reads Not Applicable while unruled, for everyone", () => {
    expect(approverDisplay(null, true)).toBe("not_applicable");
    expect(approverDisplay(undefined, true)).toBe("not_applicable");
    // Not self-raised: the ordinary resting state is Pending, not N/A.
    expect(approverDisplay(null, false)).toBe("pending");
  });

  it("still shows a ruling an admin has already made", () => {
    // Hiding a stored verdict behind "Not Applicable" would make the admin's
    // override look like it did nothing.
    expect(approverDisplay("approved", true)).toBe("approved");
    expect(approverDisplay("on_hold", true)).toBe("on_hold");
  });

  it("refuses the raiser, their manager and any bystander", () => {
    expect(canSetApproverStatus(selfRaised(), "on_hold", "initiated")).toEqual({
      ok: false,
      reason: APPROVER_REFUSAL_SELF_RAISED,
    });
    expect(canSetApproverStatus(selfRaised({ isDoersManager: true, isDoer: false }), "cancelled", "done")).toEqual({
      ok: false,
      reason: APPROVER_REFUSAL_SELF_RAISED,
    });
    expect(canRuleOn(selfRaised())).toBe(false);
    expect(selectableApproverChoices(selfRaised(), "done")).toEqual([]);
  });

  it("lets an admin overrule — including an admin who is the raiser", () => {
    /* The account holder's call (2026-09-16): "Not Applicable" describes who is
       waiting, not a lock an administrator cannot open. */
    const admin = selfRaised({ isAdmin: true });
    expect(canSetApproverStatus(admin, "approved", "done")).toEqual({ ok: true });
    expect(canRuleOn(admin)).toBe(true);
    // The Done gate still applies to the two verdicts that judge finished work.
    expect(canSetApproverStatus(admin, "approved", "initiated")).toEqual({
      ok: false,
      reason: APPROVER_REFUSAL_NOT_DONE,
    });
  });
});
