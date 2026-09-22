import type { PGlite } from "@electric-sql/pglite";

/**
 * DUMMY ROWS FOR THE JD BANK AND THE OPERATIONS CHECKLIST.
 *
 * Its own module because it is large and because these two only make sense
 * together: a checklist item can point back at a JD entry, so seeding them
 * apart produces two screens that each look populated and do not agree.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
 * Every rule in these modules is invisible against an empty database, so the
 * data is chosen to make each rule VISIBLE:
 *
 *   · A JD bank spanning ranks, positions and person-specific entries, so the
 *     bank's grouping, the rank ladder and the person picker all have shape.
 *   · Recurrence written as real rules, so the frequency column is not all
 *     "Daily".
 *   · A checklist TEMPLATE and a RUN of it against a real calendar event, which
 *     is the "PSO Checklist" vs "PSO Nashik Nov 26" distinction.
 *
 * NOBODY REAL IS IN HERE except `manan@unleashed.in`, seeded only so the
 * reporting line above the dummy admin is complete. It is a throwaway local
 * PGlite file; no password, no Firebase account, no access to anything.
 *
 * IDEMPOTENT: fixed UUIDs and `on conflict do nothing`, like the main seeder.
 */

/** Employee ids — the first six match scripts/dummy-db-seed.ts. */
const EMP = {
  me: "00000000-0000-4000-8000-000000000001",
  asha: "00000000-0000-4000-8000-000000000002",
  ravi: "00000000-0000-4000-8000-000000000003",
  meera: "00000000-0000-4000-8000-000000000004",
  imran: "00000000-0000-4000-8000-000000000005",
  long: "00000000-0000-4000-8000-000000000006",
  /**
   * The top of the dummy reporting line.
   *
   * A DIFFERENT id bank from the six above: `…-8000-…000007` is already Kavya
   * Menon, seeded by dummy-db-seed-hr-records.ts, and reusing it made the
   * insert a silent no-op under `on conflict do nothing`.
   */
  manan: "00000000-0000-4000-800f-000000000001",
} as const;

const DESIG = {
  manager: "00000000-0000-4000-8002-000000000001",
  executive: "00000000-0000-4000-8002-000000000002",
  lead: "00000000-0000-4000-8002-000000000003",
} as const;

const id = (bank: string, n: number) => `00000000-0000-4000-${bank}-${String(n).padStart(12, "0")}`;

/** A date N days from today as YYYY-MM-DD, in the machine's own calendar. */
function ymd(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── JD BANK ──────────────────────────────────────────────────────────────── */
const RANKS: [number, string, number, string][] = [
  [1, "Executive", 10, "Junior"],
  [2, "Senior Executive", 20, "Junior"],
  [3, "Team Lead", 30, "Middle"],
  [4, "Manager", 40, "Middle"],
];

/** [n, functionKey, rank n, title, holder] */
const POSITIONS: [number, string, number, string, string | null][] = [
  [1, "operations", 1, "Operations · Executive", EMP.ravi],
  [2, "operations", 3, "Operations · Team Lead", EMP.asha],
  [3, "accounts", 2, "Accounts · Senior Executive", EMP.meera],
  [4, "hr", 4, "HR · Manager", null], // vacant on purpose — escalation shows
];

/** [n, position n | null, owner | null, function, task, category, mins, recurrence, dcc, wms, event] */
const JD_ENTRIES: [number, number | null, string | null, string, string, string, number, string, boolean, boolean, boolean][] = [
  [1, 1, null, "operations", "Open the gate register and verify the night's entries", "Dispatch", 20, '{"kind":"daily"}', true, false, false],
  [2, 1, null, "operations", "Photograph every outbound load before it leaves", "Dispatch", 30, '{"kind":"daily"}', true, true, false],
  [3, 1, null, "operations", "Reconcile delivery challans against the day's dispatches", "Dispatch", 45, '{"kind":"weekdays","days":[0,1,2,3,4]}', false, true, false],
  [4, 2, null, "operations", "Review the team's DCC and sign off", "Supervision", 25, '{"kind":"daily"}', true, false, false],
  [5, 2, null, "operations", "Run the Monday operations huddle", "Supervision", 40, '{"kind":"weekdays","days":[0]}', false, true, false],
  [6, 3, null, "accounts", "Bank reconciliation for all three entities", "Finance", 60, '{"kind":"daily"}', true, false, false],
  [7, 3, null, "accounts", "File the monthly GST return", "Compliance", 120, '{"kind":"monthly_ordinal","ordinal":2,"weekday":5}', false, true, false],
  [8, 4, null, "hr", "Publish the month's holiday list", "HR Ops", 30, '{"kind":"yearly","month":1,"day":5}', false, true, false],
  // Personal JDs — owned by a person, not a seat (migration 0233).
  [9, null, EMP.imran, "operations", "Keep the support inbox under ten open tickets", "Support", 45, '{"kind":"daily"}', true, false, false],
  [10, null, EMP.imran, "operations", "Write the weekly support summary", "Support", 30, '{"kind":"weekdays","days":[4]}', false, true, false],
  [11, null, EMP.long, "accounts", "Spot-check three scrap disposal entries", "Audit", 35, '{"kind":"weekdays","days":[1,3]}', true, false, false],
];

/* ── OPERATIONS CHECKLIST ─────────────────────────────────────────────────── */
/** [code, title, category, offsetDays] — the PSO template's pattern. */
const PSO_ITEMS: [string, string, string, number][] = [
  ["PSO-01", "Confirm the venue booking in writing", "Venue", -21],
  ["PSO-02", "Send the invite to the registered list", "Comms", -14],
  ["PSO-03", "Print name badges and the attendance sheet", "Collateral", -3],
  ["PSO-04", "Brief the handholding team on the agenda", "Team", -2],
  ["PSO-05", "Carry the projector, clicker and spare HDMI", "Logistics", -1],
  ["PSO-06", "Open the hall and test audio", "Logistics", 0],
  ["PSO-07", "Run the session", "Delivery", 0],
  ["PSO-08", "Collect feedback forms before anyone leaves", "Delivery", 0],
  ["PSO-09", "Upload the attendance sheet to Drive", "Follow-up", 1],
  ["PSO-10", "Call every no-show within two days", "Follow-up", 2],
];

const MONTHLY_ITEMS: [string, string, string, number][] = [
  ["MC-01", "Freeze the attendance register", "Payroll", 0],
  ["MC-02", "Reconcile petty cash", "Finance", 1],
  ["MC-03", "Circulate the month's compliance summary", "Reporting", 3],
];

/**
 * Resolve a row that is UNIQUE ON NAME, creating it only if absent.
 *
 * The migrations already ship some of these — `jd_ranks` carries the 26-rank
 * ladder from 0226, and a fixed-id insert collides on the NAME constraint,
 * which `on conflict (id) do nothing` does not catch. So the seed asks what is
 * there before it decides to own the row, and returns whichever id wins.
 */
async function ensureNamed(
  pg: PGlite,
  table: string,
  name: string,
  fixedId: string,
  insert: (theId: string) => Promise<void>,
): Promise<string> {
  const found = await pg.query<{ id: string }>(
    `select id from ${table} where lower(name) = lower($1) limit 1`,
    [name],
  );
  if (found.rows[0]) return found.rows[0].id;
  await insert(fixedId);
  return fixedId;
}

export async function seedJdChecklist(pg: PGlite): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = async (table: string) => {
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    counts[table] = r.rows[0]?.n ?? 0;
  };

  /* ── Manan Vasa ─────────────────────────────────────────────────────────
     The top of the line, so the dummy admin has somebody to report to. */
  await pg.query(
    `insert into employees (id, name, email, role, is_admin, is_active, designation_id, joined_at)
     values ($1, 'Manan Vasa', 'manan@unleashed.in', 'both'::employee_role, true, true, $2,
             now() - interval '900 days')
     on conflict (id) do nothing`,
    [EMP.manan, DESIG.manager],
  );

  /* The reporting line. Team scoping everywhere is read from
     employees.manager_id, so without it every such feature degrades to
     "just me". */
  const LINE: [string, string][] = [
    [EMP.asha, EMP.manan],
    [EMP.me, EMP.manan],
    [EMP.ravi, EMP.asha],
    [EMP.imran, EMP.asha],
    [EMP.meera, EMP.me],
    [EMP.long, EMP.me],
  ];
  for (const [child, manager] of LINE) {
    await pg.query(`update employees set manager_id = $2 where id = $1`, [child, manager]);
  }

  /* ── JD Bank ─────────────────────────────────────────────────────────── */
  /* rank_order is unique too, so a new rank takes the next free slot rather
     than the number in RANKS — which may already belong to a shipped rank. */
  const nextOrder = await pg.query<{ n: number }>(
    `select coalesce(max(rank_order), 0)::int + 1 as n from jd_ranks`,
  );
  let order = nextOrder.rows[0]?.n ?? 1;
  const rankIds = new Map<number, string>();
  for (const [n, name, , band] of RANKS) {
    const resolved = await ensureNamed(pg, "jd_ranks", name, id("8012", n), async (theId) => {
      await pg.query(
        `insert into jd_ranks (id, name, rank_order, band) values ($1,$2,$3,$4)
         on conflict do nothing`,
        [theId, name, order++, band],
      );
    });
    rankIds.set(n, resolved);
  }

  for (const [n, fn, rankN, title, holder] of POSITIONS) {
    await pg.query(
      `insert into jd_positions (id, function_key, rank_id, title, created_by_id)
       values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
      [id("8013", n), fn, rankIds.get(rankN)!, title, EMP.me],
    );
    if (holder) {
      await pg.query(
        `insert into jd_position_holders (id, position_id, employee_id)
         values ($1,$2,$3) on conflict do nothing`,
        [id("8013", 100 + n), id("8013", n), holder],
      );
    }
  }
  await bump("jd_positions");

  for (const [n, posN, owner, fn, task, category, mins, rec, dcc, wms, event] of JD_ENTRIES) {
    await pg.query(
      `insert into jd_entries
         (id, position_id, owner_employee_id, function_key, task, category, recurrence,
          estimated_minutes, push_dcc, push_wms, push_event, created_by_id, notes_html)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
       on conflict (id) do nothing`,
      [
        id("8014", n),
        posN === null ? null : id("8013", posN),
        owner,
        fn,
        task,
        category,
        rec,
        mins,
        dcc,
        wms,
        event,
        EMP.me,
        `<p>Dummy job description — ${category.toLowerCase()}.</p>`,
      ],
    );
  }
  await bump("jd_entries");

  /* People named on a JD from a seat that is not their own — this is what the
     person view's "Assigned to them by name" section reads. */
  const ASSIGN: [number, string, boolean, boolean, boolean][] = [
    [2, EMP.imran, true, true, false],
    [3, EMP.long, false, true, false],
    [4, EMP.me, true, false, false],
    [6, EMP.long, true, false, false],
    [7, EMP.meera, false, true, true],
  ];
  let aN = 0;
  for (const [jdN, emp, dcc, wms, event] of ASSIGN) {
    await pg.query(
      `insert into jd_assignments (id, jd_id, employee_id, for_dcc, for_wms, for_event, assigned_by_id)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
      [id("8014", 900 + ++aN), id("8014", jdN), emp, dcc, wms, event, EMP.me],
    );
  }
  await bump("jd_assignments");

  /* ── Operations checklist ────────────────────────────────────────────── */
  const psoCategory = await ensureNamed(pg, "event_categories", "PSO", id("8016", 1), async (theId) => {
    await pg.query(
      `insert into event_categories (id, name, color, sort_order)
       values ($1, 'PSO', '#E10600', 10) on conflict do nothing`,
      [theId],
    );
  });
  // The specific event a run is anchored to.
  await pg.query(
    `insert into calendar_events (id, title, category_id, event_date, all_day, source, created_by_id)
     values ($1, 'PSO Nashik', $2, $3, true, 'manual', $4) on conflict (id) do nothing`,
    [id("8016", 2), psoCategory, ymd(12), EMP.me],
  );

  /* A TEMPLATE is the reusable pattern (offsets, no dates); a RUN is that
     template applied to one event on one date, and the run owns the ticks.
     Items belong to EXACTLY ONE of the two — which is what "added to this
     event only, not to the master" means in storage. */
  const TEMPLATES: [number, string, boolean, string, [string, string, string, number][]][] = [
    [1, "PSO Checklist", true, "The standard pre- and post-session list for a PSO.", PSO_ITEMS],
    [2, "Monthly Close", false, "A standing operational list — no event anchor.", MONTHLY_ITEMS],
  ];
  let itemN = 0;
  const templateIds = new Map<number, string>();
  for (const [n, name, isEvent, description, rows] of TEMPLATES) {
    const tid = await ensureNamed(pg, "ops_checklist_templates", name, id("8015", n), async (theId) => {
      await pg.query(
        `insert into ops_checklist_templates (id, name, is_event, description, created_by_id)
         values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [theId, name, isEvent, description, EMP.me],
      );
    });
    templateIds.set(n, tid);
    for (const [code, title, category, offset] of rows) {
      await pg.query(
        `insert into ops_checklist_items
           (id, template_id, code, title, category, offset_days, sort_order, created_by_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
        [id("8015", 100 + ++itemN), tid, code, title, category, offset, itemN, EMP.me],
      );
    }
  }
  await bump("ops_checklist_templates");

  return counts;
}
