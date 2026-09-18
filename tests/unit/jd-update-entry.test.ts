import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * updateJdEntry — the drawer saves ONE field at a time.
 *
 * Zod 4 applies a field's `.default()` even inside `.partial()`, so an update
 * schema built as `EntryFields.partial()` filled every omitted default back in:
 * saving just a category also wrote pushDcc/pushWms/pushEvent = false and an
 * empty `targetPeople`, which switched off every destination and retired every
 * assignment. These pin that a partial save changes only what it names.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/hr/access", () => ({ requireHrStaff: vi.fn(async () => ({ id: ME })) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: () => null }));
vi.mock("@/lib/demo/jd-demo", () => ({
  jdDemoActive: () => false,
  demoCreateEntry: vi.fn(),
  demoCreatePosition: vi.fn(),
  demoSetEntryActive: vi.fn(),
  demoUpdateEntry: vi.fn(),
}));

const { calls, selectRows } = vi.hoisted(() => ({
  calls: [] as { op: string; values?: unknown }[],
  selectRows: { current: [] as unknown[] },
}));

vi.mock("@/lib/db", () => {
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const k of ["from", "where", "limit", "innerJoin", "leftJoin", "orderBy"]) c[k] = () => c;
    (c as { then: unknown }).then = (res: (v: unknown) => void) => res(rows());
    return c;
  };
  const tx = {
    select: () => chain(() => selectRows.current),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          calls.push({ op: "update", values });
        },
      }),
    }),
    insert: () => ({
      values: (values: unknown) => {
        calls.push({ op: "insert", values });
        const r = { onConflictDoNothing: async () => {}, returning: async () => [] };
        return Object.assign(Promise.resolve(), r);
      },
    }),
  };
  return { db: { ...tx, transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

const ME = "11111111-1111-4111-8111-111111111111";
const JD = "22222222-2222-4222-8222-222222222222";

import { updateJdEntry } from "@/app/(app)/operations/job-description/actions";

beforeEach(() => {
  calls.length = 0;
  // Every read in the mock returns this row: the stored switches, and the JD's
  // text as it stands after the save.
  selectRows.current = [{ pushDcc: true, pushWms: true, pushEvent: false, task: "Tea round", category: "Vendors" }];
});

describe("updateJdEntry — a partial save", () => {
  it("changing only the category touches only the category", async () => {
    const res = await updateJdEntry({ id: JD, category: "Vendors" });
    expect(res).toEqual({ ok: true });
    const update = calls.find((c) => c.op === "update")!.values as Record<string, unknown>;
    expect(update.category).toBe("Vendors");
    // Not switched off, and nobody unassigned.
    expect(update).not.toHaveProperty("pushDcc");
    expect(update).not.toHaveProperty("pushWms");
    expect(update).not.toHaveProperty("pushEvent");
    // No assignment was retired (the retire step sets isActive: false) and none
    // re-created. The other update allowed is the JD's rows in event checklists
    // taking the new category, which is the point of keeping them linked.
    const others = calls.filter((c) => c.op === "update").slice(1).map((c) => c.values as Record<string, unknown>);
    expect(others.every((v) => !("isActive" in v) && v.category === "Vendors")).toBe(true);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("still switches a destination when that is what was sent", async () => {
    await updateJdEntry({ id: JD, pushWms: false });
    const update = calls.find((c) => c.op === "update")!.values as Record<string, unknown>;
    expect(update.pushWms).toBe(false);
    expect(update).not.toHaveProperty("pushDcc");
  });
});
