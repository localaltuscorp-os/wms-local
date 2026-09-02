import { describe, it, expect } from "vitest";
import {
  nextStatusesFor,
  canTransitionTo,
  type ActorRole,
} from "@/lib/auth/status-transitions";
import { TASK_STATUSES, PENDING_STATUSES, type TaskStatus } from "@/db/enums";

const ROLES: ActorRole[] = ["doer", "initiator", "creator", "admin", "stranger"];

describe("nextStatusesFor — pending lane sideways moves", () => {
  it("doer can move between any pending statuses", () => {
    for (const from of PENDING_STATUSES) {
      const next = nextStatusesFor(from, "doer");
      for (const peer of PENDING_STATUSES) {
        if (peer === from) continue;
        expect(next).toContain(peer);
      }
    }
  });

  it("initiator can move between any pending statuses", () => {
    for (const from of PENDING_STATUSES) {
      const next = nextStatusesFor(from, "initiator");
      for (const peer of PENDING_STATUSES) {
        if (peer === from) continue;
        expect(next).toContain(peer);
      }
    }
  });

  it("creator-only (no other relationship) cannot move status", () => {
    for (const from of PENDING_STATUSES) {
      expect(nextStatusesFor(from, "creator")).toEqual([]);
    }
  });

  it("stranger cannot move status", () => {
    for (const from of TASK_STATUSES) {
      expect(nextStatusesFor(from, "stranger")).toEqual([]);
    }
  });
});

describe("nextStatusesFor — pending → done", () => {
  it("doer can mark pending → done", () => {
    for (const from of PENDING_STATUSES) {
      expect(nextStatusesFor(from, "doer")).toContain("done");
    }
  });

  it("initiator cannot mark pending → done", () => {
    for (const from of PENDING_STATUSES) {
      expect(nextStatusesFor(from, "initiator")).not.toContain("done");
    }
  });

  it("admin can mark pending → done", () => {
    for (const from of PENDING_STATUSES) {
      expect(nextStatusesFor(from, "admin")).toContain("done");
    }
  });
});

describe("nextStatusesFor — done → approved | not_approved", () => {
  it("initiator can approve OR decline a done task", () => {
    const next = nextStatusesFor("done", "initiator");
    expect(next).toContain("approved");
    expect(next).toContain("not_approved");
  });

  it("doer cannot approve their own work", () => {
    const next = nextStatusesFor("done", "doer");
    expect(next).not.toContain("approved");
    expect(next).not.toContain("not_approved");
  });

  it("admin can approve OR decline", () => {
    const next = nextStatusesFor("done", "admin");
    expect(next).toContain("approved");
    expect(next).toContain("not_approved");
  });

  it("not_approved → any pending status is allowed for doer (rework)", () => {
    const next = nextStatusesFor("not_approved", "doer");
    for (const peer of PENDING_STATUSES) expect(next).toContain(peer);
  });
});

describe("nextStatusesFor — cancellation + external transfer", () => {
  it("initiator can cancel from any non-terminal status", () => {
    const nonTerminal: TaskStatus[] = [...PENDING_STATUSES, "done"];
    for (const from of nonTerminal) {
      expect(nextStatusesFor(from, "initiator")).toContain("cancelled");
    }
  });

  it("doer cannot cancel", () => {
    for (const from of PENDING_STATUSES) {
      expect(nextStatusesFor(from, "doer")).not.toContain("cancelled");
    }
  });

  it("initiator can transfer-external from any non-terminal status", () => {
    const nonTerminal: TaskStatus[] = [...PENDING_STATUSES, "done"];
    for (const from of nonTerminal) {
      expect(nextStatusesFor(from, "initiator")).toContain("transferred");
    }
  });

  it("doer cannot transfer-external", () => {
    for (const from of PENDING_STATUSES) {
      expect(nextStatusesFor(from, "doer")).not.toContain("transferred");
    }
  });
});

describe("nextStatusesFor — terminal lock", () => {
  it("approved tasks cannot move (except by admin → not_approved as ops override)", () => {
    expect(nextStatusesFor("approved", "doer")).toEqual([]);
    expect(nextStatusesFor("approved", "initiator")).toEqual([]);
    expect(nextStatusesFor("approved", "creator")).toEqual([]);
    expect(nextStatusesFor("approved", "stranger")).toEqual([]);
  });

  it("cancelled is terminal for everyone except admin", () => {
    expect(nextStatusesFor("cancelled", "doer")).toEqual([]);
    expect(nextStatusesFor("cancelled", "initiator")).toEqual([]);
  });

  it("transferred is terminal for everyone except admin", () => {
    expect(nextStatusesFor("transferred", "doer")).toEqual([]);
    expect(nextStatusesFor("transferred", "initiator")).toEqual([]);
  });
});

describe("canTransitionTo (predicate)", () => {
  it("is true exactly when target is in nextStatusesFor", () => {
    for (const from of TASK_STATUSES) {
      for (const role of ROLES) {
        const allowed = nextStatusesFor(from, role);
        for (const to of TASK_STATUSES) {
          expect(canTransitionTo(from, to, role)).toBe(allowed.includes(to));
        }
      }
    }
  });

  it("is always false when from === to (no self-transitions)", () => {
    for (const s of TASK_STATUSES) {
      for (const role of ROLES) {
        expect(canTransitionTo(s, s, role)).toBe(false);
      }
    }
  });
});
