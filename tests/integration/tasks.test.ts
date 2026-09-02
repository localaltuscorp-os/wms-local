import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Skip the entire suite unless a test DB is configured.
const TEST_DB = process.env.DATABASE_URL_TEST;
const describeIfDb = TEST_DB ? describe : describe.skip;

// Hoisted so vi.mock's factory (which runs at parse time) can reference it.
const { TEST_EMPLOYEE_ID } = vi.hoisted(() => ({
  TEST_EMPLOYEE_ID: "99999999-9999-9999-9999-999999999999",
}));

// vi.mock must live at top-level — Vitest hoists it before imports.
vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({
    id: TEST_EMPLOYEE_ID,
    isAdmin: false,
    isActive: true,
    name: "Test User",
    email: "test@vp.com",
  })),
}));

// Lazy-load so that import-time env validation doesn't kick in unless we
// actually intend to run the suite.
let db: typeof import("@/lib/db").db;
let schema: typeof import("@/db/schema");
let createTask: typeof import("@/app/(app)/tasks/actions").createTask;
let editTaskFields: typeof import("@/app/(app)/tasks/actions").editTaskFields;

describeIfDb("tasks integration", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB!;
    const dbMod = await import("@/lib/db");
    db = dbMod.db;
    schema = await import("@/db/schema");
    const actions = await import("@/app/(app)/tasks/actions");
    createTask = actions.createTask;
    editTaskFields = actions.editTaskFields;

    // Seed the test employee row.
    await db
      .insert(schema.employees)
      .values({
        id: TEST_EMPLOYEE_ID,
        name: "Test User",
        email: "test@vp.com",
        role: "both",
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    // Clean tasks + events between tests.
    await db.delete(schema.taskEvents);
    await db.delete(schema.tasks);
  });

  afterAll(async () => {
    // Best-effort cleanup; safe to omit if rollback strategy lands later.
    await db.delete(schema.taskEvents);
    await db.delete(schema.tasks);
  });

  it("createTask inserts the task + a 'created' event", async () => {
    const result = await createTask({
      title: "Integration test task",
      doerId: TEST_EMPLOYEE_ID,
      initiatorId: TEST_EMPLOYEE_ID,
      priority: "imp_urgent",
      dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await db.select().from(schema.tasks);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Integration test task");
    expect(rows[0]!.createdById).toBe(TEST_EMPLOYEE_ID);

    const events = await db.select().from(schema.taskEvents);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("created");
  });

  it("editTaskFields updates the row + writes one event per changed field", async () => {
    const created = await createTask({
      title: "Original",
      doerId: TEST_EMPLOYEE_ID,
      initiatorId: TEST_EMPLOYEE_ID,
      priority: "imp_urgent",
      dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [before] = await db.select().from(schema.tasks);
    const expectedUpdatedAt = before!.updatedAt.toISOString();

    const result = await editTaskFields(
      created.id,
      { title: "Renamed", notes: "Added a note." },
      expectedUpdatedAt,
    );
    expect(result.ok).toBe(true);

    const [after] = await db.select().from(schema.tasks);
    expect(after!.title).toBe("Renamed");
    expect(after!.notes).toBe("Added a note.");
    // updated_at moved forward
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());

    const events = await db.select().from(schema.taskEvents);
    // 1 "created" + 2 "field_updated" rows
    expect(events).toHaveLength(3);
    expect(events.filter((e) => e.eventType === "field_updated")).toHaveLength(2);
  });

  it("editTaskFields returns 'stale' when expectedUpdatedAt doesn't match", async () => {
    const created = await createTask({
      title: "Original",
      doerId: TEST_EMPLOYEE_ID,
      initiatorId: TEST_EMPLOYEE_ID,
      priority: "imp_urgent",
      dueAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    if (!created.ok) return;

    const result = await editTaskFields(
      created.id,
      { title: "Renamed" },
      new Date(0).toISOString(), // wrong timestamp
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("stale");
  });
});
