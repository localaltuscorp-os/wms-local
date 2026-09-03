/**
 * One-off ops script: reactivate an employee (set is_active=true) AND
 * re-enable their Firebase user (disabled=false) so they can sign in again.
 * The inverse of scripts/deactivate-employee.ts, and the break-glass
 * equivalent of reactivateEmployee in
 * app/(admin)/admin/employees/actions.ts.
 *
 * Prefer the admin UI (/admin/employees -> row menu -> Reactivate): it runs
 * as a signed-in admin and writes an employee_events audit row naming the
 * actor. Use this script only when nobody can reach that UI — it has no
 * signed-in actor, so it records no audit row.
 *
 *   tsx --env-file=.env.local scripts/reactivate-employee.ts --email <addr>            # dry-run
 *   tsx --env-file=.env.local scripts/reactivate-employee.ts --email <addr> --commit   # apply
 *   tsx --env-file=.env.local scripts/reactivate-employee.ts --id <uuid> --commit
 *
 * Both halves must agree or the account is broken in one of two ways: DB
 * active + Firebase disabled means sign-in fails (middleware verifies with
 * checkRevoked), and DB inactive + Firebase enabled means requireUser()
 * bounces them to /login. So if Firebase fails here we roll the DB row back
 * rather than leave the two out of step.
 */

import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "../lib/db";
import { employees } from "../db/schema";

async function main() {
  const { values } = parseArgs({
    options: {
      id:     { type: "string" },
      email:  { type: "string" },
      commit: { type: "boolean", default: false },
    },
  });
  if (!values.id && !values.email) {
    console.error("Usage: reactivate-employee (--email <addr> | --id <uuid>) [--commit]");
    process.exit(1);
  }

  // Email is matched case-insensitively — addresses get typed by hand, and a
  // stored "Om.Jadhav@..." should still be found by "om.jadhav@...".
  const emp = values.id
    ? await db.query.employees.findFirst({ where: eq(employees.id, values.id) })
    : await db.query.employees.findFirst({
        where: sql`lower(${employees.email}) = lower(${values.email})`,
      });

  if (!emp) {
    console.error(`No employee with ${values.id ? `id=${values.id}` : `email=${values.email}`}`);
    process.exit(1);
  }

  console.log(`\nTarget:`);
  console.log(`  id:        ${emp.id}`);
  console.log(`  name:      ${emp.name}`);
  console.log(`  email:     ${emp.email}`);
  console.log(`  isActive:  ${emp.isActive}  ->  true`);
  console.log(`  fb_uid:    ${emp.firebaseUid ?? "(none)"}  ->  disabled=false`);

  // No Firebase user means no way to sign in even once is_active flips, so
  // say so plainly instead of reporting a success that won't let them in.
  if (!emp.firebaseUid) {
    console.warn(
      "\nWARNING: this employee has no firebase_uid, so they have no sign-in " +
        "account. Reactivating alone will NOT let them log in — invite them " +
        "from /admin/employees, or run scripts/backfill-firebase-users.ts.",
    );
  }

  if (emp.isActive) {
    console.log("\nAlready active in the database.");
    if (!emp.firebaseUid) return;
    console.log("Checking Firebase, since the two can drift apart...");
  }

  if (!values.commit) {
    console.log("\nDry-run. Re-run with --commit to apply.");
    return;
  }

  const wasActive = emp.isActive;
  if (!wasActive) {
    await db.update(employees).set({ isActive: true }).where(eq(employees.id, emp.id));
    console.log("\n✓ employees.is_active = true");
  }

  if (emp.firebaseUid) {
    const projectId   = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey  = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
    if (!getApps().length) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    try {
      const before = await getAuth().getUser(emp.firebaseUid);
      console.log(`  firebase disabled was: ${before.disabled}`);
      await getAuth().updateUser(emp.firebaseUid, { disabled: false });
      console.log(`✓ Firebase user ${emp.firebaseUid} enabled.`);
    } catch (err: any) {
      // Undo the DB half so we never leave active-in-DB + disabled-in-Firebase,
      // which reads as "reactivated" but still refuses every sign-in.
      if (!wasActive) {
        await db
          .update(employees)
          .set({ isActive: false })
          .where(eq(employees.id, emp.id))
          .catch(() => {});
        console.error("  rolled employees.is_active back to false");
      }
      console.error(`\n✗ Firebase enable failed (uid=${emp.firebaseUid}): ${err?.message ?? err}`);
      process.exit(1);
    }
  }

  console.log("\nDone. Ask them to sign in at /login.");
  console.log(
    "No employee_events audit row was written (this script has no signed-in " +
      "actor). Note the change wherever you track admin actions.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
