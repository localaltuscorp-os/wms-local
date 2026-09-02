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

const { insertCall, queryCall, updateCall, valuesCalls } = vi.hoisted(() => ({
  insertCall: vi.fn(),
  queryCall: vi.fn(),
  updateCall: vi.fn(),
  valuesCalls: [] as unknown[],
}));

vi.mock("@/lib/db", () => {
  // Each call returns a values+returning chain.
  const make = () => {
    const returning = vi.fn(() => Promise.resolve([{ id: "new-task-id" }]));
    const values = vi.fn((v: unknown) => {
      valuesCalls.push(v);
      return { returning };
    });
    return { values, returning };
  };

  insertCall.mockImplementation(() => make());

  const where = vi.fn(() => ({
    returning: vi.fn(() => Promise.resolve([{ id: "tid" }])),
  }));
  const set = vi.fn(() => ({ where }));
  updateCall.mockImplementation(() => ({ set }));

  // `db.transaction(cb)` invokes the callback with a tx object that has
  // the same select/insert/update surface as `db`. Tests don't care about
  // isolation; the callback runs against the same mock object.
  const txDb = {
    insert: insertCall,
    update: updateCall,
    query: { tasks: { findFirst: queryCall } },
  };
  return {
    db: {
      insert: insertCall,
      update: updateCall,
      query: {
        tasks: {
          findFirst: queryCall,
        },
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

import { createTask, editTaskFields } from "@/app/(app)/tasks/actions";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  insertCall.mockClear();
  queryCall.mockClear();
  updateCall.mockClear();
  valuesCalls.length = 0;
});

describe("createTask", () => {
  it("rejects an invalid payload", async () => {
    const result = await createTask({
      title: "",
      doerId: VALID_UUID,
      initiatorId: VALID_UUID,
      priority: "imp_urgent",
      dueAt: "2026-06-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
  });

  it("inserts task and writes a 'created' event for a valid payload", async () => {
    const result = await createTask({
      title: "Verify KYC",
      doerId: VALID_UUID,
      initiatorId: VALID_UUID,
      priority: "imp_urgent",
      dueAt: "2026-06-01T00:00:00.000Z",
    });
    // Tier-3 (2026-05-20) — createTask now also returns `ids: string[]`
    // for the multi-doer fanout path. Single-doer callers see id === ids[0].
    expect(result).toEqual({
      ok: true,
      id: "new-task-id",
      ids: ["new-task-id"],
    });
    // First insert: tasks; second insert: task_events.
    expect(insertCall).toHaveBeenCalledTimes(2);
  });

  it("populates short_id derived from the task UUID", async () => {
    const result = await createTask({
      title: "Test task",
      doerId: VALID_UUID,
      initiatorId: VALID_UUID,
      priority: "imp_urgent",
      dueAt: "2026-06-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    // First values() call is the tasks insert.
    const taskInsert = valuesCalls[0] as { id: string; shortId: string };
    expect(taskInsert.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(taskInsert.shortId).toMatch(/^[0-9a-f]{10}$/);
    expect(taskInsert.shortId).toBe(taskInsert.id.replace(/-/g, "").slice(0, 10));
  });
});

describe("editTaskFields", () => {
  it("rejects invalid task id", async () => {
    const result = await editTaskFields(
      "not-uuid",
      { title: "x" },
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid");
  });

  it("returns 'not-found' when task is missing", async () => {
    queryCall.mockResolvedValueOnce(undefined);
    const result = await editTaskFields(
      VALID_UUID,
      { title: "x" },
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not-found");
  });

  it("returns 'forbidden' when caller isn't creator/initiator/admin", async () => {
    queryCall.mockResolvedValueOnce({
      id: VALID_UUID,
      createdById: "other",
      initiatorId: "other",
      doerId: "other",
      status: "not_started",
      title: "Old",
      description: null,
      subject: null,
      priority: "imp_urgent",
      dueAt: new Date(),
      notes: null,
      updatedAt: new Date(),
    });
    const result = await editTaskFields(
      VALID_UUID,
      { title: "New" },
      new Date().toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("returns 'stale' when optimistic lock fails (update returns 0 rows)", async () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z");
    queryCall.mockResolvedValueOnce({
      id: VALID_UUID,
      createdById: "me-id",
      initiatorId: "me-id",
      doerId: "other",
      status: "not_started",
      title: "Old",
      description: null,
      subject: null,
      priority: "imp_urgent",
      dueAt: baseDate,
      notes: null,
      updatedAt: baseDate,
    });
    // Override the update chain to return zero rows.
    const where = vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) }));
    const set = vi.fn(() => ({ where }));
    updateCall.mockReturnValueOnce({ set });

    const result = await editTaskFields(
      VALID_UUID,
      { title: "New" },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("stale");
  });

  it("returns 'ok: true' on a no-op diff (no DB writes beyond the lookup)", async () => {
    const baseDate = new Date("2026-01-01T00:00:00.000Z");
    queryCall.mockResolvedValueOnce({
      id: VALID_UUID,
      createdById: "me-id",
      initiatorId: "me-id",
      doerId: "other",
      status: "not_started",
      title: "Same title",
      description: null,
      subject: null,
      priority: "imp_urgent",
      dueAt: baseDate,
      notes: null,
      updatedAt: baseDate,
    });

    const result = await editTaskFields(
      VALID_UUID,
      { title: "Same title" },
      baseDate.toISOString(),
    );
    expect(result.ok).toBe(true);
    expect(updateCall).not.toHaveBeenCalled();
  });
});
