import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingTask } from "@/lib/queries/overdue";

// ── Mock dependencies BEFORE importing the route ─────────────────────
// Vitest hoists vi.mock(), so the mocks are in place when the route
// imports its dependencies.

// `lib/notifications/channel-prefs.ts` and `lib/slack/dispatch.ts` both
// `import "server-only"` at the top.  The real module throws when
// loaded outside an RSC; Vitest needs a no-op.
vi.mock("server-only", () => ({}));

const {
  listPendingByEmployee,
  sendDigestEmail,
  dbInsert,
  dbSelect,
  selectFromMock,
  selectWhereMock,
  insertValuesMock,
} = vi.hoisted(() => ({
  listPendingByEmployee: vi.fn(),
  sendDigestEmail: vi.fn(),
  dbInsert: vi.fn(),
  dbSelect: vi.fn(),
  selectFromMock: vi.fn(),
  selectWhereMock: vi.fn(),
  insertValuesMock: vi.fn(),
}));

vi.mock("@/lib/queries/overdue", () => ({
  listPendingByEmployee,
}));

vi.mock("@/lib/email/resend", () => ({
  sendDigestEmail,
}));

vi.mock("@/lib/notifications/channel-prefs", () => ({
  getRecipientChannelPrefs: vi.fn(async () => null),
}));
vi.mock("@/lib/slack/dispatch", () => ({
  sendSlackDigest: vi.fn(async () => "skip" as const),
}));
vi.mock("@/lib/whatsapp/dispatch", () => ({
  sendWhatsAppDigest: vi.fn(async () => "skip" as const),
}));

// M5 — handler consults `org_settings.digest_hour_ist` and skips when the
// current IST hour doesn't match.  Default the mock to "match" so the
// send-path tests proceed; the off-hour behavior has its own test.
const getOrgSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/org-settings", () => ({
  getOrgSettings: getOrgSettingsMock,
}));

function currentIstHour(): number {
  const istMs = Date.now() + 330 * 60 * 1000;
  return new Date(istMs).getUTCHours();
}

// Mock @/lib/db so the route can: db.insert(notifications).values({...})
// and db.select({...}).from(employees).where(eq(isActive,true)).
vi.mock("@/lib/db", () => {
  dbInsert.mockImplementation(() => ({
    values: insertValuesMock,
  }));
  dbSelect.mockImplementation(() => ({
    from: selectFromMock,
  }));
  selectFromMock.mockImplementation(() => ({
    where: selectWhereMock,
  }));
  return {
    db: {
      insert: dbInsert,
      select: dbSelect,
    },
    employees: { id: "employees.id", email: "employees.email", name: "employees.name", isActive: "employees.is_active" },
    notifications: { __table: "notifications" },
  };
});

// drizzle-orm — the route now uses `eq` for the active-employee filter.
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ __eq: { col, value } }),
}));

// next/server's NextResponse — minimal Response-shaped stub.
vi.mock("next/server", () => ({
  NextResponse: {
    json: <T,>(body: T, init?: { status?: number }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────
function mkRequest(authorization?: string): Request {
  return new Request("http://localhost/api/cron/digest", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

function mkPendingTask(
  over: Partial<PendingTask> & { id: string; doerId: string },
): PendingTask {
  return {
    shortId: null,
    subject: `Task ${over.id}`,
    dueAt: new Date("2026-05-10T00:00:00Z"),
    doerName: "Doer One",
    isOverdue: true,
    daysOverdue: 4,
    ...over,
  } as PendingTask;
}

beforeEach(() => {
  listPendingByEmployee.mockReset();
  sendDigestEmail.mockReset();
  dbInsert.mockClear();
  dbSelect.mockClear();
  selectFromMock.mockClear();
  selectWhereMock.mockReset();
  insertValuesMock.mockReset();
  insertValuesMock.mockResolvedValue(undefined);
  // Default: no pending tasks for anyone, no active employees.
  listPendingByEmployee.mockResolvedValue(new Map());
  selectWhereMock.mockResolvedValue([]);
  sendDigestEmail.mockResolvedValue({ id: "msg", error: null });
  getOrgSettingsMock.mockReset();
  getOrgSettingsMock.mockResolvedValue({ id: 1, digestHourIst: currentIstHour() });
  process.env.CRON_SECRET = "test-secret-1234567890abcdef";
});

describe("POST /api/cron/digest", () => {
  it("returns 401 without the correct Bearer token", async () => {
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest()); // no auth header
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(listPendingByEmployee).not.toHaveBeenCalled();
    expect(sendDigestEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset (don't leak that fact)", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong Bearer token", async () => {
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("processes zero when there are no active employees", async () => {
    selectWhereMock.mockResolvedValue([]);
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number; sent: number };
    expect(body).toEqual({ ok: true, processed: 0, sent: 0, skipped: 0 });
    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("skips zero-pending employees (no all-clear noise); emails only those with pending tasks", async () => {
    const e1 = "emp-1";
    const e2 = "emp-2";
    // e1 has 2 pending → digest; e2 has none → skipped entirely (no noise).
    listPendingByEmployee.mockResolvedValue(
      new Map<string, PendingTask[]>([
        [
          e1,
          [
            mkPendingTask({ id: "t1", doerId: e1, subject: "Send NOC" }),
            mkPendingTask({ id: "t2", doerId: e1, subject: "Chase KYC" }),
          ],
        ],
      ]),
    );
    selectWhereMock.mockResolvedValue([
      { id: e1, email: "one@vp.com", name: "Doer One" },
      { id: e2, email: "two@vp.com", name: "Doer Two" },
    ]);
    sendDigestEmail.mockResolvedValue({ id: "msg-1", error: null });

    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number; sent: number };
    // Both processed; only the one with pending tasks is emailed, the other skipped.
    expect(body).toEqual({ ok: true, processed: 2, sent: 1, skipped: 1 });
    expect(sendDigestEmail).toHaveBeenCalledTimes(1);

    // Only the pending employee gets an in-app notification row.
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    const insertedRows = insertValuesMock.mock.calls.map(
      (c: unknown[]) => c[0] as Record<string, unknown>,
    );
    expect(insertedRows.every((r) => r.kind === "overdue_digest")).toBe(true);
    const titles = insertedRows.map((r) => r.title as string).sort();
    expect(titles).toEqual(["You have 2 pending tasks"]);

    // sendDigestEmail receives pendingTasks; only e1 (with pending) is emailed.
    const callArgs = sendDigestEmail.mock.calls.map(
      (c: unknown[]) =>
        c[0] as {
          recipient: { email: string; name: string };
          pendingTasks: unknown[];
        },
    );
    const e1Call = callArgs.find((a) => a.recipient.email === "one@vp.com")!;
    expect(e1Call.pendingTasks).toHaveLength(2);
    expect(callArgs.find((a) => a.recipient.email === "two@vp.com")).toBeUndefined();
  });

  it("continues on email failure (counts in processed, not sent)", async () => {
    const e1 = "emp-1";
    listPendingByEmployee.mockResolvedValue(
      new Map<string, PendingTask[]>([[e1, [mkPendingTask({ id: "t1", doerId: e1 })]]]),
    );
    selectWhereMock.mockResolvedValue([{ id: e1, email: "one@vp.com", name: "Doer One" }]);
    sendDigestEmail.mockResolvedValue({ id: null, error: "Resend exploded" });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; sent: number };
    expect(body.processed).toBe(1);
    expect(body.sent).toBe(0);
    errSpy.mockRestore();
  });

  it("supports GET too (Vercel Cron uses GET by default)", async () => {
    selectWhereMock.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/digest/route");
    const res = await GET(mkRequest("Bearer test-secret-1234567890abcdef"));
    expect(res.status).toBe(200);
  });

  it("skips with ok:true when current IST hour ≠ org_settings.digest_hour_ist", async () => {
    const offHour = (currentIstHour() + 6) % 24;
    getOrgSettingsMock.mockResolvedValue({ id: 1, digestHourIst: offHour });

    const { POST } = await import("@/app/api/cron/digest/route");
    const res = await POST(mkRequest("Bearer test-secret-1234567890abcdef"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      skipped: string;
      istHour: number;
      digestHourIst: number;
    };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe("off_hour");
    expect(body.digestHourIst).toBe(offHour);
    expect(body.istHour).not.toBe(offHour);

    expect(listPendingByEmployee).not.toHaveBeenCalled();
    expect(sendDigestEmail).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });
});
