#!/usr/bin/env tsx
/**
 * One-time importer for the legacy Altus Corp Google Sheet.
 * Spec: docs/superpowers/specs/2026-05-14-vpinnacle-m4-import-and-multichannel-design.md
 *
 * Usage:
 *   pnpm import:legacy -- --phase=all --employees-csv=_reference/employees.csv \
 *                        --tasks-csv=_reference/tasks.csv --commit
 *
 * Without --commit, the script runs in dry-run mode (default).
 * Pass --send-invites to actually email legacy employees their invite
 * link.  Default is OFF — the demo import creates the Firebase user +
 * employees row, but the admin hand-invites later via /admin/employees.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import {
  departments,
  employees,
  tasks,
  taskEvents,
} from "@/db/schema";
import { parseLegacyEmployees, parseLegacyTasks, type LegacyTaskRow } from "@/lib/import/csv-schemas";
import { mapLegacyStatus } from "@/lib/import/status-mapping";
import { computeLegacyImportKey } from "@/lib/import/legacy-key";
import { deriveShortId } from "@/lib/import/short-id";
import { parseLegacyDate } from "@/lib/import/parse-date";

interface Args {
  phase: "employees" | "tasks" | "all";
  employeesCsv: string;
  tasksCsv: string;
  commit: boolean;
  sendInvites: boolean;
}

function parseFlags(): Args {
  const { values } = parseArgs({
    options: {
      phase:           { type: "string", default: "all" },
      "employees-csv": { type: "string", default: "_reference/employees.csv" },
      "tasks-csv":     { type: "string", default: "_reference/tasks.csv" },
      commit:          { type: "boolean", default: false },
      "send-invites":  { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const phase = (values.phase as Args["phase"]) ?? "all";
  if (!["employees", "tasks", "all"].includes(phase)) {
    throw new Error(`--phase must be employees|tasks|all (got "${phase}")`);
  }
  return {
    phase,
    employeesCsv: values["employees-csv"] as string,
    tasksCsv:     values["tasks-csv"] as string,
    commit:       Boolean(values.commit),
    sendInvites:  Boolean(values["send-invites"]),
  };
}

interface Report {
  timestamp: string;
  args: Args;
  employees: {
    created: number;
    skipped_already_exists: number;
    failed: { line: number; email: string; reason: string }[];
  };
  tasks: {
    created: number;
    skipped_already_imported: number;
    synthesised_subjects: number;
    failed: { line: number; reason: string; row: LegacyTaskRow }[];
  };
}

/**
 * Look up a department row by name (case-insensitive, trimmed).  Mirrors
 * the logic in app/(admin)/admin/employees/actions.ts so the importer
 * keeps employees.department_id in lock-step with the legacy text
 * column (M3 soft-migration invariant).
 */
async function resolveDepartmentByName(
  raw: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const [row] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(sql`lower(${departments.name}) = lower(${trimmed})`)
    .limit(1);
  return row ?? null;
}

/**
 * Lazily initialise the Firebase Admin SDK from env.  We don't use the
 * lib/firebase/admin.ts wrapper because that file is marked
 * `server-only` and trips on tsx-run scripts.  This is the same pattern
 * scripts/bootstrap-admin.ts uses.
 */
let cachedAuth: Auth | null = null;
function getAuthClient(): Auth {
  if (cachedAuth) return cachedAuth;
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) {
    throw new Error(
      "Missing Firebase Admin env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)",
    );
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  }
  cachedAuth = getAuth();
  return cachedAuth;
}

async function sendInviteEmailLite(args: {
  email: string;
  resetLink: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = process.env.RESEND_FROM_EMAIL || "Altus Corp Dashboard <onboarding@resend.dev>";
  try {
    const { error } = await new Resend(key).emails.send({
      from,
      to: args.email,
      subject: "You've been invited to Altus Corp Dashboard",
      html: `<p>Welcome to Altus Corp Dashboard.  Set your password here:</p><p><a href="${args.resetLink}">${args.resetLink}</a></p>`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function runEmployeesPhase(csv: string, args: Args, report: Report) {
  const { rows, errors } = parseLegacyEmployees(csv);
  for (const e of errors) {
    report.employees.failed.push({ line: e.line, email: String(e.raw.email ?? ""), reason: e.message });
  }
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const existing = await db.query.employees.findFirst({ where: eq(employees.email, row.email) });
    if (existing) {
      report.employees.skipped_already_exists++;
      continue;
    }
    if (!args.commit) {
      report.employees.created++;
      continue;
    }
    // Ensure department row exists.
    if (row.department) {
      const dept = await db.query.departments.findFirst({
        where: sql`lower(${departments.name}) = lower(${row.department})`,
      });
      if (!dept) {
        await db.insert(departments).values({ name: row.department }).onConflictDoNothing();
      }
    }

    // Resolve the matching department FK so employees.department_id stays
    // in lock-step with the legacy employees.department text column.
    const matchedDept = await resolveDepartmentByName(row.department);
    const departmentText = matchedDept
      ? matchedDept.name
      : row.department && row.department.trim() !== ""
        ? row.department.trim()
        : null;

    // 1. Create Firebase user (emailVerified=false, not disabled).
    const auth = getAuthClient();
    let fbUid: string;
    try {
      const fbUser = await auth.createUser({
        email: row.email,
        emailVerified: false,
        disabled: false,
      });
      fbUid = fbUser.uid;
    } catch (err: any) {
      report.employees.failed.push({ line, email: row.email, reason: `Firebase: ${err?.message ?? err}` });
      continue;
    }

    // 2. Best-effort custom claim (Cloud Function will retry).
    try {
      await auth.setCustomUserClaims(fbUid, { role: "authenticated" });
    } catch {
      // continue
    }

    // 3. Insert the employees row.
    let inserted: typeof employees.$inferSelect | undefined;
    try {
      [inserted] = await db.insert(employees).values({
        name:         row.name,
        email:        row.email,
        role:         row.role,
        department:   departmentText,
        departmentId: matchedDept?.id ?? null,
        isAdmin:      row.isAdmin,
        firebaseUid:  fbUid,
        invitedAt:    new Date(),
      }).returning();
    } catch (err: any) {
      // Roll back the Firebase user since the DB write failed.
      await auth.deleteUser(fbUid).catch(() => {});
      report.employees.failed.push({ line, email: row.email, reason: `DB: ${err?.message ?? err}` });
      continue;
    }
    if (!inserted) {
      await auth.deleteUser(fbUid).catch(() => {});
      report.employees.failed.push({ line, email: row.email, reason: "DB: insert returned no row" });
      continue;
    }

    // 4. Optionally send the invite email.  Default OFF for bulk imports
    //    so legacy employees aren't spammed with 30 invite mails — the
    //    admin will hand-invite via /admin/employees → Resend invite.
    if (args.sendInvites) {
      try {
        const link = await auth.generatePasswordResetLink(row.email, {
          url: `${siteUrl()}/welcome`,
        });
        const sent = await sendInviteEmailLite({ email: row.email, resetLink: link });
        if (!sent.ok) {
          console.warn(`  ! Invite email failed for ${row.email}: ${sent.error}`);
        }
      } catch (err: any) {
        console.warn(`  ! Invite link generation failed for ${row.email}: ${err?.message ?? err}`);
      }
    }

    report.employees.created++;
  }
}

async function runTasksPhase(csv: string, args: Args, report: Report) {
  const { rows, errors } = parseLegacyTasks(csv);
  for (const e of errors) {
    report.tasks.failed.push({ line: e.line, reason: e.message, row: e.raw as unknown as LegacyTaskRow });
  }
  const empByName = new Map<string, { id: string; email: string }>();
  for (const e of await db.select({ id: employees.id, name: employees.name, email: employees.email }).from(employees)) {
    empByName.set(e.name.trim().toLowerCase(), { id: e.id, email: e.email });
  }
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const doer       = empByName.get(row.doer.trim().toLowerCase());
    const initiator  = empByName.get(row.initiator.trim().toLowerCase());
    if (!doer)       { report.tasks.failed.push({ line, reason: `unknown doer "${row.doer}"`, row });           continue; }
    if (!initiator)  { report.tasks.failed.push({ line, reason: `unknown initiator "${row.initiator}"`, row }); continue; }
    const status = mapLegacyStatus(row.status);
    if (!status)     { report.tasks.failed.push({ line, reason: `unknown status "${row.status}"`, row });        continue; }
    const assignDate = parseLegacyDate(row.assignDate);
    const dueDate    = parseLegacyDate(row.dueDate);
    if (isNaN(assignDate.getTime())) { report.tasks.failed.push({ line, reason: `bad assignDate "${row.assignDate}"`, row }); continue; }
    if (isNaN(dueDate.getTime()))    { report.tasks.failed.push({ line, reason: `bad dueDate "${row.dueDate}"`, row });       continue; }

    let subject = row.subject;
    let subjectSynthesised = false;
    if (!subject) {
      if (row.description) {
        subject = row.description.slice(0, 60);
      } else {
        // Salt the synthesised subject with the source line so multiple
        // empty-subject rows don't collapse to the same legacy_import_key.
        subject = `(imported row ${line})`;
        subjectSynthesised = true;
      }
    }
    const key = computeLegacyImportKey({
      doerEmail: doer.email,
      initiatorEmail: initiator.email,
      assignDate: row.assignDate,
      dueDate: row.dueDate,
      status,
      subject,
    });
    const dup = await db.query.tasks.findFirst({ where: eq(tasks.legacyImportKey, key) });
    if (dup) { report.tasks.skipped_already_imported++; continue; }
    if (!args.commit) {
      report.tasks.created++;
      if (subjectSynthesised) report.tasks.synthesised_subjects++;
      continue;
    }
    const taskId = crypto.randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tasks).values({
          id: taskId,
          title: subject,
          subject,
          description: row.description,
          doerId: doer.id,
          initiatorId: initiator.id,
          createdById: initiator.id,
          priority: row.priority ?? "not_imp_not_urgent",
          status,
          createdAt: assignDate,
          dueAt: dueDate,
          shortId: deriveShortId(taskId),
          legacyImportKey: key,
        });
        await tx.insert(taskEvents).values({
          taskId,
          actorId: initiator.id,
          eventType: "created",
          note: `imported from legacy sheet on ${new Date().toISOString().slice(0,10)}`,
          createdAt: assignDate,
        });
      });
      report.tasks.created++;
      if (subjectSynthesised) report.tasks.synthesised_subjects++;
    } catch (err) {
      report.tasks.failed.push({ line, reason: `DB: ${(err as Error).message}`, row });
    }
  }
}

async function main() {
  const args = parseFlags();
  const report: Report = {
    timestamp: new Date().toISOString(),
    args,
    employees: { created: 0, skipped_already_exists: 0, failed: [] },
    tasks:     { created: 0, skipped_already_imported: 0, synthesised_subjects: 0, failed: [] },
  };
  const banner = args.commit ? "COMMIT MODE (writing to DB)" : "DRY RUN (no writes)";
  const inviteBanner = args.commit
    ? args.sendInvites ? " · invites: ON" : " · invites: OFF"
    : "";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`Legacy import — ${report.timestamp}  [${banner}${inviteBanner}]`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (args.phase === "employees" || args.phase === "all") {
    console.log(`Phase 1: ${args.employeesCsv}`);
    const csv = readFileSync(resolve(args.employeesCsv), "utf8");
    await runEmployeesPhase(csv, args, report);
    console.log(`  ✓ Created: ${report.employees.created}`);
    console.log(`  ⊘ Skipped (already exists): ${report.employees.skipped_already_exists}`);
    console.log(`  ✗ Failed: ${report.employees.failed.length}`);
  }
  if (args.phase === "tasks" || args.phase === "all") {
    console.log(`\nPhase 2: ${args.tasksCsv}`);
    const csv = readFileSync(resolve(args.tasksCsv), "utf8");
    await runTasksPhase(csv, args, report);
    console.log(`  ✓ Created: ${report.tasks.created}`);
    console.log(`  ⊘ Skipped (already imported): ${report.tasks.skipped_already_imported}`);
    console.log(`  ⚠ Synthesised subjects: ${report.tasks.synthesised_subjects}`);
    console.log(`  ✗ Failed: ${report.tasks.failed.length}`);
    for (const f of report.tasks.failed.slice(0, 5)) console.log(`    - Row ${f.line}: ${f.reason}`);
    if (report.tasks.failed.length > 5) console.log(`    ... ${report.tasks.failed.length - 5} more`);
  }
  const out = `_reference/import-report-${report.timestamp.replace(/[:.]/g, "-")}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${out}\n`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
