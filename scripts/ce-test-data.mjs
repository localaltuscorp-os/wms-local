#!/usr/bin/env node
/**
 * ce-test-data.mjs — add or remove Client Engagement TEST data.
 *
 * Every row it creates is marked twice, so it can never be mistaken for (or
 * deleted along with) a real client:
 *   · the name starts with "TEST · "
 *   · the account carries the tag "test-data"
 * Removal deletes ONLY accounts carrying that tag; their calls and reference
 * quotas go with them (ON DELETE CASCADE). Team members are never touched.
 *
 * USAGE (from wms-local):
 *   node --env-file=.env.local scripts/ce-test-data.mjs            (dry run: shows what it would do)
 *   node --env-file=.env.local scripts/ce-test-data.mjs --apply    (adds the test data)
 *   node --env-file=.env.local scripts/ce-test-data.mjs --remove   (deletes every test-data account)
 *
 * Adding is refused if test data already exists, so running it twice cannot
 * double it up. Calls start on the Monday of the current week.
 */
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const REMOVE = process.argv.includes("--remove");
const TAG = "test-data";

// name, category, batch, assignee (team member name or null), hh_status, lifecycle
const ACCOUNTS = [
  ["ABC Shah", "ps", "79", "Ruchita", "standard", "active"],
  ["PQR Mehta", "ps", "72", "Ruchita", "fee_recovery", "active"],
  ["Kavya Nair", "ps", "79", "Ruchita", "standard", "active"],
  ["Rohit Desai", "ps", "80", "Jeevan", "not_started", "active"],
  ["Sneha Iyer", "ps", "80", "Jeevan", "standard", "active"],
  ["Farhan Qureshi", "bss", "12", "Rashmi", "standard", "active"],
  ["Meera Joshi", "bss", "12", "Rashmi", "on_hold", "active"],
  ["Lawrence & Mayo", "retainer", null, "Manan", "standard", "active"],
  ["Sattva Logistics", "corporate", null, "Manan", "revenue_share", "active"],
  ["Anil Kapoor (Amb.)", "ambassador", null, "Ruchita", "revenue_share", "active"],
  ["Pooja Rane", "ps", "81", null, "standard", "active"],
  ["Vikram Solanki", "retainer", null, null, "standard", "active"],
  ["Old Batch Person", "ps", "70", "Jeevan", "standard", "completed"],
];

// account name, call type, day, from, to — no two calls of one person overlap.
const CALLS = [
  // Ruchita: ABC Shah = 180 mins over 2 calls, PQR Mehta = 240 mins over 3 (the brief's example)
  ["ABC Shah", "hh", "mon", "10:00", "11:30"],
  ["ABC Shah", "tool", "thu", "10:00", "11:30"],
  ["PQR Mehta", "hh", "tue", "12:00", "13:20"],
  ["PQR Mehta", "checkin", "wed", "12:00", "13:20"],
  ["PQR Mehta", "reference", "fri", "12:00", "13:20"],
  ["Kavya Nair", "hh", "mon", "15:00", "15:30"],
  ["Anil Kapoor (Amb.)", "checkin", "wed", "17:00", "17:10"],
  // Jeevan
  ["Rohit Desai", "hh", "tue", "10:30", "11:00"],
  ["Sneha Iyer", "hh", "tue", "11:00", "12:00"],
  ["Sneha Iyer", "tool", "sat", "16:00", "16:45"],
  // Rashmi — Meera is on hold, so her call shows hatched and is not counted
  ["Farhan Qureshi", "hh", "mon", "14:00", "15:00"],
  ["Meera Joshi", "hh", "thu", "14:00", "14:30"],
  // Manan
  ["Lawrence & Mayo", "checkin", "fri", "18:00", "19:00"],
  ["Sattva Logistics", "reference", "wed", "10:00", "10:20"],
];

// account, collector, program, target, collected, frequency
const REFERENCES = [
  ["PQR Mehta", "Devraj", "bss", 3, 1, "every_week"],
  ["Lawrence & Mayo", "Ruchita", "bss_c", 5, 2, "one_time"],
  ["Sattva Logistics", "Devraj", "general", 20, 4, "every_week"],
];

const label = (n) => `TEST · ${n}`;

function mondayIST() {
  const today = new Date(Date.now() + 5.5 * 3600_000);
  const dow = today.getUTCDay();
  today.setUTCDate(today.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return today.toISOString().slice(0, 10);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20 });

try {
  const [{ n: existing }] = await sql`select count(*)::int n from ce_accounts where ${TAG} = any(tags)`;

  if (REMOVE) {
    const gone = await sql`delete from ce_accounts where ${TAG} = any(tags) returning full_name`;
    console.log(`\n  Removed ${gone.length} test account(s), with their calls and reference quotas.\n`);
  } else if (existing > 0) {
    console.log(`\n  ${existing} test account(s) already exist. Run with --remove first to start over.\n`);
  } else if (!APPLY) {
    console.log(`\n  DRY RUN. Would add ${ACCOUNTS.length} accounts, ${CALLS.length} weekly calls and ${REFERENCES.length} reference quotas,`);
    console.log(`  every one named "TEST · …" and tagged "${TAG}". Calls start ${mondayIST()}.`);
    console.log(`\n  To add:    node --env-file=.env.local scripts/ce-test-data.mjs --apply`);
    console.log(`  To remove: node --env-file=.env.local scripts/ce-test-data.mjs --remove\n`);
  } else {
    const monday = mondayIST();
    await sql.begin(async (tx) => {
      const members = await tx`select id, name from ce_team_members`;
      const memberId = (name) => {
        if (!name) return null;
        const m = members.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!m) throw new Error(`Team member "${name}" not found`);
        return m.id;
      };
      const ids = new Map();
      for (const [name, category, batch, who, hh, life] of ACCOUNTS) {
        const [row] = await tx`
          insert into ce_accounts (full_name, category, batch_code, assigned_to, hh_status, lifecycle_status, start_date, tags, notes)
          values (${label(name)}, ${category}, ${batch}, ${memberId(who)}, ${hh}, ${life}, ${monday}, ${[TAG]}, 'Test data — safe to delete')
          returning id, assigned_to`;
        ids.set(name, row);
      }
      for (const [name, type, day, from, to] of CALLS) {
        const acct = ids.get(name);
        await tx`
          insert into ce_engagements (account_id, team_member_id, call_type, day_of_week, start_time, end_time, start_date)
          values (${acct.id}, ${acct.assigned_to}, ${type}, ${day}, ${from}, ${to}, ${monday})`;
      }
      for (const [name, collector, program, target, got, freq] of REFERENCES) {
        await tx`
          insert into ce_references (account_id, collector_id, target_program, target_count, actual_collected, frequency)
          values (${ids.get(name).id}, ${memberId(collector)}, ${program}, ${target}, ${got}, ${freq})`;
      }
    });
    console.log(`\n  Added ${ACCOUNTS.length} test accounts, ${CALLS.length} calls, ${REFERENCES.length} reference quotas (calls from ${monday}).`);
    console.log(`  Remove them any time: node --env-file=.env.local scripts/ce-test-data.mjs --remove\n`);
  }
} catch (err) {
  console.error(`\n  FAILED: ${err?.message ?? err}\n  Nothing was half-added (one transaction).\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
