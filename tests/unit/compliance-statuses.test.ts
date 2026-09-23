import { describe, it, expect } from "vitest";
import {
  COMPLIANCE_APPROVER_CHOICES,
  COMPLIANCE_APPROVER_LABEL,
  DOER_STATUSES,
  complianceApproverChoices,
  doerLabel,
  doerStatusOf,
  doerStyle,
  isComplianceApproverChoice,
  legacyStatusFor,
} from "@/lib/compliance/status";
import { APPROVER_LABEL, type ApproverActor } from "@/lib/status/approver-status";
import { wccOccurrences, type ComplianceItem } from "@/lib/compliance/schedule";
import { buildComplianceRows, summarise, type FillLike } from "@/lib/compliance/rows";

/**
 * WCC / MCC statuses (account holder, 2026-09-19):
 *   Doer Status     Not Read · Not Started · Initiated · Follow Up · Need Info · Done · Abandoned
 *   Approver Status Approved · Not Approved · On Hold · Archive
 */

describe("the Doer Status", () => {
  it("offers the seven, in order", () => {
    expect(DOER_STATUSES.map(doerLabel)).toEqual(["Not Read", "Not Started", "Initiated", "Follow Up", "Need Info", "Done", "Abandoned"]);
  });

  it("writes Abandoned as Not done for DCC's readers, and reads it back as Abandoned", () => {
    expect(legacyStatusFor("abandoned", null)).toBe("Not done");
    expect(doerStatusOf({ doerStatus: "abandoned", status: "Not done" })).toBe("abandoned");
    // A later change from the Android app still wins, as for every status.
    expect(doerStatusOf({ doerStatus: "abandoned", status: "Done" })).toBe("done");
  });

  it("gives Abandoned its own colour, apart from Not Read", () => {
    expect(doerStyle("abandoned")).not.toEqual(doerStyle("dont_know"));
  });
});

describe("the Approver Status", () => {
  const lead: ApproverActor = { isAdmin: false, isInitiator: false, isDoersManager: true, isDoer: false, isSelfRaised: false };
  const doer: ApproverActor = { ...lead, isDoersManager: false, isDoer: true };

  it("offers the four rulings — no Cancelled — with Archived written Archive", () => {
    expect(COMPLIANCE_APPROVER_CHOICES.map((c) => COMPLIANCE_APPROVER_LABEL[c] ?? APPROVER_LABEL[c])).toEqual([
      "Approved",
      "Not Approved",
      "On Hold",
      "Archive",
    ]);
    expect(isComplianceApproverChoice("cancelled")).toBe(false);
    expect(isComplianceApproverChoice("pending")).toBe(false);
    expect(isComplianceApproverChoice("archived")).toBe(true);
  });

  it("keeps the WMS rule: Approved and Not Approved wait for Done; the doer never rules", () => {
    expect(complianceApproverChoices(lead, "done")).toEqual(["approved", "not_approved", "on_hold", "archived"]);
    expect(complianceApproverChoices(lead, "abandoned")).toEqual(["on_hold", "archived"]);
    expect(complianceApproverChoices(lead, null)).toEqual(["on_hold", "archived"]);
    expect(complianceApproverChoices(doer, "done")).toEqual([]);
  });
});

/* ── Abandoned on the checklist ────────────────────────────────────────── */

// 2026-09-15 is a Tuesday; Tue & Fri: Tuesday's is open to Thursday.
const item: ComplianceItem = {
  id: "i1",
  ownerEmployeeId: "p1",
  title: "Send the proposals",
  section: null,
  code: null,
  frequency: null,
  weekdays: 0b0010010,
  scheduleKind: "scheduled",
  monthDay: null,
  isParticipantList: false,
  sortOrder: 1,
  createdById: null,
  activeFrom: null,
};
const fill = (over: Partial<FillLike>): FillLike => ({
  itemId: "i1",
  entryDate: "2026-09-15",
  status: null,
  doerStatus: null,
  doneAt: null,
  note: null,
  approverStatus: null,
  approverNotes: null,
  updatedAt: null,
  ...over,
});
const rowOn = (today: string, f: FillLike) => {
  const occ = wccOccurrences([item], "2026-09-15", "2026-09-15");
  return buildComplianceRows({
    occurrences: occ,
    fills: new Map([[occ[0]!.key, f]]),
    items: new Map([["i1", item]]),
    names: new Map([["p1", "Priya"]]),
    masters: new Map(),
    today,
    viewer: { id: "p1", isAdmin: false, fillsForAnyone: false, visibleIds: new Set(["p1"]), canManageFor: () => true },
  })[0]!;
};

describe("an Abandoned row", () => {
  const abandoned = fill({ doerStatus: "abandoned", status: "Not done" });

  it("is not carried forward, and counts no lateness — but can still be changed while open", () => {
    expect(rowOn("2026-09-16", abandoned)).toMatchObject({ carried: false, lapsed: false, locked: false, canFill: true, variance: null, running: false });
  });

  it("reads Abandoned, not Lapsed, once its time is up", () => {
    expect(rowOn("2026-09-18", abandoned)).toMatchObject({ locked: true, lapsed: false, canFill: false });
  });

  it("is filled but never done in the summary", () => {
    expect(summarise([rowOn("2026-09-16", abandoned)], "2026-09-16")).toMatchObject({ filled: 1, done: 0, abandoned: 1, carried: 0 });
  });
});
