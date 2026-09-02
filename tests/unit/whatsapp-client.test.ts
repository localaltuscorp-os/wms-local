import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `lib/whatsapp/client.ts` imports "server-only" at the top — the real
// module throws when loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

/**
 * The WhatsApp Cloud-API client is tested by mocking global `fetch`.
 *
 * IMPORTANT: every test does a dynamic `await import("@/lib/whatsapp/client")`
 * INSIDE the test body — not at the top of the file. This is deliberate.
 * The client reads `process.env.META_WHATSAPP_*` at call time, but the
 * import itself happens lazily so `beforeEach`'s env-var setup is in
 * place before any module-load-time side effects could run.
 */

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

describe("sendTemplate", () => {
  beforeEach(() => {
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.META_WHATSAPP_ACCESS_TOKEN = "tok";
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    fetchMock.mockReset();
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
  });

  it("returns { ok:true, id } on a 200 with messages[0].id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.123" }] }),
    });
    const { sendTemplate } = await import("@/lib/whatsapp/client");
    const r = await sendTemplate({
      toPhone: "+919820062511",
      templateName: "vp_assigned",
      components: [],
    });
    expect(r).toEqual({ ok: true, id: "wamid.123" });
  });

  it("returns { ok:false, error } on a 4xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "bad template" } }),
    });
    const { sendTemplate } = await import("@/lib/whatsapp/client");
    const r = await sendTemplate({
      toPhone: "+919820062511",
      templateName: "vp_assigned",
      components: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad template");
  });

  it("returns { ok:false } silently when env vars are missing", async () => {
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    vi.resetModules();
    const { sendTemplate } = await import("@/lib/whatsapp/client");
    const r = await sendTemplate({
      toPhone: "+919820062511",
      templateName: "vp_assigned",
      components: [],
    });
    expect(r.ok).toBe(false);
  });
});
