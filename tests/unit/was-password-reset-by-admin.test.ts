import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock rate-limit so we control allow/deny, and db so we control the marker.
const rateLimit = vi.fn().mockReturnValue({ ok: true });
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }));

let markerValue: Date | null = null;
let shouldThrow = false;
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (shouldThrow) throw new Error("db down");
            return Promise.resolve([{ marker: markerValue }]);
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({ employees: { email: "email", passwordResetByAdminAt: "marker" } }));

beforeEach(() => {
  rateLimit.mockClear();
  rateLimit.mockReturnValue({ ok: true });
  markerValue = null;
  shouldThrow = false;
});

describe("wasPasswordResetByAdmin", () => {
  it("returns true when the marker is set", async () => {
    markerValue = new Date();
    const { wasPasswordResetByAdmin } = await import("@/app/(auth)/login/actions");
    expect(await wasPasswordResetByAdmin("dev@altus.test")).toBe(true);
  });

  it("returns false when the marker is null", async () => {
    markerValue = null;
    const { wasPasswordResetByAdmin } = await import("@/app/(auth)/login/actions");
    expect(await wasPasswordResetByAdmin("dev@altus.test")).toBe(false);
  });

  it("returns false (fail-safe) when rate-limited — and does NOT hit the db", async () => {
    rateLimit.mockReturnValue({ ok: false });
    markerValue = new Date(); // would be true if it queried
    const { wasPasswordResetByAdmin } = await import("@/app/(auth)/login/actions");
    expect(await wasPasswordResetByAdmin("dev@altus.test")).toBe(false);
  });

  it("returns false for an empty email without consuming a rate-limit token", async () => {
    const { wasPasswordResetByAdmin } = await import("@/app/(auth)/login/actions");
    expect(await wasPasswordResetByAdmin("   ")).toBe(false);
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("returns false (fail-safe) when the db query throws", async () => {
    shouldThrow = true;
    const { wasPasswordResetByAdmin } = await import("@/app/(auth)/login/actions");
    expect(await wasPasswordResetByAdmin("dev@altus.test")).toBe(false);
  });
});
