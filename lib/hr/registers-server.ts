import "server-only";
import { aliasedTable, and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { designations, employees, hrAssets, hrContacts, onboardingSubmissions } from "@/db/schema";
import type { HrAssetIssuedKind } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { employeeDirectoryDetailsFromOnboarding } from "@/lib/hr/employee-directory";

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
  firstName?: string | null;
  lastName?: string | null;
  cellNo: string | null;
  alternateNo: string | null;
  email: string | null;
  service: string;
  directoryType: "vendor" | "hr_consultant";
  contact2Name: string | null;
  contact2CellNo: string | null;
  contact2Email: string | null;
  category?: string | null;
  utility?: string | null;
  amcOnCall?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  addressLine4?: string | null;
  pincode?: string | null;
  gstNo?: string | null;
  panNo?: string | null;
  gstName?: string | null;
  bankDetails?: Record<string, string>;
  contact1Name?: string | null;
  contact1CellNo?: string | null;
  contact1Email?: string | null;
  attachments?: Record<string, unknown>;
  rateNegotiated?: string | null;
  paymentTerms?: string | null;
  registrationSubmittedAt?: Date | null;
  notes: string | null;
  isActive: boolean;
}

export interface EmployeeContactRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  /** Personal cell — from their onboarding form first, then their profile. */
  cell: string | null;
  /** Personal email first, then the login email. */
  email: string | null;
  contact1Name: string | null;
  contact1Cell: string | null;
  contact2Name: string | null;
  contact2Cell: string | null;
  isActive: boolean;
}

export async function listContacts(): Promise<ContactRow[]> {
  const legacyColumns = {
    id: hrContacts.id,
    companyName: hrContacts.companyName,
    personName: hrContacts.personName,
    firstName: hrContacts.firstName,
    lastName: hrContacts.lastName,
    cellNo: hrContacts.cellNo,
    alternateNo: hrContacts.alternateNo,
    email: hrContacts.email,
    service: hrContacts.service,
    notes: hrContacts.notes,
    isActive: hrContacts.isActive,
  };
  type ExtendedContact = Omit<ContactRow, "directoryType"> & { directoryType: string };
  let rows: ExtendedContact[] = [];
  try {
    rows = await db
      .select({
        ...legacyColumns,
        directoryType: hrContacts.directoryType,
        contact2Name: hrContacts.contact2Name,
        contact2CellNo: hrContacts.contact2CellNo,
        contact2Email: hrContacts.contact2Email,
        category: hrContacts.category,
        utility: hrContacts.utility,
        amcOnCall: hrContacts.amcOnCall,
        addressLine1: hrContacts.addressLine1,
        addressLine2: hrContacts.addressLine2,
        addressLine3: hrContacts.addressLine3,
        addressLine4: hrContacts.addressLine4,
        pincode: hrContacts.pincode,
        gstNo: hrContacts.gstNo,
        panNo: hrContacts.panNo,
        gstName: hrContacts.gstName,
        bankDetails: hrContacts.bankDetails,
        contact1Name: hrContacts.contact1Name,
        contact1CellNo: hrContacts.contact1CellNo,
        contact1Email: hrContacts.contact1Email,
        attachments: hrContacts.attachments,
        rateNegotiated: hrContacts.rateNegotiated,
        paymentTerms: hrContacts.paymentTerms,
        registrationSubmittedAt: hrContacts.registrationSubmittedAt,
      })
      .from(hrContacts)
      .orderBy(asc(hrContacts.service), asc(hrContacts.personName)) as ExtendedContact[];
  } catch (error) {
    // A deployed database can have the original Address Book table before
    // migration 0264. Keep the directory readable rather than rendering an
    // error boundary; those existing contacts are vendors by definition.
    if (!isMissingRegisterTable(error)) throw error;
    const legacyRows = await db
      .select(legacyColumns)
      .from(hrContacts)
      .orderBy(asc(hrContacts.service), asc(hrContacts.personName));
    return legacyRows.map((row) => ({
      ...row,
      directoryType: "vendor" as const,
      contact2Name: null,
      contact2CellNo: null,
      contact2Email: null,
      firstName: null,
      lastName: null,
      category: null,
      utility: null,
      amcOnCall: null,
      addressLine1: null,
      addressLine2: null,
      addressLine3: null,
      addressLine4: null,
      pincode: null,
      gstNo: null,
      panNo: null,
      gstName: null,
      bankDetails: {},
      contact1Name: null,
      contact1CellNo: null,
      contact1Email: null,
      attachments: {},
      rateNegotiated: null,
      paymentTerms: null,
      registrationSubmittedAt: null,
    }));
  }
  return rows.map((row) => ({
    ...row,
    directoryType: row.directoryType === "hr_consultant" ? "hr_consultant" as const : "vendor" as const,
  }));
}

/** HR Directory rows. Legacy Address Book entries safely default to Vendors. */
export async function listDirectoryContacts(): Promise<ContactRow[]> {
  return listContacts();
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
    const details = employeeDirectoryDetailsFromOnboarding(
      (r.fields as Record<string, unknown> | null) ?? {},
      {
        name: r.name,
        personalEmail: r.personalEmail,
        email: r.email,
        phone: r.phone,
        whatsappPhone: r.whatsappPhone,
      },
    );
    return {
      id: r.id,
      name: r.name,
      firstName: details.firstName,
      lastName: details.lastName,
      designation: r.designation ?? null,
      cell: details.cell,
      email: details.personalEmail,
      contact1Name: details.contact1Name,
      contact1Cell: details.contact1Cell,
      contact2Name: details.contact2Name,
      contact2Cell: details.contact2Cell,
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
