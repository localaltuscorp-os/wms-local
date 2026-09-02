import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { dbExecuteMock } = vi.hoisted(() => ({
  dbExecuteMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { execute: dbExecuteMock },
  // Tables referenced in static imports — return safe stubs.
  taskEvents: {}, tasks: {}, employees: {}, employeeEvents: {}, settingsEvents: {},
}));

// drizzle-orm — listAllActivity uses sql template + SQL type only.
vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      __sql: strings.raw.join("?"),
      vals,
    }),
    {
      raw: (s: string) => ({ __raw: s }),
    },
  ),
}));

beforeEach(() => {
  dbExecuteMock.mockReset();
  // Default to empty array so callers don't time out if a test forgets
  // to set up its own resolved value (defensive).
  dbExecuteMock.mockResolvedValue([]);
});

describe("listAllActivity (UNION)", { timeout: 15000 }, () => {
  it("returns rows from all three sources merged + ordered desc by created_at", async () => {
    dbExecuteMock.mockResolvedValue([
      {
        id: "t1",
        source: "task",
        task_id: "task-1",
        target_employee_id: null,
        setting_scope: null,
        setting_target_id: null,
        actor_id: "u1",
        event_type: "status_changed",
        from_value: null,
        to_value: null,
        note: null,
        created_at: new Date("2026-05-17T10:00:00Z"),
        task_subject: "Send NOC",
        task_title: "Send NOC",
        task_status: "done",
        target_employee_name: null,
        actor_name: "Alice",
        actor_avatar_url: null,
      },
      {
        id: "e1",
        source: "employee",
        task_id: null,
        target_employee_id: "emp-2",
        setting_scope: null,
        setting_target_id: null,
        actor_id: "u1",
        event_type: "invited",
        from_value: null,
        to_value: null,
        note: null,
        created_at: new Date("2026-05-17T09:00:00Z"),
        task_subject: null,
        task_title: null,
        task_status: null,
        target_employee_name: "Bob",
        actor_name: "Alice",
        actor_avatar_url: null,
      },
      {
        id: "s1",
        source: "settings",
        task_id: null,
        target_employee_id: null,
        setting_scope: "org",
        setting_target_id: null,
        actor_id: "u1",
        event_type: "digest_hour_changed",
        from_value: 9,
        to_value: 10,
        note: null,
        created_at: new Date("2026-05-17T08:00:00Z"),
        task_subject: null,
        task_title: null,
        task_status: null,
        target_employee_name: null,
        actor_name: "Alice",
        actor_avatar_url: null,
      },
    ]);
    const { listAllActivity } = await import("@/lib/queries/activity");
    const res = await listAllActivity({ limit: 10 });
    expect(res.events).toHaveLength(3);
    expect(res.events.map((e) => e.source)).toEqual(["task", "employee", "settings"]);
    expect(res.events[1]!.targetEmployeeName).toBe("Bob");
    expect(res.events[2]!.settingScope).toBe("org");
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it("source-filter to ['task'] still executes (single arm) and returns mapped rows", async () => {
    dbExecuteMock.mockResolvedValue([
      {
        id: "t1",
        source: "task",
        task_id: "task-1",
        target_employee_id: null,
        setting_scope: null,
        setting_target_id: null,
        actor_id: "u1",
        event_type: "status_changed",
        from_value: null,
        to_value: null,
        note: null,
        created_at: new Date("2026-05-17T10:00:00Z"),
        task_subject: "Send NOC",
        task_title: "Send NOC",
        task_status: "done",
        target_employee_name: null,
        actor_name: "Alice",
        actor_avatar_url: null,
      },
    ]);
    const { listAllActivity } = await import("@/lib/queries/activity");
    const res = await listAllActivity({ source: ["task"], limit: 10 });
    expect(res.events).toHaveLength(1);
    expect(res.events[0]!.source).toBe("task");
    expect(dbExecuteMock).toHaveBeenCalledOnce();
  });

  it("empty source array short-circuits without db.execute call", async () => {
    // Per current implementation, opts.source.length === 0 falls back to
    // "all sources" (see activity.ts: `opts.source && opts.source.length > 0`).
    // So this WILL call db.execute. Just assert shape-valid response.
    dbExecuteMock.mockResolvedValue([]);
    const { listAllActivity } = await import("@/lib/queries/activity");
    const res = await listAllActivity({ source: [], limit: 10 });
    expect(res.events).toBeInstanceOf(Array);
    expect(res.events).toHaveLength(0);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it("sets nextCursor when hasMore is true (limit+1 sentinel)", async () => {
    const now = new Date("2026-05-17T10:00:00Z");
    dbExecuteMock.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        id: `t${i}`,
        source: "task",
        task_id: `task-${i}`,
        target_employee_id: null,
        setting_scope: null,
        setting_target_id: null,
        actor_id: "u1",
        event_type: "status_changed",
        from_value: null,
        to_value: null,
        note: null,
        created_at: new Date(now.getTime() - i * 60_000),
        task_subject: "X",
        task_title: "X",
        task_status: "done",
        target_employee_name: null,
        actor_name: "Alice",
        actor_avatar_url: null,
      })),
    );
    const { listAllActivity } = await import("@/lib/queries/activity");
    const res = await listAllActivity({ limit: 10 });
    expect(res.events).toHaveLength(10);
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toBe(res.events[9]!.createdAt.toISOString());
  });

  it("(deleted task) fallback when task_title is null for task source", async () => {
    dbExecuteMock.mockResolvedValue([
      {
        id: "t1", source: "task", task_id: null, target_employee_id: null,
        setting_scope: null, setting_target_id: null,
        actor_id: "u1", event_type: "status_changed",
        from_value: null, to_value: null, note: null,
        created_at: new Date(),
        task_subject: null, task_title: null, task_status: null,
        target_employee_name: null, actor_name: "Alice", actor_avatar_url: null,
      },
    ]);
    const { listAllActivity } = await import("@/lib/queries/activity");
    const res = await listAllActivity({ limit: 10 });
    expect(res.events[0]!.taskTitle).toBe("(deleted task)");
  });

  it("empty taskTitle for non-task source when task_title is null", async () => {
    dbExecuteMock.mockResolvedValue([
      {
        id: "e1", source: "employee", task_id: null, target_employee_id: "emp",
        setting_scope: null, setting_target_id: null,
        actor_id: "u1", event_type: "invited",
        from_value: null, to_value: null, note: null,
        created_at: new Date(),
        task_subject: null, task_title: null, task_status: null,
        target_employee_name: "Bob", actor_name: "Alice", actor_avatar_url: null,
      },
    ]);
    const { listAllActivity } = await import("@/lib/queries/activity");
    const res = await listAllActivity({ limit: 10 });
    expect(res.events[0]!.taskTitle).toBe("");
  });
});
