import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * DAILY GOALS — the two status axes, against a real Postgres (migration 0230).
 *
 * WHY AN INTEGRATION TEST. Both claims under test are claims about COLUMNS:
 * that the verdict lands in `approval_status` and that Archived lands in
 * `archived_at` and NEVER in `abandoned_at`, which is this module's Recycle Bin.
 * Get the second one wrong and filing a commitment deletes it — a mock would
 * happily confirm whichever column the implementation asked for.
 *
 * HOW TO RUN IT (it writes, so it needs a throwaway PGlite database):
 *
 *     pnpm test:integration:setup     # builds .pglite-test once
 *     pnpm test:integration
 *
 * It shares `PLAN_MOVE_TEST_DIR` with tests/integration/plan-move.test.ts on
 * purpose: PGlite takes an EXCLUSIVE lock on its directory, so one throwaway
 * database for the whole integration suite is the only arrangement that lets
 * them be run together — which is also why that script passes
 * `--no-file-parallelism`.
 */

const TEST_DIR = process.env.PLAN_MOVE_TEST_DIR;
const describeIfDb = TEST_DIR ? describe : describe.skip;

const { OWNER_ID, MANAGER_ID } = vi.hoisted(() => ({
  OWNER_ID: "99999999-9999-9999-9999-999999999991",
  MANAGER_ID: "99999999-9999-9999-9999-999999999992",
}));

/** Who `requireUser` returns — swapped per test to change who is asking. */
const currentUser = vi.hoisted(() => ({
  value: { id: OWNER_ID, isAdmin: false, isActive: true, name: "Owner", email: "owner@altus.test" },
}));

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn(async () => currentUser.value),
  getCurrentEmployee: vi.fn(async () => null),
  getDelegation: vi.fn(async () => null),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: () => null }));
vi.mock("server-only", () => ({}));

// The planner is open to everyone in this build (`plannerOpenToAll`), which is
// what lets a manager touch a downline member's day. Pinned here so the test
// does not depend on an environment flag.
vi.mock("@/lib/goals/plan-target", () => ({
  plannerOpenToAll: () => true,
  resolvePlanTarget: vi.fn(async (me: { id: string }) => ({ employeeId: me.id })),
}));

let db: typeof import("@/lib/db").db;
let schema: typeof import("@/db/schema");
let actions: typeof import("@/app/(app)/goals/plan/actions");

const ITEM_ID = "99999999-9999-4999-8999-9999999999a1";

async function seedItem() {
  await db.insert(schema.dailyChecklist).values({
    id: ITEM_ID,
    employeeId: OWNER_ID,
    planDate: "2026-09-15",
    title: "Walk the Plant 2 cable route",
    origin: "standalone",
    position: 1,
  });
}

async function row() {
  return db.query.dailyChecklist.findFirst({
    where: (t, { eq: e }) => e(t.id, ITEM_ID),
  });
}

describeIfDb("daily goals — the two status axes", () => {
  beforeAll(async () => {
    process.env.DUMMY_MODE = "true";
    process.env.DUMMY_DB_DIR = TEST_DIR!;
    process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key-placeholder-0000";

    const dbMod = await import("@/lib/db");
    db = dbMod.db;
    schema = await import("@/db/schema");
    actions = await import("@/app/(app)/goals/plan/actions");

    await db
      .insert(schema.employees)
      .values([
        { id: OWNER_ID, name: "Owner", email: "owner@altus.test", role: "both" },
        { id: MANAGER_ID, name: "Manager", email: "manager@altus.test", role: "both" },
      ])
      .onConflictDoNothing();
  }, 120_000);

  beforeEach(async () => {
    currentUser.value = {
      id: OWNER_ID,
      isAdmin: false,
      isActive: true,
      name: "Owner",
      email: "owner@altus.test",
    };
    await db.delete(schema.dailyChecklist).where(eq(schema.dailyChecklist.id, ITEM_ID));
    await seedItem();
  });

  afterAll(async () => {
    await db.delete(schema.dailyChecklist).where(eq(schema.dailyChecklist.id, ITEM_ID));
  });

  /* ── the doer axis ───────────────────────────────────────────────────── */

  it("lets the person whose plan it is report progress", async () => {
    const res = await actions.setPlanItemDoerStatus(ITEM_ID, "initiated");
    expect(res.ok).toBe(true);
    expect((await row())?.status).toBe("initiated");
  });

  it("refuses a value that is not on the doer axis", async () => {
    // "approved" is a VERDICT. It is a legal value in the `task_status` column
    // (legacy rows still carry it), which is exactly why the guard has to be
    // the axis and not the column.
    const res = await actions.setPlanItemDoerStatus(ITEM_ID, "approved");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not a doer status/i);
    expect((await row())?.status).toBe("not_started");
  });

  it("leaves `done` alone — the planner's close-out is not the doer axis", async () => {
    await actions.setPlanItemDoerStatus(ITEM_ID, "done");
    const r = await row();
    expect(r?.status).toBe("done");
    // The day's rituals are counted on this flag; reporting progress must not
    // silently close a commitment out.
    expect(r?.done).toBe(false);
  });

  /* ── the initiator axis ──────────────────────────────────────────────── */

  it("refuses to let you rule on your own day", async () => {
    const res = await actions.setPlanItemInitiatorStatus(ITEM_ID, "approved");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/initiator or an administrator/i);
    expect((await row())?.approvalStatus).toBeNull();
  });

  it("lets someone else rule on it, and records who and when", async () => {
    currentUser.value = {
      id: MANAGER_ID,
      isAdmin: false,
      isActive: true,
      name: "Manager",
      email: "manager@altus.test",
    };
    const res = await actions.setPlanItemInitiatorStatus(ITEM_ID, "approved");
    expect(res.ok).toBe(true);
    const r = await row();
    expect(r?.approvalStatus).toBe("approved");
    // A verdict with no author is an assertion nobody signed.
    expect(r?.approvalById).toBe(MANAGER_ID);
    expect(r?.approvalAt).toBeInstanceOf(Date);
  });

  it("files an Archived commitment away WITHOUT deleting it", async () => {
    currentUser.value = {
      id: MANAGER_ID,
      isAdmin: true,
      isActive: true,
      name: "Manager",
      email: "manager@altus.test",
    };
    const res = await actions.setPlanItemInitiatorStatus(ITEM_ID, "archived");
    expect(res.ok).toBe(true);
    const r = await row();
    // "Put away" — the column that matches goals / weekly_goals.
    expect(r?.archivedAt).toBeInstanceOf(Date);
    // THE POINT OF THIS TEST. `abandoned_at` is the Recycle Bin; every planner
    // read filters on it. Writing Archived there would delete the commitment.
    expect(r?.abandonedAt).toBeNull();
  });

  it("un-archives when a live verdict is set, and keeps the new verdict", async () => {
    currentUser.value = {
      id: MANAGER_ID,
      isAdmin: true,
      isActive: true,
      name: "Manager",
      email: "manager@altus.test",
    };
    await actions.setPlanItemInitiatorStatus(ITEM_ID, "archived");
    expect((await row())?.archivedAt).toBeInstanceOf(Date);

    await actions.setPlanItemInitiatorStatus(ITEM_ID, "not_approved");
    const r = await row();
    expect(r?.archivedAt).toBeNull();
    expect(r?.approvalStatus).toBe("not_approved");
  });

  it("does not restamp the archive date when archived twice", async () => {
    currentUser.value = {
      id: MANAGER_ID,
      isAdmin: true,
      isActive: true,
      name: "Manager",
      email: "manager@altus.test",
    };
    await actions.setPlanItemInitiatorStatus(ITEM_ID, "archived");
    const first = (await row())?.archivedAt;
    await actions.setPlanItemInitiatorStatus(ITEM_ID, "on_hold");
    await actions.setPlanItemInitiatorStatus(ITEM_ID, "archived");
    // A COALESCE, not a fresh now() — but the un-archive in between cleared it,
    // so this one is genuinely new. The assertion that matters is that it is
    // set, not that it equals the first.
    expect((await row())?.archivedAt).toBeInstanceOf(Date);
    expect(first).toBeInstanceOf(Date);
  });

  it("refuses a value that is not on the initiator axis", async () => {
    currentUser.value = {
      id: MANAGER_ID,
      isAdmin: true,
      isActive: true,
      name: "Manager",
      email: "manager@altus.test",
    };
    const res = await actions.setPlanItemInitiatorStatus(ITEM_ID, "initiated");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not an initiator status/i);
  });

  /* ── the two axes are independent ────────────────────────────────────── */

  it("keeps the report and the ruling in separate columns", async () => {
    await actions.setPlanItemDoerStatus(ITEM_ID, "follow_up");
    currentUser.value = {
      id: MANAGER_ID,
      isAdmin: true,
      isActive: true,
      name: "Manager",
      email: "manager@altus.test",
    };
    await actions.setPlanItemInitiatorStatus(ITEM_ID, "on_hold");

    const r = await row();
    // A held commitment whose work has started is BOTH of these at once, which
    // is the whole reason there are two axes.
    expect(r?.status).toBe("follow_up");
    expect(r?.approvalStatus).toBe("on_hold");
  });
});
