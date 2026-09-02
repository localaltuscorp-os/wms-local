import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Tier-3 — actions.ts now imports getStatusDisplayMap (server-only).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/status-display", () => ({
  getStatusDisplayMap: vi.fn(async () => ({})),
}));

const { insertCall, queryCall, updateCall, employeeQueryCall } = vi.hoisted(() => ({
  insertCall: vi.fn(),
  queryCall: vi.fn(),
  updateCall: vi.fn(),
  // Task 10 — approveTask now looks up the doer's manager. Default to no
  // manager so the manager gate stays closed unless a test opts in.
  employeeQueryCall: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const make = () => {
    const returning = vi.fn(() => Promise.resolve([{ id: "tid" }]));
    const values = vi.fn(() => ({ returning }));
    return { values, returning };
  };
  insertCall.mockImplementation(() => make());

  const where = vi.fn(() => ({
    returning: vi.fn(() => Promise.resolve([{ id: "tid" }])),
  }));
  const set = vi.fn(() => ({ where }));
  updateCall.mockImplementation(() => ({ set }));

  // `db.transaction(cb)` invokes the callback with a tx object that has
  // the same select/insert/update/delete surface as `db`. Tests don't care
  // about isolation; we just need the callback to run with the same mock
  // object so the call sites work.
  const txDb = {
    insert: insertCall,
    update: updateCall,
    query: {
      tasks: { findFirst: queryCall },
      employees: { findFirst: employeeQueryCall },
    },
  };
  return {
    db: {
      insert: insertCall,
      update: updateCall,
      query: {
        tasks: { findFirst: queryCall },
        employees: { findFirst: employeeQueryCall },
      },
      transaction: vi.fn(async (cb: (tx: typeof txDb) => unknown) => cb(txDb)),
    },
    tasks: { id: "tasks.id", updatedAt: "tasks.updatedAt" },
    taskEvents: { id: "task_events.id" },
    employees: {},
  };
});

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({
    id: "me-id",
    isAdmin: false,
    isActive: true,
    name: "Me",
    email: "me@vp.com",
  })),
}));

// M2.3 — actions now fan out via the notifications dispatcher (server-only).
vi.mock("@/lib/notifications/dispatch", () => ({
  notify: vi.fn(async () => undefined),
  notifyManyForTask: vi.fn(async () => undefined),
  dedupeRecipients: vi.fn(() => [] as string[]),
}));

import {
  approveTask,
  reassignTask,
  addComment,
  setTaskStatus,
} from "@/app/(app)/tasks/actions";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const baseDate = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  // Use mockReset (not mockClear) so queued mockResolvedValueOnce values from
  // prior tests don't bleed through.  Then re-establish the default impls.
  insertCall.mockReset();
  queryCall.mockReset();
  updateCall.mockReset();
  employeeQueryCall.mockReset();
  // Default: doer has no manager, so approveTask's manager gate stays closed.
  employeeQueryCall.mockResolvedValue({ managerId: null });

  const makeInsert = () => {
    const returning = vi.fn(() => Promise.resolve([{ id: "tid" }]));
    const values = vi.fn(() => ({ returning }));
    return { values, returning };
  };
  insertCall.mockImplementation(() => makeInsert());

  const where = vi.fn(() => ({
    returning: vi.fn(() => Promise.resolve([{ id: "tid" }])),
  }));
  const set = vi.fn(() => ({ where }));
  updateCall.mockImplementation(() => ({ set }));
});

function taskRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_UUID,
    createdById: "me-id",
    initiatorId: "me-id",
    doerId: "other",
    status: "follow_up",
    title: "T",
    description: null,
    subject: null,
    notes: null,
    priority: "imp_urgent",
    dueAt: baseDate,
    completedAt: null,
    updatedAt: baseDate,
    ...overrides,
  };
}

describe("setTaskStatus (rewritten)", () => {
  it("returns 'forbidden' when actor can't make the transition", async () => {
    queryCall.mockResolvedValueOnce(taskRow({ doerId: "other", initiatorId: "other", createdById: "other" }));
    const result = await setTaskStatus(VALID_UUID, "approved", baseDate.toISOString());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("happy path: writes a status_changed event for a valid transition", async () => {
    queryCall.mockResolvedValueOnce(taskRow({ doerId: "me-id" }));
    const result = await setTaskStatus(VALID_UUID, "done", baseDate.toISOString());
    expect(result.ok).toBe(true);
    expect(insertCall).toHaveBeenCalledTimes(1); // task_events row
    expect(updateCall).toHaveBeenCalledTimes(1);
  });

  it("returns 'stale' on optimistic-lock miss", async () => {
    queryCall.mockResolvedValueOnce(taskRow({ doerId: "me-id" }));
    const where = vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) }));
    updateCall.mockReturnValueOnce({ set: vi.fn(() => ({ where })) });
    const result = await setTaskStatus(VALID_UUID, "done", baseDate.toISOString());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("stale");
  });
});

describe("approveTask", () => {
  it("forbids the doer from self-approving", async () => {
    queryCall.mockResolvedValueOnce(
      taskRow({ doerId: "me-id", initiatorId: "other", status: "done" }),
    );
    const result = await approveTask(
      VALID_UUID,
      { decision: "approved" },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("forbids approve when status !== done", async () => {
    queryCall.mockResolvedValueOnce(
      taskRow({ initiatorId: "me-id", status: "follow_up" }),
    );
    const result = await approveTask(
      VALID_UUID,
      { decision: "approved" },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("approves on the happy path and writes one event", async () => {
    queryCall.mockResolvedValueOnce(
      taskRow({ initiatorId: "me-id", status: "done" }),
    );
    const result = await approveTask(
      VALID_UUID,
      { decision: "approved", note: "Looks great" },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(true);
    expect(insertCall).toHaveBeenCalledTimes(1);
    expect(updateCall).toHaveBeenCalledTimes(1);
  });
});

describe("reassignTask", () => {
  it("no-op when newDoerId equals current doerId", async () => {
    // Use VALID_UUID for both rows so the zod uuid check passes; the actor
    // role is computed from createdById/initiatorId (default "me-id"), not
    // doerId, so this still resolves to "initiator" with permission.
    const SAME = "22222222-2222-2222-2222-222222222222";
    queryCall.mockResolvedValueOnce(taskRow({ doerId: SAME }));
    const result = await reassignTask(
      VALID_UUID,
      { newDoerId: SAME },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(true);
    expect(updateCall).not.toHaveBeenCalled();
  });

  it("writes a reassigned event + a status_changed event when resetStatus=true", async () => {
    queryCall.mockResolvedValueOnce(
      taskRow({ doerId: "me-id", status: "follow_up" }),
    );
    const result = await reassignTask(
      VALID_UUID,
      { newDoerId: VALID_UUID, resetStatus: true },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(true);
    expect(insertCall).toHaveBeenCalledTimes(2); // reassigned + status_changed
  });

  it("writes only a reassigned event when resetStatus is omitted", async () => {
    queryCall.mockResolvedValueOnce(
      taskRow({ doerId: "me-id", status: "follow_up" }),
    );
    const result = await reassignTask(
      VALID_UUID,
      { newDoerId: VALID_UUID },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(true);
    expect(insertCall).toHaveBeenCalledTimes(1);
  });
});

describe("addComment", () => {
  it("happy path: writes a commented event, no task update", async () => {
    queryCall.mockResolvedValueOnce(taskRow({ doerId: "me-id" }));
    const result = await addComment(VALID_UUID, { body: "Quick note." });
    expect(result.ok).toBe(true);
    expect(insertCall).toHaveBeenCalledTimes(1);
    expect(updateCall).not.toHaveBeenCalled();
  });

  it("forbids the stranger", async () => {
    queryCall.mockResolvedValueOnce(
      taskRow({ doerId: "other", initiatorId: "other", createdById: "other" }),
    );
    const result = await addComment(VALID_UUID, { body: "Nope." });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("rejects an empty body via the validator", async () => {
    queryCall.mockResolvedValueOnce(taskRow({ doerId: "me-id" }));
    const result = await addComment(VALID_UUID, { body: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid");
  });
});
