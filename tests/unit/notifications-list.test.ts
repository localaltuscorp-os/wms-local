import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { dbSelectMock } = vi.hoisted(() => ({ dbSelectMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { select: dbSelectMock, execute: vi.fn() },
  notifications: {
    id: "n.id",
    kind: "n.kind",
    createdAt: "n.created_at",
    userId: "n.user_id",
    title: "n.title",
    body: "n.body",
    taskId: "n.task_id",
    deliveredChannels: "n.delivered_channels",
  },
  employees: { id: "e.id", name: "e.name", email: "e.email" },
  orgSettings: { id: "o.id", notificationMatrix: "o.notification_matrix" },
}));

vi.mock("drizzle-orm", () => ({
  sql: (s: TemplateStringsArray) => ({ __sql: s.raw.join("?") }),
  and: (...a: unknown[]) => ({ __and: a }),
  desc: (x: unknown) => x,
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gte: () => ({}),
  lte: () => ({}),
  lt: () => ({}),
  inArray: () => ({}),
  isNull: () => ({}),
}));

// Chain capture: db.select(...).from(...).where(...).orderBy(...).limit(...)
// or for settings:  db.select(...).from(...).where(...).limit(...)
// Each test sets `settingsResult` (first call) and `notifResult` (second call).
let settingsResult: unknown = [];
let notifResult: unknown = [];

beforeEach(() => {
  dbSelectMock.mockReset();
  let call = 0;
  // Pair pattern: odd calls (1, 3, 5...) return settingsResult,
  // even calls (2, 4, 6...) return notifResult.  This lets a single
  // test invoke listNotifications() more than once.
  dbSelectMock.mockImplementation(() => {
    call++;
    const isSettings = call % 2 === 1;
    const chain: {
      from: (t: unknown) => typeof chain;
      leftJoin: (a: unknown, b: unknown) => typeof chain;
      where: (w: unknown) => typeof chain;
      orderBy: (o: unknown) => typeof chain;
      limit: () => unknown;
    } = {
      from: (_t: unknown) => chain,
      leftJoin: (_a: unknown, _b: unknown) => chain,
      where: (_w: unknown) => chain,
      orderBy: (_o: unknown) => chain,
      limit: () => (isSettings ? settingsResult : notifResult),
    };
    return chain;
  });
});

describe("listNotifications channel-status derivation", () => {
  it("marks attempted-but-not-delivered channels as 'failed'", async () => {
    settingsResult = [
      { matrix: { task_assigned: ["email", "slack", "whatsapp"] } },
    ];
    notifResult = [
      {
        id: "n1",
        kind: "task_assigned",
        createdAt: new Date("2026-05-17T10:00:00Z"),
        recipientId: "u1",
        recipientName: "Alice",
        recipientEmail: "a@x.com",
        title: "Task assigned",
        body: "Send NOC",
        taskId: "t1",
        deliveredChannels: ["email"],
      },
    ];
    const { listNotifications } = await import("@/lib/queries/notifications");
    const res = await listNotifications();
    expect(res.rows[0]!.channelStatus.email).toBe("delivered");
    expect(res.rows[0]!.channelStatus.slack).toBe("failed");
    expect(res.rows[0]!.channelStatus.whatsapp).toBe("failed");
    expect(res.rows[0]!.channelStatus.push).toBe("not_attempted");
  });

  it("returns all not_attempted when matrix has no entry for the kind", async () => {
    settingsResult = [{ matrix: {} }];
    notifResult = [
      {
        id: "n1",
        kind: "unknown_kind",
        createdAt: new Date(),
        recipientId: "u1",
        recipientName: "A",
        recipientEmail: "a@x.com",
        title: "t",
        body: "b",
        taskId: null,
        deliveredChannels: [],
      },
    ];
    const { listNotifications } = await import("@/lib/queries/notifications");
    const res = await listNotifications();
    for (const ch of ["email", "slack", "whatsapp", "push"] as const) {
      expect(res.rows[0]!.channelStatus[ch]).toBe("not_attempted");
    }
  });

  it("filters out non-channel values from delivered_channels via isChannel guard", async () => {
    settingsResult = [{ matrix: { task_assigned: ["email"] } }];
    notifResult = [
      {
        id: "n1",
        kind: "task_assigned",
        createdAt: new Date(),
        recipientId: "u1",
        recipientName: "A",
        recipientEmail: "a@x.com",
        title: "t",
        body: "b",
        taskId: null,
        deliveredChannels: ["email", "bogus_channel"],
      },
    ];
    const { listNotifications } = await import("@/lib/queries/notifications");
    const res = await listNotifications();
    expect(res.rows[0]!.deliveredChannels).toEqual(["email"]);
    expect(res.rows[0]!.channelStatus.email).toBe("delivered");
  });

  it("populates attemptedChannels from matrix even when delivered is empty (all failed)", async () => {
    settingsResult = [{ matrix: { task_assigned: ["email", "push"] } }];
    notifResult = [
      {
        id: "n1",
        kind: "task_assigned",
        createdAt: new Date(),
        recipientId: "u1",
        recipientName: "A",
        recipientEmail: "a@x.com",
        title: "t",
        body: "b",
        taskId: null,
        deliveredChannels: [],
      },
    ];
    const { listNotifications } = await import("@/lib/queries/notifications");
    const res = await listNotifications();
    expect(res.rows[0]!.attemptedChannels).toEqual(["email", "push"]);
    expect(res.rows[0]!.channelStatus.email).toBe("failed");
    expect(res.rows[0]!.channelStatus.push).toBe("failed");
    expect(res.rows[0]!.channelStatus.slack).toBe("not_attempted");
  });
});

describe("listNotifications failuresOnly filter", () => {
  it("returns only rows with at least one failed channel when failuresOnly=true", async () => {
    settingsResult = [{ matrix: { task_assigned: ["email"] } }];
    notifResult = [
      {
        id: "n1",
        kind: "task_assigned",
        createdAt: new Date(),
        recipientId: "u1",
        recipientName: "A",
        recipientEmail: "a@x.com",
        title: "t",
        body: "b",
        taskId: null,
        deliveredChannels: ["email"],
      },
      {
        id: "n2",
        kind: "task_assigned",
        createdAt: new Date(),
        recipientId: "u2",
        recipientName: "B",
        recipientEmail: "b@x.com",
        title: "t",
        body: "b",
        taskId: null,
        deliveredChannels: [],
      },
    ];
    const { listNotifications } = await import("@/lib/queries/notifications");
    const all = await listNotifications();
    expect(all.rows).toHaveLength(2);
    const failures = await listNotifications({ failuresOnly: true });
    expect(failures.rows).toHaveLength(1);
    expect(failures.rows[0]!.id).toBe("n2");
  });
});

describe("listNotifications pagination", () => {
  it("sets hasMore + nextCursor when results exceed the limit", async () => {
    settingsResult = [{ matrix: { task_assigned: ["email"] } }];
    const now = new Date("2026-05-17T10:00:00Z");
    notifResult = Array.from({ length: 51 }, (_, i) => ({
      id: `n${i}`,
      kind: "task_assigned",
      createdAt: new Date(now.getTime() - i * 60_000),
      recipientId: "u1",
      recipientName: "A",
      recipientEmail: "a@x.com",
      title: "t",
      body: "b",
      taskId: null,
      deliveredChannels: ["email"],
    }));
    const { listNotifications } = await import("@/lib/queries/notifications");
    const res = await listNotifications();
    expect(res.rows).toHaveLength(50);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe(res.rows[49]!.createdAt.toISOString());
  });
});
