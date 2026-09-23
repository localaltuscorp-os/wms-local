import type { PGlite } from "@electric-sql/pglite";
import { mccColumns, mccDeadlinesIn, type MccFrequency } from "../lib/compliance/mcc-frequency";

/**
 * WCC AND MCC, FILLED — dummy data for migration 0238 (account holder,
 * 2026-09-18).
 *
 * DCC's compliances and four weeks of fills already exist (the showcase
 * seeder); 0238 carried them into the WMS columns. This makes the two
 * checklists look lived-in:
 *
 *   · MCC — monthly compliances for the Team Leads, Accounts and Admin, each
 *     due on its own day, with three months of history: most done around the
 *     deadline, some late, one or two never filled, the current month part way.
 *   · WCC — two once-a-week compliances with their weeks filled.
 *   · The actual date on every Done fill: the evening of its day, a few a day
 *     or two late (0238 could only copy the last-saved time).
 *   · Doer Statuses beyond Done — Initiated, Follow Up, Need Info, the odd one
 *     Abandoned (0241) — and the Team Leads' rulings: mostly Approved, a few
 *     Not Approved with a note, the odd one On Hold.
 *   · Two compliances that COUNT by their title (migration 0239) — "Send 25
 *     emails…", "Publish 4 case studies…" — with how many each Done fill
 *     completed: mostly all, some short, the odd one over.
 *   · One MCC compliance for each frequency past Monthly (migration 0240) —
 *     2 and 3 times a month, Alternate Month, Quarterly, Half Yearly,
 *     Annually — with their deadlines filled, most done, a few late or open.
 *   · Mins on the WCC compliances (migration 0242) — 5 minutes to an hour
 *     each, a few left without, as a checklist being timed would be.
 *
 * FILLS BLANKS ONLY, deterministically — re-running changes nothing, and it
 * never overwrites what somebody set in the app. Local PGlite only.
 */

const id = (bank: string, n: number) => `00000000-0000-4000-${bank}-${String(n).padStart(12, "0")}`;

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

function ymd(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY = 86_400_000;
const addDays = (s: string, n: number) =>
  new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) + n * DAY).toISOString().slice(0, 10);
const shiftMonth = (mk: string, n: number) => {
  const a = +mk.slice(0, 4) * 12 + (+mk.slice(5, 7) - 1) + n;
  return `${Math.floor(a / 12)}-${String((a % 12) + 1).padStart(2, "0")}`;
};
const monthLast = (mk: string) => new Date(Date.UTC(+mk.slice(0, 4), +mk.slice(5, 7), 0)).getUTCDate();

const OLD = { me: "00000000-0000-4000-8000-000000000001", asha: "00000000-0000-4000-8000-000000000002", meera: "00000000-0000-4000-8000-000000000004" };
const P = {
  mitul: id("8020", 1),
  priya: id("8020", 2),
  rohan: id("8020", 4),
  aarti: id("8020", 7),
  devang: id("8020", 12),
  rekha: id("8020", 13),
};

/** [n, owner, section, title, monthDay | null (= month-end)] */
const MONTHLY: [number, string, string, string, number | null][] = [
  [1, P.mitul, "Reporting", "Send the monthly sales MIS to Manan Sir", 3],
  [2, P.mitul, "Team", "Review every executive's pipeline", 15],
  [3, P.priya, "Reporting", "Update the monthly lead-source report", 2],
  [4, P.rohan, "Reporting", "Marketing spend and cost-per-lead report", 5],
  [5, P.rohan, "Planning", "Plan next month's content calendar", 25],
  [6, P.aarti, "Clients", "Client health review for every account", null],
  [7, P.devang, "Compliance", "GST reconciliation (GSTR-2B vs books)", 20],
  [8, P.devang, "Compliance", "TDS payment and challan filing", 7],
  [9, P.rekha, "Office", "Pay the electricity, internet and water bills", 10],
  [10, P.rekha, "Office", "Stock audit of stationery and pantry", 28],
  [11, OLD.asha, "People", "Monthly attendance and leave report", 1],
  [12, OLD.meera, "Accounts", "Salary register sign-off", 26],
  [13, P.rohan, "Marketing", "Publish 4 case studies on the website", 28],
];

/** [n, owner, section, title, weekday mask (0 = any day)] */
const WEEKLY: [number, string, string, string, number][] = [
  [1, P.mitul, "Reporting", "Weekly pipeline call with Manan Sir", 0],
  [2, P.rekha, "Office", "Deep-clean the pantry and fridge", 0b0100000], // Saturday
  [3, P.priya, "Outreach", "Send 25 emails to dormant leads", 0],
];

/** [n, owner, section, title, frequency, deadline days (31 = month-end), due month] */
const CYCLES: [number, string, string, string, MccFrequency, number[], number | null][] = [
  [20, P.mitul, "Reporting", "Send the MIS report to Manan Sir", "twice_monthly", [15, 31], null],
  [21, P.devang, "Accounts", "Reconcile the bank statements", "thrice_monthly", [10, 20, 31], null],
  [22, P.rekha, "Office", "Service the air conditioners", "alternate_month", [31], 2],
  [23, P.devang, "Statutory", "File the quarterly TDS return", "quarterly", [31], 7],
  [24, OLD.me, "Board", "Circulate the board meeting minutes", "quarterly", [30], 9],
  [25, OLD.asha, "People", "Review every employee's goals", "half_yearly", [15], 10],
  [26, OLD.meera, "Statutory", "Renew the shop and establishment licence", "annually", [31], 3],
];

/** The compliances above that count by their title, and the count each asks for. */
const COUNTED: [string, number][] = [
  [id("8024", 3), 25],
  [id("8023", 13), 4],
];

const DOER_NOTES = [
  "Done — shared on the group.",
  "Filed in the shared drive.",
  "Sent by email, copy to the Team Lead.",
  "Done; two items carried to next month.",
];
const HOLD_NOTES = ["Waiting on the numbers from Accounts.", "Vendor has not sent the invoice yet."];
const NO_NOTES = ["Figures don't match the books — redo.", "Missing two accounts. Please complete.", "Wrong month's data attached."];

export async function seedWccMcc(pg: PGlite): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const ready = await pg.query(
    `select 1 from information_schema.columns where table_name = 'dcc_entries' and column_name = 'doer_status'`,
  );
  if (ready.rows.length === 0) return counts;

  const alive = async (empId: string) =>
    (await pg.query(`select 1 from employees where id = $1 and is_active`, [empId])).rows.length > 0;
  const managerOf = async (empId: string) =>
    (await pg.query<{ m: string | null }>(`select manager_id as m from employees where id = $1`, [empId])).rows[0]?.m ?? null;

  const today = ymd(0);
  const thisMonth = today.slice(0, 7);

  /* ── MCC compliances and three months of history ─────────────────────── */
  for (const [n, owner, section, title, monthDay] of MONTHLY) {
    if (!(await alive(owner))) continue;
    const itemId = id("8023", n);
    await pg.query(
      `insert into dcc_kpi_items
         (id, owner_employee_id, section, code, title, frequency, weekdays, schedule_kind, month_day, needs_review, sort_order, created_by_id, created_at)
       values ($1,$2,$3,$4,$5,'Monthly',0,'monthly',$6,false,$7,$8, now() - interval '120 days')
       on conflict (id) do nothing`,
      [itemId, owner, section, `MC-${String(n).padStart(2, "0")}`, title, monthDay, 50 + n, (await managerOf(owner)) ?? OLD.me],
    );
    for (let back = 3; back >= 0; back--) {
      const mk = shiftMonth(thisMonth, -back);
      const deadline = `${mk}-${String(Math.min(monthDay ?? 31, monthLast(mk))).padStart(2, "0")}`;
      const key = `${itemId}|${mk}`;
      const x = rand(key);
      const past = deadline < today;
      let doer: string | null = null;
      let doneOn: string | null = null;
      if (past) {
        if (x < 0.62) {
          doer = "done";
          doneOn = addDays(deadline, Math.floor(rand(`${key}|d`) * 6) - 3); // up to 3 early … 2 late
        } else if (x < 0.78) {
          doer = "done";
          doneOn = addDays(deadline, 1 + Math.floor(rand(`${key}|l`) * 4)); // late
        } else if (x < 0.86) doer = "follow_up";
        else if (x < 0.92) doer = "need_info";
        // else: never filled
      } else if (x < 0.35) {
        doer = "done";
        doneOn = addDays(today, -Math.floor(rand(`${key}|e`) * 3)); // done early
      } else if (x < 0.6) doer = "initiated";
      if (doneOn && doneOn > today) doneOn = today;
      if (!doer) continue;
      const legacy = doer === "done" ? "Done" : "Pending";
      const note = doer === "done" && rand(`${key}|n`) < 0.4 ? DOER_NOTES[Math.floor(rand(`${key}|nt`) * DOER_NOTES.length)]! : doer === "need_info" ? HOLD_NOTES[0]! : null;
      await pg.query(
        `insert into dcc_entries (item_id, entry_date, status, doer_status, done_at, note, filled_by_id, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, coalesce($5::timestamptz + interval '10 minutes', now()))
         on conflict do nothing`,
        [itemId, deadline, legacy, doer, doneOn ? `${doneOn}T18:${String(Math.floor(rand(`${key}|m`) * 50) + 5).padStart(2, "0")}:00+05:30` : null, note, owner],
      );
    }
  }

  /* ── MCC frequencies past Monthly (0240) ─────────────────────────────── */
  const hasCycles = (
    await pg.query(`select 1 from information_schema.columns where table_name = 'dcc_kpi_items' and column_name = 'mcc_frequency'`)
  ).rows.length;
  if (hasCycles) {
    for (const [n, owner, section, title, frequency, days, startMonth] of CYCLES) {
      if (!(await alive(owner))) continue;
      const itemId = id("8023", n);
      const c = mccColumns({ frequency, days, startMonth });
      await pg.query(
        `insert into dcc_kpi_items
           (id, owner_employee_id, section, code, title, frequency, weekdays, schedule_kind, month_day,
            mcc_frequency, mcc_days, mcc_start_month, needs_review, sort_order, created_by_id, created_at)
         values ($1,$2,$3,$4,$5,$6,0,'monthly',$7,$8,$9,$10,false,$11,$12, now() - interval '400 days')
         on conflict (id) do nothing`,
        [itemId, owner, section, `MC-${n}`, title, c.frequency, c.monthDay, c.mccFrequency, c.mccDays, c.mccStartMonth, 50 + n, (await managerOf(owner)) ?? OLD.me],
      );
      // A year of deadlines: most done around the day, some late, a few open.
      for (let back = 12; back >= 0; back--) {
        for (const d of mccDeadlinesIn({ frequency, days, startMonth }, shiftMonth(thisMonth, -back))) {
          const key = `${itemId}|${d.deadline}`;
          const x = rand(key);
          const past = d.deadline < today;
          let doer: string | null = null;
          let doneOn: string | null = null;
          if (past) {
            if (x < 0.7) {
              doer = "done";
              doneOn = addDays(d.deadline, Math.floor(rand(`${key}|d`) * 4) - 2);
            } else if (x < 0.85) {
              doer = "done";
              doneOn = addDays(d.deadline, 1 + Math.floor(rand(`${key}|l`) * 5));
            } else if (x < 0.93) doer = "follow_up";
          } else if (x < 0.3) doer = "initiated";
          if (doneOn && doneOn > today) doneOn = today;
          if (!doer) continue;
          await pg.query(
            `insert into dcc_entries (item_id, entry_date, status, doer_status, done_at, filled_by_id, updated_at)
             values ($1,$2,$3,$4,$5,$6, coalesce($5::timestamptz + interval '10 minutes', now()))
             on conflict do nothing`,
            [itemId, d.deadline, doer === "done" ? "Done" : "Pending", doer, doneOn ? `${doneOn}T17:40:00+05:30` : null, owner],
          );
        }
      }
    }
  }

  /* ── WCC once-a-week compliances ──────────────────────────────────────── */
  for (const [n, owner, section, title, mask] of WEEKLY) {
    if (!(await alive(owner))) continue;
    const itemId = id("8024", n);
    await pg.query(
      `insert into dcc_kpi_items
         (id, owner_employee_id, section, code, title, frequency, weekdays, schedule_kind, needs_review, sort_order, created_by_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,'weekly',false,$8,$9, now() - interval '60 days')
       on conflict (id) do nothing`,
      [itemId, owner, section, `WK-${n}`, title, mask ? "Every Saturday" : "Weekly", mask, 40 + n, (await managerOf(owner)) ?? OLD.me],
    );
    for (let w = 4; w >= 1; w--) {
      const day = ymd(-7 * w + 2);
      if (rand(`${itemId}|${day}`) < 0.2) continue; // a missed week
      await pg.query(
        `insert into dcc_entries (item_id, entry_date, status, doer_status, done_at, filled_by_id, updated_at)
         values ($1,$2,'Done','done',($2::date + time '17:20') at time zone 'Asia/Kolkata',$3, now())
         on conflict do nothing`,
        [itemId, day, owner],
      );
    }
  }

  /* ── The actual date on every Done fill 0238 carried across ──────────── */
  const done = (
    await pg.query<{ id: string; entry_date: string }>(
      `select id, to_char(entry_date, 'YYYY-MM-DD') as entry_date from dcc_entries
        where doer_status = 'done' and done_at is not null and done_at = updated_at`,
    )
  ).rows;
  for (const e of done) {
    const x = rand(`${e.id}|late`);
    const lateBy = x < 0.84 ? 0 : x < 0.95 ? 1 : 2;
    const day = addDays(e.entry_date, lateBy);
    if (day > today) continue;
    const mins = 17 * 60 + Math.floor(rand(`${e.id}|t`) * 250); // 5 pm – 9:10 pm
    const at = `${day}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00+05:30`;
    await pg.query(`update dcc_entries set done_at = $2 where id = $1 and done_at = updated_at`, [e.id, at]);
  }

  /* ── More Doer Statuses than Done, and the Team Leads' rulings ────────── */
  // Abandoned needs 0241's wider check; without it, none are made.
  const canAbandon = (
    await pg.query(
      `select 1 from pg_constraint where conname = 'dcc_entries_doer_status_chk' and pg_get_constraintdef(oid) like '%abandoned%'`,
    )
  ).rows.length;
  const open = (
    await pg.query<{ id: string }>(`select id from dcc_entries where doer_status = 'initiated' and approver_id is null and subject_id is null`)
  ).rows;
  for (const e of open) {
    const x = rand(`${e.id}|doer`);
    const next = x < 0.3 ? "follow_up" : x < 0.5 ? "need_info" : x < 0.58 && canAbandon ? "abandoned" : null;
    // The old word moves with it: Abandoned is "Not done" to DCC's readers.
    if (next) {
      await pg.query(
        `update dcc_entries set doer_status = $2, status = case when $2 = 'abandoned' then 'Not done' else status end
          where id = $1 and doer_status = 'initiated'`,
        [e.id, next],
      );
    }
  }

  const rulable = (
    await pg.query<{ id: string; doer_status: string; manager_id: string | null; note: string | null }>(
      `select e.id, e.doer_status, emp.manager_id, e.note
         from dcc_entries e
         join dcc_kpi_items k on k.id = e.item_id
         join employees emp on emp.id = k.owner_employee_id
        where e.approver_status is null and e.approver_id is null and e.subject_id is null
          and e.entry_date < current_date`,
    )
  ).rows;
  for (const e of rulable) {
    if (!e.manager_id) continue;
    const x = rand(`${e.id}|ap`);
    let ruling: string | null = null;
    let note: string | null = null;
    if (e.doer_status === "done") {
      if (x < 0.58) ruling = "approved";
      else if (x < 0.64) {
        ruling = "not_approved";
        note = NO_NOTES[Math.floor(rand(`${e.id}|apn`) * NO_NOTES.length)]!;
      } else if (x < 0.67) {
        ruling = "on_hold";
        note = HOLD_NOTES[1]!;
      }
    } else if (e.doer_status === "need_info" && x < 0.3) {
      ruling = "on_hold";
      note = HOLD_NOTES[0]!;
    }
    if (!ruling) continue;
    await pg.query(
      `update dcc_entries
          set approver_status = $2, approver_notes = $3, approver_id = $4,
              approver_at = coalesce(done_at, updated_at) + interval '14 hours',
              status = case when $2 in ('cancelled', 'archived') then 'NA' else status end
        where id = $1 and approver_status is null and approver_id is null`,
      [e.id, ruling, note, e.manager_id],
    );
  }
  /* ── How many, for the compliances that count ─────────────────────────── */
  const hasCount = (
    await pg.query(`select 1 from information_schema.columns where table_name = 'dcc_entries' and column_name = 'completed_quantity'`)
  ).rows.length;
  if (hasCount) {
    for (const [itemId, target] of COUNTED) {
      const done = (
        await pg.query<{ id: string }>(
          `select id from dcc_entries where item_id = $1 and doer_status = 'done' and completed_quantity is null and subject_id is null`,
          [itemId],
        )
      ).rows;
      for (const e of done) {
        const x = rand(`${e.id}|qty`);
        const n =
          x < 0.55
            ? target
            : x < 0.9
              ? Math.round(target * (0.55 + rand(`${e.id}|short`) * 0.4))
              : target + 1 + Math.floor(rand(`${e.id}|over`) * 3);
        await pg.query(
          `update dcc_entries set completed_quantity = $2::int, value_number = $2::int where id = $1 and completed_quantity is null`,
          [e.id, n],
        );
      }
    }
  }

  /* ── Mins, for the WCC compliances ───────────────────────────────────── */
  const hasMinutes = (
    await pg.query(`select 1 from information_schema.columns where table_name = 'dcc_kpi_items' and column_name = 'minutes'`)
  ).rows.length;
  if (hasMinutes) {
    const MINS = [5, 10, 10, 15, 15, 20, 30, 30, 45, 60];
    const untimed = (
      await pg.query<{ id: string }>(
        `select id from dcc_kpi_items
          where schedule_kind in ('scheduled', 'weekly') and not is_participant_list and not archived and minutes is null`,
      )
    ).rows;
    for (const it of untimed) {
      // About one in ten stays without — decided by the id, so a re-run agrees.
      if (rand(`${it.id}|mins`) < 0.1) continue;
      const m = MINS[Math.floor(rand(`${it.id}|mins-value`) * MINS.length)]!;
      await pg.query(`update dcc_kpi_items set minutes = $2::int where id = $1 and minutes is null`, [it.id, m]);
    }
  }

  // A few doer notes on finished daily work.
  await pg.query(
    `update dcc_entries set note = $1
      where note is null and doer_status = 'done' and subject_id is null
        and ('x' || substr(md5(id::text), 1, 6))::bit(24)::int % 9 = 0`,
    ["Done — logged in the tracker."],
  );

  for (const [label, sql] of [
    ["mcc compliances", `select count(*)::int as n from dcc_kpi_items where schedule_kind = 'monthly' and not archived`],
    ...(hasCycles
      ? ([["mcc past Monthly", `select count(*)::int as n from dcc_kpi_items where mcc_frequency is not null and mcc_frequency <> 'monthly'`]] as const)
      : []),
    ["wcc compliances", `select count(*)::int as n from dcc_kpi_items where schedule_kind in ('scheduled','weekly') and not archived`],
    ...(hasMinutes
      ? ([["wcc compliances with Mins", `select count(*)::int as n from dcc_kpi_items where minutes is not null and not archived`]] as const)
      : []),
    ["fills with a Doer Status", `select count(*)::int as n from dcc_entries where doer_status is not null`],
    ["fills ruled on", `select count(*)::int as n from dcc_entries where approver_status is not null`],
    ...(hasCount
      ? ([["fills with a count", `select count(*)::int as n from dcc_entries where completed_quantity is not null`]] as const)
      : []),
  ] as const) {
    counts[label] = (await pg.query<{ n: number }>(sql)).rows[0]?.n ?? 0;
  }
  return counts;
}
