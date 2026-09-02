import { describe, it, expect } from "vitest";
import {
  canEditTaskFields,
  type TaskPermissionInput,
} from "@/lib/auth/task-permissions";
import { PENDING_STATUSES, TASK_STATUSES } from "@/db/enums";

const me = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";

function task(overrides: Partial<TaskPermissionInput["task"]> = {}) {
  return {
    createdById: other,
    initiatorId: other,
    doerId: other,
    status: "not_started" as const,
    ...overrides,
  };
}

describe("canEditTaskFields", () => {
  it("allows the creator on a pending task", () => {
    const result = canEditTaskFields({
      employee: { id: me, isAdmin: false },
      task: task({ createdById: me }),
    });
    expect(result).toBe(true);
  });

  it("allows the initiator on a pending task", () => {
    const result = canEditTaskFields({
      employee: { id: me, isAdmin: false },
      task: task({ initiatorId: me }),
    });
    expect(result).toBe(true);
  });

  // Tier-3 (2026-05-20) — Manan's spec widened canEditTaskFields so the
  // doer can edit their own task while it's pending. Previously the doer
  // was denied unless they were also the creator or initiator.
  it("allows the doer (Tier-3 spec widening)", () => {
    const result = canEditTaskFields({
      employee: { id: me, isAdmin: false },
      task: task({ doerId: me }),
    });
    expect(result).toBe(true);
  });

  it("denies a stranger", () => {
    const result = canEditTaskFields({
      employee: { id: me, isAdmin: false },
      task: task(),
    });
    expect(result).toBe(false);
  });

  it("denies the creator on a non-pending task", () => {
    for (const status of TASK_STATUSES) {
      if ((PENDING_STATUSES as readonly string[]).includes(status)) continue;
      const result = canEditTaskFields({
        employee: { id: me, isAdmin: false },
        task: task({ createdById: me, status }),
      });
      expect(result).toBe(false);
    }
  });

  it("allows the admin even on a non-pending task", () => {
    for (const status of TASK_STATUSES) {
      const result = canEditTaskFields({
        employee: { id: me, isAdmin: true },
        task: task({ status }),
      });
      expect(result).toBe(true);
    }
  });

  it("denies when task.createdById is null and user is not initiator/admin", () => {
    const result = canEditTaskFields({
      employee: { id: me, isAdmin: false },
      task: task({ createdById: null }),
    });
    expect(result).toBe(false);
  });
});

import {
  canApprove,
  canReassign,
  canComment,
} from "@/lib/auth/task-permissions";

describe("canApprove", () => {
  it("initiator on done task → true", () => {
    expect(
      canApprove({
        employee: { id: me, isAdmin: false },
        task: task({ initiatorId: me, status: "done" }),
        isDoersManager: false,
      }),
    ).toBe(true);
  });

  it("initiator on non-done task → false", () => {
    expect(
      canApprove({
        employee: { id: me, isAdmin: false },
        task: task({ initiatorId: me, status: "follow_up" }),
        isDoersManager: false,
      }),
    ).toBe(false);
  });

  it("doer on done task → false (no self-approve)", () => {
    expect(
      canApprove({
        employee: { id: me, isAdmin: false },
        task: task({ doerId: me, status: "done" }),
        isDoersManager: false,
      }),
    ).toBe(false);
  });

  it("admin on done task → true", () => {
    expect(
      canApprove({
        employee: { id: me, isAdmin: true },
        task: task({ status: "done" }),
        isDoersManager: false,
      }),
    ).toBe(true);
  });
});

describe("canReassign", () => {
  it("doer in pending lane → true", () => {
    expect(
      canReassign({
        employee: { id: me, isAdmin: false },
        task: task({ doerId: me, status: "follow_up" }),
      }),
    ).toBe(true);
  });

  it("initiator in pending lane → true", () => {
    expect(
      canReassign({
        employee: { id: me, isAdmin: false },
        task: task({ initiatorId: me, status: "follow_up" }),
      }),
    ).toBe(true);
  });

  it("stranger → false", () => {
    expect(
      canReassign({
        employee: { id: me, isAdmin: false },
        task: task(),
      }),
    ).toBe(false);
  });

  it("done task → false (cannot reassign completed work)", () => {
    expect(
      canReassign({
        employee: { id: me, isAdmin: false },
        task: task({ doerId: me, status: "done" }),
      }),
    ).toBe(false);
  });
});

import { canApprove as canApproveH, canDecline } from "@/lib/auth/task-permissions";

const dbase = {
  task: { createdById: "c", initiatorId: "i", doerId: "d", status: "done" as const },
};

describe("canApprove (hierarchy)", () => {
  it("admin approves", () => expect(canApproveH({ employee: { id: "x", isAdmin: true }, ...dbase, isDoersManager: false })).toBe(true));
  it("initiator approves", () => expect(canApproveH({ employee: { id: "i", isAdmin: false }, ...dbase, isDoersManager: false })).toBe(true));
  it("doer's manager approves", () => expect(canApproveH({ employee: { id: "m", isAdmin: false }, ...dbase, isDoersManager: true })).toBe(true));
  it("doer cannot self-approve even if flagged manager", () => expect(canApproveH({ employee: { id: "d", isAdmin: false }, ...dbase, isDoersManager: true })).toBe(false));
  it("unrelated non-manager cannot", () => expect(canApproveH({ employee: { id: "z", isAdmin: false }, ...dbase, isDoersManager: false })).toBe(false));
  it("only when done", () => expect(canApproveH({ employee: { id: "i", isAdmin: false }, task: { ...dbase.task, status: "not_started" }, isDoersManager: false })).toBe(false));
});
describe("canDecline", () => {
  it("participant declines", () => expect(canDecline({ employee: { id: "d", isAdmin: false }, ...dbase })).toBe(true));
  it("admin declines", () => expect(canDecline({ employee: { id: "x", isAdmin: true }, ...dbase })).toBe(true));
  it("stranger cannot", () => expect(canDecline({ employee: { id: "z", isAdmin: false }, ...dbase })).toBe(false));
});

describe("canComment", () => {
  it("any participant can comment regardless of status", () => {
    for (const status of TASK_STATUSES) {
      expect(
        canComment({
          employee: { id: me, isAdmin: false },
          task: task({ doerId: me, status }),
        }),
      ).toBe(true);
      expect(
        canComment({
          employee: { id: me, isAdmin: false },
          task: task({ initiatorId: me, status }),
        }),
      ).toBe(true);
      expect(
        canComment({
          employee: { id: me, isAdmin: false },
          task: task({ createdById: me, status }),
        }),
      ).toBe(true);
    }
  });

  it("stranger cannot comment", () => {
    expect(
      canComment({
        employee: { id: me, isAdmin: false },
        task: task(),
      }),
    ).toBe(false);
  });

  it("admin can always comment", () => {
    expect(
      canComment({
        employee: { id: me, isAdmin: true },
        task: task(),
      }),
    ).toBe(true);
  });
});
