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

/**
 * CLIENT ENGAGEMENT — enough rows to see every rule work.
 *
 * Deliberately includes the awkward cases, because a module that only ever sees
 * tidy data is a module whose edges nobody has looked at: an entity in the
 * unassigned pool, one on hold, one on barter, one that has not started yet, a
 * lead sitting near the 27-hour line, and a call with no times on it at all.
 *
 * Fixed ids with `on conflict do nothing`, like the rest of this file: re-seed
 * as often as you like, and anything edited in the app stays edited.
 */
async function seedClientEngagement(
  pg: PGlite,
  /** The roster id for a name, or NULL when that person is not in the org tree.
   *
   *  It used to be `(name) => string`, and the three Client Engagement leads —
   *  Jeevan, Ruchita, Mitul — are named ONLY here; they were never added to
   *  TREE. `treeId` builds its uuid from `treeNames.indexOf(name)`, so an
   *  unknown name produced `…-8003-000000000000`, an id no employee has, and
   *  the first insert died on `pa_people_employee_id_fkey`. That made a fresh
   *  dummy database impossible to build (upstream carries the same bug).
   *
   *  `pa_people.employee_id` is nullable on purpose — migration 0191 says "one
   *  row per roster employee; free-typed people are unconstrained" — so a lead
   *  who is not on the roster is a legitimate row with no employee behind it,
   *  which is a truer statement than pointing at an id that does not exist. */
  employeeIdOf: (name: string) => string | null,
  today: Date,
): Promise<void> {
  const ce = (n: number) => `00000000-0000-4000-8005-${String(n).padStart(12, "0")}`;
  const ymd = (offsetDays: number) =>
    new Date(today.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  // ── The leads, with a roster row of their own ──
  const LEADS: [number, string][] = [
    [1, "Jeevan"],
    [2, "Ruchita"],
    [3, "Mitul"],
  ];
  for (const [n, name] of LEADS) {
    await pg.query(
      `insert into pa_people (id, kind, name, employee_id, is_ce_lead)
       values ($1,'employee',$2,$3,true)
       on conflict (id) do nothing`,
      [ce(n), name, employeeIdOf(name)],
    );
  }
  const lead = (name: string) => ce(LEADS.find((l) => l[1] === name)![0]);

  // ── Participants and clients ──
  // id, name, product, batch, owner, on hold, colour band, starts, ends
  const ENTRIES: [number, string, string, string | null, string | null, boolean, string | null, string, string][] = [
    [10, "Mihir Vira", "ps", "91", lead("Jeevan"), false, "active", ymd(-30), ymd(60)],
    [11, "Sneha Kulkarni", "ps", "91", lead("Jeevan"), false, "active", ymd(-30), ymd(60)],
    [12, "Farhan Qureshi", "bss", "88", lead("Jeevan"), false, "active", ymd(-45), ymd(45)],
    [13, "Tanvi Deshpande", "bss", "88", lead("Ruchita"), false, "active", ymd(-20), ymd(70)],
    [14, "Lakshmi Iyer", "os", null, lead("Ruchita"), false, "barter", ymd(-60), ymd(120)],
    [15, "Nikhil Rao", "retainer", null, lead("Mitul"), false, "active", ymd(-10), ymd(170)],
    // On hold: theirs, but costing the week nothing.
    [16, "Aarti Menon", "ps", "90", lead("Mitul"), true, "active", ymd(-90), ymd(10)],
    // Not started: the status derives itself when the day comes.
    [17, "Pranav Shetty", "bss", "92", lead("Ruchita"), false, "active", ymd(21), ymd(140)],
    // The unassigned pool.
    [18, "Devika Nair", "ps", "92", null, false, "active", ymd(7), ymd(120)],
    [19, "Rohit Bhatia", "os", null, null, false, "active", ymd(-5), ymd(180)],
    [20, "Kiran Joshi", "retainer", null, null, false, "active", ymd(-2), ymd(200)],
  ];
  for (const [n, name, section, batch, owner, hold, highlight, start, end] of ENTRIES) {
    await pg.query(
      `insert into pa_entries (id, person_id, section, name, batch_no, on_hold, highlight, start_date, end_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do nothing`,
      [ce(n), owner, section, name, batch, hold, highlight, start, end],
    );
  }

  // ── Ambassadors: on a revenue share by definition, one still unclaimed ──
  const AMBASSADORS: [number, string, string | null][] = [
    [30, "Vikram Sethi", lead("Mitul")],
    [31, "Ananya Ghosh", null],
  ];
  for (const [n, name, owner] of AMBASSADORS) {
    await pg.query(
      `insert into pa_ambassadors (id, name, email, products, owner_person_id, status, start_date)
       values ($1,$2,$3,'{"ps"}',$4,'revenue_share',$5)
       on conflict (id) do nothing`,
      [ce(n), name, `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.invalid`, owner, ymd(-120)],
    );
  }

  // ── The weekly calls ──
  // Jeevan is deliberately taken close to the 27-hour line, so the red flag on
  // the grid and the calendar's banner can be seen without arranging anything.
  // entity, seq, type, day, from, to
  const CALLS: [number, number, string, string, string, string][] = [
    [10, 1, "hh", "mon", "10:00", "13:00"],
    [10, 2, "tool", "wed", "10:00", "13:00"],
    [11, 1, "hh", "mon", "13:00", "16:00"],
    [11, 2, "checkin", "thu", "10:00", "14:00"],
    [12, 1, "hh", "tue", "10:00", "14:00"],
    [12, 2, "tool", "fri", "10:00", "14:00"],
    [12, 3, "courtesy", "sat", "10:00", "13:30"],
    [13, 1, "hh", "tue", "15:00", "17:00"],
    [14, 1, "checkin", "wed", "11:00", "12:00"],
    [15, 1, "reference", "thu", "16:00", "17:30"],
    [16, 1, "hh", "fri", "15:00", "16:00"],
    [30, 1, "courtesy", "mon", "17:00", "18:00"],
  ];
  for (const [entity, seq, type, day, from, to] of CALLS) {
    const minutes =
      (Number(to.slice(0, 2)) * 60 + Number(to.slice(3))) - (Number(from.slice(0, 2)) * 60 + Number(from.slice(3)));
    const column = entity >= 30 ? "ambassador_id" : "entry_id";
    await pg.query(
      `insert into pa_calls (id, ${column}, seq, call_type, day, duration_min, start_time, end_time)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do nothing`,
      [ce(100 + entity * 10 + seq), ce(entity), seq, type, day, minutes, from, to],
    );
  }

  // A call from before the scheduler existed: a length, but no clock. It shows
  // in the calendar's "Not fixed" strip and on the Calls-not-fixed badge until
  // somebody gives it a time.
  await pg.query(
    `insert into pa_calls (id, entry_id, seq, call_type, day, duration_min)
     values ($1,$2,1,'checkin','wed',60)
     on conflict (id) do nothing`,
    [ce(999), ce(19)],
  );
}

export async function seedDummyData(pg: PGlite): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  const bump = async (table: string) => {
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    counts[table] = r.rows[0]?.n ?? 0;
  };

  /*
   * FUNCTIONS IS THE LIVE MASTER — `departments` HAS NOT BEEN SINCE 0234.
   *
   * Migration 0234 ("functions replace departments") copied the rows into
   * `functions` keeping their ids, and re-pointed `employees.department_id`,
   * `employee_departments.department_id` and `jd_positions.department_id` at
   * `functions`. The column names stayed `department_id` — the CONSTRAINT is
   * what decides which table a value must exist in.
   *
   * This seed only ever filled `departments`, so on a FRESH database every
   * employee insert died on `employees_department_id_fkey`. It went unnoticed
   * for the obvious reason: nobody rebuilds the fixture. An existing `.pglite`
   * predated 0234, and the migration itself copied the rows across — so the
   * only way to meet this bug was to delete the directory, which is exactly
   * what a corrupted PGlite forces you to do.
   *
   * Both tables are filled and kept in step: `functions` because the foreign
   * keys demand it, `departments` because 0234 keeps it as the backup record
   * and a fixture that leaves it empty tells a different story from production.
   */
  for (const [id, name] of [
    [DEPT.ops, "Operations"],
    [DEPT.finance, "Finance"],
    [DEPT.tech, "Technology"],
    [DEPT.hr, "HR"],
  ] as const) {
    await pg.query(`insert into functions (id, name) values ($1,$2) on conflict do nothing`, [id, name]);
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
  // FROM `functions`, not `departments`: the id resolved here is written into
  // employees.department_id and employee_departments.department_id, and both
  // of those foreign-key into `functions` since 0234. Reading the backup table
  // could hand back an id that the live master does not have.
  const hrDept = await pg.query<{ id: string }>(
    `select id from functions where lower(name) = 'hr' limit 1`,
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

  // HR records — filled forms, scanned documents and letters, with the files
  // themselves on disk, so HR Record's ZIP download and the Drive backup have
  // something real to collect. Imported lazily: it pulls in pdf-lib.
  const { seedDummyHrRecords } = await import("./dummy-db-seed-hr-records");
  Object.assign(counts, await seedDummyHrRecords(pg, { admin: EMP.me, asha: EMP.asha, ravi: EMP.ravi }));

  // The JD Bank and the Operations checklist — two features that only
  // make sense together (a checklist item can point
  // back at a JD entry), so they are seeded as one set.
  const { seedJdChecklist } = await import("./dummy-db-seed-jd-checklist");
  Object.assign(counts, await seedJdChecklist(pg));

  // A month of a full team on top of the above — Operations (Checklist, JD
  // Bank, JD-Master, JD-Specific Person, JD-For Recruitment) and DCC, so each
  // table can be judged the way it looks in use rather than just non-empty.
  const { seedShowcase } = await import("./dummy-db-seed-showcase");
  Object.assign(counts, await seedShowcase(pg));

  // The WMS Tasks columns on the checklist and a person's JD (migration 0237):
  // Client, Subject, Initiator, Frequency, the Approver columns, Doer Notes.
  const { seedWmsColumns } = await import("./dummy-db-seed-wms-columns");
  Object.assign(counts, await seedWmsColumns(pg));

  // WCC and MCC (migration 0238): monthly compliances with history, the actual
  // date on every Done, and the Team Leads' rulings.
  const { seedWccMcc } = await import("./dummy-db-seed-wcc-mcc");
  Object.assign(counts, await seedWccMcc(pg));

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

  // ── OPERATIONS › DIRECTORY — a few fictional vendors so the page is not empty.
  // Fixed ids + `on conflict do nothing`: re-runnable, and a vendor edited or
  // deleted in the UI is never put back by re-seeding.
  const VENDORS: [number, string, string, string | null, string, string, string, string, string, boolean][] = [
    [1, "AC", "Suresh", "Patil", "9800000101", "cool.air@example.invalid", "Shop 4, Link Road", "Mumbai", "400064", true],
    [2, "Electrician", "Ramesh", "Yadav", "9800000102", "ramesh.electric@example.invalid", "12 Station Lane", "Thane", "400601", false],
    [3, "Stationery", "Kavita", "Shah", "9800000103", "paperhouse@example.invalid", "Gala 7, Market Yard", "Pune", "411037", false],
    [4, "Computer Repairs", "Anil", null, "9800000104", "fixit@example.invalid", "2nd Floor, Tech Plaza", "Mumbai", "400093", true],
  ];
  for (const [n, category, first, last, cell, email, line1, city, pin, amc] of VENDORS) {
    await pg.query(
      `insert into ops_vendors (id, category, first_name, last_name, cell_no, email, address_line1, city, state, pincode, amc)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'Maharashtra',$9,$10)
       on conflict (id) do nothing`,
      [`00000000-0000-4000-8004-${String(n).padStart(12, "0")}`, category, first, last, cell, email, line1, city, pin, amc],
    );
  }
  await bump("ops_vendors");

  await seedClientEngagement(
    pg,
    (name) => (treeNames.includes(name) ? treeId(name) : null),
    new Date(),
  );
  await bump("pa_entries");
  await bump("pa_calls");

  await seedCandidates(pg);
  await bump("candidate_intake");

  // ── FILE TWO TASKS INTO THE PLAN ─────────────────────────────────────────
  //
  // An executable plan row IS a WMS task (tasks.project_node_id), and until now
  // the fixture had plan rows and tasks but nothing joining them — so every
  // surface that reads the join rendered its empty state in dummy mode. The
  // task drawer's "Plan location" panel is the one that made this visible: with
  // no filed task there is no way to see it at all.
  //
  // Done here rather than in the TASKS loop because that runs BEFORE the nodes
  // exist, and project_node_id is a foreign key.
  const FILED: Array<[task: string, node: string]> = [
    // A full Project · Milestone · Result chain above an Action.
    ["00000000-0000-4000-8004-000000000001", "00000000-0000-4000-8003-000000000005"],
    // One level deeper, so the panel is exercised on a Sub-Action too.
    ["00000000-0000-4000-8004-000000000002", "00000000-0000-4000-8003-000000000006"],
  ];
  for (const [taskId, nodeId] of FILED) {
    await pg.query(`update tasks set project_node_id = $2 where id = $1`, [taskId, nodeId]);
  }

  // ── BILLING ──────────────────────────────────────────────────────────────
  //
  // The document engine is useless until an issuing entity has a GSTIN, a bank
  // and a signatory, so dummy mode seeds one — otherwise the first thing a
  // developer meets is "this entity cannot issue a tax invoice" and an empty
  // product picker. Everything below is INVENTED: a fake PAN, a fake GSTIN, a
  // fake account number. It exists so the screens have something to render.
  await pg.query(
    `insert into billing_entity_profiles
       (entity_id, legal_name, pan, gstin, state_name, state_code, address_line,
        email, phone, website, bank_name, bank_account_name, bank_account_no,
        bank_ifsc, bank_branch, default_sac_code, signatory_name,
        signatory_designation, interest_clause)
     values ('altus-corp', 'Altus Corp', 'AAAPA1111A', '27AAAPA1111A1Z5',
             'Maharashtra', '27',
             'Sacred Space, C-6, Gambhir Estates, Kotkar Road, Goregaon (E), Mumbai 63',
             'billing@example.invalid', '+91 80970 10410', 'www.example.invalid',
             'Dummy Bank', 'Altus Corp (Current Account)', '0000000000',
             'DUMM0000001', 'Goregaon East', '998311', 'The Proprietor', 'Proprietor',
             'Interest will be charged at 24% p.a. at actuals for delay in payment after due date.')
     on conflict (entity_id) do nothing`,
  );
  await bump("billing_entity_profiles");

  for (const [code, description, rate] of [
    ["998311", "Management consulting and management services", "18"],
    ["998313", "Information technology consulting and support services", "18"],
    ["998365", "Sale of advertising space or time", "18"],
  ] as const) {
    await pg.query(
      `insert into billing_sac_codes (code, description, default_gst_rate)
       values ($1,$2,$3) on conflict (code) do nothing`,
      [code, description, rate],
    );
  }
  await bump("billing_sac_codes");

  // Fill in the BILLING columns of products migration 0217 already created, so
  // picking one on a line really does bring its SAC, rate and GST rate with it.
  // UPDATE, never insert: the product master is real data with real codes, and
  // the dummy fixture has no business inventing rows in it.
  for (const [name, sac, rate] of [
    ["Graduate Programs", "998311", "75000.00"],
    ["BSS", "998313", "45000.00"],
    ["Retainer", "998365", "25000.00"],
  ] as const) {
    await pg.query(
      `update outstanding_products
          set sac_code = $2, default_rate = $3, default_gst_rate = '18', is_billable = true
        where name = $1`,
      [name, sac, rate],
    );
  }
  await bump("outstanding_products");

  // Two customers, deliberately one of each kind: GST-registered in the
  // seller's own state (so CGST+SGST is exercised) and unregistered (so the
  // no-tax-rows document is one click away).
  await pg.query(
    `insert into billing_customers
       (id, name, contact_name, email, whatsapp, gstin, address_line1, city, state_name, state_code, pincode)
     values ('00000000-0000-4000-8009-000000000001', 'Northwind Systems LLP', 'The Director',
             'accounts@northwind.invalid', '+919000000001', '27AAACN1111N1Z5',
             '4th Floor, Prabhadevi', 'Mumbai', 'Maharashtra', '27', '400025')
     on conflict do nothing`,
  );
  await pg.query(
    `insert into billing_customers
       (id, name, contact_name, email, address_line1, city, state_name, state_code)
     values ('00000000-0000-4000-8009-000000000002', 'Sunil Raut', 'Sunil Raut',
             'sunil.raut@example.invalid', 'Shivaji Park', 'Mumbai', 'Maharashtra', '27')
     on conflict do nothing`,
  );
  await bump("billing_customers");

  // ── GOALS ───────────────────────────────────────────────────────
  //
  // The Goals workspace had NO fixture at all, so every one of its boards
  // rendered its empty state in dummy mode and none of them could be looked at
  // — which is the whole point of dummy mode (see scripts/dummy-db-setup.ts).
  //
  // Deliberately small and deliberately VARIED on the two status axes: some
  // rows carry an initiator verdict and the rest are unruled, because "No
  // Verdict" beside "Approved" is what those two columns are for, and a fixture
  // where every row looks the same tests nothing.
  const fyNow = new Date();
  const fy = fyNow.getFullYear();
  const mk = `${fy}-${String(fyNow.getMonth() + 1).padStart(2, "0")}`;
  const qk = `${fy}-Q${Math.floor(fyNow.getMonth() / 3) + 1}`;

  const GOALS: Array<[id: string, period: string, key: string, title: string, area: string, status: string, approval: string | null, pct: number]> = [
    ["00000000-0000-4000-8005-000000000001", "year",    String(fy), "Attendance live on every site", "Operations", "initiated",   null,        35],
    ["00000000-0000-4000-8005-000000000002", "quarter", qk,         "Biometric readers at 4 plants", "Operations", "follow_up",   "approved",  50],
    ["00000000-0000-4000-8005-000000000003", "month",   mk,         "Plant 2 reader install",        "Operations", "not_started", null,         0],
    ["00000000-0000-4000-8005-000000000004", "month",   mk,         "Retire the muster register",    "Compliance", "need_info",   "on_hold",   20],
  ];
  for (const [id, period, key, title, area, status, approval, pct] of GOALS) {
    await pg.query(
      `insert into goals
         (id, employee_id, period, period_key, title, area, status, approval_status, pct_done,
          created_by_id, scope)
       values ($1,$2,$3,$4,$5,$6,$7::task_status,$8::approval_status,$9,$10,'professional')
       on conflict (id) do nothing`,
      [id, EMP.me, period, key, title, area, status, approval, pct, EMP.asha],
    );
  }
  await bump("goals");

  // ── WEEKLY GOALS ─────────────────────────────────────────────
  // Anchored to the CURRENT Monday so the week board opens on them whenever the
  // fixture is built, rather than on a week that has already gone by.
  const monday = (() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();

  const WEEKLY: Array<[id: string, subject: string, area: string, status: string, approval: string | null, pct: number]> = [
    ["00000000-0000-4000-8006-000000000001", "Site survey at Plant 2", "Operations", "initiated",   null,        60],
    ["00000000-0000-4000-8006-000000000002", "Raise the cabling PO",   "Operations", "not_started", null,         0],
    ["00000000-0000-4000-8006-000000000003", "Vendor demo write-up",   "Operations", "done",        "approved", 100],
  ];
  for (const [id, subject, area, status, approval, pct] of WEEKLY) {
    await pg.query(
      `insert into weekly_goals
         (id, employee_id, week_start, subject, target_done, area, status, approval_status,
          pct_done, created_by_id)
       values ($1,$2,$3,$4,$4,$5,$6::task_status,$7::approval_status,$8,$9)
       on conflict (id) do nothing`,
      [id, EMP.me, monday, subject, area, status, approval, pct, EMP.me],
    );
  }
  await bump("weekly_goals");

  // ── DAILY GOALS ──────────────────────────────────────────────
  // Today's plan. Two rows carry a verdict so the Initiator Status control in a
  // card's detail view has something to show besides "No Verdict".
  const planYmd = new Date().toISOString().slice(0, 10);
  const DAILY: Array<[id: string, title: string, status: string, approval: string | null, done: boolean, pos: number]> = [
    ["00000000-0000-4000-8007-000000000001", "Walk the Plant 2 cable route", "initiated", null,       false, 1],
    ["00000000-0000-4000-8007-000000000002", "Send the vendor comparison",   "done",      "approved", true,  2],
    ["00000000-0000-4000-8007-000000000003", "Chase the cabling quote",      "follow_up", "on_hold",  false, 3],
  ];
  for (const [id, title, status, approval, done, pos] of DAILY) {
    await pg.query(
      `insert into daily_checklist
         (id, employee_id, plan_date, title, origin, position, status, approval_status, done)
       values ($1,$2,$3,$4,'standalone',$5,$6::task_status,$7::approval_status,$8)
       on conflict (id) do nothing`,
      [id, EMP.me, planYmd, title, pos, status, approval, done],
    );
  }
  await bump("daily_checklist");

  return counts;
}

