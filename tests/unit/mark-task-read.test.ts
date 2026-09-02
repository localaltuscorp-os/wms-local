import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ set: unknown }> = [];
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (v: unknown) => ({
        where: () => { calls.push({ set: v }); return Promise.resolve(); },
      }),
    }),
  },
  tasks: { id: "id", firstReadAt: "first_read_at" },
}));
vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u1", name: "U" }),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/cache-tags", () => ({ CACHE_TAGS: { tasks: "tasks" } }));

beforeEach(() => { calls.length = 0; });

describe("markTaskRead", () => {
  it("issues an update setting firstReadAt", async () => {
    const { markTaskRead } = await import("@/app/(app)/tasks/read-actions");
    await markTaskRead("00000000-0000-4000-8000-000000000000");
    expect(calls.length).toBe(1);
    expect(calls[0]!.set).toHaveProperty("firstReadAt");
  });

  it("does not throw on an invalid id (best-effort)", async () => {
    const { markTaskRead } = await import("@/app/(app)/tasks/read-actions");
    await expect(markTaskRead("not-a-uuid")).resolves.toBeUndefined();
  });
});
