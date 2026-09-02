// Phase B — verify the task_metrics projection against a fresh fold of the
// event log (ARCHITECTURE.md Law 4: if a projection and the log disagree, the
// log wins). This is the shadow-verify that must pass BEFORE any read is cut
// over to the projection. Prints expected (from log) vs actual (projection) and
// a per-(day,doer) drift count; exits non-zero on any mismatch.
//   pnpm tsx --env-file=.env.local scripts/verify-task-metrics.ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

interface Counts {
  created: number;
  done: number;
  approved: number;
  notApproved: number;
}
const zero = (): Counts => ({ created: 0, done: 0, approved: 0, notApproved: 0 });

async function main() {
  // Expected, folded straight from the event log — mirrors the handler's rule
  // (only events with a non-empty doerId contribute).
  const expRows = (await sql.unsafe(`
    select (occurred_at at time zone 'UTC')::date::text as day,
           payload->>'doerId' as doer_id,
           event_type,
           payload->>'toStatus' as to_status,
           payload->>'decision' as decision
    from event_log
    where aggregate_type = 'task' and coalesce(payload->>'doerId','') <> ''
  `)) as unknown as {
    day: string;
    doer_id: string;
    event_type: string;
    to_status: string | null;
    decision: string | null;
  }[];

  const expected = new Map<string, Counts>();
  for (const r of expRows) {
    const key = `${r.day}|${r.doer_id}`;
    const c = expected.get(key) ?? zero();
    if (r.event_type === "TaskCreated") c.created += 1;
    else if (r.event_type === "TaskStatusChanged") {
      if (r.to_status === "done") c.done += 1;
      else if (r.to_status === "approved") c.approved += 1;
      else if (r.to_status === "not_approved") c.notApproved += 1;
    } else if (r.event_type === "TaskApprovalDecided") {
      if (r.decision === "approved") c.approved += 1;
      else c.notApproved += 1;
    }
    expected.set(key, c);
  }

  // Actual, from the projection.
  const projRows = (await sql.unsafe(`
    select day::text as day, doer_id::text as doer_id,
           created_count, done_count, approved_count, not_approved_count
    from task_metrics_daily
  `)) as unknown as {
    day: string;
    doer_id: string;
    created_count: number;
    done_count: number;
    approved_count: number;
    not_approved_count: number;
  }[];

  const actual = new Map<string, Counts>();
  for (const r of projRows) {
    actual.set(`${r.day}|${r.doer_id}`, {
      created: r.created_count,
      done: r.done_count,
      approved: r.approved_count,
      notApproved: r.not_approved_count,
    });
  }

  // Compare every key in either set.
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  let drift = 0;
  const expTot = zero();
  const actTot = zero();
  for (const k of keys) {
    const e = expected.get(k) ?? zero();
    const a = actual.get(k) ?? zero();
    expTot.created += e.created; expTot.done += e.done; expTot.approved += e.approved; expTot.notApproved += e.notApproved;
    actTot.created += a.created; actTot.done += a.done; actTot.approved += a.approved; actTot.notApproved += a.notApproved;
    if (e.created !== a.created || e.done !== a.done || e.approved !== a.approved || e.notApproved !== a.notApproved) {
      drift += 1;
    }
  }

  const cols: (keyof Counts)[] = ["created", "done", "approved", "notApproved"];
  console.log("metric          expected   projection   ok");
  let allOk = true;
  for (const c of cols) {
    const ok = expTot[c] === actTot[c];
    allOk = allOk && ok;
    console.log(`${c.padEnd(14)} ${String(expTot[c]).padStart(9)} ${String(actTot[c]).padStart(12)}   ${ok ? "✓" : "✗"}`);
  }
  console.log(`\nkeys compared: ${keys.size}   per-(day,doer) drift rows: ${drift}`);
  if (allOk && drift === 0) {
    console.log("\n✅ PROJECTION VERIFIED — projection == fold of the event log (Law 4). Safe to cut a read over.");
    await sql.end();
    process.exit(0);
  } else {
    console.log("\n❌ DRIFT DETECTED — do NOT cut reads over; rebuild the projection and investigate.");
    await sql.end();
    process.exit(1);
  }
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
