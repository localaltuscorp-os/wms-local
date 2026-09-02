import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock revalidatePath + updateTag before importing the actions (top-level
// mocks run before imports). `updateTag` is the Next 16 server-action-
// scoped tag invalidator used by `revalidateTaskRoutes`.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Tier-3 — actions.ts now imports getStatusDisplayMap (server-only).
// Stub both so vitest can load the file.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/status-display", () => ({
  getStatusDisplayMap: vi.fn(async () => ({})),
}));

// M2.1 added requireUser import to actions.ts which transitively loads
// "server-only" — stub it so this old M1.7 test still loads.
vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({
    id: "me-id",
    isAdmin: false,
    isActive: true,
    name: "Me",
    email: "me@vp.com",
  })),
  getCurrentEmployee: vi.fn(async () => null),
  requireAdmin: vi.fn(),
}));

// M2.3 — actions now fan out via the notifications dispatcher (server-only).
// Stub it so the tests don't trip the server-only guard.
vi.mock("@/lib/notifications/dispatch", () => ({
  notify: vi.fn(async () => undefined),
  notifyManyForTask: vi.fn(async () => undefined),
  dedupeRecipients: vi.fn(() => [] as string[]),
}));

// Use vi.hoisted so the shared mocks are available inside the vi.mock factory
// (which is hoisted).  We track:
// - updateCall: the underlying db.update fn
// - insertCall: the underlying db.insert fn (audit-row writes)
// - queryCall:  the underlying db.query.tasks.findFirst fn
const { updateCall, insertCall, queryCall } = vi.hoisted(() => ({
  updateCall: vi.fn(),
  insertCall: vi.fn(),
  queryCall: vi.fn(),
}));

// Mock the db layer.  These actions now use db.transaction(async (tx) => ...);
// the tx handle exposes the same .update / .insert / .query surface as db.
vi.mock("@/lib/db", () => {
  const makeUpdate = () => {
    const returning = vi.fn(() => Promise.resolve([{ id: "tid" }]));
    const where = vi.fn(() => ({ returning, then: undefined }));
    // Some actions (M1.7 era) call .where() and await directly without
    // .returning().  We make where() awaitable-compatible by returning an
    // object whose then() resolves to undefined.
    const whereAwaitable = Object.assign(where, {});
    const set = vi.fn(() => ({ where: whereAwaitable, returning }));
    return { set };
  };
  updateCall.mockImplementation(() => makeUpdate());

  const makeInsert = () => {
    const values = vi.fn(() => Promise.resolve([{ id: "evt" }]));
    return { values };
  };
  insertCall.mockImplementation(() => makeInsert());

  // The linter added `tx.select(...).from(...).where(...).limit(1)` calls
  // inside `setTaskPriority` / `reassignDoer` (optimistic-lock readback).
  // The chain just needs to resolve to a plausible single-row result — the
  // tests assert on the audit-event writes, not the readback value.
  // Chain shape: select(...).from(...).where(...).limit(1) OR .for('update').
  // The select-readback is what the linter-refactored setTaskPriority /
  // reassignDoer read for the optimistic-lock check, so it needs to return
  // the same "current task" the test seeded via `queryCall.mockResolvedValueOnce`.
  // Calling queryCall.getMockImplementation()() resolves to that test fixture
  // (or a default), so the existing scenario harness keeps working unchanged.
  const readCurrent = async (): Promise<unknown[]> => {
    const impl = queryCall.getMockImplementation?.();
    const row = impl ? await impl() : await queryCall();
    return row ? [row] : [];
  };
  const txSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(readCurrent),
        for: vi.fn(() => ({
          limit: vi.fn(readCurrent),
          then: (cb: (v: unknown) => unknown) => readCurrent().then(cb),
        })),
        then: (cb: (v: unknown) => unknown) => readCurrent().then(cb),
      })),
    })),
  }));

  const tx = {
    update: updateCall,
    insert: insertCall,
    select: txSelect,
    query: { tasks: { findFirst: queryCall } },
  };

  return {
    db: {
      update: updateCall,
      insert: insertCall,
      select: txSelect,
      query: { tasks: { findFirst: queryCall } },
      transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    tasks: { id: "tasks.id", priority: "tasks.priority", doerId: "tasks.doerId" },
    taskEvents: { id: "task_events.id" },
    employees: {},
  };
});

import {
  archiveTask,
  unarchiveTask,
  setTaskStatus,
  setTaskPriority,
  reassignDoer,
} from "@/app/(app)/tasks/actions";
import { requireUser } from "@/lib/auth/current";

const VALID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const INVALID = "not-a-uuid";
// Archive/restore are admin-only; the default mock actor is a non-admin.
const ADMIN_USER = {
  id: "me-id",
  isAdmin: true,
  isActive: true,
  name: "Me",
  email: "me@vp.com",
} as Awaited<ReturnType<typeof requireUser>>;

beforeEach(() => {
  updateCall.mockClear();
  insertCall.mockClear();
  queryCall.mockReset();
});

describe("task actions", () => {
  it("archiveTask runs an update + emits an `archived` audit event", async () => {
    // Archive/restore are admin-only — give this call an admin actor.
    vi.mocked(requireUser).mockResolvedValueOnce(ADMIN_USER);
    await archiveTask(VALID);
    expect(updateCall).toHaveBeenCalledTimes(1);
    expect(insertCall).toHaveBeenCalledTimes(1);
    // Inspect the values() argument on the insert call to confirm the event type.
    const insertReturn = insertCall.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertReturn.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "archived" }),
    );
  });

  it("archiveTask silently ignores invalid uuids", async () => {
    await archiveTask(INVALID);
    expect(updateCall).not.toHaveBeenCalled();
    expect(insertCall).not.toHaveBeenCalled();
  });

  it("unarchiveTask emits a `restored` audit event", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(ADMIN_USER);
    await unarchiveTask(VALID);
    expect(updateCall).toHaveBeenCalledTimes(1);
    expect(insertCall).toHaveBeenCalledTimes(1);
    const insertReturn = insertCall.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertReturn.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "restored" }),
    );
  });

  it.skip("setTaskStatus accepts each known status", async () => {
    // M2.2 rewrote setTaskStatus to require expectedUpdatedAt + db.query.tasks
    // lookups + permission checks; the dedicated suite in
    // task-actions-workflow.test.ts covers the new behavior.
    await setTaskStatus(VALID, "done", new Date().toISOString());
    await setTaskStatus(VALID, "approved", new Date().toISOString());
    expect(updateCall).toHaveBeenCalledTimes(2);
  });

  it("setTaskPriority emits a `priority_changed` event when priority changes", async () => {
    queryCall.mockResolvedValueOnce({ id: VALID, priority: "not_imp_not_urgent" });
    await setTaskPriority(VALID, "imp_urgent");
    expect(updateCall).toHaveBeenCalledTimes(1);
    expect(insertCall).toHaveBeenCalledTimes(1);
    const insertReturn = insertCall.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertReturn.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "priority_changed",
        fromValue: { priority: "not_imp_not_urgent" },
        toValue: { priority: "imp_urgent" },
      }),
    );
  });

  it("setTaskPriority is a no-op (no update, no event) when priority is unchanged", async () => {
    queryCall.mockResolvedValueOnce({ id: VALID, priority: "imp_urgent" });
    await setTaskPriority(VALID, "imp_urgent");
    expect(updateCall).not.toHaveBeenCalled();
    expect(insertCall).not.toHaveBeenCalled();
  });

  it("reassignDoer emits a `reassigned` event when the doer changes", async () => {
    queryCall.mockResolvedValueOnce({ id: VALID, doerId: "old-doer" });
    await reassignDoer(VALID, OTHER);
    expect(updateCall).toHaveBeenCalledTimes(1);
    expect(insertCall).toHaveBeenCalledTimes(1);
    const insertReturn = insertCall.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertReturn.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "reassigned",
        fromValue: { doerId: "old-doer" },
        toValue: { doerId: OTHER },
      }),
    );
  });

  it("reassignDoer is a no-op when the doer id matches the current doer", async () => {
    queryCall.mockResolvedValueOnce({ id: VALID, doerId: OTHER });
    await reassignDoer(VALID, OTHER);
    expect(updateCall).not.toHaveBeenCalled();
    expect(insertCall).not.toHaveBeenCalled();
  });

  it("reassignDoer requires both ids to be uuids", async () => {
    await reassignDoer(VALID, INVALID);
    expect(updateCall).not.toHaveBeenCalled();
    expect(insertCall).not.toHaveBeenCalled();
  });
});
