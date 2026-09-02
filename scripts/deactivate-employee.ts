/**
 * One-off ops script: deactivate an employee (set is_active=false) AND
 * disable their Firebase user (disabled=true) so their session cookie
 * can't be refreshed. Reversible: see reactivateEmployee in
 * app/(admin)/admin/employees/actions.ts (or run this script with the
 * inverse boolean wired up).
 *
 *   tsx --env-file=.env.local scripts/deactivate-employee.ts --id <uuid>            # dry-run
 *   tsx --env-file=.env.local scripts/deactivate-employee.ts --id <uuid> --commit   # apply
 */

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "../lib/db";
import { employees } from "../db/schema";

async function main() {
  const { values } = parseArgs({
    options: {
      id:     { type: "string" },
      commit: { type: "boolean", default: false },
    },
  });
  if (!values.id) {
    console.error("Usage: deactivate-employee --id <uuid> [--commit]");
    process.exit(1);
  }
  const id = values.id;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!emp) {
    console.error(`No employee with id=${id}`);
    process.exit(1);
  }

  console.log(`\nTarget:`);
  console.log(`  id:        ${emp.id}`);
  console.log(`  name:      ${emp.name}`);
  console.log(`  email:     ${emp.email}`);
  console.log(`  isActive:  ${emp.isActive}  →  false`);
  console.log(`  fb_uid:    ${emp.firebaseUid ?? "(none)"}  →  disabled=true`);

  if (!emp.isActive) {
    console.log("\nAlready inactive. Skipping.");
    return;
  }

  if (!values.commit) {
    console.log("\nDry-run. Re-run with --commit to apply.");
    return;
  }

  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
  console.log("\n✓ employees.is_active = false");

  if (emp.firebaseUid) {
    const projectId   = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey  = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
    if (!getApps().length) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    try {
      await getAuth().updateUser(emp.firebaseUid, { disabled: true });
      console.log(`✓ Firebase user ${emp.firebaseUid} disabled.`);
    } catch (err: any) {
      console.warn(
        `Firebase disable failed (uid=${emp.firebaseUid}): ${err?.message ?? err}`,
      );
      console.warn("Roll back manually if needed: UPDATE employees SET is_active = true WHERE id = ...");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
