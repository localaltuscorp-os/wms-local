import type { PGlite } from "@electric-sql/pglite";

/**
 * THE WMS TASKS COLUMNS, FILLED — dummy data for migration 0237 (account
 * holder, 2026-09-18).
 *
 * The Event Checklist now reads S. No. · Client · Subject · Task · Doer ·
 * Initiator · Target Date · Frequency · Doer Status · Doer Notes · Actual Date ·
 * +/- Days · Approver Status · Approver Notes, and a person's JD reads S. No. ·
 * Client · Subject · Job Description · Target Date · Doer Notes. The earlier
 * seeders wrote the rows; this fills the new columns on them, so each table can
 * be judged full:
 *
 *   · Subjects — every subject Operations files under is on the Admin Panel's
 *     roster, which is where the Subject pickers now read from.
 *   · Clients on the onboarding checklists and on about half the event rows;
 *     clients on the client-facing JDs.
 *   · Initiators — the doer's manager on some rows, the doer themself on a few
 *     (those read "Not Applicable" for Approver Status, as on a WMS task).
 *   · Dates and repeats on the standing lists: the office list daily, the
 *     monthly close monthly with one quarterly row, onboarding one-off; a
 *     weekly row running up to each workshop.
 *   · Approver rulings and notes on finished work, and Doer Notes on some.
 *   · Doer Notes on a person's JD, from the people who hold the seats.
 *
 * FILLS BLANKS ONLY, deterministically — re-running it changes nothing, and it
 * never overwrites a value somebody set in the app. It only ever writes to the
 * local PGlite file (scripts/dummy-db-setup.ts).
 */

const DAY = 86_400_000;

/* Deterministic randomness — the same FNV-1a the showcase seeder uses. */
function rand(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** YYYY-MM-DD, `offset` days from today. */
function ymd(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(ymdStr: string, n: number): string {
  const t = Date.UTC(+ymdStr.slice(0, 4), +ymdStr.slice(5, 7) - 1, +ymdStr.slice(8, 10)) + n * DAY;
  return new Date(t).toISOString().slice(0, 10);
}

const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const wdOf = (ymdStr: string) => WD[new Date(`${ymdStr}T00:00:00Z`).getUTCDay()]!;

const pick = <T>(list: readonly T[], key: string): T => list[Math.floor(rand(key) * list.length)]!;

const DOER_NOTES_DONE = [
  "Done — photos are in the shared drive.",
  "Confirmed on call.",
  "Shared on the WhatsApp group.",
  "Signed copy filed in the red folder.",
  "Done early; vendor agreed to the old rate.",
];
const APPROVER_NOTES_NO = [
  "Photos missing — please upload them and re-mark Done.",
  "Wrong invoice attached. Redo.",
  "Only half the list was called. Finish the rest.",
];
const APPROVER_NOTES_YES = ["Good.", "Checked — thanks.", "Well done, on time."];
const JD_DOER_NOTES = [
  "I do this right after the 10 am stand-up.",
  "Vendor numbers are saved in the shared sheet.",
  "Takes longer on Mondays — backlog from the weekend.",
  "The checklist for this is pinned in the WhatsApp group.",
  "Check with Accounts before closing this.",
  "Keys are with security if I'm on leave.",
];

export async function seedWmsColumns(pg: PGlite): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = async (label: string, sql: string) => {
    const r = await pg.query<{ n: number }>(sql);
    counts[label] = r.rows[0]?.n ?? 0;
  };

  // Nothing to fill until 0237 has run.
  const ready = await pg.query(
    `select 1 from information_schema.columns
      where table_name = 'ops_checklist_items' and column_name = 'recurrence_rule'`,
  );
  if (ready.rows.length === 0) return counts;

  /* ── 1. Subjects: the Admin Panel roster covers what Operations files under ── */
  await pg.query(
    `insert into subjects (name)
     select distinct on (lower(trim(c))) trim(c)
       from (select category as c from jd_entries union all select category from ops_checklist_items) x
      where c is not null and trim(c) <> ''
        and not exists (select 1 from subjects s where lower(s.name) = lower(trim(x.c)))
     on conflict do nothing`,
  );

  const clients = (
    await pg.query<{ name: string }>(`select name from clients where is_active order by name`)
  ).rows.map((r) => r.name);

  /* ── 2. Checklist rows: Client, Initiator, dates and repeats ─────────────── */
  // 0237's own backfill, again: the seeders run AFTER the migrations, so rows
  // they create were never there for it to reach.
  await pg.query(
    `update ops_checklist_items set initiator_id = created_by_id
      where initiator_id is null and created_by_id is not null`,
  );
  const items = (
    await pg.query<{
      id: string;
      code: string | null;
      run_title: string;
      is_event: boolean;
      event_date: string | null;
      offset_days: number | null;
      target_date: string | null;
      client: string | null;
      doer_id: string | null;
      initiator_id: string | null;
      created_by_id: string | null;
      manager_id: string | null;
      recurrence_rule: string | null;
      sort_order: number;
      created_at: string;
    }>(
      `select i.id, i.code, r.title as run_title, r.is_event,
              to_char(r.event_date, 'YYYY-MM-DD') as event_date, i.offset_days,
              to_char(i.target_date, 'YYYY-MM-DD') as target_date, i.client, i.doer_id,
              i.initiator_id, i.created_by_id, e.manager_id, i.recurrence_rule, i.sort_order,
              to_char(r.created_at, 'YYYY-MM-DD') as created_at
         from ops_checklist_items i
         join ops_checklist_runs r on r.id = i.run_id
         left join employees e on e.id = i.doer_id
        where i.run_id is not null
        order by r.id, i.sort_order`,
    )
  ).rows;

  const standingIndex = new Map<string, number>();
  for (const it of items) {
    const key = it.id;

    // Client — the onboarding checklists are for one client; event rows get one about half the time.
    if (!it.client) {
      const named = clients.find((c) => it.run_title.includes(c));
      const client = named ?? (it.is_event && clients.length > 0 && rand(`${key}|client`) < 0.55 ? pick(clients, `${key}|c`) : null);
      if (client) await pg.query(`update ops_checklist_items set client = $2 where id = $1 and client is null`, [it.id, client]);
    }

    // Initiator — still the default (whoever created the row): the doer's manager, sometimes the doer.
    if (it.doer_id && it.initiator_id && it.initiator_id === it.created_by_id) {
      const x = rand(`${key}|init`);
      const next =
        x < 0.45 && it.manager_id && it.manager_id !== it.doer_id ? it.manager_id : x >= 0.45 && x < 0.52 ? it.doer_id : null;
      if (next) {
        await pg.query(`update ops_checklist_items set initiator_id = $2 where id = $1 and initiator_id = $3`, [
          it.id,
          next,
          it.created_by_id,
        ]);
      }
    }

    // Dates and repeats.
    if (!it.is_event && !it.target_date) {
      const n = (standingIndex.get(it.run_title) ?? 0) + 1;
      standingIndex.set(it.run_title, n);
      let date: string | null = null;
      let rule: string | null = null;
      const code = it.code ?? "";
      if (code.startsWith("OF-")) {
        date = ymd(-14);
        rule = code === "OF-03" ? `FREQ=WEEKLY;BYDAY=${wdOf(date)}` : "FREQ=DAILY";
      } else if (code.startsWith("MC-")) {
        const first = `${ymd(0).slice(0, 8)}01`;
        if (code === "MC-03") {
          // Quarterly: the 5th of the quarter's first month.
          const m = +ymd(0).slice(5, 7);
          const qm = String(m - ((m - 1) % 3)).padStart(2, "0");
          date = `${ymd(0).slice(0, 4)}-${qm}-05`;
          rule = "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=5";
        } else {
          date = addDays(first, n - 1);
          rule = `FREQ=MONTHLY;BYMONTHDAY=${+date.slice(8, 10)}`;
        }
      } else if (code.startsWith("ON-")) {
        // One-off steps, three days apart from the day the checklist was opened.
        const start = it.created_at && it.run_title.includes("Aurora") ? ymd(-50) : ymd(-12);
        date = code === "ON-08" ? addDays(start, 30) : addDays(start, (n - 1) * 3);
      }
      if (date) {
        await pg.query(
          `update ops_checklist_items set target_date = $2, recurrence_rule = coalesce(recurrence_rule, $3)
            where id = $1 and target_date is null`,
          [it.id, date, rule],
        );
      }
    }
    // The ad campaign and the tele-calling run weekly up to each workshop.
    if (it.is_event && it.event_date && !it.recurrence_rule && (it.code === "WS-03" || it.code === "WS-04")) {
      const anchor = addDays(it.event_date, it.offset_days ?? 0);
      await pg.query(
        `update ops_checklist_items set recurrence_rule = $2 where id = $1 and recurrence_rule is null`,
        [it.id, `FREQ=WEEKLY;BYDAY=${wdOf(anchor)};UNTIL=${addDays(it.event_date, -1)}`],
      );
    }
  }

  /* ── 3. Rulings and notes on the work ────────────────────────────────────── */
  const checks = (
    await pg.query<{
      id: string;
      status: string;
      notes: string | null;
      done_at: string | null;
      approver_status: string | null;
      approver_notes: string | null;
      doer_id: string | null;
      initiator_id: string | null;
    }>(
      `select c.id, c.status, c.notes, c.done_at::text as done_at, c.approver_status, c.approver_notes,
              i.doer_id, i.initiator_id
         from ops_checklist_checks c
         join ops_checklist_items i on i.id = c.item_id
        where c.approver_id is null`,
    )
  ).rows;
  for (const c of checks) {
    const selfRaised = !!c.initiator_id && c.initiator_id === c.doer_id;
    if (c.status === "done" && !c.notes && rand(`${c.id}|dn`) < 0.35) {
      await pg.query(`update ops_checklist_checks set notes = $2 where id = $1 and notes is null`, [
        c.id,
        pick(DOER_NOTES_DONE, `${c.id}|dnt`),
      ]);
    }
    if (c.approver_status || selfRaised) continue;
    const x = rand(`${c.id}|ap`);
    let ruling: string | null = null;
    let note: string | null = null;
    if (c.status === "done") {
      if (x < 0.62) {
        ruling = "approved";
        if (rand(`${c.id}|apn`) < 0.3) note = pick(APPROVER_NOTES_YES, `${c.id}|apnt`);
      } else if (x < 0.7) {
        ruling = "not_approved";
        note = pick(APPROVER_NOTES_NO, `${c.id}|apnt`);
      } else if (x < 0.74) ruling = "on_hold";
    } else if (c.status === "need_info" && x < 0.25) {
      ruling = "on_hold";
      note = "Waiting on the budget sign-off.";
    }
    if (!ruling) continue;
    await pg.query(
      `update ops_checklist_checks
          set approver_status = $2, approver_notes = coalesce(approver_notes, $3),
              approver_id = $4, approver_at = coalesce(done_at, now()) + interval '1 day'
        where id = $1 and approver_status is null and approver_id is null`,
      [c.id, ruling, note, c.initiator_id],
    );
  }

  /* ── 4. JDs: clients on the client-facing work, and Doer Notes ───────────── */
  const jds = (
    await pg.query<{ id: string; function_key: string; client: string | null; position_id: string | null; owner_employee_id: string | null }>(
      `select id, function_key, client, position_id, owner_employee_id from jd_entries where is_active`,
    )
  ).rows;
  for (const jd of jds) {
    if (!jd.client && clients.length > 0) {
      const facing = jd.function_key === "handholding" || jd.function_key === "sales";
      if (rand(`${jd.id}|jc`) < (facing ? 0.6 : 0.12)) {
        await pg.query(`update jd_entries set client = $2 where id = $1 and client is null`, [jd.id, pick(clients, `${jd.id}|jcn`)]);
      }
    }
    const doers = jd.owner_employee_id
      ? [jd.owner_employee_id]
      : (
          await pg.query<{ employee_id: string }>(
            `select employee_id from jd_position_holders where position_id = $1 and is_active`,
            [jd.position_id],
          )
        ).rows.map((r) => r.employee_id);
    for (const emp of doers) {
      if (rand(`${jd.id}|${emp}|dn`) >= (jd.owner_employee_id ? 0.45 : 0.3)) continue;
      await pg.query(
        `insert into jd_doer_notes (jd_id, employee_id, notes, updated_by_id)
         values ($1,$2,$3,$2) on conflict do nothing`,
        [jd.id, emp, pick(JD_DOER_NOTES, `${jd.id}|${emp}|dnt`)],
      );
    }
  }

  await bump("subjects", `select count(*)::int as n from subjects`);
  await bump("ops_checklist_items.client", `select count(*)::int as n from ops_checklist_items where client is not null`);
  await bump("ops_checklist_items.recurrence_rule", `select count(*)::int as n from ops_checklist_items where recurrence_rule is not null`);
  await bump("ops_checklist_checks.approver_status", `select count(*)::int as n from ops_checklist_checks where approver_status is not null`);
  await bump("jd_entries.client", `select count(*)::int as n from jd_entries where client is not null`);
  await bump("jd_doer_notes", `select count(*)::int as n from jd_doer_notes`);
  return counts;
}
