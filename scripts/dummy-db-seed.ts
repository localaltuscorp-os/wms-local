import type { PGlite } from "@electric-sql/pglite";

/**
 * Dummy rows for DUMMY MODE — invented people, invented clients, invented work.
 *
 * WHAT IT IS FOR. The screens are built to display a populated organisation:
 * rosters, pickers, filters, charts, rankings, trees. Rendered against an empty
 * database they all collapse into their empty states, which is precisely the
 * one layout nobody needs to work on. So this fills the tables the app reads
 * first, with enough VARIETY that the interesting cases show up:
 *
 *   · every task status and every priority appears at least once
 *   · overdue, due-today and future tasks, so date colouring has all three
 *   · tasks spread across doers and initiators, so "assigned to me" differs
 *     from "everything"
 *   · one very long client name and one very long employee name, so
 *     truncation is exercised rather than assumed
 *   · a project tree five levels deep, plus a milestone with no children
 *   · a couple of archived rows, so the archive screen is not empty either
 *
 * NOBODY REAL IS IN HERE. The names are invented; the sole fixed identity is
 * DUMMY_USER, the account DUMMY MODE signs you in as.
 *
 * IDEMPOTENT. Every insert is `on conflict do nothing` against a fixed UUID, so
 * re-running the setup tops the data up instead of duplicating it.
 */

/** The employee DUMMY MODE signs you in as. Fixed so it survives a rebuild. */
export const DUMMY_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Dummy Admin",
  email: "dummy.admin@example.invalid",
} as const;

const EMP = {
  me: DUMMY_USER.id,
  asha: "00000000-0000-4000-8000-000000000002",
  ravi: "00000000-0000-4000-8000-000000000003",
  meera: "00000000-0000-4000-8000-000000000004",
  imran: "00000000-0000-4000-8000-000000000005",
  long: "00000000-0000-4000-8000-000000000006",
} as const;

const DEPT = {
  ops: "00000000-0000-4000-8001-000000000001",
  finance: "00000000-0000-4000-8001-000000000002",
  tech: "00000000-0000-4000-8001-000000000003",
} as const;

const DESIG = {
  manager: "00000000-0000-4000-8002-000000000001",
  executive: "00000000-0000-4000-8002-000000000002",
  lead: "00000000-0000-4000-8002-000000000003",
} as const;

/** Days from today, so the data is never stale relative to "now". */
function day(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}

const EMPLOYEES: [id: string, name: string, email: string, role: string, admin: boolean, dept: string, desig: string][] = [
  [EMP.me, DUMMY_USER.name, DUMMY_USER.email, "both", true, DEPT.tech, DESIG.manager],
  [EMP.asha, "Asha Kulkarni", "asha@example.invalid", "both", true, DEPT.ops, DESIG.manager],
  [EMP.ravi, "Ravi Deshpande", "ravi@example.invalid", "doer", false, DEPT.ops, DESIG.executive],
  [EMP.meera, "Meera Iyer", "meera@example.invalid", "doer", false, DEPT.finance, DESIG.lead],
  [EMP.imran, "Imran Shaikh", "imran@example.invalid", "initiator", false, DEPT.tech, DESIG.executive],
  // Long name — the pickers and table cells have to truncate something.
  [EMP.long, "Venkataraman Subramanian Krishnamurthy", "vsk@example.invalid", "doer", false, DEPT.finance, DESIG.executive],
];

const CLIENTS = [
  "Aurora Textiles",
  "Bharat Logistics",
  "Coastal Cements",
  "Deccan Foods",
  "Everest Pharma",
  "Ganges Steel Rolling & Fabrication Works", // long, for truncation
  "Himalaya Motors",
];

const SUBJECTS = [
  "Audit",
  "Billing",
  "Compliance",
  "Dispatch",
  "GST Filing",
  "Onboarding",
  "Quality Complaint",
  "Site Visit",
];

/** [title, doer, initiator, status, priority, dueOffsetDays, client, subject, archived] */
const TASKS: [string, string, string, string, string, number, string, string, boolean][] = [
  ["Reconcile September GST input credit", EMP.me, EMP.asha, "initiated", "imp_urgent", -3, "Deccan Foods", "GST Filing", false],
  ["Chase pending delivery challans", EMP.me, EMP.asha, "follow_up", "imp_urgent", -1, "Bharat Logistics", "Dispatch", false],
  ["Draft the quality complaint response", EMP.me, EMP.imran, "need_info", "imp_not_urgent", 0, "Aurora Textiles", "Quality Complaint", false],
  ["Close out the Q2 internal audit points", EMP.me, EMP.asha, "not_started", "imp_not_urgent", 4, "Everest Pharma", "Audit", false],
  ["Collect vendor GST certificates", EMP.me, EMP.imran, "dont_know", "not_imp_not_urgent", 11, "Coastal Cements", "Compliance", false],
  ["Update the plant-2 site visit report", EMP.ravi, EMP.me, "done", "not_imp_urgent", -6, "Himalaya Motors", "Site Visit", false],
  ["Raise the October billing batch", EMP.ravi, EMP.me, "initiated", "imp_urgent", 1, "Ganges Steel Rolling & Fabrication Works", "Billing", false],
  ["Onboard the two new dispatch operators", EMP.ravi, EMP.asha, "on_hold", "not_imp_not_urgent", 8, "Bharat Logistics", "Onboarding", false],
  ["Verify the weighbridge calibration record", EMP.meera, EMP.me, "need_help", "imp_urgent", -2, "Coastal Cements", "Compliance", false],
  ["Prepare the freight cost comparison", EMP.meera, EMP.imran, "follow_up_1", "imp_not_urgent", 3, "Bharat Logistics", "Billing", false],
  ["File the September TDS return", EMP.meera, EMP.asha, "follow_up_2", "imp_urgent", 2, "Deccan Foods", "GST Filing", false],
  ["Reply to the packaging defect notice", EMP.imran, EMP.me, "follow_up_3", "not_imp_urgent", 6, "Aurora Textiles", "Quality Complaint", false],
  ["Rework the dispatch scheduling sheet", EMP.imran, EMP.asha, "not_started", "not_imp_not_urgent", 14, "Himalaya Motors", "Dispatch", false],
  ["Compile the vendor onboarding checklist", EMP.long, EMP.me, "initiated", "imp_not_urgent", 5, "Everest Pharma", "Onboarding", false],
  ["Audit the scrap disposal register", EMP.long, EMP.imran, "done", "not_imp_not_urgent", -9, "Ganges Steel Rolling & Fabrication Works", "Audit", false],
  ["Archive the closed 2025 billing disputes", EMP.asha, EMP.me, "done", "not_imp_not_urgent", -20, "Deccan Foods", "Billing", true],
  ["Retire the old muster register format", EMP.asha, EMP.me, "cancelled", "not_imp_not_urgent", -25, "Aurora Textiles", "Compliance", true],
];

/** A project tree. [id, name, kind, parentId, sortOrder, owner, targetOffsetDays, progress, status] */
const NODES: [string, string, string, string | null, number, string | null, number | null, number | null, string | null][] = [
  ["00000000-0000-4000-8003-000000000001", "AICL WMS Rollout", "project", null, 0, EMP.asha, 120, 35, "initiated"],
  ["00000000-0000-4000-8003-000000000002", "ATTENDANCE", "milestone", "00000000-0000-4000-8003-000000000001", 0, EMP.ravi, 42, 50, "initiated"],
  ["00000000-0000-4000-8003-000000000003", "Biometric feed live on every site", "result", "00000000-0000-4000-8003-000000000002", 0, EMP.meera, 28, 40, "initiated"],
  ["00000000-0000-4000-8003-000000000004", "Shortlist and demo three vendors", "action", "00000000-0000-4000-8003-000000000003", 0, EMP.meera, 9, null, null],
  ["00000000-0000-4000-8003-000000000005", "Install readers at Plant 2", "action", "00000000-0000-4000-8003-000000000003", 1, EMP.imran, 21, null, null],
  ["00000000-0000-4000-8003-000000000006", "Site survey and cable route", "sub_action", "00000000-0000-4000-8003-000000000005", 0, EMP.imran, 15, null, null],
  ["00000000-0000-4000-8003-000000000007", "Confirm the conduit run", "sub_sub_action", "00000000-0000-4000-8003-000000000006", 0, null, 13, null, null],
  ["00000000-0000-4000-8003-000000000008", "Raise the cabling PO", "sub_action", "00000000-0000-4000-8003-000000000005", 1, null, null, null, null],
  ["00000000-0000-4000-8003-000000000009", "Muster register retired", "result", "00000000-0000-4000-8003-000000000002", 1, null, 68, null, "not_started"],
  // A milestone with no children — an empty branch must render as a leaf.
  ["00000000-0000-4000-8003-00000000000a", "PAYROLL", "milestone", "00000000-0000-4000-8003-000000000001", 1, EMP.asha, 89, null, "not_started"],
  ["00000000-0000-4000-8003-00000000000b", "Vendor Portal", "project", null, 1, EMP.imran, 210, 0, "not_started"],
  ["00000000-0000-4000-8003-00000000000c", "KICK-OFF", "milestone", "00000000-0000-4000-8003-00000000000b", 0, null, 32, null, "not_started"],
  ["00000000-0000-4000-8003-00000000000d", "Scope signed off by both sides", "result", "00000000-0000-4000-8003-00000000000c", 0, EMP.asha, 32, null, "not_started"],
];

export async function seedDummyData(pg: PGlite): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const bump = async (table: string) => {
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    counts[table] = r.rows[0]?.n ?? 0;
  };

  for (const [id, name] of [
    [DEPT.ops, "Operations"],
    [DEPT.finance, "Finance"],
    [DEPT.tech, "Technology"],
  ] as const) {
    await pg.query(`insert into departments (id, name) values ($1,$2) on conflict do nothing`, [id, name]);
  }

  for (const [id, name] of [
    [DESIG.manager, "Manager"],
    [DESIG.executive, "Executive"],
    [DESIG.lead, "Team Lead"],
  ] as const) {
    await pg.query(`insert into designations (id, name) values ($1,$2) on conflict do nothing`, [id, name]);
  }

  for (const [id, name, email, role, admin, dept, desig] of EMPLOYEES) {
    await pg.query(
      `insert into employees (id, name, email, role, is_admin, is_active, department_id, designation_id, joined_at)
       values ($1,$2,$3,$4::employee_role,$5,true,$6,$7, now() - interval '200 days')
       on conflict (id) do nothing`,
      [id, name, email, role, admin, dept, desig],
    );
  }
  await bump("employees");

  for (const name of CLIENTS) {
    await pg.query(`insert into clients (name) values ($1) on conflict do nothing`, [name]);
  }
  await bump("clients");

  for (const name of SUBJECTS) {
    await pg.query(`insert into subjects (name) values ($1) on conflict do nothing`, [name]);
  }
  await bump("subjects");

  let i = 0;
  for (const [title, doer, initiator, status, priority, due, client, subject, archived] of TASKS) {
    const id = `00000000-0000-4000-8004-${String(++i).padStart(12, "0")}`;
    await pg.query(
      `insert into tasks
         (id, title, doer_id, initiator_id, created_by_id, status, priority, due_at,
          client, subject, archived, description, created_at,
          completed_at)
       values ($1,$2,$3,$4,$4,$5::task_status,$6::task_priority,$7,$8,$9,$10,$11,
               now() - interval '30 days',
               case when $5 = 'done' then now() - interval '2 days' else null end)
       on conflict (id) do nothing`,
      [
        id,
        title,
        doer,
        initiator,
        status,
        priority,
        day(due),
        client,
        subject,
        archived,
        `Dummy task — ${subject.toLowerCase()} work for ${client}.`,
      ],
    );
  }
  await bump("tasks");

  for (const [id, name, kind, parent, sort, owner, target, progress, status] of NODES) {
    await pg.query(
      `insert into project_nodes
         (id, name, kind, parent_id, sort_order, owner_id, target_date, progress_percent, status, created_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (id) do nothing`,
      [id, name, kind, parent, sort, owner, target === null ? null : day(target).slice(0, 10), progress, status, EMP.me],
    );
  }
  await bump("project_nodes");

  return counts;
}
