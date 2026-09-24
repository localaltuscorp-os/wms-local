import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WCC / MCC — THE COUNT, SAVED (migration 0239).
 *
 * The real server actions against a real Postgres (PGlite, in memory) with the
 * real 0238 and 0239 applied, because what matters here is SQL: the hand-built
 * INSERT with and without the count's columns, the numeric value_number beside
 * the integer count, the CHECK that refuses a negative, and a database that
 * 0239 has not reached yet. Auth, scope and the calendar are stubbed.
 */

const h = vi.hoisted(() => ({
  pg: null as unknown as import("@electric-sql/pglite").PGlite,
  me: { id: "", isAdmin: false, email: "doer@example.com" },
  /** Holds `dcc.coordinator` — may record against anybody's row (migration 0248). */
  coordinator: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current", () => ({ requireUser: vi.fn(async () => h.me) }));
vi.mock("@/lib/auth/super-admin", () => ({ isSuperAdmin: () => false }));
vi.mock("@/lib/security/capabilities", () => ({ canEditPastDccEntries: () => false }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: () => null }));
vi.mock("@/lib/dcc/calendar-sync", () => ({ scheduleDccCalendarSync: vi.fn() }));
vi.mock("@/lib/dcc/access", () => ({
  loadDccScope: vi.fn(async () => ({ visibleIds: new Set([h.me.id]) })),
  loadComplianceScope: vi.fn(async () => ({
    visibleIds: new Set([h.me.id]),
    chainIds: new Set([h.me.id]),
    isSuper: false,
    isManager: false,
    isCoordinator: h.coordinator,
  })),
  canManageItemsFor: () => true,
  isComplianceCoordinator: vi.fn(async () => h.coordinator),
}));
vi.mock("@/lib/dcc/item-guard", () => ({ guardItemWrite: vi.fn(async () => ({ ok: true, owner: h.me.id })) }));
vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/db/schema");
  h.pg = new PGlite();
  return { db: drizzle(h.pg, { schema }) };
});

import { saveComplianceItem, setComplianceDoer } from "@/app/(app)/dcc/compliance-actions";

const DOER = "11111111-1111-4111-8111-111111111111";
/** Somebody else, so "may I record against THEIR row" has something to ask about. */
const OTHER = "22222222-2222-4222-8222-222222222222";
const DAY = "2026-09-15";

/** DCC's two tables as they stood before 0238 — every column Drizzle writes. */
const BEFORE_0238 = `
  CREATE TABLE employees (id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE dcc_kpi_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_employee_id uuid NOT NULL REFERENCES employees(id),
    section text, code text, title text NOT NULL, frequency text, weekdays smallint,
    schedule_kind text NOT NULL DEFAULT 'scheduled',
    is_participant_list boolean NOT NULL DEFAULT false,
    client_id uuid, template_code text,
    needs_review boolean NOT NULL DEFAULT false,
    target_number numeric(14,2), unit text, sort_order integer,
    archived boolean NOT NULL DEFAULT false,
    created_by_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE dcc_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES dcc_kpi_items(id) ON DELETE CASCADE,
    entry_date date NOT NULL, status text, value_number numeric(14,2), note text,
    filled_by_id uuid, subject_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX dcc_entries_uq ON dcc_entries
    (item_id, entry_date, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
`;
const M0238 = readFileSync("db/migrations/0238_wcc_mcc.sql", "utf8");
const M0239 = readFileSync("db/migrations/0239_wcc_mcc_completed_quantity.sql", "utf8");
const M0240 = readFileSync("db/migrations/0240_mcc_frequencies.sql", "utf8");
const M0242 = readFileSync("db/migrations/0242_wcc_minutes.sql", "utf8");

beforeAll(async () => {
  await h.pg.exec(BEFORE_0238);
  await h.pg.exec(M0238);
  await h.pg.exec(M0239);
  await h.pg.exec(M0239); // applied by hand, so it must survive a second run
  await h.pg.exec(M0240);
  await h.pg.exec(M0242);
  await h.pg.query(`INSERT INTO employees (id, name) VALUES ($1, 'Priya'), ($2, 'Ravi')`, [DOER, OTHER]);
}, 60_000);

afterAll(async () => {
  await h.pg?.close();
});

// The rows open and lapse by the IST calendar day, so the clock is set — only
// Date is faked; PGlite's own timers run as they are.
function setToday(ymd: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${ymd}T12:00:00+05:30`));
}
afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
  setToday(DAY);
  h.me = { id: DOER, isAdmin: false, email: "doer@example.com" };
  h.coordinator = false;
  await h.pg.exec(`DELETE FROM dcc_entries; DELETE FROM dcc_kpi_items;`);
});

async function compliance(
  title: string,
  target: string | null = null,
  unit: string | null = null,
  ownerId: string = DOER,
): Promise<string> {
  const r = await h.pg.query<{ id: string }>(
    `INSERT INTO dcc_kpi_items (owner_employee_id, title, weekdays, schedule_kind, target_number, unit)
     VALUES ($1, $2, 63, 'scheduled', $3, $4) RETURNING id`,
    [ownerId, title, target, unit],
  );
  return r.rows[0]!.id;
}

type Fill = { doer_status: string | null; status: string | null; completed_quantity: number | null; value_number: string | null; done_at: Date | null };
async function fillOf(itemId: string): Promise<Fill | undefined> {
  const r = await h.pg.query<Fill>(
    `SELECT doer_status, status, completed_quantity, value_number::text AS value_number, done_at FROM dcc_entries WHERE item_id = $1`,
    [itemId],
  );
  return r.rows[0];
}

const doer = (itemId: string, over: Partial<Parameters<typeof setComplianceDoer>[0]>) =>
  setComplianceDoer({ itemId, deadline: DAY, ...over });

describe("a compliance that counts, marked Done", () => {
  it("will not be Done without how many — and writes nothing", async () => {
    const id = await compliance("Send 25 emails");
    const res = await doer(id, { doerStatus: "done" });
    expect(res).toEqual({ ok: false, error: "Enter how many were completed out of 25." });
    expect(await fillOf(id)).toBeUndefined();
  });

  it("records the count on Done, with DCC's value beside it", async () => {
    const id = await compliance("Send 25 emails");
    expect(await doer(id, { doerStatus: "done", completedQuantity: 18 })).toEqual({ ok: true });
    const f = await fillOf(id);
    expect(f).toMatchObject({ doer_status: "done", status: "Done", completed_quantity: 18, value_number: "18.00" });
    expect(f!.done_at).not.toBeNull();
  });

  it("takes the unit from the compliance's own Target in the message", async () => {
    const id = await compliance("Tele-calls to workshop leads", "50", "calls");
    expect(await doer(id, { doerStatus: "done" })).toEqual({ ok: false, error: "Enter how many were completed out of 50 calls." });
    expect(await doer(id, { doerStatus: "done", completedQuantity: 45 })).toEqual({ ok: true });
    expect(await fillOf(id)).toMatchObject({ completed_quantity: 45 });
  });

  it("lets the count be corrected while Done, keeping the actual date", async () => {
    const id = await compliance("Send 25 emails");
    await doer(id, { doerStatus: "done", completedQuantity: 18 });
    const before = (await fillOf(id))!.done_at;
    expect(await doer(id, { completedQuantity: 22 })).toEqual({ ok: true });
    const f = await fillOf(id);
    expect(f).toMatchObject({ doer_status: "done", completed_quantity: 22, value_number: "22.00" });
    expect(f!.done_at).toEqual(before);
  });

  it("keeps the count through a note, and through Done picked again", async () => {
    const id = await compliance("Send 25 emails");
    await doer(id, { doerStatus: "done", completedQuantity: 18 });
    expect(await doer(id, { notes: "Two bounced." })).toEqual({ ok: true });
    expect(await doer(id, { doerStatus: "done" })).toEqual({ ok: true });
    expect(await fillOf(id)).toMatchObject({ completed_quantity: 18, value_number: "18.00" });
  });

  it("clears the count when it leaves Done, and refuses a count on an open row", async () => {
    const id = await compliance("Send 25 emails");
    await doer(id, { doerStatus: "done", completedQuantity: 18 });
    expect(await doer(id, { doerStatus: "initiated" })).toEqual({ ok: true });
    expect(await fillOf(id)).toMatchObject({ doer_status: "initiated", completed_quantity: null, value_number: null, done_at: null });
    expect(await doer(id, { completedQuantity: 20 })).toEqual({
      ok: false,
      error: "Mark it Done first, then record how many were completed.",
    });
  });

  it("accepts 0, and more than the target", async () => {
    const zero = await compliance("Send 25 emails");
    expect(await doer(zero, { doerStatus: "done", completedQuantity: 0 })).toEqual({ ok: true });
    expect(await fillOf(zero)).toMatchObject({ completed_quantity: 0 });
    const over = await compliance("Make 10 calls");
    expect(await doer(over, { doerStatus: "done", completedQuantity: 12 })).toEqual({ ok: true });
    expect(await fillOf(over)).toMatchObject({ completed_quantity: 12 });
  });

  it("refuses a count that is not a whole number from 0", async () => {
    const id = await compliance("Send 25 emails");
    const words = "Enter how many were completed, as a whole number — 0 or more.";
    expect(await doer(id, { doerStatus: "done", completedQuantity: -1 })).toEqual({ ok: false, error: words });
    expect(await doer(id, { doerStatus: "done", completedQuantity: 2.5 })).toEqual({ ok: false, error: words });
    expect(await doer(id, { doerStatus: "done", completedQuantity: "18" as unknown as number })).toEqual({ ok: false, error: words });
    expect((await doer(id, { doerStatus: "done", completedQuantity: 1_000_001 })).ok).toBe(false);
    expect(await fillOf(id)).toBeUndefined();
  });
});

describe("a compliance that does not count", () => {
  it("is simply Done, with no count", async () => {
    const id = await compliance("Send update to Manan Sir");
    expect(await doer(id, { doerStatus: "done" })).toEqual({ ok: true });
    expect(await fillOf(id)).toMatchObject({ doer_status: "done", completed_quantity: null, value_number: null });
  });

  it("treats a target of one as nothing to count", async () => {
    const one = await compliance("Make 1 call");
    expect(await doer(one, { doerStatus: "done" })).toEqual({ ok: true });
    const silenced = await compliance("Send 25 emails", "1");
    expect(await doer(silenced, { doerStatus: "done" })).toEqual({ ok: true });
  });

  it("refuses a count", async () => {
    const id = await compliance("Send update to Manan Sir");
    expect(await doer(id, { doerStatus: "done", completedQuantity: 3 })).toEqual({
      ok: false,
      error: "This compliance has no quantity to count — just mark it Done.",
    });
  });
});

describe("the database", () => {
  it("refuses a negative count even from outside the app", async () => {
    const id = await compliance("Send 25 emails");
    await expect(
      h.pg.query(`INSERT INTO dcc_entries (item_id, entry_date, completed_quantity) VALUES ($1, $2, -1)`, [id, DAY]),
    ).rejects.toThrow(/dcc_entries_completed_quantity_chk/);
  });
});

describe("the Target on the add / edit pop-up", () => {
  const base = { ownerEmployeeId: DOER, kind: "wcc" as const, weekdays: [0, 1, 2, 3, 4, 5] };
  const itemRow = async () =>
    (await h.pg.query<{ id: string; target_number: string | null; unit: string | null }>(
      `SELECT id, target_number::text AS target_number, unit FROM dcc_kpi_items`,
    )).rows[0]!;

  it("saves a Target and unit with a new compliance", async () => {
    expect(await saveComplianceItem({ ...base, title: "Tele-calls", targetQuantity: 50, unit: "calls" })).toEqual({ ok: true });
    expect(await itemRow()).toMatchObject({ target_number: "50.00", unit: "calls" });
  });

  it("leaves the Target alone on an edit that does not send one, and clears it on one that sends none", async () => {
    await saveComplianceItem({ ...base, title: "Tele-calls", targetQuantity: 50, unit: "calls" });
    const { id } = await itemRow();
    await saveComplianceItem({ ...base, itemId: id, title: "Tele-calls to leads" });
    expect(await itemRow()).toMatchObject({ target_number: "50.00", unit: "calls" });
    await saveComplianceItem({ ...base, itemId: id, title: "Tele-calls to leads", targetQuantity: null, unit: null });
    expect(await itemRow()).toMatchObject({ target_number: null, unit: null });
  });

  it("refuses a Target below one or not whole", async () => {
    expect(await saveComplianceItem({ ...base, title: "X", targetQuantity: 0 })).toEqual({
      ok: false,
      error: "The target must be 1 or more — leave it blank for none.",
    });
    expect(await saveComplianceItem({ ...base, title: "X", targetQuantity: 2.5 })).toEqual({
      ok: false,
      error: "The target must be a whole number.",
    });
  });
});

describe("somebody else's row — the DCC Coordinator grant (migration 0248)", () => {
  const whoFilled = async (itemId: string) =>
    (await h.pg.query<{ doer_status: string | null; filled_by_id: string | null }>(
      `SELECT doer_status, filled_by_id FROM dcc_entries WHERE item_id = $1`,
      [itemId],
    )).rows[0];

  it("is refused without the grant, and writes nothing", async () => {
    const id = await compliance("Send 25 emails", null, null, OTHER);
    expect(await doer(id, { doerStatus: "done" })).toEqual({
      ok: false,
      error: "Only the person it belongs to can update their Doer Status.",
    });
    expect(await fillOf(id)).toBeUndefined();
  });

  it("saves with it, and the row records who actually typed it in", async () => {
    h.coordinator = true;
    // A title with no number, so this case is about the GRANT and not about the
    // count — "Send 25 emails" would need one, and that is the next test.
    const id = await compliance("Send update to Manan Sir", null, null, OTHER);
    expect(await doer(id, { doerStatus: "done" })).toEqual({ ok: true });
    // The grant lets somebody record another's work; it does not make the record
    // anonymous. `filled_by_id` is the coordinator, not the person on the row.
    expect(await whoFilled(id)).toMatchObject({ doer_status: "done", filled_by_id: DOER });
  });

  it("carries the count through too, since that is the same write", async () => {
    h.coordinator = true;
    const id = await compliance("Send 25 emails", null, null, OTHER);
    expect(await doer(id, { doerStatus: "done", completedQuantity: 18 })).toEqual({ ok: true });
    const f = await fillOf(id);
    expect(f).toMatchObject({ completed_quantity: 18, value_number: "18.00" });
  });

  it("still cannot touch a day that has closed", async () => {
    h.coordinator = true;
    const id = await compliance("Send 25 emails", null, null, OTHER);
    // The grant is about WHOSE row, not WHICH day. The day lock is a separate
    // rule (`dcc.edit_past_entries`, which stays Manan's) and this does not bend
    // it — ten days back has lapsed for a coordinator exactly as for everyone.
    const res = await doer(id, { doerStatus: "done", deadline: "2026-09-05" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/lapsed/);
  });
});

describe("before 0239 has run", () => {
  it("still saves a compliance that does not count, and says which migration a count needs", async () => {
    await h.pg.exec(`ALTER TABLE dcc_entries DROP COLUMN completed_quantity`);
    try {
      const plain = await compliance("Send update to Manan Sir");
      expect(await doer(plain, { doerStatus: "done" })).toEqual({ ok: true });
      const counted = await compliance("Send 25 emails");
      expect(await doer(counted, { doerStatus: "done", completedQuantity: 18 })).toEqual({
        ok: false,
        error: "Could not save that. If this keeps happening, migration 0239 may not have been run.",
      });
    } finally {
      await h.pg.exec(M0239);
    }
  });
});
