import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WCC / MCC — BULK UPLOAD AND MCC FREQUENCIES, SAVED (migration 0240).
 *
 * The real server actions against a real Postgres (PGlite, in memory) with
 * 0238, 0239 and 0240 applied: what a bulk upload writes for each checklist,
 * what the check-only pass reports, that a sheet with a problem adds nothing,
 * that an MCC frequency is stored and obeyed, and that a database 0240 has not
 * reached still saves a Doer Status. Auth and the calendar are stubbed; the
 * assignment rule ("any active employee may be given a compliance") is the real
 * one, so the employees table is seeded and an unknown id is what gets refused.
 */

const h = vi.hoisted(() => ({
  pg: null as unknown as import("@electric-sql/pglite").PGlite,
  me: { id: "", isAdmin: false, email: "lead@example.com" },
  manageable: new Set<string>(),
  /** Holds `dcc.edit_past_entries` — may change a lapsed row. */
  editsPast: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current", () => ({ requireUser: vi.fn(async () => h.me) }));
vi.mock("@/lib/auth/super-admin", () => ({ isSuperAdmin: () => false }));
vi.mock("@/lib/security/capabilities", () => ({ canEditPastDccEntries: () => h.editsPast }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: () => null }));
vi.mock("@/lib/dcc/calendar-sync", () => ({ scheduleDccCalendarSync: vi.fn() }));
vi.mock("@/lib/dcc/access", () => ({
  loadDccScope: vi.fn(async () => ({ visibleIds: h.manageable })),
  // The WCC / MCC scope. Not a coordinator here — this file is about the two
  // checklists' own rules (bulk upload, MCC frequencies, the day lock), and the
  // grant has its own cases in tests/unit/compliance-quantity-actions.test.ts.
  loadComplianceScope: vi.fn(async () => ({
    visibleIds: h.manageable,
    chainIds: h.manageable,
    isSuper: false,
    isManager: false,
    isCoordinator: false,
  })),
  canManageItemsFor: (_scope: unknown, id: string) => h.manageable.has(id),
  isComplianceCoordinator: vi.fn(async () => false),
}));
vi.mock("@/lib/dcc/item-guard", () => ({ guardItemWrite: vi.fn(async () => ({ ok: true, owner: h.me.id })) }));
vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/db/schema");
  h.pg = new PGlite();
  return { db: drizzle(h.pg, { schema }) };
});

import {
  bulkAddCompliances,
  saveComplianceItem,
  setComplianceApprover,
  setComplianceDoer,
  setComplianceMinutes,
} from "@/app/(app)/dcc/compliance-actions";

const LEAD = "11111111-1111-4111-8111-111111111111";
const PRIYA = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
/** Not an employees row at all — what "not on the active list" is for. */
const GHOST = "99999999-9999-4999-8999-999999999999";

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
const M0240 = readFileSync("db/migrations/0240_mcc_frequencies.sql", "utf8");
const M0241 = readFileSync("db/migrations/0241_wcc_mcc_abandoned.sql", "utf8");
const M0242 = readFileSync("db/migrations/0242_wcc_minutes.sql", "utf8");

beforeAll(async () => {
  await h.pg.exec(BEFORE_0238);
  await h.pg.exec(readFileSync("db/migrations/0238_wcc_mcc.sql", "utf8"));
  await h.pg.exec(readFileSync("db/migrations/0239_wcc_mcc_completed_quantity.sql", "utf8"));
  await h.pg.exec(M0240);
  await h.pg.exec(M0240); // applied by hand, so it must survive a second run
  await h.pg.exec(M0241);
  await h.pg.exec(M0241);
  await h.pg.exec(M0242);
  await h.pg.exec(M0242);
  await h.pg.query(`INSERT INTO employees (id, name) VALUES ($1, 'Tara Lead'), ($2, 'Priya Shah'), ($3, 'Sam Stranger')`, [LEAD, PRIYA, STRANGER]);
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
  setToday("2026-09-20");
  h.me = { id: LEAD, isAdmin: false, email: "lead@example.com" };
  h.manageable = new Set([LEAD, PRIYA]);
  h.editsPast = false;
  await h.pg.exec(`DELETE FROM dcc_entries; DELETE FROM dcc_kpi_items;`);
});

type ItemRow = {
  owner_employee_id: string;
  title: string;
  section: string | null;
  frequency: string;
  weekdays: number;
  schedule_kind: string;
  month_day: number | null;
  mcc_frequency: string | null;
  mcc_days: number[] | null;
  mcc_start_month: number | null;
  target_number: string | null;
  unit: string | null;
  created_by_id: string;
};
async function items(): Promise<ItemRow[]> {
  return (
    await h.pg.query<ItemRow>(
      `SELECT owner_employee_id, title, section, frequency, weekdays, schedule_kind, month_day, mcc_frequency, mcc_days,
              mcc_start_month, target_number::text AS target_number, unit, created_by_id
         FROM dcc_kpi_items ORDER BY title`,
    )
  ).rows;
}

const mccRow = (line: number, title: string, over: Record<string, unknown> = {}) => ({
  line,
  ownerEmployeeId: PRIYA,
  title,
  section: null,
  mccFrequency: "monthly" as const,
  mccDays: [5],
  mccStartMonth: null,
  ...over,
});

describe("bulk upload — MCC", () => {
  it("adds every row with its frequency, deadlines, month and Target", async () => {
    const res = await bulkAddCompliances({
      kind: "mcc",
      rows: [
        mccRow(4, "A · Send the MIS", { mccFrequency: "twice_monthly", mccDays: [15, null], section: "Reporting" }),
        mccRow(5, "B · File the TDS return", { mccFrequency: "quarterly", mccDays: [null], mccStartMonth: 7 }),
        mccRow(6, "C · Visit client sites", { mccDays: [20], targetQuantity: 12, unit: "visits", ownerEmployeeId: LEAD }),
      ],
    });
    expect(res).toEqual({ ok: true, dryRun: false, created: 3 });
    expect(await items()).toEqual([
      expect.objectContaining({
        title: "A · Send the MIS", section: "Reporting", owner_employee_id: PRIYA, schedule_kind: "monthly", frequency: "2 times/month",
        month_day: 15, mcc_frequency: "twice_monthly", mcc_days: [15, 31], mcc_start_month: null, created_by_id: LEAD,
      }),
      expect.objectContaining({ title: "B · File the TDS return", frequency: "Quarterly", month_day: null, mcc_frequency: "quarterly", mcc_days: null, mcc_start_month: 7 }),
      expect.objectContaining({ title: "C · Visit client sites", owner_employee_id: LEAD, frequency: "Monthly", month_day: 20, target_number: "12.00", unit: "visits" }),
    ]);
  });

  it("checks only, on a dry run — and says what is wrong with each row", async () => {
    await bulkAddCompliances({ kind: "mcc", rows: [mccRow(4, "Pay GST")] });
    const res = await bulkAddCompliances({
      kind: "mcc",
      dryRun: true,
      rows: [
        mccRow(4, "pay  GST"),
        mccRow(5, "Renew licence"),
        mccRow(6, "Renew Licence"),
        mccRow(7, "Not a person's", { ownerEmployeeId: GHOST }),
        mccRow(8, "No month", { mccFrequency: "annually", mccDays: [null] }),
        mccRow(9, "Days out of order", { mccFrequency: "twice_monthly", mccDays: [20, 10] }),
      ],
    });
    expect(res).toEqual({
      ok: true,
      dryRun: true,
      problems: [
        { line: 4, error: "Already on Priya Shah's MCC." },
        { line: 6, error: "The same compliance for Priya Shah as row 5." },
        { line: 7, error: "That employee is not on the active list." },
        { line: 8, error: "Pick the month Annually is due in." },
        { line: 9, error: "The deadline days must be different and in order — e.g. the 15th, then month-end." },
      ],
    });
    expect((await items()).map((i) => i.title)).toEqual(["Pay GST"]);
  });

  it("adds nothing when any row has a problem", async () => {
    const res = await bulkAddCompliances({
      kind: "mcc",
      rows: [mccRow(4, "Fine"), mccRow(5, "Broken", { mccFrequency: "quarterly", mccDays: [5] })],
    });
    expect(res).toEqual({
      ok: false,
      error: "1 row needs fixing — nothing was added.",
      problems: [{ line: 5, error: "Pick the month Quarterly is due in." }],
    });
    expect(await items()).toEqual([]);
  });

  it("tells MCC and WCC apart: the same title may sit on both", async () => {
    await bulkAddCompliances({ kind: "wcc", rows: [{ line: 4, ownerEmployeeId: PRIYA, title: "Review", wccMode: "days", weekdays: [0] }] });
    const res = await bulkAddCompliances({ kind: "mcc", rows: [mccRow(4, "Review")] });
    expect(res).toMatchObject({ ok: true, created: 1 });
  });

  it("refuses more rows than one upload takes, and none at all", async () => {
    expect(await bulkAddCompliances({ kind: "mcc", rows: [] })).toEqual({ ok: false, error: "There are no rows to add." });
    const many = Array.from({ length: 501 }, (_, i) => mccRow(i + 4, `Row ${i}`));
    expect(await bulkAddCompliances({ kind: "mcc", rows: many })).toEqual({ ok: false, error: "Upload at most 500 rows at a time." });
  });
});

describe("bulk upload — WCC", () => {
  it("adds Mon to Sat, Mon to Sun and Each Day of the Week with their weekday masks", async () => {
    const res = await bulkAddCompliances({
      kind: "wcc",
      rows: [
        { line: 4, ownerEmployeeId: PRIYA, title: "A · Call every lead", wccMode: "days", weekdays: [0, 1, 2, 3, 4, 5] },
        { line: 5, ownerEmployeeId: PRIYA, title: "B · Check the CCTV", wccMode: "days", weekdays: [0, 1, 2, 3, 4, 5, 6] },
        { line: 6, ownerEmployeeId: PRIYA, title: "C · Send 25 emails", wccMode: "days", weekdays: [0, 2, 4], targetQuantity: 25, unit: "emails" },
      ],
    });
    expect(res).toEqual({ ok: true, dryRun: false, created: 3 });
    // The stored `frequency` text stays in words DCC's own reader understands.
    expect((await items()).map((i) => [i.title, i.schedule_kind, i.weekdays, i.frequency, i.mcc_frequency])).toEqual([
      ["A · Call every lead", "scheduled", 0b0111111, "Daily", null],
      ["B · Check the CCTV", "scheduled", 0b1111111, "Mon, Tue, Wed, Thu, Fri, Sat & Sun", null],
      ["C · Send 25 emails", "scheduled", 0b0010101, "Mon, Wed & Fri", null],
    ]);
  });

  it("still saves an older once-a-week compliance when it is edited", async () => {
    expect(
      await saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "wcc", title: "Weekly numbers", wccMode: "weekly", weekdays: [5] }),
    ).toEqual({ ok: true });
    expect((await items()).map((i) => [i.schedule_kind, i.weekdays, i.frequency])).toEqual([["weekly", 0b0100000, "Every Saturday"]]);
  });

  it("refuses Selected days with no day", async () => {
    const res = await bulkAddCompliances({ kind: "wcc", dryRun: true, rows: [{ line: 4, ownerEmployeeId: PRIYA, title: "X", wccMode: "days", weekdays: [] }] });
    expect(res).toEqual({ ok: true, dryRun: true, problems: [{ line: 4, error: "Pick at least one day, or the compliance will never be due." }] });
  });
});

describe("MCC frequencies from the pop-up, and the deadlines they make", () => {
  const save = (over: Record<string, unknown>) =>
    saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "mcc", title: "File it", ...over });

  it("stores each frequency, and refuses one that is incomplete", async () => {
    expect(await save({ title: "Half", mccFrequency: "half_yearly", mccDays: [15], mccStartMonth: 10 })).toEqual({ ok: true });
    expect(await save({ title: "Three", mccFrequency: "thrice_monthly", mccDays: [10, 20, null] })).toEqual({ ok: true });
    expect(await save({ title: "Old way", monthDay: 7 })).toEqual({ ok: true });
    expect(await save({ title: "Bad", mccFrequency: "thrice_monthly", mccDays: [10, 20] })).toEqual({ ok: false, error: "3 times/month needs 3 deadline days." });
    expect((await items()).map((i) => [i.title, i.frequency, i.month_day, i.mcc_frequency, i.mcc_days, i.mcc_start_month])).toEqual([
      ["Half", "Half Yearly", 15, "half_yearly", null, 10],
      ["Old way", "Monthly", 7, "monthly", null, null],
      ["Three", "3 times/month", 10, "thrice_monthly", [10, 20, 31], null],
    ]);
  });

  it("keeps each deadline of 2 times/month to its own fill, and refuses a date that is not one", async () => {
    h.me = { id: PRIYA, isAdmin: false, email: "priya@example.com" };
    await save({ title: "Twice", mccFrequency: "twice_monthly", mccDays: [15, null] });
    const [{ id }] = (await h.pg.query<{ id: string }>(`SELECT id FROM dcc_kpi_items`)).rows as [{ id: string }];
    expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-15", doerStatus: "done" })).toEqual({ ok: true });
    expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-30", doerStatus: "initiated" })).toEqual({ ok: true });
    expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-20", doerStatus: "done" })).toEqual({
      ok: false,
      error: "That date is not one of this compliance's deadlines — refresh the page and try again.",
    });
    const fills = (await h.pg.query<{ d: string; s: string }>(`SELECT to_char(entry_date, 'YYYY-MM-DD') AS d, doer_status AS s FROM dcc_entries ORDER BY 1`)).rows;
    expect(fills).toEqual([
      { d: "2026-09-15", s: "done" },
      { d: "2026-09-30", s: "initiated" },
    ]);
  });

  it("still saves a Doer Status on a database 0240 has not reached", async () => {
    h.me = { id: PRIYA, isAdmin: false, email: "priya@example.com" };
    await save({ title: "Monthly", monthDay: 7 });
    const [{ id }] = (await h.pg.query<{ id: string }>(`SELECT id FROM dcc_kpi_items`)).rows as [{ id: string }];
    await h.pg.exec(`ALTER TABLE dcc_kpi_items DROP COLUMN mcc_frequency, DROP COLUMN mcc_days, DROP COLUMN mcc_start_month`);
    try {
      expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-07", doerStatus: "done" })).toEqual({ ok: true });
      // Adding one needs 0240 — and says so.
      expect(await save({ title: "Another" })).toEqual({
        ok: false,
        error: "Could not save the compliance. If this keeps happening, migrations 0238, 0240 and 0242 may not have been run.",
      });
    } finally {
      await h.pg.exec(M0240);
    }
  });
});

describe("carried forward, then lapsed — on the server", () => {
  // 2026-09-14 is a Monday.
  const asPriya = () => (h.me = { id: PRIYA, isAdmin: false, email: "priya@example.com" });
  async function wcc(title: string, weekdays: number[]) {
    asPriya();
    await saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "wcc", title, wccMode: "days", weekdays });
    return (await h.pg.query<{ id: string }>(`SELECT id FROM dcc_kpi_items WHERE title = $1`, [title])).rows[0]!.id;
  }
  const doer = (itemId: string, deadline: string, over: Record<string, unknown> = { doerStatus: "done" }) =>
    setComplianceDoer({ itemId, deadline, ...over });
  const lapsedOn = (day: string) => ({ ok: false, error: `This one lapsed on ${day} — what was filled can no longer be changed.` });

  it("a daily one is open only on its day — yesterday's Need Info is frozen, even its note", async () => {
    const id = await wcc("Call every lead", [0, 1, 2, 3, 4, 5]);
    setToday("2026-09-15");
    expect(await doer(id, "2026-09-15", { doerStatus: "need_info" })).toEqual({ ok: true });
    setToday("2026-09-16");
    expect(await doer(id, "2026-09-15")).toEqual(lapsedOn("Wed 16 Sep"));
    expect(await doer(id, "2026-09-15", { notes: "Done late" })).toEqual(lapsedOn("Wed 16 Sep"));
    expect(await doer(id, "2026-09-16")).toEqual({ ok: true });
    expect(await doer(id, "2026-09-17")).toEqual({ ok: false, error: "This one is not open yet — it can be filled from Thu 17 Sep." });
  });

  it("Tue & Fri: Tuesday's is carried to Thursday and lapses on Friday; Friday's lapses on Sunday", async () => {
    const id = await wcc("Send the proposals", [1, 4]);
    setToday("2026-09-17");
    expect(await doer(id, "2026-09-15")).toEqual({ ok: true });
    expect(await doer(id, "2026-09-16")).toEqual({
      ok: false,
      error: "That date is not one of this compliance's deadlines — refresh the page and try again.",
    });
    setToday("2026-09-18");
    expect(await doer(id, "2026-09-15", { doerStatus: "initiated" })).toEqual(lapsedOn("Fri 18 Sep"));
    setToday("2026-09-19");
    expect(await doer(id, "2026-09-18")).toEqual({ ok: true });
    setToday("2026-09-20");
    expect(await doer(id, "2026-09-18", { doerStatus: "initiated" })).toEqual(lapsedOn("Sun 20 Sep"));
    // Done late, on the Thursday: the actual date is on record.
    const [tue] = (await h.pg.query<{ d: string }>(`SELECT to_char(done_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d FROM dcc_entries WHERE entry_date = '2026-09-15'`)).rows;
    expect(tue).toEqual({ d: "2026-09-17" });
  });

  it("lets the past-entry editor correct a lapsed row, and the Team Lead still rule on it", async () => {
    const id = await wcc("Close the day", [0, 1, 2, 3, 4, 5]);
    setToday("2026-09-15");
    expect(await doer(id, "2026-09-15")).toEqual({ ok: true });
    setToday("2026-09-18");
    expect(await doer(id, "2026-09-15", { doerStatus: "need_info" })).toEqual(lapsedOn("Wed 16 Sep"));
    h.me = { id: LEAD, isAdmin: false, email: "lead@example.com" };
    expect(await setComplianceApprover({ itemId: id, deadline: "2026-09-15", status: "approved" })).toEqual({ ok: true });
    h.editsPast = true;
    expect(await doer(id, "2026-09-15", { doerStatus: "need_info" })).toEqual({ ok: true });
  });

  it("MCC: carried to the day before the next deadline, the last to month-end", async () => {
    asPriya();
    await saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "mcc", title: "Reconcile", mccFrequency: "thrice_monthly", mccDays: [10, 20, null] });
    await saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "mcc", title: "GST", monthDay: 20 });
    const idOf = async (t: string) => (await h.pg.query<{ id: string }>(`SELECT id FROM dcc_kpi_items WHERE title = $1`, [t])).rows[0]!.id;
    const rec = await idOf("Reconcile");
    const gst = await idOf("GST");
    setToday("2026-09-19");
    expect(await doer(rec, "2026-09-10")).toEqual({ ok: true }); // carried 10th–19th
    setToday("2026-09-20");
    expect(await doer(rec, "2026-09-10", { doerStatus: "initiated" })).toEqual(lapsedOn("Sun 20 Sep"));
    expect(await doer(rec, "2026-09-20", { doerStatus: "initiated" })).toEqual({ ok: true }); // the 20th's own day
    // The month-end one opens the day after the 20th's deadline.
    expect(await doer(rec, "2026-09-30", { doerStatus: "initiated" })).toEqual({
      ok: false,
      error: "This one is not open yet — it can be filled from Mon 21 Sep.",
    });
    setToday("2026-09-30");
    expect(await doer(gst, "2026-09-20")).toEqual({ ok: true }); // carried to month-end
    setToday("2026-10-01");
    expect(await doer(gst, "2026-09-20", { doerStatus: "initiated" })).toEqual(lapsedOn("Thu 1 Oct"));
  });
});

describe("Abandoned, and WCC / MCC's four rulings — on the server", () => {
  async function tuesdayDaily() {
    h.me = { id: PRIYA, isAdmin: false, email: "priya@example.com" };
    await saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "wcc", title: "Call every lead", wccMode: "days", weekdays: [0, 1, 2, 3, 4, 5] });
    return (await h.pg.query<{ id: string }>(`SELECT id FROM dcc_kpi_items WHERE title = 'Call every lead'`)).rows[0]!.id;
  }
  const entry = async () =>
    (await h.pg.query<{ doer_status: string; status: string; approver_status: string | null }>(
      `SELECT doer_status, status, approver_status FROM dcc_entries`,
    )).rows[0];

  it("saves Abandoned, with \"Not done\" beside it for DCC", async () => {
    setToday("2026-09-15");
    const id = await tuesdayDaily();
    expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-15", doerStatus: "abandoned" })).toEqual({ ok: true });
    expect(await entry()).toMatchObject({ doer_status: "abandoned", status: "Not done" });
  });

  it("rules On Hold and Archive on an abandoned row, and refuses Cancelled", async () => {
    setToday("2026-09-15");
    const id = await tuesdayDaily();
    await setComplianceDoer({ itemId: id, deadline: "2026-09-15", doerStatus: "abandoned" });
    h.me = { id: LEAD, isAdmin: false, email: "lead@example.com" };
    const rule = (status: string) => setComplianceApprover({ itemId: id, deadline: "2026-09-15", status });
    expect(await rule("cancelled")).toEqual({ ok: false, error: "Pick Approved, Not Approved, On Hold or Archive." });
    expect(await rule("approved")).toEqual({ ok: false, error: "Approve or reject only after the Doer Status is Done." });
    expect(await rule("archived")).toEqual({ ok: true });
    expect(await entry()).toMatchObject({ approver_status: "archived", status: "NA" });
  });

  it("keeps an old DCC Done as Done when it is archived", async () => {
    setToday("2026-09-15");
    const id = await tuesdayDaily();
    // A fill from the old DCC board: only the old word, no Doer Status.
    await h.pg.query(`INSERT INTO dcc_entries (item_id, entry_date, status) VALUES ($1, '2026-09-15', 'Done')`, [id]);
    h.me = { id: LEAD, isAdmin: false, email: "lead@example.com" };
    expect(await setComplianceApprover({ itemId: id, deadline: "2026-09-15", status: "archived" })).toEqual({ ok: true });
    expect(await entry()).toMatchObject({ doer_status: "done", status: "NA", approver_status: "archived" });
    // Still Done: the Team Lead can change their mind to Approved.
    expect(await setComplianceApprover({ itemId: id, deadline: "2026-09-15", status: "approved" })).toEqual({ ok: true });
    expect(await entry()).toMatchObject({ doer_status: "done", status: "Done", approver_status: "approved" });
  });

  it("says which migration Abandoned needs, on a database 0241 has not reached", async () => {
    setToday("2026-09-15");
    const id = await tuesdayDaily();
    await h.pg.exec(`
      ALTER TABLE dcc_entries DROP CONSTRAINT dcc_entries_doer_status_chk;
      ALTER TABLE dcc_entries ADD CONSTRAINT dcc_entries_doer_status_chk CHECK (doer_status IS NULL
        OR doer_status IN ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));
    `);
    try {
      expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-15", doerStatus: "abandoned" })).toEqual({
        ok: false,
        error: "Could not save that. If this keeps happening, migration 0241 may not have been run.",
      });
      expect(await setComplianceDoer({ itemId: id, deadline: "2026-09-15", doerStatus: "done" })).toEqual({ ok: true });
    } finally {
      await h.pg.exec(M0241);
    }
  });
});

describe("WCC's Mins — on the server (migration 0242)", () => {
  const MINUTES_WORDS = "Mins is a whole number of minutes, 1 to 1440 — or leave it blank.";
  const minutesOf = async (title: string) =>
    (await h.pg.query<{ minutes: number | null }>(`SELECT minutes FROM dcc_kpi_items WHERE title = $1`, [title])).rows[0]?.minutes;
  const idOf = async (title: string) =>
    (await h.pg.query<{ id: string }>(`SELECT id FROM dcc_kpi_items WHERE title = $1`, [title])).rows[0]!.id;
  const add = (title: string, over: Record<string, unknown> = {}) =>
    saveComplianceItem({ ownerEmployeeId: PRIYA, kind: "wcc", title, wccMode: "days", weekdays: [0, 1, 2, 3, 4, 5], ...over });

  it("stores the Mins a compliance is added with; an edit leaves them unless it sends new ones", async () => {
    expect(await add("Call every lead", { minutes: 30 })).toEqual({ ok: true });
    expect(await minutesOf("Call every lead")).toBe(30);
    const itemId = await idOf("Call every lead");
    expect(await add("Call every lead", { itemId })).toEqual({ ok: true });
    expect(await minutesOf("Call every lead")).toBe(30);
    expect(await add("Call every lead", { itemId, minutes: 45 })).toEqual({ ok: true });
    expect(await minutesOf("Call every lead")).toBe(45);
    expect(await add("Call every lead", { itemId, minutes: null })).toEqual({ ok: true });
    expect(await minutesOf("Call every lead")).toBeNull();
  });

  it("refuses Mins that are not a whole number of minutes, 1 to 1440", async () => {
    for (const minutes of [0, 1441, 12.5]) expect(await add("X", { minutes })).toEqual({ ok: false, error: MINUTES_WORDS });
    expect(await items()).toEqual([]);
  });

  it("sets and clears the Mins from the table, for yourself and for your team", async () => {
    await add("Call every lead");
    const itemId = await idOf("Call every lead");
    // The Team Lead, for Priya.
    expect(await setComplianceMinutes({ itemId, minutes: 20 })).toEqual({ ok: true });
    expect(await minutesOf("Call every lead")).toBe(20);
    // Priya, her own.
    h.me = { id: PRIYA, isAdmin: false, email: "priya@example.com" };
    h.manageable = new Set([PRIYA]);
    expect(await setComplianceMinutes({ itemId, minutes: 25 })).toEqual({ ok: true });
    expect(await setComplianceMinutes({ itemId, minutes: null })).toEqual({ ok: true });
    expect(await minutesOf("Call every lead")).toBeNull();
  });

  it("refuses someone outside the team, a compliance that is gone, and a bad figure", async () => {
    await add("Call every lead", { minutes: 30 });
    const itemId = await idOf("Call every lead");
    expect(await setComplianceMinutes({ itemId, minutes: 0 })).toEqual({ ok: false, error: MINUTES_WORDS });
    h.me = { id: STRANGER, isAdmin: false, email: "sam@example.com" };
    h.manageable = new Set([STRANGER]);
    expect(await setComplianceMinutes({ itemId, minutes: 5 })).toEqual({
      ok: false,
      error: "You can set the Mins of your own compliances and your team's only.",
    });
    await h.pg.query(`UPDATE dcc_kpi_items SET archived = true WHERE id = $1`, [itemId]);
    h.me = { id: LEAD, isAdmin: false, email: "lead@example.com" };
    expect(await setComplianceMinutes({ itemId, minutes: 5 })).toEqual({ ok: false, error: "That compliance no longer exists." });
    expect(await minutesOf("Call every lead")).toBe(30);
  });

  it("adds the Mins from a bulk upload", async () => {
    const res = await bulkAddCompliances({
      kind: "wcc",
      rows: [
        { line: 4, ownerEmployeeId: PRIYA, title: "A · Call every lead", wccMode: "days", weekdays: [0, 1, 2, 3, 4, 5], minutes: 30 },
        { line: 5, ownerEmployeeId: PRIYA, title: "B · Check the CCTV", wccMode: "days", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      ],
    });
    expect(res).toEqual({ ok: true, dryRun: false, created: 2 });
    expect(await minutesOf("A · Call every lead")).toBe(30);
    expect(await minutesOf("B · Check the CCTV")).toBeNull();
  });

  it("says 0242 is missing on a database it has not reached — and the Doer Status still saves", async () => {
    setToday("2026-09-15");
    h.me = { id: PRIYA, isAdmin: false, email: "priya@example.com" };
    await add("Call every lead");
    const itemId = await idOf("Call every lead");
    await h.pg.exec(`ALTER TABLE dcc_kpi_items DROP COLUMN minutes`);
    try {
      expect(await setComplianceMinutes({ itemId, minutes: 5 })).toEqual({
        ok: false,
        error: "Could not save the Mins. If this keeps happening, migration 0242 may not have been run.",
      });
      expect(await setComplianceDoer({ itemId, deadline: "2026-09-15", doerStatus: "done" })).toEqual({ ok: true });
      // An edit that leaves Mins alone still saves.
      expect(await add("Call every lead", { itemId, section: "Calls" })).toEqual({ ok: true });
    } finally {
      await h.pg.exec(M0242);
    }
  });
});
