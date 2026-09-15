import { describe, it, expect, vi, beforeEach } from "vitest";
import { codeOf } from "../fixtures/source-code";

vi.mock("server-only", () => ({}));

/**
 * THE REPORTING HIERARCHY — moves, cycles, and history.
 *
 * ── WHAT THIS FILE IS REALLY PROTECTING ────────────────────────────────────
 * Two things that would each be a serious outage:
 *
 *   1. A CYCLE. Every downline query in the application is a recursive CTE over
 *      `employees.manager_id`. One loop makes goals, productivity, appraisal and
 *      the delegated-access hierarchy check hang or error for everybody in it.
 *      The old `editEmployee` refused only self-assignment, so making your own
 *      report your manager went straight through.
 *
 *   2. A FAN-OUT. The brief warns against rewriting historical rows' manager
 *      ids. There is a test below whose only job is to fail if this module ever
 *      starts writing to tasks, goals, KPI or DCC.
 */

/** Rows keyed by employee id, standing in for the `employees` table. */
const { managerOf, history, updates } = vi.hoisted(() => ({
  managerOf: new Map<string, string | null>(),
  history: [] as {
    id: string;
    employeeId: string;
    managerId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    note: string | null;
  }[],
  updates: [] as { table: string; patch: Record<string, unknown>; id?: string }[],
}));

let nextId = 1;

/**
 * A tiny in-memory query engine standing in for Drizzle.
 *
 * ── WHY A MATCHER AND NOT A SHAPE-SNIFFER ──────────────────────────────────
 * The first version of this stub keyed off the exact `where` shape each call
 * site built (`and(eq, isNull)` vs a bare `eq`), which made the tests fail the
 * moment a query was written a slightly different way — testing the query's
 * spelling rather than its meaning.
 *
 * So conditions are modelled as a flat list of `{column, value}` predicates
 * (see the `drizzle-orm` mock below) and rows are filtered by matching all of
 * them. It handles any combination of `eq` / `isNull` / `and` on these two
 * tables, which is what the module builds today and what it is likely to build
 * tomorrow.
 *
 * Anything it genuinely cannot serve throws, so a new query cannot pass this
 * suite by silently returning nothing.
 */
interface Predicate {
  col: string;
  val?: unknown;
  isNull?: boolean;
}
interface Condition {
  parts: Predicate[];
}

function matches(row: Record<string, unknown>, cond: Condition | undefined): boolean {
  if (!cond) return true;
  return cond.parts.every((p) => (p.isNull ? row[p.col] == null : row[p.col] === p.val));
}

function makeDb() {
  const rowsOf = (table: { __name: string }): Record<string, unknown>[] => {
    if (table.__name === "employee_manager_history") {
      return history as unknown as Record<string, unknown>[];
    }
    if (table.__name === "employees") {
      return [...managerOf.entries()].map(([id, managerId]) => ({ id, managerId }));
    }
    throw new Error(`unexpected table ${table.__name}`);
  };

  const api = {
    select: (_cols?: unknown) => ({
      from: (table: { __name: string }) => {
        const build = (cond?: Condition) => {
          const result = () => rowsOf(table).filter((r) => matches(r, cond));
          return {
            limit: (n: number) => Promise.resolve(result().slice(0, n)),
            orderBy: () => ({
              limit: (n: number) => Promise.resolve(result().slice(0, n)),
              then: (r: (v: unknown) => unknown) => Promise.resolve(result()).then(r),
            }),
            then: (r: (v: unknown) => unknown) => Promise.resolve(result()).then(r),
          };
        };
        return { where: (cond: Condition) => build(cond), ...build() };
      },
    }),
    insert: (table: { __name: string }) => ({
      values: async (v: Record<string, unknown>) => {
        if (table.__name !== "employee_manager_history") {
          throw new Error(`unexpected insert into ${table.__name}`);
        }
        history.push({
          id: `h${nextId++}`,
          employeeId: v.employeeId as string,
          managerId: (v.managerId as string | null) ?? null,
          effectiveFrom: v.effectiveFrom as string,
          effectiveTo: null,
          note: (v.note as string | null) ?? null,
        });
      },
    }),
    update: (table: { __name: string }) => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (cond: Condition) => {
          const id = cond.parts.find((p) => p.col === "id")?.val as string | undefined;
          updates.push({ table: table.__name, patch, id });
          if (table.__name === "employees") {
            managerOf.set(id!, (patch.managerId as string | null) ?? null);
            return;
          }
          const row = history.find((h) => h.id === id);
          if (!row) throw new Error(`history row ${id} not found`);
          if (patch.managerId !== undefined) row.managerId = patch.managerId as string | null;
          if (patch.note !== undefined) row.note = patch.note as string | null;
          // `effectiveTo` arrives as a raw SQL expression (today minus a day);
          // the stub records the marker the `sql` mock produced.
          if (patch.effectiveTo !== undefined) {
            row.effectiveTo = (patch.effectiveTo as { __closed?: string }).__closed ?? "closed";
          }
        },
      }),
    }),
    // `unknown` rather than `typeof api`: the transaction callback receives the
    // same object, which makes the type self-referential and leaves `api`
    // implicitly `any` (TS7022). The module under test types its own `tx`.
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(api),
  };
  return api;
}

vi.mock("@/lib/db", () => ({ db: makeDb() }));

vi.mock("@/db/schema", () => ({
  employees: { __name: "employees", id: "id", managerId: "managerId" },
  employeeManagerHistory: {
    __name: "employee_manager_history",
    id: "id",
    employeeId: "employeeId",
    managerId: "managerId",
    effectiveFrom: "effectiveFrom",
    effectiveTo: "effectiveTo",
  },
}));

/**
 * Conditions as a flat predicate list the stub above can evaluate.
 *
 * Real Drizzle builds opaque SQL. Here every operator returns `{ parts: [...] }`
 * and `and` concatenates them, so a `where` composed any way round evaluates to
 * the same filter — which is what the module means, as opposed to how it happens
 * to be written.
 */
type Parts = { parts: { col: string; val?: unknown; isNull?: boolean }[] };

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown): Parts => ({ parts: [{ col, val }] }),
  isNull: (col: string): Parts => ({ parts: [{ col, isNull: true }] }),
  and: (...conds: (Parts | undefined)[]): Parts => ({
    parts: conds.flatMap((c) => c?.parts ?? []),
  }),
  // `managerOn` / `reportsToOn` are not exercised here (they are pure reads over
  // the same rows), so these only need to compose without throwing.
  or: (...conds: (Parts | undefined)[]): Parts => ({
    parts: conds.flatMap((c) => c?.parts ?? []),
  }),
  lte: (col: string, val: unknown): Parts => ({ parts: [{ col, val }] }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      __closed: "closed",
      raw: strings.raw.join("?"),
      vals,
    }),
    { raw: (s: string) => ({ __raw: s }) },
  ),
}));

const { recordManagerChange, setReportingManager, wouldCreateCycle, managerHistoryFor } =
  await import("@/lib/employees/manager-history");

/** A single condition shape for the two "select from employees" call sites. */
function seedRoster(rows: Record<string, string | null>) {
  managerOf.clear();
  for (const [id, mgr] of Object.entries(rows)) managerOf.set(id, mgr);
}

beforeEach(() => {
  history.length = 0;
  updates.length = 0;
  nextId = 1;
  seedRoster({});
});

const TODAY = new Date("2026-09-10T06:00:00.000Z");

describe("cycle detection", () => {
  beforeEach(() => {
    // manan ← rohan ← rutvisha ← rudra
    seedRoster({ manan: null, rohan: "manan", rutvisha: "rohan", rudra: "rutvisha" });
  });

  it("allows a normal move", async () => {
    expect(await wouldCreateCycle("rudra", "rohan")).toBe(false);
    expect(await wouldCreateCycle("rudra", "manan")).toBe(false);
  });

  it("refuses making your own DIRECT report your manager", async () => {
    // The two-step cycle the old check let through: rutvisha manages rudra, so
    // rudra cannot become rutvisha's manager.
    expect(await wouldCreateCycle("rutvisha", "rudra")).toBe(true);
  });

  it("refuses making an INDIRECT report your manager", async () => {
    // rudra is two levels below rohan.
    expect(await wouldCreateCycle("rohan", "rudra")).toBe(true);
    // …and three below manan.
    expect(await wouldCreateCycle("manan", "rudra")).toBe(true);
  });

  it("refuses self-assignment", async () => {
    expect(await wouldCreateCycle("rudra", "rudra")).toBe(true);
  });

  it("terminates on data that ALREADY contains a loop", async () => {
    // Without the step cap this function would be the thing that hangs while
    // detecting hangs.
    seedRoster({ a: "b", b: "a" });
    expect(await wouldCreateCycle("c", "a")).toBe(false);
  });

  it("setReportingManager refuses a cycle with a readable message", async () => {
    const res = await setReportingManager({
      employeeId: "rutvisha",
      managerId: "rudra",
      changedById: "admin",
      now: TODAY,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/loop in the reporting chain/);
    // Nothing was written.
    expect(updates).toEqual([]);
    expect(history).toEqual([]);
  });

  it("setReportingManager refuses self-assignment", async () => {
    const res = await setReportingManager({
      employeeId: "rudra",
      managerId: "rudra",
      changedById: "admin",
      now: TODAY,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/their own manager/);
  });
});

describe("recording the reporting period", () => {
  it("opens the first period when there is no history", async () => {
    const res = await recordManagerChange({
      employeeId: "rudra",
      managerId: "rohan",
      changedById: "admin",
      now: TODAY,
    });
    expect(res.changed).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      employeeId: "rudra",
      managerId: "rohan",
      effectiveFrom: "2026-09-10",
      effectiveTo: null,
    });
  });

  it("closes the old period and opens a new one on a move", async () => {
    history.push({
      id: "h0",
      employeeId: "rudra",
      managerId: "rohan",
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
      note: null,
    });

    const res = await recordManagerChange({
      employeeId: "rudra",
      managerId: "rutvisha",
      changedById: "admin",
      now: TODAY,
    });

    expect(res.changed).toBe(true);
    expect(history).toHaveLength(2);
    // The August period is closed…
    expect(history[0]!.effectiveTo).not.toBeNull();
    // …and the new one starts today, still open.
    expect(history[1]).toMatchObject({
      managerId: "rutvisha",
      effectiveFrom: "2026-09-10",
      effectiveTo: null,
    });
  });

  it("records a move to NOBODY, which is a real state", async () => {
    history.push({
      id: "h0",
      employeeId: "rudra",
      managerId: "rohan",
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
      note: null,
    });
    await recordManagerChange({
      employeeId: "rudra",
      managerId: null,
      changedById: "admin",
      now: TODAY,
    });
    expect(history[1]!.managerId).toBeNull();
  });

  it("writes NOTHING when the manager has not changed", async () => {
    history.push({
      id: "h0",
      employeeId: "rudra",
      managerId: "rohan",
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
      note: null,
    });
    const res = await recordManagerChange({
      employeeId: "rudra",
      managerId: "rohan",
      changedById: "admin",
      now: TODAY,
    });
    // An audit trail whose entries are mostly "Rohan → Rohan" is one nobody
    // reads.
    expect(res.changed).toBe(false);
    expect(history).toHaveLength(1);
    expect(updates).toEqual([]);
  });

  it("rewrites the open period on a SAME-DAY correction, leaving no zero-length row", async () => {
    // A period from the 10th to the 10th followed by another from the 10th
    // would make "who managed them on the 10th" ambiguous.
    history.push({
      id: "h0",
      employeeId: "rudra",
      managerId: "rohan",
      effectiveFrom: "2026-09-10",
      effectiveTo: null,
      note: null,
    });
    const res = await recordManagerChange({
      employeeId: "rudra",
      managerId: "rutvisha",
      changedById: "admin",
      now: TODAY,
    });
    expect(res.changed).toBe(true);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      managerId: "rutvisha",
      effectiveFrom: "2026-09-10",
      effectiveTo: null,
    });
  });

  it("keeps exactly one open period through a sequence of moves", async () => {
    seedRoster({ rudra: null, rohan: null, rutvisha: null, manan: null });
    for (const [i, mgr] of ["rohan", "rutvisha", "manan"].entries()) {
      await recordManagerChange({
        employeeId: "rudra",
        managerId: mgr,
        changedById: "admin",
        // Different days, so each move opens its own period.
        now: new Date(`2026-0${7 + i}-01T06:00:00.000Z`),
      });
    }
    const open = history.filter((h) => h.employeeId === "rudra" && h.effectiveTo === null);
    expect(open).toHaveLength(1);
    expect(open[0]!.managerId).toBe("manan");
    expect(history).toHaveLength(3);
  });
});

describe("setReportingManager keeps the column and the history in step", () => {
  it("updates employees.manager_id AND records the period", async () => {
    seedRoster({ rudra: "rohan", rohan: null, rutvisha: null });
    const res = await setReportingManager({
      employeeId: "rudra",
      managerId: "rutvisha",
      changedById: "admin",
      now: TODAY,
    });
    expect(res).toEqual({ ok: true, changed: true });
    expect(managerOf.get("rudra")).toBe("rutvisha");
    expect(updates.some((u) => u.table === "employees")).toBe(true);
    expect(history.at(-1)).toMatchObject({ managerId: "rutvisha", effectiveTo: null });
  });

  it("reconciles history for a row whose column predates the table", async () => {
    // An employee set before 0220 existed, or by a path that predates it: the
    // column is right, the history is empty. Re-saving the same manager must
    // fill the gap without reporting a change.
    seedRoster({ rudra: "rohan", rohan: null });
    const res = await setReportingManager({
      employeeId: "rudra",
      managerId: "rohan",
      changedById: "admin",
      now: TODAY,
    });
    expect(res).toEqual({ ok: true, changed: false });
    expect(history).toHaveLength(1);
    expect(history[0]!.managerId).toBe("rohan");
  });

  it("refuses an unknown employee", async () => {
    seedRoster({});
    const res = await setReportingManager({
      employeeId: "ghost",
      managerId: null,
      changedById: "admin",
      now: TODAY,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/);
  });
});

describe("managerHistoryFor", () => {
  it("returns the periods oldest-first", async () => {
    history.push(
      { id: "h1", employeeId: "rudra", managerId: "rohan", effectiveFrom: "2026-08-01", effectiveTo: "2026-08-31", note: null },
      { id: "h2", employeeId: "rudra", managerId: "rutvisha", effectiveFrom: "2026-09-01", effectiveTo: null, note: "moved teams" },
      { id: "h3", employeeId: "other", managerId: "manan", effectiveFrom: "2026-01-01", effectiveTo: null, note: null },
    );
    const rows = await managerHistoryFor("rudra");
    expect(rows.map((r) => r.managerId)).toEqual(["rohan", "rutvisha"]);
    expect(rows[1]!.note).toBe("moved teams");
  });
});

describe("NO FAN-OUT — historical rows are never rewritten", () => {
  const source = codeOf("lib/employees/manager-history.ts");
  const boardActions = codeOf("app/(admin)/admin/hierarchy/actions.ts");

  it("touches only the two tables it owns", () => {
    // The brief: "Do not blindly update every historical task/goal record's
    // manager ID if that destroys historical reporting." Every consumer resolves
    // the manager from `employees.manager_id` live, so there is nothing to
    // fan out to — and this test fails if somebody adds one.
    for (const table of [
      "tasks",
      "goals",
      "dailyGoals",
      "dccKpiItems",
      "dccEntries",
      "weeklyGoals",
      "pmsMonthlyReview",
      "apprConfig",
      "salaryRuns",
    ]) {
      expect(source, table).not.toContain(table);
      expect(boardActions, table).not.toContain(table);
    }
  });

  it("the board action delegates to the one write path", () => {
    // Two doors (the employee editor and the Kanban board), one mechanism — so
    // they cannot disagree about what a legal tree is or forget the history.
    expect(boardActions).toMatch(/setReportingManager/);
    expect(boardActions).not.toMatch(/db\.update\(employees\)/);
  });

  it("the employee editor also records the period and checks for cycles", () => {
    const editor = codeOf("app/(admin)/admin/employees/actions.ts");
    expect(editor).toMatch(/recordManagerChange/);
    expect(editor).toMatch(/wouldCreateCycle/);
  });
});
