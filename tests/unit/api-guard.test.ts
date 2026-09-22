import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * THE ROUTE-HANDLER GUARD.
 *
 * This is the only thing standing between "the matrix looks enforced" and "the
 * matrix IS enforced" for the ~180 route handlers, so its edge cases are worth
 * pinning individually. Three of them are security-relevant and one is an
 * availability incident waiting to happen:
 *
 *   1. An UNGOVERNED path must be ALLOWED. If this inverts, every endpoint
 *      nobody has classified starts refusing — the app breaks at random, and
 *      the fix would look like a permissions bug forever.
 *   2. A DENIED node must refuse with 403 and NAME the node, so a screenshot of
 *      a failed request says which switch to look at.
 *   3. The refusal must be RETURNED, not thrown. A route handler has no error
 *      boundary, so a throw becomes a 500 — a refusal that reports itself as the
 *      application being broken.
 *
 * `canViewModule` is mocked, so these assert the guard's OWN logic rather than
 * the matrix behind it (covered by permission-effective.test.ts).
 */

const canViewModule = vi.fn();
vi.mock("@/lib/permissions/resolve", () => ({
  canViewModule: (key: string) => canViewModule(key),
}));

const { apiViewDenial, forbiddenApiResponse } = await import(
  "@/lib/permissions/api-guard"
);

/** A request the way Next hands one to a handler. */
const req = (path: string) => new Request(`https://os.altuscorp.in${path}`);

beforeEach(() => {
  canViewModule.mockReset();
  canViewModule.mockResolvedValue(true);
});

describe("the guard allows what it should not refuse", () => {
  it("ALLOWS an ungoverned path without consulting the matrix at all", async () => {
    // The deliberate hole in the safety net, and the reason it exists: the
    // catalogue only claims what somebody has classified. Inventing a refusal
    // for the rest would break surfaces at random.
    expect(await apiViewDenial(req("/some/route/nobody/classified"))).toBeNull();
    expect(await apiViewDenial(req("/"))).toBeNull();
    expect(canViewModule).not.toHaveBeenCalled();
  });

  it("allows a governed path the caller may view", async () => {
    expect(await apiViewDenial(req("/api/hr/letters/pdf"))).toBeNull();
    expect(canViewModule).toHaveBeenCalledWith("hr.letters");
  });

  it("lets a handler's own auth answer when there is no session", async () => {
    // `modulePermission` returns allowAll() for a caller with no identity, so
    // an unauthenticated request falls through to the handler — which is what
    // keeps a 401 from being rewritten as a 403 by this guard.
    canViewModule.mockResolvedValue(true);
    expect(await apiViewDenial(req("/salary/export.xlsx"))).toBeNull();
  });
});

describe("the guard refuses what it should", () => {
  it("returns 403 — it does not throw, because a handler has no error boundary", async () => {
    canViewModule.mockResolvedValue(false);
    const res = await apiViewDenial(req("/api/hr/letters/pdf"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("NAMES the node, so a failed request says which switch to look at", async () => {
    canViewModule.mockResolvedValue(false);
    const res = await apiViewDenial(req("/api/hr/letters/issue-rich"));
    expect(await res!.json()).toEqual({ error: "forbidden", node: "hr.letters" });
  });

  it("resolves the node from the PATH, including when a query string is present", async () => {
    // Endpoints carry query strings routinely; a guard that read the raw URL
    // would resolve nothing and silently allow.
    canViewModule.mockResolvedValue(false);
    const res = await apiViewDenial(
      req("/api/hr/letters/pdf?template=appointment"),
    );
    expect(canViewModule).toHaveBeenCalledWith("hr.letters");
    expect(res!.status).toBe(403);
  });

  it("governs an export by the SAME node as the screen it exports", async () => {
    canViewModule.mockResolvedValue(false);
    const res = await apiViewDenial(req("/salary/export.xlsx"));
    expect(canViewModule).toHaveBeenCalledWith("accounts.payroll");
    expect(res!.status).toBe(403);
  });

  it("prefers the most specific node, so a sub-module can be revoked alone", async () => {
    canViewModule.mockResolvedValue(false);
    await apiViewDenial(req("/salary/documents/pdf"));
    expect(canViewModule).toHaveBeenCalledWith("accounts.payroll.documents");
  });
});

describe("the refusal itself", () => {
  it("carries CORS headers when given them, for the native app", async () => {
    // Without these the app reports a network failure instead of a 403, and the
    // person sees "can't connect" rather than "you do not have access".
    canViewModule.mockResolvedValue(false);
    const res = await apiViewDenial(req("/salary/export.xlsx"), {
      "Access-Control-Allow-Origin": "*",
    });
    expect(res!.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("is a real 403 carrying JSON, not an empty body", async () => {
    const res = forbiddenApiResponse("accounts.payroll");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
