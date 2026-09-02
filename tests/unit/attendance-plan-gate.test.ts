import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/* The two reads countPlannedWork makes, in order:
 *   1. daily_checklist rows for the day  -> [{ taskId }]
 *   2. count of open assigned tasks      -> [{ n }]
 * Each is `db.select(...).from(...).where(...)`, so the chain is stubbed and
 * the awaited value is taken from a queue.                                   */
const { queue, whereCalls } = vi.hoisted(() => ({
  queue: [] as unknown[][],
  whereCalls: [] as unknown[][],
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        // Thenable AND chainable: countPlannedWork awaits `.where(...)` directly,
        // while hasStartedDay / isDayClosedOut add `.limit(1)`. Both must draw the
        // SAME queued row set, or adding a `.limit()` would silently shift every
        // later expectation by one.
        where: (...args: unknown[]) => {
          whereCalls.push(args);
          const rows = queue.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            limit: () => Promise.resolve(rows),
          });
        },
      }),
    }),
  },
  dailyChecklist: {}, dailyPlanDay: {}, goals: {}, weeklyGoals: {},
  weeklyGoalActuals: {}, tasks: { id: "tasks.id" }, employees: {},
}));

vi.mock("@/db/schema", () => ({
  dailyChecklist: { taskId: "dc.task_id", employeeId: "dc.emp", planDate: "dc.date" },
  dailyPlanDay: {}, goals: {}, weeklyGoals: {}, weeklyGoalActuals: {},
  tasks: { id: "t.id", doerId: "t.doer", archived: "t.archived", status: "t.status", createdAt: "t.created" },
  employees: {},
}));

const notInArrayMock = vi.fn((_col: unknown, vals: unknown[]) => ({ __notIn: vals }));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ __and: a.filter(Boolean) }),
  asc: () => ({}), desc: () => ({}), eq: () => ({}), lt: () => ({}),
  isNull: () => ({}), inArray: () => ({}),
  notInArray: (c: unknown, v: unknown[]) => notInArrayMock(c, v),
  sql: Object.assign(
    (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s.raw.join("?"), v }),
    { raw: (s: string) => ({ __raw: s }) },
  ),
}));

vi.mock("@/lib/tasks/effective-due", () => ({
  effectiveDueAtSql: () => ({ __raw: "effective_due" }),
  pickEffectiveDue: () => null,
}));
vi.mock("@/lib/weekly-goals/week", () => ({
  istYmd: () => "2026-08-18",
  currentWeekStart: () => "2026-08-17",
}));

const { countPlannedWork, hasStartedDay, isDayClosedOut } = await import(
  "@/lib/queries/daily-checklist"
);
const { needsDailyPlan, dailyPlanShortfall } = await import("@/lib/daily-checklist/gate");

beforeEach(() => {
  queue.length = 0;
  whereCalls.length = 0;
  notInArrayMock.mockClear();
});

describe("countPlannedWork — what the clock-in gate measures", () => {
  it("does NOT double-count a task that is both assigned and pulled onto the plan", async () => {
    // 3 checklist rows, all of them pulled tasks. The DB excludes those 3 from
    // the assigned count (notInArray), so it returns 0 more.
    queue.push([{ taskId: "t1" }, { taskId: "t2" }, { taskId: "t3" }], [{ n: 0 }]);
    expect(await countPlannedWork("emp-1", "2026-08-18")).toBe(3);
  });

  it("asks the database to exclude pulled tasks when any were pulled", async () => {
    queue.push([{ taskId: "t1" }, { taskId: "t2" }], [{ n: 0 }]);
    await countPlannedWork("emp-1", "2026-08-18");
    expect(notInArrayMock).toHaveBeenCalledTimes(1);
    expect(notInArrayMock.mock.calls[0]?.[1]).toEqual(["t1", "t2"]);
  });

  it("omits the exclusion entirely when nothing was pulled (empty NOT IN is invalid SQL)", async () => {
    queue.push([{ taskId: null }, { taskId: null }], [{ n: 4 }]);
    const n = await countPlannedWork("emp-1", "2026-08-18");
    expect(notInArrayMock).not.toHaveBeenCalled();
    expect(n).toBe(6); // 2 typed commitments + 4 assigned
  });

  it("counts assigned work on its own — someone who planned nothing but has tasks due", async () => {
    queue.push([], [{ n: 5 }]);
    expect(await countPlannedWork("emp-1", "2026-08-18")).toBe(5);
  });

  it("returns 0 for an empty day", async () => {
    queue.push([], [{ n: 0 }]);
    expect(await countPlannedWork("emp-1", "2026-08-18")).toBe(0);
  });
});

describe("hasStartedDay / isDayClosedOut — the two daily_plan_day stamps", () => {
  it("is started once started_at is stamped", async () => {
    queue.push([{ startedAt: new Date("2026-08-18T04:00:00Z") }]);
    expect(await hasStartedDay("emp-1", "2026-08-18")).toBe(true);
  });

  it("is NOT started with no row at all", async () => {
    queue.push([]);
    expect(await hasStartedDay("emp-1", "2026-08-18")).toBe(false);
  });

  it("is NOT started after reopenPlan nulls the stamp", async () => {
    queue.push([{ startedAt: null }]);
    expect(await hasStartedDay("emp-1", "2026-08-18")).toBe(false);
  });

  it("is closed out once closed_at is stamped (Finish Day)", async () => {
    queue.push([{ closedAt: new Date("2026-08-18T13:00:00Z") }]);
    expect(await isDayClosedOut("emp-1", "2026-08-18")).toBe(true);
  });

  it("an EMPTY plan no longer counts as closed out — that was the bypass", async () => {
    // Old behaviour returned true here ("nothing to close out"), which let
    // someone clear their plan after clocking in and walk straight out.
    queue.push([{ closedAt: null }]);
    expect(await isDayClosedOut("emp-1", "2026-08-18")).toBe(false);
  });
});

/* needsDailyPlan reads, in order (Promise.all, started first):
 *   1. daily_plan_day row      -> [{ startedAt }]
 *   2. daily_checklist rows    -> [{ taskId }]
 *   3. assigned-task count     -> [{ n }]                                    */
describe("needsDailyPlan — clock-in needs Start My Day AND five things", () => {
  it("blocks a full plan that was never started", async () => {
    queue.push([{ startedAt: null }], [], [{ n: 8 }]);
    expect(await needsDailyPlan("emp-1")).toBe(true);
  });

  it("blocks a started day that is one item short", async () => {
    queue.push([{ startedAt: new Date() }], [], [{ n: 4 }]);
    expect(await needsDailyPlan("emp-1")).toBe(true);
  });

  it("allows a started day with exactly five", async () => {
    queue.push([{ startedAt: new Date() }], [], [{ n: 5 }]);
    expect(await needsDailyPlan("emp-1")).toBe(false);
  });

  it("still dedupes: 3 pulled tasks + the same 3 assigned is 3, not 6 — so it blocks", async () => {
    queue.push(
      [{ startedAt: new Date() }],
      [{ taskId: "t1" }, { taskId: "t2" }, { taskId: "t3" }],
      [{ n: 0 }],
    );
    expect(await needsDailyPlan("emp-1")).toBe(true);
  });

  it("reports WHICH condition failed, so the punch can say the right thing", async () => {
    queue.push([{ startedAt: null }], [], [{ n: 7 }]);
    expect(await dailyPlanShortfall("emp-1")).toEqual({ have: 7, need: 5, started: false });

    queue.push([{ startedAt: new Date() }], [], [{ n: 2 }]);
    expect(await dailyPlanShortfall("emp-1")).toEqual({ have: 2, need: 5, started: true });
  });
});
