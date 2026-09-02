/**
 * Backfill: create Firebase Auth users for active employees who have an
 * employees row but no firebaseUid, so they can use /forgot-password
 * without an admin first sending an invite.
 *
 * No email is sent. The Firebase user is created with emailVerified=true
 * and a random password they'll never use (they'll set their own via
 * forgot-password). The employees row is updated with the new UID.
 *
 * Idempotent: re-runs skip rows that already have a UID. If a Firebase
 * user already exists for the email (e.g. created out-of-band), we
 * adopt its UID instead of creating a duplicate.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/backfill-firebase-users.ts        # dry-run
 *   pnpm tsx --env-file=.env.local scripts/backfill-firebase-users.ts --apply
 */
import { randomBytes } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "../lib/db";
import { employees } from "../db/schema";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[backfill] mode: ${apply ? "APPLY (will write)" : "dry-run (no writes — pass --apply to commit)"}`);

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error("Missing FIREBASE_* env vars");
    process.exit(1);
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  const auth = getAuth();

  const candidates = await db
    .select({ id: employees.id, email: employees.email, name: employees.name })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNull(employees.firebaseUid)));

  if (candidates.length === 0) {
    console.log("[backfill] nothing to do — every active employee has a Firebase UID");
    process.exit(0);
  }
  console.log(`[backfill] ${candidates.length} active employee(s) without a Firebase UID:`);

  let created = 0;
  let adopted = 0;
  let skipped = 0;
  let failed = 0;

  for (const emp of candidates) {
    const label = `${emp.name} <${emp.email}>`;
    try {
      let uid: string | null = null;

      try {
        const existing = await auth.getUserByEmail(emp.email);
        uid = existing.uid;
        console.log(`  - ADOPT  ${label} → uid=${uid} (Firebase user already exists)`);
        adopted += 1;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "auth/user-not-found") {
          if (apply) {
            const fbUser = await auth.createUser({
              email: emp.email,
              emailVerified: true,
              disabled: false,
              // Random password they never use. They'll set their own via
              // /forgot-password. 32 bytes = 256 bits — plenty.
              password: randomBytes(32).toString("base64url"),
            });
            await auth.setCustomUserClaims(fbUser.uid, { role: "authenticated" });
            uid = fbUser.uid;
            console.log(`  - CREATE ${label} → uid=${uid}`);
            created += 1;
          } else {
            console.log(`  - WOULD CREATE ${label} (dry-run)`);
            created += 1;
            continue;
          }
        } else {
          throw err;
        }
      }

      if (apply && uid) {
        await db.update(employees).set({ firebaseUid: uid }).where(eq(employees.id, emp.id));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  - FAIL   ${label}: ${msg}`);
      failed += 1;
    }
  }

  console.log(
    `[backfill] done — created=${created} adopted=${adopted} skipped=${skipped} failed=${failed}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
