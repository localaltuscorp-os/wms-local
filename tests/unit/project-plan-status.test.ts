import { describe, it, expect } from "vitest";
import {
  canSetPlanStatus,
  selectableStatuses,
  effectivePlanStatus,
  isWorkingStatus,
  isRestrictedStatus,
  isPlanStatus,
  PLAN_WORKING_STATUSES,
  PLAN_RESTRICTED_STATUSES,
  PLAN_STATUS_LABEL,
  type PlanActor,
} from "@/lib/project-plan/status";

/** An actor with every relationship off unless named. */
function actor(over: Partial<PlanActor> = {}): PlanActor {
  return {
    id: "me",
    isAdmin: false,
    isOwner: false,
    isDoer: false,
    isSupervisor: false,
    ...over,
  };
}

const ADMIN = actor({ isAdmin: true });
const OWNER = actor({ isOwner: true });
const DOER = actor({ isDoer: true });
const SUPERVISOR = actor({ isSupervisor: true });
const BYSTANDER = actor();

describe("the two vocabularies are disjoint and complete", () => {
  it("every status belongs to exactly one flow", () => {
    for (const s of PLAN_WORKING_STATUSES) {
      expect(isWorkingStatus(s)).toBe(true);
      expect(isRestrictedStatus(s)).toBe(false);
      expect(isPlanStatus(s)).toBe(true);
    }
    for (const s of PLAN_RESTRICTED_STATUSES) {
      expect(isRestrictedStatus(s)).toBe(true);
      expect(isWorkingStatus(s)).toBe(false);
      expect(isPlanStatus(s)).toBe(true);
    }
  });

  it("every status has a label, so nothing renders as a raw enum value", () => {
    for (const s of [...PLAN_WORKING_STATUSES, ...PLAN_RESTRICTED_STATUSES]) {
      expect(PLAN_STATUS_LABEL[s]).toBeTruthy();
    }
    // The WMS wording, not the database's: "Not Read", never "Don't know".
    expect(PLAN_STATUS_LABEL.dont_know).toBe("Not Read");
  });

  it("rejects anything that is not a status at all", () => {
    expect(isPlanStatus("")).toBe(false);
    expect(isPlanStatus(null)).toBe(false);
    expect(isPlanStatus("in_progress")).toBe(false);
    expect(canSetPlanStatus(ADMIN, "in_progress").ok).toBe(false);
    // Even an admin cannot invent a value — the vocabulary is the vocabulary.
    expect(canSetPlanStatus(ADMIN, "approved!").ok).toBe(false);
  });
});

// Brief §6: the working six are a progress REPORT, so the people close to the
// work may set them.
describe("working flow — the doer, their supervisor, the owner", () => {
  it("lets everyone close to the work report progress", () => {
    for (const who of [ADMIN, OWNER, DOER, SUPERVISOR]) {
      for (const s of PLAN_WORKING_STATUSES) {
        expect(canSetPlanStatus(who, s).ok).toBe(true);
      }
    }
  });

  it("refuses someone with no relationship to the row", () => {
    for (const s of PLAN_WORKING_STATUSES) {
      const v = canSetPlanStatus(BYSTANDER, s);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/doer, their supervisor or the project owner/i);
    }
  });
});

// Brief §6: the restricted five are a RULING about the work. This is the rule
// the whole permission story rests on.
describe("restricted flow — the project owner or an administrator, nobody else", () => {
  it("lets the owner and an admin rule", () => {
    for (const who of [ADMIN, OWNER]) {
      for (const s of PLAN_RESTRICTED_STATUSES) {
        expect(canSetPlanStatus(who, s).ok).toBe(true);
      }
    }
  });

  it("refuses the DOER — the person who did the work cannot approve it", () => {
    for (const s of PLAN_RESTRICTED_STATUSES) {
      const v = canSetPlanStatus(DOER, s);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toMatch(/project owner or an administrator/i);
    }
  });

  it("refuses the SUPERVISOR too — reporting up is not the same as ruling", () => {
    for (const s of PLAN_RESTRICTED_STATUSES) {
      expect(canSetPlanStatus(SUPERVISOR, s).ok).toBe(false);
    }
  });

  it("refuses a bystander", () => {
    for (const s of PLAN_RESTRICTED_STATUSES) {
      expect(canSetPlanStatus(BYSTANDER, s).ok).toBe(false);
    }
  });

  it("names the status it refused, so the message is actionable", () => {
    const v = canSetPlanStatus(DOER, "approved");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("Approved");
  });
});

describe("selectableStatuses — what a picker may offer", () => {
  it("gives an owner and an admin the whole vocabulary", () => {
    for (const who of [ADMIN, OWNER]) {
      expect(selectableStatuses(who)).toHaveLength(
        PLAN_WORKING_STATUSES.length + PLAN_RESTRICTED_STATUSES.length,
      );
    }
  });

  it("gives a doer the working six and not one verdict", () => {
    const list = selectableStatuses(DOER);
    expect(list).toEqual([...PLAN_WORKING_STATUSES]);
    expect(list.some(isRestrictedStatus)).toBe(false);
  });

  it("gives a bystander nothing at all", () => {
    expect(selectableStatuses(BYSTANDER)).toEqual([]);
  });

  it("never offers what canSetPlanStatus would refuse", () => {
    for (const who of [ADMIN, OWNER, DOER, SUPERVISOR, BYSTANDER]) {
      for (const s of selectableStatuses(who)) {
        expect(canSetPlanStatus(who, s).ok).toBe(true);
      }
    }
  });
});

describe("effectivePlanStatus — a verdict outranks a progress report", () => {
  it("shows the verdict over the working status underneath", () => {
    // The row was at Follow Up when it was cancelled. It reads Cancelled — but
    // the report underneath is not erased, which is why they are two columns.
    expect(effectivePlanStatus("follow_up", "cancelled", false)).toBe("cancelled");
    expect(effectivePlanStatus("done", "not_approved", false)).toBe("not_approved");
  });

  it("shows archived above everything, since the row is gone from the board", () => {
    expect(effectivePlanStatus("done", "approved", true)).toBe("archived");
  });

  it("falls back to the working status, then to Not Started", () => {
    expect(effectivePlanStatus("initiated", null, false)).toBe("initiated");
    expect(effectivePlanStatus(null, null, false)).toBe("not_started");
    // A row written before migration 0204, or by something that got it wrong.
    expect(effectivePlanStatus("nonsense", null, false)).toBe("not_started");
    expect(effectivePlanStatus("initiated", "nonsense", false)).toBe("initiated");
  });
});
