import "server-only";
import { aliasedTable, and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { designations, employees, hrAssets, hrContacts, onboardingSubmissions } from "@/db/schema";
import type { HrAssetIssuedKind } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

/**
 * Read side of the Address Book + Asset Register. Writes live in the two
 * actions files; permissions in lib/hr/registers.ts.
 */

/** The migration may not have run yet (this repo applies SQL by hand). */
export function isMissingRegisterTable(e: unknown): boolean {
  const codeOf = (v: unknown): unknown =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  if (hit(codeOf(e))) return true;
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return hit(codeOf(cause));
}

/* ------------------------------------------------------------------ */
/* Address Book                                                         */
/* ------------------------------------------------------------------ */

export interface ContactRow {
  id: string;
  companyName: string | null;
  personName: string;
  cellNo: string | null;
  alternateNo: string | null;
  email: string | null;
  service: string;
  notes: string | null;
  isActive: boolean;
}

export interface EmployeeContactRow {
  id: string;
  name: string;
  designation: string | null;
  /** Personal cell — from their onboarding form first, then their profile. */
  cell: string | null;
  /** Personal email first, then the login email. */
  email: string | null;
  isActive: boolean;
}

export async function listContacts(): Promise<ContactRow[]> {
  return db
    .select({
      id: hrContacts.id,
      companyName: hrContacts.companyName,
      personName: hrContacts.personName,
      cellNo: hrContacts.cellNo,
      alternateNo: hrContacts.alternateNo,
      email: hrContacts.email,
      service: hrContacts.service,
      notes: hrContacts.notes,
      isActive: hrContacts.isActive,
    })
    .from(hrContacts)
    .orderBy(asc(hrContacts.service), asc(hrContacts.personName));
}

/**
 * Every employee, with the personal contact details they gave on their HR forms.
 * READ LIVE — nothing is copied into hr_contacts — so the Address Book is never
 * out of date with the onboarding form. An employee who has left (or whose login
 * is deactivated) lands in the Inactive list automatically.
 */
export async function listEmployeeContacts(): Promise<EmployeeContactRow[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      personalEmail: employees.personalEmail,
      phone: employees.phone,
      whatsappPhone: employees.whatsappPhone,
      isActive: employees.isActive,
      employmentStatus: employees.employmentStatus,
      designation: designations.name,
      fields: onboardingSubmissions.fields,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(onboardingSubmissions, eq(onboardingSubmissions.employeeId, employees.id))
    .where(and(eq(employees.accountType, "employee"), ne(employees.employmentStatus, "anonymised")))
    .orderBy(asc(employees.name));

  return rows.map((r) => {
    const fields = (r.fields as Record<string, string> | null) ?? {};
    const formPhone = String(fields.phone ?? "").trim();
    return {
      id: r.id,
      name: r.name,
      designation: r.designation ?? null,
      cell: formPhone || r.phone || r.whatsappPhone || null,
      email: r.personalEmail || r.email || null,
      isActive: r.isActive && r.employmentStatus === "active",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Asset Register                                                       */
/* ------------------------------------------------------------------ */

export interface AssetRow {
  id: string;
  assetCode: string;
  assetType: string;
  assetName: string;
  location: string | null;
  serialNo: string | null;
  model: string | null;
  make: string | null;
  description: string | null;
  specifications: string | null;
  warrantyUntil: string | null;
  underAmc: boolean;
  vendorName: string | null;
  photoPath: string | null;
  photoUrl: string | null;
  invoicePath: string | null;
  invoiceUrl: string | null;
  issuedKind: HrAssetIssuedKind;
  issuedEmployeeId: string | null;
  issuedEmployeeName: string | null;
  issuedOffice: string | null;
  notes: string | null;
  /** Only filled for editors — viewers never receive credentials. */
  username: string | null;
  /** Whether a password is on file. The password itself is only ever revealed on request. */
  hasPassword: boolean;
}

export interface AssetPerson {
  id: string;
  name: string;
}

export async function listAssets(opts: { withCredentials: boolean }): Promise<AssetRow[]> {
  const issued = aliasedTable(employees, "issued_emp");
  const rows = await db
    .select({ a: hrAssets, issuedName: issued.name })
    .from(hrAssets)
    .leftJoin(issued, eq(hrAssets.issuedEmployeeId, issued.id))
    .orderBy(asc(hrAssets.assetType), asc(hrAssets.assetCode));

  const paths = rows.flatMap((r) => [r.a.photoPath, r.a.invoicePath]).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    try {
      const { data } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUrls(paths, 3600);
      for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
    } catch {
      /* leave unsigned — the view shows the file as unavailable */
    }
  }

  return rows.map(({ a, issuedName }) => ({
    id: a.id,
    assetCode: a.assetCode,
    assetType: a.assetType,
    assetName: a.assetName,
    location: a.location,
    serialNo: a.serialNo,
    model: a.model,
    make: a.make,
    description: a.description,
    specifications: a.specifications,
    warrantyUntil: a.warrantyUntil,
    underAmc: a.underAmc,
    vendorName: a.vendorName,
    photoPath: a.photoPath,
    photoUrl: a.photoPath ? signed.get(a.photoPath) ?? null : null,
    invoicePath: a.invoicePath,
    invoiceUrl: a.invoicePath ? signed.get(a.invoicePath) ?? null : null,
    issuedKind: a.issuedKind,
    issuedEmployeeId: a.issuedEmployeeId,
    issuedEmployeeName: issuedName ?? null,
    issuedOffice: a.issuedOffice,
    notes: a.notes,
    username: opts.withCredentials ? a.username : null,
    hasPassword: !!a.passwordEnc,
  }));
}

/** Active employees, for the "Issued to" dropdown. */
export async function listAssetPeople(): Promise<AssetPerson[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.accountType, "employee"), eq(employees.isActive, true)))
    .orderBy(asc(employees.name));
}
