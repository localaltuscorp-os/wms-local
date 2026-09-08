/**
 * DUMMY-DATA SEEDER — for the throwaway local Postgres only.
 *
 * The production `.env.local` points at the LIVE Supabase project, and this
 * repo's other seed scripts are deliberately disabled stubs for exactly that
 * reason. This one is safe because it REFUSES TO RUN against anything that is
 * not a loopback host, and refuses outright on a deployment. That guard is the
 * whole point of the file — do not relax it.
 *
 * Usage (dry-run prints the plan, --apply writes):
 *   node node_modules/tsx/dist/cli.mjs --env-file=.env.local scripts/seed-dummy.ts
 *   node node_modules/tsx/dist/cli.mjs --env-file=.env.local scripts/seed-dummy.ts --apply
 *
 * Re-runnable: it clears the rows it owns (the seeded employees and everything
 * hanging off them) and rewrites them, so the dataset stays stable instead of
 * doubling on every run.
 */
import { pathToFileURL } from "url";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  departments,
  designations,
  employeeDepartments,
  employees,
  goals,
  payingEntities,
  tasks,
  weeklyGoals,
} from "@/db/schema";

const APPLY = process.argv.includes("--apply");

/* ── The guard ─────────────────────────────────────────────────────────── */

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Throws unless DATABASE_URL is a loopback Postgres and we are not deployed. */
function assertLocalTarget(): URL {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    throw new Error("Refusing to seed: this is a deployment.");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const url = new URL(raw);
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at "${url.hostname}", which is not a ` +
        `local database. This script writes dummy rows and must never touch the ` +
        `live Supabase project. Point DATABASE_URL at the local dummy cluster first.`,
    );
  }
  return url;
}

/* ── Fixtures ──────────────────────────────────────────────────────────── */

/** The account the no-login local session signs in as (DEV_USER_EMAIL). */
const DEV_EMAIL = (process.env.DEV_USER_EMAIL ?? "vinalpatil.altuscorp@gmail.com").toLowerCase();

type PersonSeed = {
  name: string;
  email: string;
  department: string;
  designation: string;
  isAdmin?: boolean;
  role?: "doer" | "initiator" | "both";
};

const PEOPLE: PersonSeed[] = [
  { name: "Vinal Patil", email: DEV_EMAIL, department: "Founder Office", designation: "Founder", isAdmin: true, role: "both" },
  { name: "Aarti Deshmukh", email: "aarti.demo@example.test", department: "Sales", designation: "Sales Manager", isAdmin: true, role: "both" },
  { name: "Rohan Kulkarni", email: "rohan.demo@example.test", department: "Sales", designation: "Sales Executive" },
  { name: "Sneha Iyer", email: "sneha.demo@example.test", department: "Marketing", designation: "Marketing Lead", role: "both" },
  { name: "Imran Shaikh", email: "imran.demo@example.test", department: "Social Media", designation: "Content Designer" },
  { name: "Priya Nair", email: "priya.demo@example.test", department: "Accounts", designation: "Accountant" },
  { name: "Karan Mehta", email: "karan.demo@example.test", department: "Apps", designation: "Software Engineer" },
  { name: "Divya Rao", email: "divya.demo@example.test", department: "Apps", designation: "Software Engineer" },
  { name: "Farhan Qureshi", email: "farhan.demo@example.test", department: "HR", designation: "HR Executive", role: "both" },
  { name: "Meera Joshi", email: "meera.demo@example.test", department: "Consulting", designation: "Consultant" },
  { name: "Ajay Pawar", email: "ajay.demo@example.test", department: "Handholding", designation: "Client Success" },
  { name: "Neha Bhatt", email: "neha.demo@example.test", department: "CRM", designation: "CRM Executive" },
];

const CLIENT_NAMES = [
  "Ashwini Enterprises",
  "Bluecrest Textiles",
  "Deccan Polymers",
  "Everline Logistics",
  "Girija Foods",
  "Kaveri Motors",
  "Nirvana Interiors",
  "Sahyadri Steel",
];

const DESIGNATIONS = [...new Set(PEOPLE.map((p) => p.designation))];
const PAYING_ENTITIES = ["Altus Corp", "Productivity Shastra"];

const TASK_TITLES = [
  "Follow up on the pending quotation",
  "Prepare the monthly MIS pack",
  "Draft the onboarding deck for the new client",
  "Reconcile last month's vendor invoices",
  "Review the campaign creatives",
  "Close out the open support tickets",
  "Schedule the quarterly review call",
  "Update the CRM pipeline stages",
  "Publish the case study on the website",
  "Collect the signed service agreement",
  "Fix the reported bug in the attendance screen",
  "Plan next week's content calendar",
  "Verify the payroll inputs",
  "Send the renewal reminder",
  "Audit the document folder structure",
];

const STATUSES = ["dont_know", "not_started", "initiated", "follow_up", "need_info", "on_hold", "done"] as const;
const PRIORITIES = ["imp_urgent", "imp_not_urgent", "not_imp_urgent", "not_imp_not_urgent"] as const;

/* ── Small deterministic helpers ───────────────────────────────────────── */

/**
 * Deterministic PRNG so successive runs produce the SAME dataset — a fixture
 * that moves under you makes "did my change cause that?" impossible to answer.
 */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rand = makeRng(20260904);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(18, 30, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monday of the week `offsetWeeks` away from this one, as an ISO date. */
function weekStart(offsetWeeks: number): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function monthKey(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

/* ── Seed ──────────────────────────────────────────────────────────────── */

export async function seedDummy(): Promise<void> {
  const url = assertLocalTarget();
  console.log(`▸ Target: ${url.pathname.replace(/^\//, "")} on ${url.host}`);
  console.log(`▸ Session user (DEV_USER_EMAIL): ${DEV_EMAIL}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to seed:");
    console.log(
      `  ${PEOPLE.length} employees · ${CLIENT_NAMES.length} clients · 90 tasks · ` +
        `weekly goals for 3 weeks · a year/quarter/month goal tree per person`,
    );
    return;
  }

  // Lookup lists first. Additive and shared with the migrations' own department
  // seed, so these merely fill gaps.
  await db
    .insert(designations)
    .values(DESIGNATIONS.map((name, i) => ({ name, sortOrder: i * 10 })))
    .onConflictDoNothing({ target: designations.name });
  await db
    .insert(payingEntities)
    .values(PAYING_ENTITIES.map((name, i) => ({ name, sortOrder: i * 10 })))
    .onConflictDoNothing({ target: payingEntities.name });
  await db
    .insert(departments)
    .values([...new Set(PEOPLE.map((p) => p.department))].map((name) => ({ name })))
    .onConflictDoNothing({ target: departments.name });
  await db
    .insert(clients)
    .values(CLIENT_NAMES.map((name, i) => ({ name, sortOrder: i * 10 })))
    .onConflictDoNothing({ target: clients.name });

  const deptRows = await db.select({ id: departments.id, name: departments.name }).from(departments);
  const deptId = new Map(deptRows.map((d) => [d.name, d.id]));

  // Clear what this script owns so a re-run rewrites rather than doubles up.
  // Tasks and goals reference employees, so they go first.
  const emails = PEOPLE.map((p) => p.email);
  const existing = await db.select({ id: employees.id }).from(employees).where(inArray(employees.email, emails));
  const oldIds = existing.map((e) => e.id);
  if (oldIds.length) {
    await db.delete(tasks).where(inArray(tasks.doerId, oldIds));
    await db.delete(goals).where(inArray(goals.employeeId, oldIds));
    await db.delete(weeklyGoals).where(inArray(weeklyGoals.employeeId, oldIds));
    await db.delete(employeeDepartments).where(inArray(employeeDepartments.employeeId, oldIds));
    await db.delete(employees).where(inArray(employees.id, oldIds));
  }

  const staff = await db
    .insert(employees)
    .values(
      PEOPLE.map((p) => ({
        name: p.name,
        email: p.email,
        role: p.role ?? ("doer" as const),
        department: p.department,
        departmentId: deptId.get(p.department) ?? null,
        isAdmin: p.isAdmin ?? false,
        isActive: true,
        joinedAt: daysFromNow(-400),
        // No firebase_uid on purpose: these accounts cannot sign in, which is
        // fine — local testing runs with DISABLE_AUTH=true.
      })),
    )
    .returning({ id: employees.id, name: employees.name, email: employees.email });

  const byEmail = new Map(staff.map((e) => [e.email, e]));
  const me = byEmail.get(DEV_EMAIL)!;

  await db
    .insert(employeeDepartments)
    .values(
      PEOPLE.map((p) => ({
        employeeId: byEmail.get(p.email)!.id,
        departmentId: deptId.get(p.department)!,
        isPrimary: true,
      })),
    )
    .onConflictDoNothing();

  // Tasks — spread across statuses, priorities and a due window straddling
  // today, so the overdue / due-today / upcoming buckets all have something in
  // them and the dashboard KPIs are not all zero.
  const taskRows = [];
  for (let i = 0; i < 90; i++) {
    const doer = pick(staff);
    const initiator = pick(staff);
    const status = pick(STATUSES);
    const dueOffset = Math.floor(rand() * 40) - 20;
    const done = status === "done";
    taskRows.push({
      title: `${pick(TASK_TITLES)} (#${i + 1})`,
      description: "Dummy task generated by scripts/seed-dummy.ts for local testing.",
      doerId: doer.id,
      initiatorId: initiator.id,
      createdById: initiator.id,
      priority: pick(PRIORITIES),
      status,
      dueAt: daysFromNow(dueOffset),
      completedAt: done ? daysFromNow(Math.min(dueOffset, 0)) : null,
      client: pick(CLIENT_NAMES),
      subject: pick(CLIENT_NAMES),
      createdAt: daysFromNow(dueOffset - 7),
    });
  }
  await db.insert(tasks).values(taskRows);

  // Weekly goals — last week, this week and next week for everyone.
  const weeklyRows = [];
  for (const offset of [-1, 0, 1]) {
    for (const person of staff) {
      for (let position = 1; position <= 3; position++) {
        const pct = offset < 0 ? 60 + Math.floor(rand() * 41) : Math.floor(rand() * 70);
        weeklyRows.push({
          employeeId: person.id,
          weekStart: weekStart(offset),
          position,
          client: pick(CLIENT_NAMES),
          subject: pick(TASK_TITLES),
          priority: pick(PRIORITIES),
          targetDone: `Target ${position} for the week`,
          pctDone: pct,
          weight: 100,
          status: pct >= 100 ? ("done" as const) : ("initiated" as const),
          notes: "Dummy weekly goal.",
        });
      }
    }
  }
  await db.insert(weeklyGoals).values(weeklyRows);

  // Periodic goals — a year goal per person with quarter and month children, so
  // the Goals dashboard has a real tree with roll-up to look at.
  const year = String(new Date().getFullYear());
  for (const person of staff) {
    const [yearGoal] = await db
      .insert(goals)
      .values({
        employeeId: person.id,
        period: "year",
        periodKey: year,
        position: 1,
        title: `Grow ${person.name.split(" ")[0]}'s portfolio in ${year}`,
        area: "Business",
        client: pick(CLIENT_NAMES),
        uom: "accounts",
        targetQty: "24.00",
        actualQty: `${8 + Math.floor(rand() * 10)}.00`,
        targetAmount: "2400000.00",
        actualAmount: `${400000 + Math.floor(rand() * 900000)}.00`,
        pctDone: 20 + Math.floor(rand() * 50),
        weight: 100,
      })
      .returning({ id: goals.id });

    const [quarterGoal] = await db
      .insert(goals)
      .values({
        employeeId: person.id,
        period: "quarter",
        periodKey: quarterKey(),
        parentGoalId: yearGoal!.id,
        position: 1,
        title: "Close 6 accounts this quarter",
        area: "Business",
        client: pick(CLIENT_NAMES),
        uom: "accounts",
        targetQty: "6.00",
        actualQty: `${1 + Math.floor(rand() * 5)}.00`,
        pctDone: 20 + Math.floor(rand() * 60),
        weight: 100,
        source: "cascade",
      })
      .returning({ id: goals.id });

    await db.insert(goals).values(
      [-1, 0].map((m, i) => ({
        employeeId: person.id,
        period: "month",
        periodKey: monthKey(m),
        parentGoalId: quarterGoal!.id,
        position: i + 1,
        title: `Close 2 accounts in ${monthKey(m)}`,
        area: "Business",
        client: pick(CLIENT_NAMES),
        uom: "accounts",
        targetQty: "2.00",
        actualQty: `${Math.floor(rand() * 3)}.00`,
        pctDone: m < 0 ? 70 + Math.floor(rand() * 31) : Math.floor(rand() * 60),
        weight: 100,
        source: "cascade",
      })),
    );
  }

  const counts = await db.execute(sql`
    select
      (select count(*) from employees)    as employees,
      (select count(*) from tasks)        as tasks,
      (select count(*) from weekly_goals) as weekly_goals,
      (select count(*) from goals)        as goals,
      (select count(*) from clients)      as clients
  `);
  console.log("\n✓ Dummy data written");
  console.table(counts);
  console.log(`\nLogin is off locally (DISABLE_AUTH=true) — you land on /hub as ${me.name}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seedDummy()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\nSeed failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
