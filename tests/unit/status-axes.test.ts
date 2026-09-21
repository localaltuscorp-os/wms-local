import { describe, it, expect } from "vitest";
import {
  DOER_STATUSES,
  DOER_STATUS_LABEL,
  INITIATOR_STATUSES,
  INITIATOR_STATUS_LABEL,
  INITIATOR_COLUMN_ORDER,
  NO_VERDICT_COL,
  canSetDoerStatus,
  canSetInitiatorStatus,
  doerColumnFor,
  effectiveDoerStatus,
  effectiveInitiatorStatus,
  initiatorColumnFor,
  initiatorWrite,
  isTerminalDoerStatus,
  selectableInitiatorStatuses,
  type StatusActor,
} from "@/lib/status/axes";

const actor = (over: Partial<StatusActor> = {}): StatusActor => ({
  id: "me",
  isAdmin: false,
  isInitiator: false,
  isDoer: false,
  isSupervisor: false,
  ...over,
});

describe("the two status axes", () => {
  it("offers exactly the seven doer statuses Manan listed, in order", () => {
    expect(DOER_STATUSES.map((s) => DOER_STATUS_LABEL[s])).toEqual([
      "Not Read",
      "Not Started",
      "Initiated",
      "Follow Up",
      "Need Info",
      "Done",
      "Abandoned",
    ]);
  });

  it("offers exactly the four initiator statuses, in order", () => {
    expect(INITIATOR_STATUSES.map((s) => INITIATOR_STATUS_LABEL[s])).toEqual([
      "Approved",
      "Not Approved",
      "On Hold",
      "Archived",
    ]);
  });

  it("keeps the axes disjoint — no value means two things", () => {
    const overlap = (DOER_STATUSES as readonly string[]).filter((s) =>
      (INITIATOR_STATUSES as readonly string[]).includes(s),
    );
    expect(overlap).toEqual([]);
  });
});

describe("reading a row's status back", () => {
  it("falls back to Not Started for a value off the axis", () => {
    // A pre-0225 straggler, or a legacy verdict sitting in `status`.
    expect(effectiveDoerStatus("on_hold")).toBe("not_started");
    expect(effectiveDoerStatus(null)).toBe("not_started");
    expect(effectiveDoerStatus("nonsense")).toBe("not_started");
  });

  it("treats done and abandoned as the two terminals, and nothing else", () => {
    const terminal = DOER_STATUSES.filter(isTerminalDoerStatus);
    expect(terminal).toEqual(["done", "abandoned"]);
  });

  it("reports no verdict as null, NOT as Not Approved", () => {
    expect(effectiveInitiatorStatus(null, false)).toBeNull();
  });

  it("lets the archive flag outrank any verdict", () => {
    expect(effectiveInitiatorStatus("approved", true)).toBe("archived");
    expect(effectiveInitiatorStatus(null, true)).toBe("archived");
  });

  it("shows the pre-split verdicts as Archived, which is what they meant", () => {
    expect(effectiveInitiatorStatus("cancelled", false)).toBe("archived");
    expect(effectiveInitiatorStatus("transferred", false)).toBe("archived");
  });
});

describe("writing an initiator status", () => {
  it("archives without discarding the verdict that was there", () => {
    expect(initiatorWrite("archived")).toEqual({
      approvalStatus: null,
      archived: true,
    });
  });

  it("un-archives when a live verdict is set", () => {
    expect(initiatorWrite("on_hold")).toEqual({
      approvalStatus: "on_hold",
      archived: false,
    });
    expect(initiatorWrite("approved")).toEqual({
      approvalStatus: "approved",
      archived: false,
    });
  });
});

describe("who may set what", () => {
  it("refuses a doer their own approval — the point of the split", () => {
    const r = canSetInitiatorStatus(actor({ isDoer: true }), "approved");
    expect(r.ok).toBe(false);
    expect(selectableInitiatorStatuses(actor({ isDoer: true }))).toEqual([]);
  });

  it("refuses a supervisor too — supervising is not commissioning", () => {
    expect(canSetInitiatorStatus(actor({ isSupervisor: true }), "on_hold").ok).toBe(
      false,
    );
  });

  it("allows the initiator and the admin all four", () => {
    expect(selectableInitiatorStatuses(actor({ isInitiator: true }))).toEqual([
      ...INITIATOR_STATUSES,
    ]);
    expect(selectableInitiatorStatuses(actor({ isAdmin: true }))).toEqual([
      ...INITIATOR_STATUSES,
    ]);
  });

  it("lets the people close to the work report progress", () => {
    for (const a of [
      actor({ isDoer: true }),
      actor({ isSupervisor: true }),
      actor({ isInitiator: true }),
      actor({ isAdmin: true }),
    ]) {
      expect(canSetDoerStatus(a, "abandoned").ok).toBe(true);
    }
    expect(canSetDoerStatus(actor(), "abandoned").ok).toBe(false);
  });

  it("refuses a value from the wrong axis on either side", () => {
    expect(canSetDoerStatus(actor({ isAdmin: true }), "approved").ok).toBe(false);
    expect(canSetInitiatorStatus(actor({ isAdmin: true }), "done").ok).toBe(false);
  });
});

describe("board columns", () => {
  it("puts an unruled row in its own No Verdict column", () => {
    expect(initiatorColumnFor({ approvalStatus: null, archived: false })).toBe(
      NO_VERDICT_COL,
    );
    // And that column leads the board — it is the queue an initiator clears.
    expect(INITIATOR_COLUMN_ORDER[0]).toBe(NO_VERDICT_COL);
  });

  it("columns a row by each axis independently", () => {
    const row = { status: "abandoned", approvalStatus: "on_hold", archived: false };
    expect(doerColumnFor(row)).toBe("abandoned");
    expect(initiatorColumnFor(row)).toBe("on_hold");
  });

  it("gives every doer status a column and every column a label", () => {
    for (const s of DOER_STATUSES) {
      expect(DOER_STATUS_LABEL[s]).toBeTruthy();
      expect(doerColumnFor({ status: s })).toBe(s);
    }
  });
});
