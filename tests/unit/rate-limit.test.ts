import { describe, it, expect, beforeEach, vi } from "vitest";

// `lib/rate-limit.ts` imports "server-only" to keep callers honest at
// build time. The vitest node env isn't a Next build, so the marker
// module's guard throws — mock it away the same way the other unit
// tests in this repo do.
vi.mock("server-only", () => ({}));

import {
  rateLimit,
  rateLimitOrError,
  __resetRateLimitForTests,
} from "@/lib/rate-limit";

beforeEach(() => __resetRateLimitForTests());

describe("rateLimit", () => {
  it("allows the first request and tracks remaining", () => {
    const r = rateLimit("u1", "write");
    expect(r.ok).toBe(true);
    expect(r.limit).toBe(60);
    expect(r.remaining).toBe(59);
  });

  it("counts each kind separately for the same actor", () => {
    rateLimit("u1", "write");
    const w = rateLimit("u1", "write");
    const r = rateLimit("u1", "read");
    expect(w.remaining).toBe(58);
    expect(r.remaining).toBe(599);
  });

  it("rejects past the write cap and surfaces a retry hint", () => {
    for (let i = 0; i < 60; i++) {
      const r = rateLimit("u2", "write");
      expect(r.ok).toBe(true);
    }
    const r = rateLimit("u2", "write");
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("isolates different actors", () => {
    for (let i = 0; i < 60; i++) rateLimit("alice", "write");
    const blockedAlice = rateLimit("alice", "write");
    const freeBob = rateLimit("bob", "write");
    expect(blockedAlice.ok).toBe(false);
    expect(freeBob.ok).toBe(true);
  });
});

describe("rateLimitOrError", () => {
  it("returns null when allowed", () => {
    expect(rateLimitOrError("u3", "write")).toBeNull();
  });

  it("returns a Result-shape error on cap, mentioning the kind", () => {
    for (let i = 0; i < 60; i++) rateLimit("u4", "write");
    const err = rateLimitOrError("u4", "write");
    expect(err).not.toBeNull();
    expect(err!.ok).toBe(false);
    expect(err!.error).toContain("write");
    // Form: "Too many write requests. Try again in <N>s."
    expect(err!.error).toMatch(/in \d+s/);
  });
});
