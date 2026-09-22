import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * setChecklistApprover — the Event Checklist's Approver Status follows the WMS
 * Tasks rule (lib/status/approver-status.ts): the row's initiator, the doer's
 * manager or an admin may rule; never the doer on their own row; Approved and
 * Not Approved wait for the Doer Status to reach Done.
 */

const { me, calls, row } = vi.hoisted(() => ({
  me: { current: { id: "", isAdmin: false, email: "someone@example.com" } },
  calls: [] as { op: string; values?: unknown; set?: unknown }[],
  row: { current: null as null | { doerId: string | null; initiatorId: string | null; status: string | null } },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/workspace-access", () => ({ requireWorkspace: vi.fn(async () => me.current) }));
vi.mock("@/lib/auth/super-admin", () => ({ isSuperAdmin: () => false }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: () => null }));
vi.mock("@/lib/weekly-goals/hierarchy", () => ({
  getDownlineIds: vi.fn(async (id: string) => (id === MANAGER ? [DOER] : [])),
}));
vi.mock("@/lib/demo/ops-checklist-demo", () => ({
  checklistDemoActive: () => false,
  demoCreateItem: vi.fn(),
  demoChecklistSnapshot: vi.fn(),
  demoCreateEvent: vi.fn(),
  demoCreateRun: vi.fn(),
  demoFindItem: vi.fn(),
  demoRemoveItem: vi.fn(),
  demoSaveRunAsTemplate: vi.fn(),
  demoSetApprover: vi.fn(),
  demoSetCheck: vi.fn(),
  demoUpdateItem: vi.fn(),
  demoUpdateRun: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["from", "where", "limit", "innerJoin", "leftJoin", "orderBy"]) c[k] = () => c;
    (c as { then: unknown }).then = (res: (v: unknown) => void) => res(row.current ? [row.current] : []);
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (values: unknown) => ({
          onConflictDoUpdate: async ({ set }: { set: unknown }) => {
            calls.push({ op: "upsert", values, set });
          },
        }),
      }),
    },
  };
});

const DOER = "11111111-1111-4111-8111-111111111111";
const INITIATOR = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const STRANGER = "44444444-4444-4444-8444-444444444444";
const RUN = "55555555-5555-4555-8555-555555555555";
const ITEM = "66666666-6666-4666-8666-666666666666";

import { setChecklistApprover } from "@/app/(app)/operations/checklist/actions";

const as = (id: string, isAdmin = false) => {
  me.current = { id, isAdmin, email: `${id}@example.com` };
};
const rule = (status: string) => setChecklistApprover({ runId: RUN, itemId: ITEM, status });

beforeEach(() => {
  calls.length = 0;
  row.current = { doerId: DOER, initiatorId: INITIATOR, status: "done" };
});

describe("setChecklistApprover — who may rule", () => {
  it("lets the initiator approve finished work, and stamps who ruled", async () => {
    as(INITIATOR);
    expect(await rule("approved")).toEqual({ ok: true });
    const set = calls[0]!.set as Record<string, unknown>;
    expect(set.approverStatus).toBe("approved");
    expect(set.approverId).toBe(INITIATOR);
  });

  it("never lets the doer rule on their own row", async () => {
    as(DOER);
    const res = await rule("approved");
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("lets the doer's manager rule, and refuses someone with no say", async () => {
    as(MANAGER);
    expect(await rule("on_hold")).toEqual({ ok: true });
    as(STRANGER);
    expect((await rule("on_hold")).ok).toBe(false);
  });

  it("holds Approved until the Doer Status is Done — even when stored in the old words", async () => {
    as(INITIATOR);
    row.current = { doerId: DOER, initiatorId: INITIATOR, status: "initiated" };
    expect((await rule("approved")).ok).toBe(false);
    // Pre-0237 "Done" still counts as done.
    row.current = { doerId: DOER, initiatorId: INITIATOR, status: "Done" };
    expect(await rule("approved")).toEqual({ ok: true });
  });

  it("stores Pending as no ruling at all", async () => {
    as(INITIATOR);
    await rule("pending");
    expect((calls[0]!.set as Record<string, unknown>).approverStatus).toBeNull();
  });

  it("leaves a self-raised row to an admin alone", async () => {
    row.current = { doerId: DOER, initiatorId: DOER, status: "done" };
    as(DOER);
    expect((await rule("approved")).ok).toBe(false);
    as(STRANGER, true);
    expect(await rule("approved")).toEqual({ ok: true });
  });

  it("lets only someone who may rule write the Approver Notes", async () => {
    as(DOER);
    expect((await setChecklistApprover({ runId: RUN, itemId: ITEM, approverNotes: "fine" })).ok).toBe(false);
    as(INITIATOR);
    expect(await setChecklistApprover({ runId: RUN, itemId: ITEM, approverNotes: "fine" })).toEqual({ ok: true });
    expect((calls[0]!.set as Record<string, unknown>).approverNotes).toBe("fine");
  });
});
