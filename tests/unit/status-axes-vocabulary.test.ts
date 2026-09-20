import { describe, expect, it } from "vitest";
import {
  DOER_STATUSES,
  DOER_STATUS_LABEL,
  INITIATOR_STATUSES,
  INITIATOR_STATUS_LABEL,
  INITIATOR_COLUMN_LABEL,
  NO_VERDICT_COL,
  canSetDoerStatus,
  canSetInitiatorStatus,
  effectiveInitiatorStatus,
  initiatorWrite,
  type StatusActor,
} from "@/lib/status/axes";
import { TASK_STATUSES } from "@/db/enums";

/**
 * THE TWO DROPDOWNS, pinned.
 *
 * Manan, 2026-09-15 supplied a screenshot of the verdict dropdown and asked for
 * it everywhere: No Verdict · Approved · Not Approved · On Hold · Archived —
 * and the same treatment for the doer axis beside it.
 *
 * These assert the LISTS, which is the half of that request a test can hold on
 * to. The rendering is one shared component (components/status/status-select.tsx)
 * precisely so there is only one list to pin.
 *
 * THE REGRESSION THIS GUARDS. The Goals table built its doer picker from
 * `ADMIN_TASK_STATUSES` — every non-deprecated value in the column — so an
 * admin reporting a goal's PROGRESS was offered "Approved", "Not approved",
 * "Cancelled" and "Transferred" as if they were progress, beside an Initiator
 * Status cell that ruled on exactly those. The first test below is the one that
 * fails if anything ever points a doer control at the column again.
 */

const VERDICT_WORDS = ["approved", "not_approved", "cancelled", "transferred", "on_hold"];

describe("the doer dropdown", () => {
  it("is exactly the seven progress values, in lifecycle order", () => {
    expect([...DOER_STATUSES]).toEqual([
      "dont_know",
      "not_started",
      "initiated",
      "follow_up",
      "need_info",
      "done",
      "abandoned",
    ]);
  });

  it("carries NO verdict on it", () => {
    for (const v of VERDICT_WORDS) {
      expect(DOER_STATUSES as readonly string[]).not.toContain(v);
    }
  });

  it("reads 'Not Read' for the 2026-05 import's internal name", () => {
    // `dont_know` is a relic of the import and is never shown as itself.
    expect(DOER_STATUS_LABEL.dont_know).toBe("Not Read");
  });

  it("is a strict subset of the column it writes to", () => {
    // The column still holds legacy values; the AXIS is what the control offers.
    for (const s of DOER_STATUSES) {
      expect(TASK_STATUSES as readonly string[]).toContain(s);
    }
    expect(DOER_STATUSES.length).toBeLessThan(TASK_STATUSES.length);
  });
});

describe("the initiator dropdown", () => {
  it("is exactly the four verdicts from the screenshot", () => {
    expect([...INITIATOR_STATUSES]).toEqual([
      "approved",
      "not_approved",
      "on_hold",
      "archived",
    ]);
  });

  it("labels them the way the screenshot does, No Verdict included", () => {
    expect(INITIATOR_COLUMN_LABEL[NO_VERDICT_COL]).toBe("No Verdict");
    expect(INITIATOR_STATUS_LABEL.approved).toBe("Approved");
    expect(INITIATOR_STATUS_LABEL.not_approved).toBe("Not Approved");
    expect(INITIATOR_STATUS_LABEL.on_hold).toBe("On Hold");
    expect(INITIATOR_STATUS_LABEL.archived).toBe("Archived");
  });

  it("treats 'nobody has ruled' as a real state, not as Not Approved", () => {
    expect(effectiveInitiatorStatus(null, false)).toBeNull();
    expect(effectiveInitiatorStatus("not_approved", false)).toBe("not_approved");
  });

  it("lets Archived outrank whatever the last ruling was", () => {
    expect(effectiveInitiatorStatus("approved", true)).toBe("archived");
  });
});

describe("Archived is a flag, not a stored verdict", () => {
  it("archives without discarding the verdict underneath", () => {
    // Un-archiving must not silently forget that something was Approved.
    expect(initiatorWrite("archived")).toEqual({ approvalStatus: null, archived: true });
  });

  it("un-archives whenever a live verdict is set", () => {
    expect(initiatorWrite("approved")).toEqual({ approvalStatus: "approved", archived: false });
    expect(initiatorWrite("on_hold")).toEqual({ approvalStatus: "on_hold", archived: false });
  });
});

describe("who may set which axis", () => {
  const base: StatusActor = {
    id: "me",
    isAdmin: false,
    isInitiator: false,
    isDoer: false,
    isSupervisor: false,
  };

  it("keeps a doer from approving their own work", () => {
    const doer = { ...base, isDoer: true };
    expect(canSetDoerStatus(doer, "done").ok).toBe(true);
    expect(canSetInitiatorStatus(doer, "approved").ok).toBe(false);
  });

  it("lets the initiator rule, and report progress too", () => {
    const initiator = { ...base, isInitiator: true };
    expect(canSetInitiatorStatus(initiator, "approved").ok).toBe(true);
    expect(canSetDoerStatus(initiator, "initiated").ok).toBe(true);
  });

  it("refuses a value from the wrong axis on either control", () => {
    const admin = { ...base, isAdmin: true };
    expect(canSetDoerStatus(admin, "approved").ok).toBe(false);
    expect(canSetInitiatorStatus(admin, "initiated").ok).toBe(false);
  });

  it("lets a bystander do neither", () => {
    expect(canSetDoerStatus(base, "done").ok).toBe(false);
    expect(canSetInitiatorStatus(base, "approved").ok).toBe(false);
  });
});
