import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
  // Named exactly "HR", not "Human Resources": matchesDepartment() (lib/
  // workspaces.ts) lowercases the name, splits it on non-letters and looks for
  // the token "hr", so "Human Resources" → ["human","resources"] does NOT match.
  hr: "00000000-0000-4000-8001-000000000004",
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

/* ---------------------------------------------------------------------------
 * CANDIDATES - the no-login interview form (0221) and policies (0222).
 *
 * Both screens are lists, so against an empty database they show only their
 * empty state and neither feature can be looked at, let alone tested. These
 * rows put one candidate in each state that behaves DIFFERENTLY:
 *
 *   - not started      link issued, form untouched
 *   - part-filled      a draft mid-way, so the progress badge renders
 *                      something other than 0% or 100%
 *   - submitted        "Complete", and still editable over the link, which is
 *                      the whole promise of the flow
 *   - policies started 2 of 6 signed, so the list shows both states at once
 *   - closed record    candidate_active false, which is what makes the
 *                      "reopen this candidate?" confirmation appear
 *
 * -- THE TOKENS ARE FIXED, AND THAT IS ONLY SAFE HERE ----------------------
 * A real link's plaintext token exists for one moment and is never stored -
 * only its SHA-256 reaches the database - so a seeded candidate would normally
 * be unopenable: you would have the row but no URL. These hashes are therefore
 * derived from KNOWN strings, printed by dummy-db-setup.ts, so the sandbox
 * hands you links that actually work.
 *
 * That is a deliberate hole in an otherwise unguessable credential, and it is
 * confined to this file: it runs from `pnpm dummy:setup` / `dummy:reset`
 * against the local PGlite fixture only, never against Supabase, and DUMMY_MODE
 * is ignored under NODE_ENV=production. Nothing here reaches a deployed site.
 * ------------------------------------------------------------------------- */

const CAND = {
  fresh: "00000000-0000-4000-8100-000000000001",
  partial: "00000000-0000-4000-8100-000000000002",
  submitted: "00000000-0000-4000-8100-000000000003",
  policies: "00000000-0000-4000-8100-000000000004",
  closed: "00000000-0000-4000-8100-000000000005",
} as const;

/** Each candidate's own `employees` row - the subject every write targets. */
const CAND_EMP = {
  fresh: "00000000-0000-4000-8101-000000000001",
  partial: "00000000-0000-4000-8101-000000000002",
  submitted: "00000000-0000-4000-8101-000000000003",
  policies: "00000000-0000-4000-8101-000000000004",
  closed: "00000000-0000-4000-8101-000000000005",
} as const;

/** Plaintext tokens. Printed on setup; only the hash is stored. DEV ONLY. */
export const DUMMY_TOKENS = {
  fresh: "dummy-form-link-not-started-000000000",
  partial: "dummy-form-link-part-filled-000000000",
  submitted: "dummy-form-link-submitted-00000000000",
  policies: "dummy-policies-link-two-signed-000000",
} as const;

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/**
 * The local org chart for Team Reporting, or none.
 *
 * Absent file → empty chart, not an error: the file is deliberately not in the
 * repository, so its absence is the normal case on every machine but one.
 */
function loadLocalTeamTree(): { name: string; reports: string[] }[] {
  const file = join(process.cwd(), "scripts", "dummy-team-tree.local.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (n): n is { name: string; reports: string[] } =>
          !!n &&
          typeof (n as { name?: unknown }).name === "string" &&
          Array.isArray((n as { reports?: unknown }).reports),
      )
      .map((n) => ({ name: n.name, reports: n.reports.filter((r) => typeof r === "string") }));
  } catch {
    console.warn(`Ignoring ${file}: it is not valid JSON.`);
    return [];
  }
}

async function seedCandidates(pg: PGlite): Promise<void> {
  const rows: [string, string, string, string, string, string, string | null, boolean][] = [
    [CAND.fresh, CAND_EMP.fresh, "Aarav Kulkarni", "aarav.kulkarni@example.invalid", "9820011001", "Operations Executive", null, true],
    [CAND.partial, CAND_EMP.partial, "Diya Raghunathan", "diya.raghunathan@example.invalid", "9820011002", "Finance Executive", null, true],
    [CAND.submitted, CAND_EMP.submitted, "Kabir Sheth", "kabir.sheth@example.invalid", "9820011003", "Second-Year Intern", "2 days", true],
    [CAND.policies, CAND_EMP.policies, "Ishaan Vora", "ishaan.vora@example.invalid", "9820011004", "Team Lead", "5 days", true],
    [CAND.closed, CAND_EMP.closed, "Meher Bhatt", "meher.bhatt@example.invalid", "9820011005", "Operations Executive", null, false],
  ];

  for (const [intakeId, empId, name, email, mobile, position, submittedAgo, active] of rows) {
    // The wizard reads `data` under its own `sectionId.fieldKey` keys, so the
    // candidate opens a form already carrying what HR typed rather than a blank.
    const data: Record<string, string> = {
      "personal.fullName": name,
      "personal.mobile": mobile,
      "personal.email": email,
      "personal.position": position,
    };
    // The part-filled one carries extra answers so its progress badge lands
    // between the two extremes instead of at one of them.
    if (intakeId === CAND.partial) {
      Object.assign(data, {
        "personal.dob": "1998-04-14",
        "personal.gender": "Female",
        "personal.address": "14, Linking Road, Bandra West, Mumbai 400050",
        "personal.maritalStatus": "Single",
        "education.highestQualification": "B.Com, Mumbai University",
        "experience.totalYears": "3",
      });
    }

    await pg.query(
      "insert into candidate_intake" +
        " (id, full_name, email, mobile, position_applied, data, submitted_at, created_by_id, created_at)" +
        " values ($1,$2,$3,$4,$5,$6::jsonb," +
        (submittedAgo ? " now() - interval '" + submittedAgo + "'," : " null,") +
        " $7, now() - interval '6 days')" +
        " on conflict (id) do nothing",
      [intakeId, name, email, mobile, position, JSON.stringify(data), EMP.me],
    );

    // account_type 'candidate' with is_active false is what the DB CHECK
    // expects; `candidate_active` is the liveness flag resolveAccessLink()
    // re-reads on every single request.
    await pg.query(
      "insert into employees" +
        " (id, name, email, role, is_admin, is_active, account_type, candidate_active," +
        "  candidate_intake_id, personal_email, invited_at, deactivated_at)" +
        " values ($1,$2,$3,'doer'::employee_role,false,false,'candidate',$4,$5,$3," +
        " now() - interval '6 days'," +
        (active ? " null)" : " now() - interval '1 day')") +
        " on conflict (id) do nothing",
      [empId, name, email, active, intakeId],
    );
  }

  // One live link each. The CLOSED candidate deliberately gets none: their
  // record is shut, so a link would resolve to nothing, and a dead link is
  // worse than no link. Re-opening them is what the HR dialog now asks about.
  const links: [string, string, string][] = [
    [CAND.fresh, DUMMY_TOKENS.fresh, "form"],
    [CAND.partial, DUMMY_TOKENS.partial, "form"],
    [CAND.submitted, DUMMY_TOKENS.submitted, "form"],
    [CAND.policies, DUMMY_TOKENS.policies, "policies"],
  ];
  for (const [intakeId, token, purpose] of links) {
    await pg.query(
      "insert into candidate_access_links" +
        " (intake_id, token_hash, expires_at, purpose, created_by_id, created_at)" +
        " values ($1,$2, now() + interval '30 days', $3, $4, now() - interval '6 days')" +
        " on conflict (token_hash) do nothing",
      [intakeId, sha256(token), purpose, EMP.me],
    );
  }

  // Two of six policies already accepted, so the candidate's list shows signed
  // AND unsigned rows on first open. `policy_compliance` is mirrored the way the
  // real action does it, with a null doc_instance_id marking a typed candidate
  // acceptance rather than a DigiLocker-backed signature.
  for (const key of ["posh-policy", "exit-policy"]) {
    await pg.query(
      "insert into candidate_policy_signatures" +
        " (intake_id, employee_id, policy_key, version, signed_name, signed_at, updated_at)" +
        " values ($1,$2,$3,1,$4, now() - interval '3 days', now() - interval '3 days')" +
        " on conflict (intake_id, policy_key) do nothing",
      [CAND.policies, CAND_EMP.policies, key, "Ishaan Vora"],
    );
    await pg.query(
      "insert into policy_compliance" +
        " (policy_key, employee_id, version, status, signed_at)" +
        " values ($1,$2,1,'signed', now() - interval '3 days')" +
        " on conflict (policy_key, employee_id) do nothing",
      [key, CAND_EMP.policies],
    );
  }
}

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
    [DEPT.hr, "HR"],
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
  // THE DUMMY ADMIN IS HR STAFF — seeded, not hand-tweaked.
  //
  // Without this, every /hr/* sub-page silently bounces back to /hr and the
  // console looks broken: you pick "Selection Letter" and land on the module's
  // "choose a step" placeholder, with the URL never leaving /hr. The cause is
  // requireHrStaff() (lib/hr/access.ts), which admits super-admins and members
  // of the "HR" department ONLY — `is_admin` explicitly does NOT count, and the
  // seeded admin was in Technology.
  //
  // This used to be a manual UPDATE somebody ran against .pglite by hand, so it
  // vanished on every `pnpm dummy:setup --reset` and the redirect loop came
  // back looking like a fresh bug. Seeding it makes a reset reproduce a working
  // sandbox instead.
  //
  // BOTH sources isHrStaff() reads are set, because they are different places:
  // the `department` TEXT column on the employee row, and membership in the
  // structured `employee_departments` join table (employeeDepartmentNames()
  // reads only the latter). `department_id` alone feeds NEITHER.
  // Resolve the HR department BY NAME rather than trusting DEPT.hr: the
  // migrations may already ship an "HR" row with an id of their own, in which
  // case the seed's `on conflict do nothing` insert above is skipped and
  // DEPT.hr never exists — pointing employees.department_id at it then fails
  // the employees_department_id_fkey constraint.
  const hrDept = await pg.query<{ id: string }>(
    `select id from departments where lower(name) = 'hr' limit 1`,
  );
  const hrDeptId = hrDept.rows[0]?.id ?? null;

  // The TEXT column is set unconditionally — it is on its own sufficient for
  // isHrStaff(), so the sandbox still works even if no departments row exists.
  await pg.query(`update employees set department = 'HR' where id = $1`, [EMP.me]);

  if (hrDeptId) {
    await pg.query(`update employees set department_id = $1 where id = $2`, [hrDeptId, EMP.me]);
    await pg.query(
      `insert into employee_departments (employee_id, department_id) values ($1,$2)
       on conflict do nothing`,
      [EMP.me, hrDeptId],
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

  // ── A LOCAL-ONLY ORG CHART, for Operations > Team Reporting ────────────
  //
  // Team Reporting is tested against a real org chart, and real names do not
  // belong in the repository. So the chart is read from
  // scripts/dummy-team-tree.local.json - git-ignored - and simply skipped when
  // that file is absent (a fresh clone, CI, anybody else's machine).
  //
  // Nothing here can reach production: this seed only ever runs against the
  // local PGlite database (`pnpm dummy:setup`), which DUMMY_MODE refuses to use
  // outside development, and the file it reads is never pushed.
  //
  // SCOPED TO THE HIERARCHY. The people are plain employee rows with
  // manager_id set - no tasks, goals, KPI or attendance - so no other module
  // changes shape. The six fixture employees stay unattached here and are
  // filtered off the Team Reporting board itself (see that page), while every
  // other module still sees them.
  //
  // `on conflict do nothing` + `where manager_id is null`: re-runnable, and a
  // transfer made in the UI is never undone by topping the fixture up.
  const TREE = loadLocalTeamTree();

  // One stable id per name, so re-seeding updates the same rows instead of
  // filling the roster with duplicates. Ordered by first appearance: the head of
  // the tree, then each manager's reports.
  const treeNames: string[] = [];
  for (const node of TREE) {
    if (!treeNames.includes(node.name)) treeNames.push(node.name);
    for (const r of node.reports) if (!treeNames.includes(r)) treeNames.push(r);
  }
  const treeId = (name: string) =>
    `00000000-0000-4000-8003-${String(treeNames.indexOf(name) + 1).padStart(12, "0")}`;
  const managerNames = new Set(TREE.filter((n) => n.reports.length > 0).map((n) => n.name));
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, ".");

  for (const name of treeNames) {
    await pg.query(
      `insert into employees (id, name, email, role, is_admin, is_active, department_id, designation_id, joined_at)
       values ($1,$2,$3,'doer'::employee_role,false,true,$4,$5, now() - interval '200 days')
       on conflict (id) do nothing`,
      [
        treeId(name),
        name,
        `${slug(name)}@example.invalid`,
        DEPT.ops,
        managerNames.has(name) ? DESIG.manager : DESIG.executive,
      ],
    );
  }

  for (const node of TREE) {
    for (const r of node.reports) {
      await pg.query(
        "update employees set manager_id = $2 where id = $1 and manager_id is null",
        [treeId(r), treeId(node.name)],
      );
    }
  }

  await seedCandidates(pg);
  await bump("candidate_intake");

  return counts;
}
