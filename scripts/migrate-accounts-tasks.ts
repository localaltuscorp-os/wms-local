// One-time migration (run at the Admin-restructure deploy): move every
// accounts_task_list task into the WMS task list — Doer: Siddhesh Walve,
// Initiator: Manan Vasa, Subject: "Accounts" — then archive the source rows
// (kept as a backup, not destroyed). Reuses the app's createTasksCore so
// short-ids, task numbers and Phase-B events are all correct.
//
// Dry-run by default. To write:
//   node -r "<scratchpad>/preload.cjs" --import tsx --env-file=.env.local \
//        scripts/migrate-accounts-tasks.ts            # dry-run
//   MIGRATE_EXECUTE=1 node -r "<preload>" --import tsx --env-file=.env.local \
//        scripts/migrate-accounts-tasks.ts            # write
// (preload.cjs stubs the `server-only` guard so app modules import under tsx.)
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { createTasksCore } from "@/lib/tasks/create-task";
import type { CreateTaskInput } from "@/lib/validators/task";

const SIDDHESH = "8ca9682a-7552-43c7-9176-f5df9c0cd44e"; // Siddhesh Walve
const MANAN = "1fbc08ff-fa3f-47c3-bcee-3539a9c0c299"; // Manan Vasa
const EXECUTE = process.env.MIGRATE_EXECUTE === "1";

/** accounts status text → WMS status. */
function mapStatus(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v.includes("done")) return "done";
  if (v.includes("help")) return "need_info";
  return "not_started"; // Pending / blank / anything else
}

interface Row {
  id: string;
  area: string | null;
  task_description: string | null;
  status: string | null;
  links: string | null;
  target_date: string | null;
  notes: string | null;
}

async function main() {
  const rows = (await db.execute(sql`
    select id, area, task_description, status, links, target_date, notes
    from accounts_task_list where archived = false order by sr_no asc nulls last
  `)) as unknown as Row[];
  console.log(`${rows.length} accounts tasks to migrate. EXECUTE=${EXECUTE}\n`);

  let done = 0;
  for (const r of rows) {
    const title = (r.task_description?.trim() || r.area?.trim() || "Accounts task").slice(0, 240);
    const desc = [
      r.area && `Area: ${r.area.trim()}`,
      r.links && `Links: ${r.links.trim()}`,
      r.notes && `Notes: ${r.notes.trim()}`,
    ]
      .filter(Boolean)
      .join("\n");
    const dueAt = r.target_date ? new Date(r.target_date) : new Date();
    const status = mapStatus(r.status);
    console.log(`  • [${status.padEnd(11)}] ${title}  (due ${dueAt.toISOString().slice(0, 10)})`);
    if (!EXECUTE) continue;

    const input = {
      title,
      doerId: SIDDHESH,
      initiatorId: MANAN,
      priority: "imp_not_urgent",
      dueAt: dueAt.toISOString(),
      subject: "Accounts",
      description: desc || null,
    } as unknown as CreateTaskInput;

    const res = await createTasksCore({ id: MANAN, name: "Manan Vasa" }, input);
    if (!res.ok) {
      console.log(`    ✗ ${res.error}`);
      continue;
    }
    if (status !== "dont_know") {
      await db.execute(sql`update tasks set status = ${status}, updated_at = now() where id = ${res.id}`);
    }
    // Retire the source row (archived backup, not deleted).
    await db.execute(sql`update accounts_task_list set archived = true, updated_at = now() where id = ${r.id}`);
    done++;
  }
  console.log(
    EXECUTE
      ? `\n✓ migrated ${done}/${rows.length} tasks → WMS (Doer Siddhesh / Initiator Manan), source rows archived`
      : `\n(dry-run — set MIGRATE_EXECUTE=1 to write)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
