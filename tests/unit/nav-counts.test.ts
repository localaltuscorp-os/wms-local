import { describe, it, expect, vi } from "vitest";

// `unstable_cache` requires Next's incrementalCache at runtime, which the
// vitest node env doesn't provide. Mock it as a pass-through wrapper so
// `fetchTaskTotals` in nav-counts.ts just invokes the underlying function.
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    // The query is now two counts: `select({n}).from(tasks).where(...)` for
    // open work, and again for archived. Both resolve to `[{ n }]`.
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ n: 321 }])),
      })),
    })),
  },
  tasks: { archived: "tasks.archived", status: "tasks.status" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return { ...actual, count: () => ({ as: () => "count_alias" }) };
});

// notifications query is exercised in its own surface; here we stub it so
// getNavCounts stays focused on the tasks counts shape.
vi.mock("@/lib/queries/notifications", () => ({
  getUnreadCount: vi.fn(() => Promise.resolve(0)),
}));

import { getNavCounts } from "@/lib/queries/nav-counts";

describe("getNavCounts", () => {
  it("returns shape { activeTasks, archivedTasks, inboxUnread } as numbers", async () => {
    const result = await getNavCounts();
    expect(typeof result.activeTasks).toBe("number");
    expect(typeof result.archivedTasks).toBe("number");
    expect(typeof result.inboxUnread).toBe("number");
    expect(result.inboxUnread).toBe(0);
  });
});
