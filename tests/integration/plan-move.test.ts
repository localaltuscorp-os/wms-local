import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq as sqlEq } from "drizzle-orm";

/**
 * DRAG A BRANCH TO ANOTHER PROJECT — the move, end to end, against a real
 * Postgres.
 *
 * WHY THIS IS AN INTEGRATION TEST AND NOT A UNIT ONE. The whole feature is a
 * claim about `parent_id`: that re-pointing ONE row carries its results, its
 * actions and its sub-actions with it, and that the linked WMS tasks come along
 * without being re-created. Nothing about that claim can be checked against a
 * mock — a fake would simply return whatever the implementation asked it for.
 *
 * HOW TO RUN IT. It needs a throwaway PGlite database, because it writes:
 *
 *     pnpm test:integration:setup     # builds .pglite-test once
 *     pnpm test:integration
 *
 * Skipped without `PLAN_MOVE_TEST_DIR`, so an ordinary `pnpm test` neither
 * needs a database nor touches the one the dev server is holding open.
 *
 * `test:integration` passes `--no-file-parallelism`, and that is not a tuning
 * knob: PGlite takes an EXCLUSIVE LOCK on its data directory, so two test files
 * opening the same one at once get "PGlite failed to initialize properly". One
 * database, one worker at a time.
 */

const TEST_DIR = process.env.PLAN_MOVE_TEST_DIR;
const describeIfDb = TEST_DIR ? describe : describe.skip;

const { TEST_EMPLOYEE_ID } = vi.hoisted(() => ({
  TEST_EMPLOYEE_ID: "99999999-9999-9999-9999-999999999999",
}));

/** Flip to true to make `requireUser` hand back a NON-admin for one test. */
const notAdmin = vi.hoisted(() => ({ value: false }));

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => ({
    id: TEST_EMPLOYEE_ID,
    isAdmin: !notAdmin.value,
    isActive: true,
    name: "Test User",
    email: "test@altus.test",
  })),
  getCurrentEmployee: vi.fn(async () => null),
  getDelegation: vi.fn(async () => null),
}));

// The actions call these at the end of every write; outside a request there is
// no store for them to touch.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: () => null }));

// `import "server-only"` throws outside a React server render. The modules the
// actions pull in (lib/queries/project-plan, lib/auth/…) carry it precisely so
// they can never reach a client bundle — which is not a statement about tests.
vi.mock("server-only", () => ({}));

// The move never schedules anything, but `createPlanNode` and friends share a
// module with the calendar bridge — keep it inert so a test never reaches out.
vi.mock("@/lib/google/sync", () => ({ reconcileTaskEvent: vi.fn(async () => {}) }));

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/db/schema");
let actions: typeof import("@/app/(app)/project-plan/actions");

/** Insert a plan row directly — the fixture, not the thing under test. */
async function node(
  kind: string,
  name: string,
  parentId: string | null,
  sortOrder = 10,
): Promise<string> {
  const [row] = await db
    .insert(schema.projectNodes)
    .values({
      name,
      kind: kind as "project",
      parentId,
      sortOrder,
      createdById: TEST_EMPLOYEE_ID,
    })
    .returning({ id: schema.projectNodes.id });
  return row!.id;
}

/** `eq(projectNodes.id, id)` without importing drizzle at the top of a file
 *  whose whole point is to load the app's modules lazily. */
function eqId(id: string) {
  return sqlEq(schema.projectNodes.id, id);
}

async function parentOf(id: string): Promise<string | null> {
  const row = await db.query.projectNodes.findFirst({
    where: (t, { eq }) => eq(t.id, id),
  });
  return row?.parentId ?? null;
}

describeIfDb("project plan — moving a branch between projects", () => {
  beforeAll(async () => {
    process.env.DUMMY_MODE = "true";
    process.env.DUMMY_DB_DIR = TEST_DIR!;
    // `lib/env.ts` validates these at import and `lib/db/index.ts` builds a
    // postgres-js client from DATABASE_URL unconditionally — even in DUMMY_MODE,
    // where nothing ever connects through it. Placeholders satisfy the schema
    // without pointing anywhere real; PGlite is what actually answers.
    process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key-placeholder-0000";
    const dbMod = await import("@/lib/db");
    db = dbMod.db;
    schema = await import("@/db/schema");
    actions = await import("@/app/(app)/project-plan/actions");

    await db
      .insert(schema.employees)
      .values({
        id: TEST_EMPLOYEE_ID,
        name: "Test User",
        email: "test@altus.test",
        role: "both",
      })
      .onConflictDoNothing();
    // PGlite boots PostgreSQL from a WASM blob; the default 10s hook timeout is
    // not enough on a cold directory.
  }, 120_000);

  beforeEach(async () => {
    // Every test builds its own two projects; clearing the whole table between
    // them keeps the sibling ordinals predictable. Tasks first — they reference
    // the nodes.
    await db.delete(schema.tasks);
    await db.delete(schema.projectNodes);
  });

  afterAll(async () => {
    await db.delete(schema.tasks);
    await db.delete(schema.projectNodes);
  });

  it("moves a milestone to another project and takes its whole branch", async () => {
    const from = await node("project", "Alpha", null, 10);
    const to = await node("project", "Beta", null, 20);
    const milestone = await node("milestone", "Discovery", from);
    const result = await node("result", "Vendor onboarding", milestone);
    const action = await node("action", "Shortlist vendors", result);
    const sub = await node("sub_action", "Draft the RFP", action);

    const res = await actions.reparentPlanNode({ id: milestone, targetId: to });
    expect(res.ok).toBe(true);

    // ONE row was re-pointed…
    expect(await parentOf(milestone)).toBe(to);
    // …and the branch beneath it is intact and now under Beta.
    expect(await parentOf(result)).toBe(milestone);
    expect(await parentOf(action)).toBe(result);
    expect(await parentOf(sub)).toBe(action);

    if (res.ok) expect(res.moved).toBe(4); // the milestone + 3 beneath it
  });

  it("creates the placeholder levels a drop needs, and says so first", async () => {
    const from = await node("project", "Alpha", null, 10);
    const to = await node("project", "Beta", null, 20);
    const milestone = await node("milestone", "Discovery", from);
    const result = await node("result", "Vendor onboarding", milestone);
    await node("action", "Shortlist vendors", result);

    // A Result cannot hang off a Project — it needs a Milestone in between.
    const impact = await actions.planMoveImpact({ id: result, targetId: to });
    expect(impact.ok).toBe(true);
    if (!impact.ok) return;

    expect(impact.plan.sameProject).toBe(false);
    expect(impact.plan.toProjectName).toBe("Beta");
    expect(impact.plan.creates).toEqual([
      { kind: "milestone", name: "Unclassified Milestone" },
    ]);
    expect(impact.plan.carries).toEqual([{ kind: "action", count: 1 }]);

    // Nothing was written by the preview.
    expect(await parentOf(result)).toBe(milestone);

    const res = await actions.reparentPlanNode({ id: result, targetId: to });
    expect(res.ok).toBe(true);

    const newParent = await parentOf(result);
    expect(newParent).not.toBe(milestone);
    const placeholder = await db.query.projectNodes.findFirst({
      where: (t, { eq }) => eq(t.id, newParent!),
    });
    expect(placeholder?.kind).toBe("milestone");
    expect(placeholder?.name).toBe("Unclassified Milestone");
    expect(placeholder?.parentId).toBe(to);
  });

  it("reuses an existing placeholder rather than making a second one", async () => {
    const from = await node("project", "Alpha", null, 10);
    const to = await node("project", "Beta", null, 20);
    const existing = await node("milestone", "Unclassified Milestone", to);
    const milestone = await node("milestone", "Discovery", from);
    const a = await node("result", "First", milestone);
    const b = await node("result", "Second", milestone);

    const impact = await actions.planMoveImpact({ id: a, targetId: to });
    expect(impact.ok && impact.plan.creates).toEqual([]);

    await actions.reparentPlanNode({ id: a, targetId: to });
    await actions.reparentPlanNode({ id: b, targetId: to });

    expect(await parentOf(a)).toBe(existing);
    expect(await parentOf(b)).toBe(existing);

    const milestones = await db.query.projectNodes.findMany({
      where: (t, { and, eq }) => and(eq(t.parentId, to), eq(t.kind, "milestone")),
    });
    expect(milestones).toHaveLength(1);
  });

  it("reads a drop on a same-level row as 'put it where that row is'", async () => {
    const from = await node("project", "Alpha", null, 10);
    const to = await node("project", "Beta", null, 20);
    const mFrom = await node("milestone", "Discovery", from);
    const mTo = await node("milestone", "Delivery", to);
    const moving = await node("result", "Vendor onboarding", mFrom);
    const sibling = await node("result", "Contracting", mTo);

    // Dropped on ANOTHER RESULT — the parent is that result's milestone.
    const res = await actions.reparentPlanNode({ id: moving, targetId: sibling });
    expect(res.ok).toBe(true);
    expect(await parentOf(moving)).toBe(mTo);
  });

  it("carries the linked WMS task with the branch and re-stamps its client", async () => {
    const from = await node("project", "Alpha", null, 10);
    const to = await node("project", "Beta", null, 20);
    // The client lives on the PROJECT and every task under it inherits it, so a
    // cross-project move has to re-stamp the whole branch.
    await db
      .update(schema.projectNodes)
      .set({ clientName: "Alpha Client" })
      .where(eqId(from));
    await db
      .update(schema.projectNodes)
      .set({ clientName: "Beta Client" })
      .where(eqId(to));

    const milestone = await node("milestone", "Discovery", from);
    const result = await node("result", "Vendor onboarding", milestone);
    const action = await node("action", "Shortlist vendors", result);

    const [task] = await db
      .insert(schema.tasks)
      .values({
        title: "Shortlist vendors",
        doerId: TEST_EMPLOYEE_ID,
        initiatorId: TEST_EMPLOYEE_ID,
        createdById: TEST_EMPLOYEE_ID,
        dueAt: new Date("2026-10-01T09:00:00Z"),
        projectNodeId: action,
        client: "Alpha Client",
      })
      .returning({ id: schema.tasks.id });

    const res = await actions.reparentPlanNode({ id: milestone, targetId: to });
    expect(res.ok).toBe(true);

    const after = await db.query.tasks.findFirst({
      where: (t, { eq }) => eq(t.id, task!.id),
    });
    // The SAME task row — not a re-created one.
    expect(after?.id).toBe(task!.id);
    expect(after?.projectNodeId).toBe(action);
    expect(after?.client).toBe("Beta Client");
    // Untouched otherwise.
    expect(after?.doerId).toBe(TEST_EMPLOYEE_ID);
    expect(after?.dueAt?.toISOString()).toBe("2026-10-01T09:00:00.000Z");
  });

  it("refuses a move into the branch's own subtree", async () => {
    const p = await node("project", "Alpha", null, 10);
    const milestone = await node("milestone", "Discovery", p);
    const result = await node("result", "Vendor onboarding", milestone);

    const res = await actions.reparentPlanNode({ id: milestone, targetId: result });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/underneath it/i);
    // Untouched.
    expect(await parentOf(milestone)).toBe(p);
  });

  it("refuses to move a project, which has nothing above it", async () => {
    const a = await node("project", "Alpha", null, 10);
    const b = await node("project", "Beta", null, 20);
    const res = await actions.reparentPlanNode({ id: a, targetId: b });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/project has nothing above it/i);
    expect(await parentOf(a)).toBeNull();
  });

  it("refuses a drop that would not move the row at all", async () => {
    const p = await node("project", "Alpha", null, 10);
    const milestone = await node("milestone", "Discovery", p);
    const res = await actions.reparentPlanNode({ id: milestone, targetId: p });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already there/i);
  });
});


describeIfDb("archive vs delete " + "—" + " the register's two red buttons", () => {
  /**
   * The Project Plan register used to have ONE button, labelled Delete, that
   * ARCHIVED. It now has the pair the hierarchy board always had, and the whole
   * risk of that change is that the red button on the right genuinely destroys
   * things now. These two tests are the safety net for exactly that.
   */

  beforeEach(async () => {
    await db.delete(schema.tasks);
    await db.delete(schema.projectNodes);
  });

  it("ARCHIVE takes the branch off the board and keeps every row", async () => {
    const project = await node("project", "Alpha", null, 10);
    const milestone = await node("milestone", "Discovery", project);
    const result = await node("result", "Vendor onboarding", milestone);

    const res = await actions.deletePlanNode(milestone);
    expect(res.ok).toBe(true);

    // Off the board...
    const m = await db.query.projectNodes.findFirst({
      where: (t, { eq }) => eq(t.id, milestone),
    });
    expect(m?.isArchived).toBe(true);
    // ...but still THERE, and so is everything under it. That is what makes it
    // restorable, and it is the difference the two buttons are named for.
    const r = await db.query.projectNodes.findFirst({
      where: (t, { eq }) => eq(t.id, result),
    });
    expect(r).toBeTruthy();
    expect(r?.isArchived).toBe(true);
  });

  it("DELETE removes the branch outright, rows and linked tasks together", async () => {
    const project = await node("project", "Alpha", null, 10);
    const milestone = await node("milestone", "Discovery", project);
    const result = await node("result", "Vendor onboarding", milestone);
    const action = await node("action", "Shortlist vendors", result);

    const [task] = await db
      .insert(schema.tasks)
      .values({
        title: "Shortlist vendors",
        doerId: TEST_EMPLOYEE_ID,
        initiatorId: TEST_EMPLOYEE_ID,
        createdById: TEST_EMPLOYEE_ID,
        dueAt: new Date("2026-10-01T09:00:00Z"),
        projectNodeId: action,
      })
      .returning({ id: schema.tasks.id });

    const res = await actions.purgePlanNode(milestone);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.nodes).toBe(3); // milestone + result + action
      expect(res.tasks).toBe(1);
    }

    // GONE, not archived.
    for (const id of [milestone, result, action]) {
      expect(
        await db.query.projectNodes.findFirst({ where: (t, { eq }) => eq(t.id, id) }),
      ).toBeUndefined();
    }
    expect(
      await db.query.tasks.findFirst({ where: (t, { eq }) => eq(t.id, task!.id) }),
    ).toBeUndefined();

    // The PROJECT above it is untouched: a purge takes the branch, not the tree.
    expect(
      await db.query.projectNodes.findFirst({ where: (t, { eq }) => eq(t.id, project) }),
    ).toBeTruthy();
  });

  it("refuses the permanent delete for anyone who is not an administrator", async () => {
    // The register hides the button for them (`showDelete={me.isAdmin}`), but
    // hiding a control is a courtesy — this is the control.
    const project = await node("project", "Alpha", null, 10);
    const milestone = await node("milestone", "Discovery", project);

    notAdmin.value = true;
    try {
      const res = await actions.purgePlanNode(milestone);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/administrator/i);
    } finally {
      notAdmin.value = false;
    }

    expect(
      await db.query.projectNodes.findFirst({ where: (t, { eq }) => eq(t.id, milestone) }),
    ).toBeTruthy();
  });
});
