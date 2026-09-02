"use server";

/**
 * Employee Self-Service Portal — server loaders.
 *
 * ACCESS MODEL: employee-facing. Every loader resolves the signed-in employee
 * via requireUser() and filters STRICTLY to `me.id`. There is no HR/admin gate
 * and no way to pass another person's id — a caller only ever sees their own
 * payslips, documents and policy compliance.
 *
 * "use server" ⇒ every export is an async Server Action; pure types live in the
 * sibling ./portal-types module.
 */

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  salaryBreakup,
  documentInstances,
  documentSignatures,
  policyCompliance,
  policyDocuments,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getDocType } from "@/lib/hr/letters/registry";
import { netAfterWaiveOff } from "@/lib/salary/waive-off";
import { fyForMonth, monthLabel } from "@/lib/salary/period";
import { getEntity } from "@/lib/hr/entities";
import { getOnboarding } from "@/lib/queries/onboarding";
import {
  CORRESPONDENCE_TYPE_KEYS,
  type PortalPayslips,
  type PortalPayslip,
  type PortalQuarterTotal,
  type PortalAnnualTotal,
  type PortalDocuments,
  type PortalDocument,
  type PortalPolicies,
  type PortalPolicy,
  type PortalSalaryCertificate,
  type PortalOnboarding,
} from "./portal-types";

const SIGNED_URL_TTL = 3600; // 1h — regenerated on every portal read.

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** A `date` column comes back as "YYYY-MM-DD" (or a Date under some drivers) —
 *  normalise to the canonical "YYYY-MM" month key the salary helpers expect. */
function monthKey(month: string | Date): string {
  const s = month instanceof Date ? month.toISOString().slice(0, 10) : String(month);
  return s.slice(0, 7);
}

/** FY quarter (1..4) for a "YYYY-MM" month — Apr–Jun=1 … Jan–Mar=4. */
function fyQuarter(month: string): number {
  const m = Number(month.slice(5, 7));
  if (m >= 4 && m <= 6) return 1;
  if (m >= 7 && m <= 9) return 2;
  if (m >= 10 && m <= 12) return 3;
  return 4; // Jan–Mar
}

/** Stable FY start-year for a "YYYY-MM" month (Jan–Mar belong to prior FY). */
function fyStartYear(month: string): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

/**
 * The signed-in employee's monthly payslips (newest-first) plus quarterly and
 * annual net-total aggregates. Net reuses the ONE source of truth
 * (`netAfterWaiveOff`) so the portal never drifts from the salary table / PDF.
 */
export async function getMyPayslips(): Promise<PortalPayslips> {
  const me = await requireUser();

  const rowsRaw = await db
    .select()
    .from(salaryBreakup)
    .where(eq(salaryBreakup.employeeId, me.id))
    .orderBy(desc(salaryBreakup.month));

  const rows: PortalPayslip[] = rowsRaw.map((r) => {
    const key = monthKey(r.month);
    const net = netAfterWaiveOff({
      monthlyCtc: r.monthlyCtc,
      daysInMonth: r.daysInMonth,
      finalPayment: r.finalPayment,
      waiveOffDays: r.waiveOffDays,
      payoutAdjustment: r.payoutAdjustment,
    });
    return {
      id: r.id,
      month: key,
      monthLabel: monthLabel(key),
      fy: fyForMonth(key),
      companyName: r.companyName,
      designation: r.designation,
      monthlyCtc: toNum(r.monthlyCtc),
      annualCtc: toNum(r.annualCtc),
      net,
      paid: r.paid,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    };
  });

  // Quarterly aggregate (sum of net per FY quarter).
  const qMap = new Map<string, PortalQuarterTotal>();
  const aMap = new Map<string, PortalAnnualTotal>();
  let grandTotal = 0;
  for (const p of rows) {
    grandTotal += p.net;
    const startYear = fyStartYear(p.month);
    const q = fyQuarter(p.month);
    const qKey = `${startYear}-Q${q}`;
    const existingQ = qMap.get(qKey);
    if (existingQ) {
      existingQ.total += p.net;
      existingQ.count += 1;
    } else {
      qMap.set(qKey, { key: qKey, quarter: `Q${q}`, fy: p.fy, total: p.net, count: 1 });
    }
    const existingA = aMap.get(p.fy);
    if (existingA) {
      existingA.total += p.net;
      existingA.count += 1;
    } else {
      aMap.set(p.fy, { fy: p.fy, total: p.net, count: 1 });
    }
  }

  // Newest FY / quarter first (rows are already month-desc, so first-seen order
  // is newest → oldest; keep that).
  const quarters = [...qMap.values()];
  const annual = [...aMap.values()];

  return { rows, quarters, annual, grandTotal };
}

/**
 * The signed-in employee's letters + correspondence. Each instance carries a
 * friendly title (from the letters registry) and, when a SIGNED archive exists
 * for THIS person (`document_signatures.signedPdfPath`, status 'signed'), a
 * freshly-minted download URL. Split into formal Letters vs Correspondence
 * (birthday / employee-of-the-month greetings).
 */
export async function getMyDocuments(): Promise<PortalDocuments> {
  const me = await requireUser();

  const instances = await db
    .select()
    .from(documentInstances)
    .where(eq(documentInstances.employeeId, me.id))
    .orderBy(desc(documentInstances.createdAt));

  // This person's signed archives, keyed by the source doc id they signed.
  const sigs = await db
    .select({
      docId: documentSignatures.docId,
      signedPdfPath: documentSignatures.signedPdfPath,
    })
    .from(documentSignatures)
    .where(
      and(
        eq(documentSignatures.signerEmployeeId, me.id),
        eq(documentSignatures.status, "signed"),
        isNotNull(documentSignatures.signedPdfPath),
      ),
    );

  const pathByDocId = new Map<string, string>();
  for (const s of sigs) {
    if (s.signedPdfPath) pathByDocId.set(s.docId, s.signedPdfPath);
  }

  // Batch-sign every archived path in one round-trip.
  const uniquePaths = [...new Set([...pathByDocId.values()])];
  const urlByPath = new Map<string, string>();
  if (uniquePaths.length > 0) {
    try {
      const { data } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .createSignedUrls(uniquePaths, SIGNED_URL_TTL, { download: true });
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl);
      }
    } catch {
      /* leave empty — a missing URL renders as "not downloadable yet" */
    }
  }

  const letters: PortalDocument[] = [];
  const correspondence: PortalDocument[] = [];
  for (const inst of instances) {
    const path = pathByDocId.get(inst.id) ?? null;
    const doc: PortalDocument = {
      id: inst.id,
      typeKey: inst.typeKey,
      title: getDocType(inst.typeKey)?.title ?? inst.typeKey,
      status: inst.status,
      issuedAt: inst.issuedAt ? inst.issuedAt.toISOString() : null,
      signedUrl: path ? urlByPath.get(path) ?? null : null,
    };
    if (CORRESPONDENCE_TYPE_KEYS.has(inst.typeKey)) correspondence.push(doc);
    else letters.push(doc);
  }

  return { letters, correspondence };
}

/**
 * The signed-in employee's policy compliance — every policy they're expected to
 * sign, with its friendly title and signed/pending state. Links out to
 * `/hr/policies/<key>` where the person can read and sign a pending policy.
 */
export async function getMyPolicies(): Promise<PortalPolicies> {
  const me = await requireUser();

  const rowsRaw = await db
    .select({
      key: policyCompliance.policyKey,
      status: policyCompliance.status,
      signedAt: policyCompliance.signedAt,
      title: policyDocuments.title,
    })
    .from(policyCompliance)
    .leftJoin(policyDocuments, eq(policyDocuments.key, policyCompliance.policyKey))
    .where(eq(policyCompliance.employeeId, me.id))
    .orderBy(desc(policyCompliance.updatedAt));

  const rows: PortalPolicy[] = rowsRaw.map((r) => ({
    key: r.key,
    title: r.title ?? r.key,
    status: r.status,
    signedAt: r.signedAt ? r.signedAt.toISOString() : null,
  }));

  return { rows };
}

/**
 * The data behind the signed-in employee's Salary Certificate. Distilled from
 * their LATEST salary row (current designation / entity / CTC) plus the
 * earliest→latest month span for tenure. Returns `null` when the person has no
 * salary rows on file (nothing to certify). Scoped strictly to `me.id`.
 */
export async function getMySalaryCertificate(): Promise<PortalSalaryCertificate | null> {
  const me = await requireUser();

  const rowsRaw = await db
    .select({
      month: salaryBreakup.month,
      designation: salaryBreakup.designation,
      companyName: salaryBreakup.companyName,
      annualCtc: salaryBreakup.annualCtc,
      monthlyCtc: salaryBreakup.monthlyCtc,
    })
    .from(salaryBreakup)
    .where(eq(salaryBreakup.employeeId, me.id))
    .orderBy(desc(salaryBreakup.month));

  const latest = rowsRaw[0]; // newest (rows are month-desc)
  const earliest = rowsRaw[rowsRaw.length - 1]; // oldest
  if (!latest || !earliest) return null;
  const latestKey = monthKey(latest.month);
  const firstKey = monthKey(earliest.month);
  const entity = getEntity(latest.companyName);

  return {
    employeeName: me.name,
    designation: latest.designation,
    companyName: latest.companyName,
    entity: { id: entity.id, displayName: entity.displayName, legalName: entity.legalName },
    annualCtc: toNum(latest.annualCtc),
    monthlyCtc: toNum(latest.monthlyCtc),
    firstMonth: firstKey,
    firstMonthLabel: monthLabel(firstKey),
    latestMonth: latestKey,
    latestMonthLabel: monthLabel(latestKey),
    monthsCount: rowsRaw.length,
  };
}

/**
 * The signed-in employee's OWN onboarding submission — the form THEY filled.
 * Wraps the shared `getOnboarding(me.id)` loader (linked by `employeeId`) and
 * returns only the read-only answer/file maps, never anyone else's data.
 */
export async function getMyOnboarding(): Promise<PortalOnboarding> {
  const me = await requireUser();
  const view = await getOnboarding(me.id);

  if (!view) {
    return { exists: false, status: null, submittedAt: null, fields: {}, files: {} };
  }

  const files: PortalOnboarding["files"] = {};
  for (const [key, f] of Object.entries(view.files)) {
    files[key] = { fileName: f.fileName, signedUrl: f.signedUrl, isLink: f.isLink };
  }

  return {
    exists: view.exists,
    status: view.status,
    submittedAt: view.submittedAt,
    fields: view.fields,
    files,
  };
}
