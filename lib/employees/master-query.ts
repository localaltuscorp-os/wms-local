import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  departments,
  designations,
  employeeDocuments,
  employees,
  functions,
  onboardingSubmissions,
  payingEntities,
  salaryCtcBreakup,
  salaryProfiles,
  shiftTypes,
} from "@/db/schema";
import { isCurrentStaff } from "@/lib/queries/employees";
import { codeHistoryFor } from "./code-registry";

/**
 * THE EMPLOYEE MASTER — one read across every existing source of truth.
 *
 * ── WHAT THIS MODULE IS FOR ────────────────────────────────────────────────
 * The brief asks for a consolidated master "rather than maintaining
 * disconnected employee information screens", and is equally clear that it must
 * not become a second employee system (§20). Those two pull in opposite
 * directions unless the consolidation happens HERE, in the read — which is what
 * this is. Nothing below owns any data. Every field is joined from where it
 * already lives:
 *
 *   employees                    name, code, DOJ, probation, mails, phone,
 *                                manager, worker type, status, attendance config
 *   designations / paying_entities / departments / functions / shift_types
 *                                the master lists, by FK
 *   salary_profiles              annual CTC, monthly TDS, PT exempt, pay type
 *   salary_ctc_breakup           the COMPONENT-WISE breakup (§9)
 *   onboarding_submissions.fields  family, addresses, banking, PAN/Aadhaar (§10–11)
 *   employee_documents           documents (§12)
 *   employee_code_registry       the code and its history
 *
 * HR records are deliberately absent: they stay in the HR module and the
 * workspace LINKS to them (§14). Attendance records likewise — the master shows
 * the CONFIGURATION (schedule, shift, remote), never a copy of the punches.
 *
 * ── WHY THE FAMILY AND ADDRESS COME OUT OF A JSONB BLOB ────────────────────
 * Because that is where they are. `onboarding_submissions.fields` is the form
 * every employee filled at joining, and it is the only place the company holds
 * a father's name or a permanent address. Promoting those into columns would be
 * a migration of real data for no gain the master needs, and would leave two
 * copies to disagree. `readOnboardingFields` below is the single reader, so the
 * key names appear once rather than being spelled out at each call site.
 */

/* ── The onboarding blob, typed at its one reader ─────────────────────────── */

/**
 * The keys actually present across the 16 real submissions, read off the live
 * data rather than guessed from the form component. Everything is optional:
 * the form has changed shape over time and an older submission simply lacks a
 * key, which must read as "not recorded" and never throw.
 */
export interface OnboardingFields {
  firstName?: string; middleName?: string; lastName?: string;
  phone?: string;
  panNo?: string; aadharNo?: string;
  // Family
  fatherName?: string; fatherPhone?: string;
  motherName?: string; motherPhone?: string;
  brotherName?: string; brotherPhone?: string;
  sisterName?: string; sisterPhone?: string;
  emergencyContacts?: unknown;
  // Current address
  currAddr1?: string; currAddr2?: string; currAddr3?: string;
  currCity?: string; currState?: string; currPincode?: string; currLandmark?: string;
  // Permanent address
  permAddr1?: string; permAddr2?: string; permAddr3?: string;
  permCity?: string; permState?: string; permPincode?: string; permLandmark?: string;
  sameAsPermanent?: unknown;
  // Native
  nativeAddr?: string; nativeCity?: string; nativeState?: string; nativePincode?: string;
  // Banking
  bankAccountName?: string; bankAccountNo?: string; ifsCode?: string; micrCode?: string;
  branchAddress?: string; branchCity?: string; branchPincode?: string;
  // Previous employment
  lastCompanyName?: string; lastCompanyAddress?: string; lastCtc?: string; lastDesignation?: string;
  // References
  ref1Name?: string; ref1Phone?: string; ref2Name?: string; ref2Phone?: string;
}

/** One family member, as the Family table renders them (§11). */
export interface FamilyMember {
  relationship: string;
  name: string | null;
  phone: string | null;
}

export interface PostalAddress {
  line1: string | null;
  line2: string | null;
  line3: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  /** True when every part is empty — the view shows "Not recorded" rather than
   *  four blank rows pretending to be an address. */
  empty: boolean;
}

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function addressFrom(f: OnboardingFields, p: "curr" | "perm"): PostalAddress {
  const g = (k: string) => text((f as Record<string, unknown>)[k]);
  const a: PostalAddress = {
    line1: g(`${p}Addr1`), line2: g(`${p}Addr2`), line3: g(`${p}Addr3`),
    landmark: g(`${p}Landmark`), city: g(`${p}City`), state: g(`${p}State`),
    pincode: g(`${p}Pincode`), empty: false,
  };
  a.empty = !(a.line1 || a.line2 || a.line3 || a.city || a.state || a.pincode);
  return a;
}

/**
 * The four named relatives the onboarding form collects, as rows.
 *
 * A FIXED SET, and that is a property of the source rather than a limitation
 * chosen here: the form has `fatherName`/`motherName`/`brotherName`/
 * `sisterName` and nothing else. Rows with neither a name nor a phone are
 * dropped, so somebody with no recorded sibling gets a two-row table instead of
 * two empty rows captioned "Brother" and "Sister".
 */
function familyFrom(f: OnboardingFields): FamilyMember[] {
  const pairs: [string, keyof OnboardingFields, keyof OnboardingFields][] = [
    ["Father", "fatherName", "fatherPhone"],
    ["Mother", "motherName", "motherPhone"],
    ["Brother", "brotherName", "brotherPhone"],
    ["Sister", "sisterName", "sisterPhone"],
  ];
  return pairs
    .map(([relationship, n, p]) => ({
      relationship,
      name: text(f[n]),
      phone: text(f[p]),
    }))
    .filter((m) => m.name || m.phone);
}

/**
 * Emergency contacts, which are stored loosely.
 *
 * The key exists on every submission but its shape is not guaranteed — it has
 * been seen as a string and as an array of objects. Normalised to a list of
 * name/phone pairs, and anything unrecognisable is reported as a single note
 * rather than dropped, because an emergency contact is the last field that
 * should silently disappear.
 */
export interface EmergencyContact { name: string | null; phone: string | null; note: string | null }

function emergencyFrom(raw: unknown): EmergencyContact[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [{ name: null, phone: null, note: t }] : [];
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((item): EmergencyContact[] => {
      if (typeof item === "string") {
        const t = item.trim();
        return t ? [{ name: null, phone: null, note: t }] : [];
      }
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const name = text(o.name) ?? text(o.contactName) ?? text(o.fullName);
        const phone = text(o.phone) ?? text(o.number) ?? text(o.contact) ?? text(o.mobile);
        const note = text(o.relationship) ?? text(o.relation) ?? null;
        return name || phone || note ? [{ name, phone, note }] : [];
      }
      return [];
    });
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const name = text(o.name), phone = text(o.phone);
    return name || phone ? [{ name, phone, note: null }] : [];
  }
  return [];
}

/* ── CTC breakup ──────────────────────────────────────────────────────────── */

export interface CtcComponent {
  label: string;
  /** Annual rupees. Monthly is derived, never stored — see the note below. */
  annual: number;
  monthly: number;
}

export interface CtcBreakup {
  components: CtcComponent[];
  annualTotal: number;
  monthlyTotal: number;
  /** True when no breakup row exists and the total is the profile's CTC alone. */
  derivedFromTotalOnly: boolean;
}

/**
 * Read `salary_ctc_breakup.components` into rows the Payroll section renders.
 *
 * MONTHLY IS DERIVED FROM ANNUAL, always, and never the other way round: the
 * stored figure is annual (`annual_ctc`), and rounding a monthly value back up
 * by twelve would make the components stop summing to the total the payroll
 * engine actually uses. The table shows both columns (§9); only one is real.
 *
 * A month with no breakup row is not an error — most of the roster has a CTC
 * and no component split — so it degrades to a single "Total CTC" line and says
 * so via `derivedFromTotalOnly`, which the view renders as an invitation to add
 * the breakup rather than as a blank table.
 */
export function readCtcBreakup(
  components: unknown,
  annualCtcFallback: number,
): CtcBreakup {
  const out: CtcComponent[] = [];
  if (Array.isArray(components)) {
    for (const c of components) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      const label = text(o.label) ?? text(o.name) ?? text(o.component);
      const annual = Number(o.annual ?? o.amount ?? o.value ?? 0);
      if (!label || !Number.isFinite(annual)) continue;
      out.push({ label, annual, monthly: Math.round((annual / 12) * 100) / 100 });
    }
  } else if (components && typeof components === "object") {
    // The other shape seen in the wild: { basic: 120000, hra: 60000, … }
    for (const [k, v] of Object.entries(components as Record<string, unknown>)) {
      const annual = Number(v);
      if (!Number.isFinite(annual) || annual === 0) continue;
      out.push({
        label: k.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        annual,
        monthly: Math.round((annual / 12) * 100) / 100,
      });
    }
  }

  const annualTotal = out.length
    ? out.reduce((s, c) => s + c.annual, 0)
    : annualCtcFallback;
  return {
    components: out,
    annualTotal,
    monthlyTotal: Math.round((annualTotal / 12) * 100) / 100,
    derivedFromTotalOnly: out.length === 0,
  };
}

/* ── The master row ───────────────────────────────────────────────────────── */

/** One row of the Employee Master table. Flat on purpose: the table sorts,
 *  filters and exports over it without reaching into nested objects. */
export interface EmployeeMasterRow {
  id: string;
  employeeCode: string | null;
  name: string;
  /** The office mail shown under the name — `official_email` where set, else the
   *  login address, because the column must never be blank for a live employee. */
  officeEmail: string;
  personalEmail: string | null;
  phone: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;

  functionId: string | null;
  functionName: string | null;
  entityId: string | null;
  entityName: string | null;
  designationId: string | null;
  designationName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  shiftTypeId: string | null;
  shiftTypeName: string | null;

  managerId: string | null;
  managerName: string | null;

  workerType: string | null;
  isTeamLead: boolean;
  trainPass: boolean;

  joinedAt: Date | null;
  probationEnd: string | null;
  /** Date of Completion — the last working day. */
  dateOfCompletion: string | null;
  /** True when probation_end is set and still in the future (§2's tag). */
  onProbation: boolean;

  annualCtc: number | null;
  monthlyCtc: number | null;
  tdsMonthly: number | null;
  ptExempt: boolean | null;
  payType: string | null;

  isActive: boolean;
  employmentStatus: string | null;
  deactivatedAt: Date | null;
  /** active | probation | inactive | offboarded — what the Status column shows. */
  status: string;
}

const MASTER_STATUSES = ["active", "probation", "inactive", "offboarded"] as const;
export type MasterStatus = (typeof MASTER_STATUSES)[number];

function statusOf(r: {
  isActive: boolean;
  employmentStatus: string | null;
  onProbation: boolean;
}): MasterStatus {
  if (r.employmentStatus && r.employmentStatus !== "active") return "offboarded";
  if (!r.isActive) return "inactive";
  return r.onProbation ? "probation" : "active";
}

/**
 * Every employee, with everything the master table needs, in one round trip.
 *
 * `isCurrentStaff` is reused rather than restated — it is the predicate the
 * existing Employees screen filters on, and two definitions of "is this person
 * on the roster" is exactly the drift this consolidation is meant to end.
 */
export async function loadEmployeeMasterRows(
  now: Date = new Date(),
): Promise<EmployeeMasterRow[]> {
  const today = now.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      name: employees.name,
      email: employees.email,
      officialEmail: employees.officialEmail,
      personalEmail: employees.personalEmail,
      phone: employees.phone,
      whatsapp: employees.whatsappPhone,
      avatarUrl: employees.avatarUrl,

      functionId: employees.functionId,
      functionName: functions.name,
      entityId: employees.payingEntityId,
      entityName: payingEntities.name,
      designationId: employees.designationId,
      designationName: designations.name,
      departmentId: employees.departmentId,
      departmentName: departments.name,
      shiftTypeId: employees.shiftTypeId,
      shiftTypeName: shiftTypes.name,

      managerId: employees.managerId,
      managerName: sql<string | null>`mgr.name`,

      workerType: employees.workerType,
      isTeamLead: employees.isTeamLead,
      trainPass: employees.trainPass,

      joinedAt: employees.joinedAt,
      probationEnd: employees.probationEnd,
      dateOfCompletion: employees.lastWorkingDay,

      annualCtc: salaryProfiles.annualCtc,
      tdsMonthly: salaryProfiles.tdsMonthly,
      ptExempt: salaryProfiles.ptExempt,
      payType: salaryProfiles.payType,

      isActive: employees.isActive,
      employmentStatus: employees.employmentStatus,
      deactivatedAt: employees.deactivatedAt,
    })
    .from(employees)
    .leftJoin(functions, eq(functions.id, employees.functionId))
    .leftJoin(payingEntities, eq(payingEntities.id, employees.payingEntityId))
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(shiftTypes, eq(shiftTypes.id, employees.shiftTypeId))
    // Aliased in raw SQL: a self-join needs a distinct table reference, and the
    // manager is an employee like any other.
    .leftJoin(sql`employees as mgr`, sql`mgr.id = ${employees.managerId}`)
    .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
    .where(isCurrentStaff)
    .orderBy(asc(employees.name));

  return rows.map((r) => {
    // ON PROBATION means the date is set AND still ahead of us. A probation end
    // in the past is somebody who finished it, and tagging them would be wrong
    // on most of the roster.
    const onProbation = !!r.probationEnd && r.probationEnd >= today;
    const annual = r.annualCtc == null ? null : Number(r.annualCtc);
    return {
      ...r,
      officeEmail: r.officialEmail ?? r.email,
      annualCtc: annual,
      monthlyCtc: annual == null ? null : Math.round((annual / 12) * 100) / 100,
      tdsMonthly: r.tdsMonthly == null ? null : Number(r.tdsMonthly),
      onProbation,
      status: statusOf({
        isActive: r.isActive,
        employmentStatus: r.employmentStatus,
        onProbation,
      }),
    };
  });
}

/* ── One employee, in full — what the workspace opens on ──────────────────── */

export interface EmployeeMasterDetail {
  row: EmployeeMasterRow;
  ctc: CtcBreakup;
  family: FamilyMember[];
  emergencyContacts: EmergencyContact[];
  currentAddress: PostalAddress;
  permanentAddress: PostalAddress;
  onboarding: OnboardingFields;
  documents: {
    id: string; docType: string; title: string | null; fileName: string | null;
    effectiveDate: string | null; createdAt: Date; archived: boolean;
  }[];
  codeHistory: Awaited<ReturnType<typeof codeHistoryFor>>;
  /** Attendance CONFIGURATION only — never the punches (§13). */
  work: {
    weeklyOff: number | null;
    officialStart: string | null;
    officialEnd: string | null;
    lateAfter: string | null;
    earlyBefore: string | null;
    fullDayMinutes: number | null;
    halfDayMinutes: number | null;
    weeklyTargetMinutes: number | null;
    worksOutsideOffice: boolean | null;
    timezone: string | null;
    dailyTaskQuota: number | null;
    /* ── Employee schedule settings (0228) ───────────────────────────────
       Not nullable, unlike everything above: these columns are NOT NULL with
       defaults, so "unset" is not a state they have. Typing them as plain
       booleans is what stops the form having to invent a third option for a
       Yes/No question.                                                     */
    attendanceApplicable: boolean;
    saturdayWorking: [boolean, boolean, boolean, boolean, boolean];
    /** Null means "same as Monday–Friday", not "no Saturday". */
    satOfficialStart: string | null;
    satOfficialEnd: string | null;
    wfhFullTimeAllowed: boolean;
    wfhPartTimeAllowed: boolean;
  };
}

export async function loadEmployeeMasterDetail(
  employeeId: string,
  now: Date = new Date(),
): Promise<EmployeeMasterDetail | null> {
  const rows = await loadEmployeeMasterRows(now);
  const row = rows.find((r) => r.id === employeeId);
  if (!row) return null;

  const [emp, breakupRow, submission, docs, codeHistory] = await Promise.all([
    db.query.employees.findFirst({ where: eq(employees.id, employeeId) }),
    db
      .select({ components: salaryCtcBreakup.components, annualCtc: salaryCtcBreakup.annualCtc })
      .from(salaryCtcBreakup)
      .where(eq(salaryCtcBreakup.employeeId, employeeId))
      .limit(1),
    db
      .select({ fields: onboardingSubmissions.fields })
      .from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.employeeId, employeeId))
      .orderBy(sql`${onboardingSubmissions.updatedAt} desc`)
      .limit(1),
    db
      .select({
        id: employeeDocuments.id,
        docType: employeeDocuments.docType,
        title: employeeDocuments.title,
        fileName: employeeDocuments.fileName,
        effectiveDate: employeeDocuments.effectiveDate,
        createdAt: employeeDocuments.createdAt,
        archived: employeeDocuments.archived,
      })
      .from(employeeDocuments)
      .where(eq(employeeDocuments.employeeId, employeeId))
      .orderBy(sql`${employeeDocuments.createdAt} desc`),
    codeHistoryFor(employeeId),
  ]);

  const fields = (submission[0]?.fields ?? {}) as OnboardingFields;
  const ctc = readCtcBreakup(
    breakupRow[0]?.components,
    Number(breakupRow[0]?.annualCtc ?? row.annualCtc ?? 0),
  );

  return {
    row,
    ctc,
    family: familyFrom(fields),
    emergencyContacts: emergencyFrom(fields.emergencyContacts),
    currentAddress: addressFrom(fields, "curr"),
    permanentAddress: addressFrom(fields, "perm"),
    onboarding: fields,
    documents: docs,
    codeHistory,
    work: {
      weeklyOff: emp?.weeklyOff ?? null,
      officialStart: emp?.attOfficialStart ?? null,
      officialEnd: emp?.attOfficialEnd ?? null,
      lateAfter: emp?.attLateAfter ?? null,
      earlyBefore: emp?.attEarlyBefore ?? null,
      fullDayMinutes: emp?.attFullDayMinutes ?? null,
      halfDayMinutes: emp?.attHalfDayMinutes ?? null,
      weeklyTargetMinutes: emp?.weeklyTargetMinutes ?? null,
      worksOutsideOffice: emp?.worksOutsideOffice ?? null,
      timezone: emp?.timezone ?? null,
      dailyTaskQuota: emp?.dailyTaskQuota ?? null,
      // The `??` fallbacks are the column defaults, reached only when the
      // employee row itself failed to load — so a detail panel that renders
      // without a row shows the defaults rather than blank toggles.
      attendanceApplicable: emp?.attendanceApplicable ?? true,
      saturdayWorking: [
        emp?.sat1Working ?? true,
        emp?.sat2Working ?? true,
        emp?.sat3Working ?? true,
        emp?.sat4Working ?? true,
        emp?.sat5Working ?? true,
      ],
      satOfficialStart: emp?.satOfficialStart ?? null,
      satOfficialEnd: emp?.satOfficialEnd ?? null,
      wfhFullTimeAllowed: emp?.wfhFullTimeAllowed ?? false,
      wfhPartTimeAllowed: emp?.wfhPartTimeAllowed ?? false,
    },
  };
}

/* ── The master lists the filters and the workspace dropdowns need ────────── */

export interface MasterOptions {
  functions: { id: string; name: string }[];
  entities: { id: string; name: string; codePrefix: string | null }[];
  designations: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  shiftTypes: { id: string; name: string }[];
  managers: { id: string; name: string }[];
}

export async function loadMasterOptions(): Promise<MasterOptions> {
  const [f, e, d, dep, s, m] = await Promise.all([
    db.select({ id: functions.id, name: functions.name })
      .from(functions).where(eq(functions.isActive, true))
      .orderBy(asc(functions.sortOrder), asc(functions.name)),
    db.select({ id: payingEntities.id, name: payingEntities.name, codePrefix: payingEntities.codePrefix })
      .from(payingEntities).where(eq(payingEntities.isActive, true))
      .orderBy(asc(payingEntities.sortOrder), asc(payingEntities.name)),
    db.select({ id: designations.id, name: designations.name })
      .from(designations).where(eq(designations.isActive, true))
      .orderBy(asc(designations.sortOrder), asc(designations.name)),
    db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
    db.select({ id: shiftTypes.id, name: shiftTypes.name })
      .from(shiftTypes).where(eq(shiftTypes.isActive, true))
      .orderBy(asc(shiftTypes.sortOrder), asc(shiftTypes.name)),
    db.select({ id: employees.id, name: employees.name })
      .from(employees).where(and(isCurrentStaff, eq(employees.isActive, true)))
      .orderBy(asc(employees.name)),
  ]);
  return { functions: f, entities: e, designations: d, departments: dep, shiftTypes: s, managers: m };
}
