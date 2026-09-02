import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Skip the entire suite unless a test DB is configured.
const TEST_DB = process.env.DATABASE_URL_TEST;
const describeIfDb = TEST_DB ? describe : describe.skip;

// Hoisted so vi.mock's factory (which runs at parse time) can reference them.
const { ME_ID, OTHER_ID } = vi.hoisted(() => ({
  ME_ID: "99999999-9999-9999-9999-999999999999",
  OTHER_ID: "88888888-8888-8888-8888-888888888888",
}));

// vi.mock must live at top-level — Vitest hoists it before imports.
vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({
    id: ME_ID,
    isAdmin: false,
    isActive: true,
    name: "Me",
    email: "me@vp.com",
  })),
}));

// Lazy-load so that import-time env validation doesn't kick in unless we
// actually intend to run the suite.
let db: typeof import("@/lib/db").db;
let schema: typeof import("@/db/schema");
let createTask: typeof import("@/app/(app)/tasks/actions").createTask;
let setTaskStatus: typeof import("@/app/(app)/tasks/actions").setTaskStatus;
let approveTask: typeof import("@/app/(app)/tasks/actions").approveTask;
let reassignTask: typeof import("@/app/(app)/tasks/actions").reassignTask;
let addComment: typeof import("@/app/(app)/tasks/actions").addComment;

describeIfDb("workflow integration", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    db = (await import("@/lib/db")).db;
    schema = await import("@/db/schema");
    const actions = await import("@/app/(app)/tasks/actions");
    ({
      createTask,
      setTaskStatus,
      approveTask,
      reassignTask,
      addComment,
    } = actions);

    await db
      .insert(schema.employees)
      .values([
        { id: ME_ID, name: "Me", email: "me@vp.com", role: "both" },
        { id: OTHER_ID, name: "Other", email: "other@vp.com", role: "both" },
      ])
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(schema.taskEvents);
    await db.delete(schema.tasks);
  });

  afterAll(async () => {
    await db.delete(schema.taskEvents);
    await db.delete(schema.tasks);
  });

  async function makeTask(initiatorId = ME_ID, doerId = OTHER_ID) {
    const r = await createTask({
      title: "Workflow test",
      doerId,
      initiatorId,
      priority: "imp_urgent",
      dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    if (!r.ok) throw new Error("create failed");
    return r.id;
  }

  async function currentUpdatedAt(_taskId: string): Promise<string> {
    const [row] = await db.select().from(schema.tasks);
    if (!row) throw new Error("no task");
    return row.updatedAt.toISOString();
  }

  it("doer pending → done, then initiator approves; writes correct events", async () => {
    const current = await import("@/lib/auth/current");

    const taskId = await makeTask(/* initiator */ ME_ID, /* doer */ OTHER_ID);

    // Switch identity to the doer for the pending → done move.
    vi.mocked(current.requireUser).mockResolvedValueOnce({
      id: OTHER_ID,
      isAdmin: false,
      isActive: true,
      name: "Other",
      email: "other@vp.com",
    } as never);
    const moveResult = await setTaskStatus(taskId, "done", await currentUpdatedAt(taskId));
    expect(moveResult.ok).toBe(true);

    // Switch back to the initiator for approve.
    const approveResult = await approveTask(
      taskId,
      { decision: "approved", note: "Looks good" },
      await currentUpdatedAt(taskId),
    );
    expect(approveResult.ok).toBe(true);

    const [task] = await db.select().from(schema.tasks);
    expect(task!.status).toBe("approved");
    expect(task!.approvedById).toBe(ME_ID);
    expect(task!.approvedAt).not.toBeNull();

    const events = await db.select().from(schema.taskEvents);
    // created + status_changed (→done) + status_changed (→approved) = 3
    expect(events).toHaveLength(3);
    expect(events.filter((e) => e.eventType === "status_changed")).toHaveLength(2);
  });

  it("reassign with resetStatus writes a reassigned + status_changed event", async () => {
    const taskId = await makeTask(ME_ID, OTHER_ID);
    const upd = await currentUpdatedAt(taskId);

    // First move the task to follow_up so reset is observable.
    const current = await import("@/lib/auth/current");
    vi.mocked(current.requireUser).mockResolvedValueOnce({
      id: OTHER_ID,
      isAdmin: false,
      isActive: true,
      name: "Other",
      email: "other@vp.com",
    } as never);
    await setTaskStatus(taskId, "follow_up", upd);

    const result = await reassignTask(
      taskId,
      { newDoerId: ME_ID, resetStatus: true },
      await currentUpdatedAt(taskId),
    );
    expect(result.ok).toBe(true);

    const events = await db.select().from(schema.taskEvents);
    // created + status_changed(→follow_up) + reassigned + status_changed(→dont_know)
    expect(events.filter((e) => e.eventType === "reassigned")).toHaveLength(1);
    expect(events.filter((e) => e.eventType === "status_changed")).toHaveLength(2);
  });

  it("addComment writes a commented event without touching the task row", async () => {
    const taskId = await makeTask(ME_ID, OTHER_ID);
    const before = await db.select().from(schema.tasks);
    const result = await addComment(taskId, { body: "Quick note." });
    expect(result.ok).toBe(true);
    const after = await db.select().from(schema.tasks);
    expect(after[0]!.updatedAt.getTime()).toBe(before[0]!.updatedAt.getTime());
    const events = await db.select().from(schema.taskEvents);
    expect(events.find((e) => e.eventType === "commented")).toBeDefined();
  });
});
