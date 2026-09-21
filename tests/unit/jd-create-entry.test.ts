import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * createJdEntry with the New JD form's own payload.
 *
 * The form sends `null` for an empty link slot. The URL validator once accepted
 * only `string | undefined`, so every JD without all three links failed with
 * "Invalid input: expected string, received null" — the form could not save the
 * ordinary case. These run the real schema; only the database and auth are stubbed.
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

const { selectRows, inserted } = vi.hoisted(() => ({
  selectRows: { current: [] as unknown[] },
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => {
  const select = () => ({
    from: () => ({ where: () => ({ limit: async () => selectRows.current }) }),
  });
  const insert = () => ({
    values: (v: Record<string, unknown>) => {
      inserted.push(v);
      return { returning: async () => [{ id: NEW_ID }] };
    },
  });
  return {
    db: {
      select,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ insert }),
    },
  };
});

const ME = "11111111-1111-4111-8111-111111111111";
const POSITION = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";
const NEW_ID = "44444444-4444-4444-8444-444444444444";

import { createJdEntry } from "@/app/(app)/operations/job-description/actions";

/** What JdForm's submit() sends when only the task is filled in. */
function formPayload(over: Record<string, unknown> = {}) {
  return {
    positionId: POSITION,
    task: "Make tea/coffee for the office and guests",
    category: null,
    notesHtml: null,
    recurrence: { kind: "daily" },
    estimatedMinutes: 15,
    videoUrl: null,
    guidelinesUrl: null,
    templateUrl: null,
    pushDcc: false,
    pushWms: false,
    pushEvent: false,
    targetPeople: { dcc: [], wms: [], event: [] },
    ...over,
  };
}

beforeEach(() => {
  inserted.length = 0;
  selectRows.current = [{ functionKey: "operations" }];
});

describe("createJdEntry — the New JD form's payload", () => {
  it("saves a Master JD whose three link slots are empty (null)", async () => {
    const res = await createJdEntry(formPayload());
    expect(res).toEqual({ ok: true, id: NEW_ID });
    expect(inserted[0]).toMatchObject({
      positionId: POSITION,
      functionKey: "operations",
      videoUrl: null,
      guidelinesUrl: null,
      templateUrl: null,
    });
  });

  it("saves a personal task the same way", async () => {
    selectRows.current = [{ id: PERSON }];
    const { positionId: _, ...rest } = formPayload();
    const res = await createJdEntry({ ...rest, ownerEmployeeId: PERSON, functionKey: "hr" });
    expect(res).toEqual({ ok: true, id: NEW_ID });
    expect(inserted[0]).toMatchObject({ ownerEmployeeId: PERSON, functionKey: "hr", videoUrl: null });
  });

  it("keeps a link that is filled in, and still rejects one that is not a URL", async () => {
    const ok = await createJdEntry(formPayload({ videoUrl: "  https://example.com/sop  " }));
    expect(ok.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ videoUrl: "https://example.com/sop", guidelinesUrl: null });

    const bad = await createJdEntry(formPayload({ templateUrl: "example.com/sheet" }));
    expect(bad).toEqual({ ok: false, error: "Links must start with http:// or https://" });
  });

  it("with no position picked, asks for one instead of a raw validation error", async () => {
    const res = await createJdEntry(formPayload({ positionId: undefined }));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/^Pick a position/);
  });

  it("records the uploaded SOP files with the JD, in the same transaction", async () => {
    const mine = `jd/${ME}/0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa/SOP.pdf`;
    const res = await createJdEntry(
      formPayload({
        attachments: [
          { kind: "guidelines", path: mine, fileName: "SOP.pdf", size: 2048 },
          { kind: "video", path: `jd/${ME}/0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa/how.mp4`, fileName: "how.mp4", size: 4096 },
        ],
      }),
    );
    expect(res).toEqual({ ok: true, id: NEW_ID });
    // inserted[0] is the JD itself; the files follow as one batch.
    expect(inserted[1]).toEqual([
      expect.objectContaining({ jdId: NEW_ID, kind: "guidelines", storagePath: mine, fileName: "SOP.pdf", uploadedById: ME }),
      expect.objectContaining({ jdId: NEW_ID, kind: "video", fileName: "how.mp4" }),
    ]);
  });

  it("refuses a file path the caller was never given, and writes nothing", async () => {
    const res = await createJdEntry(
      formPayload({
        attachments: [
          { kind: "guidelines", path: `jd/${PERSON}/0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa/SOP.pdf`, fileName: "SOP.pdf", size: 2048 },
        ],
      }),
    );
    expect(res).toEqual({ ok: false, error: "Invalid upload." });
    expect(inserted).toHaveLength(0);
  });

  it("accepts every Frequency preset the form can produce", async () => {
    const { frequencyOptionsFor } = await import("@/lib/jd/recurrence");
    for (const o of frequencyOptionsFor("2026-09-16").filter((o) => o.id !== "custom")) {
      const res = await createJdEntry(formPayload({ recurrence: o.value }));
      expect(res, o.label).toEqual({ ok: true, id: NEW_ID });
    }
  });
});
