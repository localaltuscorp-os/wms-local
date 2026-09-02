import { describe, it, expect, vi, beforeEach } from "vitest";

// `lib/slack/client.ts` imports "server-only" at the top.  The real
// module throws when loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

const lookupByEmail = vi.fn();
const updateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@slack/web-api", () => {
  class WebClient {
    users = { lookupByEmail };
    chat = { postMessage: vi.fn() };
  }
  return { WebClient };
});
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({ set: () => ({ where: updateMock }) }),
  },
}));

import { resolveSlackUserId } from "@/lib/slack/client";

describe("resolveSlackUserId", () => {
  beforeEach(() => {
    lookupByEmail.mockReset();
    updateMock.mockClear();
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    // Ensure the lazy global client is rebuilt with the mocked WebClient
    // each test (and isn't accidentally cached from a prior run).
    (globalThis as unknown as { __slack?: unknown }).__slack = undefined;
  });

  it("returns cached slackUserId without API call", async () => {
    const id = await resolveSlackUserId({
      id: "e1",
      email: "x@y.com",
      slackUserId: "U123",
    } as never);
    expect(id).toBe("U123");
    expect(lookupByEmail).not.toHaveBeenCalled();
  });

  it("looks up by email and caches the result", async () => {
    lookupByEmail.mockResolvedValue({ ok: true, user: { id: "U456" } });
    const id = await resolveSlackUserId({
      id: "e2",
      email: "y@z.com",
      slackUserId: null,
    } as never);
    expect(id).toBe("U456");
    expect(lookupByEmail).toHaveBeenCalledWith({ email: "y@z.com" });
    expect(updateMock).toHaveBeenCalled();
  });

  it("returns null when Slack doesn't know the email", async () => {
    lookupByEmail.mockResolvedValue({ ok: false });
    const id = await resolveSlackUserId({
      id: "e3",
      email: "ghost@x.com",
      slackUserId: null,
    } as never);
    expect(id).toBeNull();
  });

  it("returns null on thrown errors (network, rate limit, etc.)", async () => {
    lookupByEmail.mockRejectedValue(new Error("ECONNRESET"));
    const id = await resolveSlackUserId({
      id: "e4",
      email: "y@z.com",
      slackUserId: null,
    } as never);
    expect(id).toBeNull();
  });
});
