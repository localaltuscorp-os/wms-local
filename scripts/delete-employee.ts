/**
 * One-off ops script: hard-delete an employee row + their Firebase user.
 *
 *   tsx --env-file=.env.local scripts/delete-employee.ts --id <uuid>            # dry-run (reports refs)
 *   tsx --env-file=.env.local scripts/delete-employee.ts --id <uuid> --commit   # apply
 *
 * Blocking FKs (per db/schema.ts):
 *   tasks.doer_id / initiator_id / created_by_id  → RESTRICT
 *   task_events.actor_id                          → RESTRICT
 *   employee_events.actor_id                      → RESTRICT
 *   settings_events.actor_id                      → RESTRICT
 *
 * Cascading FKs (silently deleted):
 *   notifications (user_id), push_subscriptions (user_id),
 *   employee_events (employee_id, lifecycle events ABOUT them)
 *
 * If any blocker is present the script refuses with a count breakdown —
 * use deactivate (set is_active=false) instead, or reassign their tasks
 * first.
 */

import { parseArgs } from "node:util";
import { eq, or, sql } from "drizzle-orm";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "../lib/db";
import {
  employees,
  tasks,
  taskEvents,
  employeeEvents,
  settingsEvents,
  notifications,
} from "../db/schema";

async function countRefs(employeeId: string) {
  const [tasksRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      or(
        eq(tasks.doerId, employeeId),
        eq(tasks.initiatorId, employeeId),
        eq(tasks.createdById, employeeId),
      ),
    );
  const [taskEventsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskEvents)
    .where(eq(taskEvents.actorId, employeeId));
  const [employeeEventsActorRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(employeeEvents)
    .where(eq(employeeEvents.actorId, employeeId));
  const [settingsEventsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(settingsEvents)
    .where(eq(settingsEvents.actorId, employeeId));
  const [notifRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.userId, employeeId));

  return {
    blocking: {
      tasksAsDoerOrInitiatorOrCreator: Number(tasksRow?.n ?? 0),
      taskEventsAsActor: Number(taskEventsRow?.n ?? 0),
      employeeEventsAsActor: Number(employeeEventsActorRow?.n ?? 0),
      settingsEventsAsActor: Number(settingsEventsRow?.n ?? 0),
    },
    cascade: {
      notificationsForUser: Number(notifRow?.n ?? 0),
    },
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      id:     { type: "string" },
      commit: { type: "boolean", default: false },
    },
  });
  if (!values.id) {
    console.error("Usage: delete-employee --id <uuid> [--commit]");
    process.exit(1);
  }
  const id = values.id;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!emp) {
    console.error(`No employee with id=${id}`);
    process.exit(1);
  }

  console.log(`\nTarget employee:`);
  console.log(`  id:       ${emp.id}`);
  console.log(`  name:     ${emp.name}`);
  console.log(`  email:    ${emp.email}`);
  console.log(`  isAdmin:  ${emp.isAdmin}`);
  console.log(`  isActive: ${emp.isActive}`);
  console.log(`  fb_uid:   ${emp.firebaseUid ?? "(none)"}`);

  const refs = await countRefs(id);
  console.log(`\nBlocking references (would prevent delete):`);
  console.table(refs.blocking);
  console.log(`\nCascading references (auto-deleted):`);
  console.table(refs.cascade);

  const totalBlocking = Object.values(refs.blocking).reduce((a, b) => a + b, 0);
  if (totalBlocking > 0) {
    console.error(
      `\nRefusing to delete — ${totalBlocking} blocking reference(s) exist.`,
    );
    console.error(
      "Either reassign those tasks/events to another employee first, or run with --deactivate-instead (set is_active=false).",
    );
    process.exit(1);
  }

  if (!values.commit) {
    console.log("\nDry-run. No blockers found. Re-run with --commit to delete.");
    return;
  }

  // 1. DB delete (cascades clear notifications + push_subscriptions +
  //    employee_events about-them).
  await db.delete(employees).where(eq(employees.id, id));
  console.log("\n✓ Employees row deleted (cascaded child rows cleared).");

  // 2. Firebase user delete
  if (emp.firebaseUid) {
    const projectId   = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey  = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
    if (!getApps().length) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    try {
      await getAuth().deleteUser(emp.firebaseUid);
      console.log(`✓ Firebase user ${emp.firebaseUid} deleted.`);
    } catch (err: any) {
      console.warn(
        `Firebase delete failed (uid=${emp.firebaseUid}): ${err?.message ?? err}`,
      );
      console.warn("Employees row is already gone — clean up Firebase manually.");
    }
  } else {
    console.log("(No firebase_uid on this row — nothing to delete in Firebase.)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
