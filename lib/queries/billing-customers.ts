import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingCustomerAddresses,
  billingCustomerContacts,
  billingCustomerDocuments,
  billingCustomers,
  billingLookups,
  employees,
  type CustomerIntroducer,
} from "@/db/schema";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createSignedObjectUrl } from "@/lib/storage/objects";

/**
 * READS FOR THE CUSTOMER SCREENS — master, address book and recycle bin.
 *
 * Every list here filters `deleted_at is null`. The recycle bin is the one
 * read that does the opposite, and it is the only place a deleted row should
 * ever appear: a customer that turns up in the master after being deleted is
 * worse than one that cannot be found at all.
 */

/**
 * One Customer Master row — every field the New Customer KYC form asks for
 * EXCEPT the address, which lives only in the Customer Address Book (Manan,
 * 2026-09-19: "address data goes into the address book only; whatever is left
 * goes into the customer master"). Fields removed from the form (grade,
 * export, credit limit, freight, transporter, quantity deviation) are not here
 * either, though saved clients keep their values in the table.
 */
export interface CustomerMasterRow {
  id: string;
  name: string;
  clientCode: string | null;
  // Identity
  salesPersonName: string | null;
  customerTypes: string[];
  industryTypes: string[];
  productTypes: string[];
  businessCategory: string | null;
  natureOfBusiness: string | null;
  tags: string[];
  // Registration & tax
  gstin: string | null;
  pan: string | null;
  msmeNo: string | null;
  gstRegType: string | null;
  currency: string;
  // Primary contact (the first KYC contact)
  contactName: string | null;
  contactDesignation: string | null;
  contactDepartment: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  // Commercial
  paymentTerms: string | null;
  creditDays: string | null;
  otherReferences: string | null;
  notes: string | null;
  // Online & payment options
  linkedinUrl: string | null;
  instagramHandle: string | null;
  subscription: string | null;
  emi: string | null;
  moduleWisePayment: string | null;
  // Introducer (KYC "Introducer" box)
  introducer: CustomerIntroducer | null;
  // State of the record
  isExport: boolean;
  isActive: boolean;
  createdAt: Date;
}

/**
 * The master list. One query plus one for the primary contacts.
 *
 * The contacts are fetched separately rather than joined because a customer
 * with three contacts would otherwise multiply into three rows and every count
 * on the screen would be wrong. Run one after the other, not in parallel —
 * parallel bursts have stalled on the pooler.
 */
export async function listCustomerMaster(): Promise<CustomerMasterRow[]> {
  const rows = await db
    .select({
      id: billingCustomers.id,
      name: billingCustomers.name,
      clientCode: billingCustomers.clientCode,
      salesPersonName: employees.name,
      customerTypes: billingCustomers.customerTypes,
      industryTypes: billingCustomers.industryTypes,
      productTypes: billingCustomers.productTypes,
      businessCategory: billingCustomers.businessCategory,
      natureOfBusiness: billingCustomers.natureOfBusiness,
      tags: billingCustomers.tags,
      gstin: billingCustomers.gstin,
      pan: billingCustomers.pan,
      msmeNo: billingCustomers.msmeNo,
      gstRegType: billingCustomers.gstRegType,
      currency: billingCustomers.currency,
      contactName: billingCustomers.contactName,
      phone: billingCustomers.phone,
      whatsapp: billingCustomers.whatsapp,
      email: billingCustomers.email,
      paymentTerms: billingCustomers.paymentTerms,
      creditDays: billingCustomers.creditDays,
      otherReferences: billingCustomers.otherReferences,
      notes: billingCustomers.notes,
      linkedinUrl: billingCustomers.linkedinUrl,
      instagramHandle: billingCustomers.instagramHandle,
      subscription: billingCustomers.subscription,
      emi: billingCustomers.emi,
      moduleWisePayment: billingCustomers.moduleWisePayment,
      introducer: billingCustomers.introducer,
      isExport: billingCustomers.isExport,
      isActive: billingCustomers.isActive,
      createdAt: billingCustomers.createdAt,
    })
    .from(billingCustomers)
    .leftJoin(employees, eq(employees.id, billingCustomers.salesPersonId))
    .where(isNull(billingCustomers.deletedAt))
    .orderBy(asc(billingCustomers.name));

  const primaries = await db
    .select({
      customerId: billingCustomerContacts.customerId,
      firstName: billingCustomerContacts.firstName,
      lastName: billingCustomerContacts.lastName,
      designation: billingCustomerContacts.designation,
      department: billingCustomerContacts.department,
      phone: billingCustomerContacts.phone,
      whatsapp: billingCustomerContacts.whatsapp,
      email: billingCustomerContacts.email,
    })
    .from(billingCustomerContacts)
    .orderBy(asc(billingCustomerContacts.sortOrder));

  const byCustomer = new Map<string, (typeof primaries)[number]>();
  for (const c of primaries) if (!byCustomer.has(c.customerId)) byCustomer.set(c.customerId, c);

  return rows.map(({ phone, whatsapp, email, ...r }) => {
    const k = byCustomer.get(r.id);
    const kycName = k ? [k.firstName, k.lastName].filter(Boolean).join(" ").trim() : "";
    return {
      ...r,
      // The KYC contact if there is one, else what the customer row carried
      // before KYC existed.
      contactName: kycName || r.contactName,
      contactDesignation: k?.designation ?? null,
      contactDepartment: k?.department ?? null,
      contactPhone: k?.phone || phone,
      contactWhatsapp: k?.whatsapp || whatsapp,
      contactEmail: k?.email || email,
    };
  });
}

export interface CustomerStats {
  total: number;
  domestic: number;
  active: number;
  export: number;
  withGstin: number;
}

export function customerStats(rows: CustomerMasterRow[]): CustomerStats {
  return {
    total: rows.length,
    domestic: rows.filter((r) => !r.isExport).length,
    active: rows.filter((r) => r.isActive).length,
    export: rows.filter((r) => r.isExport).length,
    withGstin: rows.filter((r) => Boolean(r.gstin)).length,
  };
}

export interface AddressBookRow {
  id: string;
  customerId: string;
  customerName: string;
  clientCode: string | null;
  kind: string;
  label: string | null;
  lines: string[];
  city: string | null;
  stateName: string | null;
  country: string;
  pincode: string | null;
  gstin: string | null;
}

/**
 * THE ADDRESS BOOK — every address entered on every KYC form, flattened.
 *
 * Derived, never separately entered: "whatever data we filled in the KYC form
 * goes into that section". So there is no writer for this screen — editing an
 * address happens on the client it belongs to, and this is the way to find it.
 */
export async function listAddressBook(): Promise<AddressBookRow[]> {
  const rows = await db
    .select({
      id: billingCustomerAddresses.id,
      customerId: billingCustomerAddresses.customerId,
      customerName: billingCustomers.name,
      clientCode: billingCustomers.clientCode,
      gstin: billingCustomers.gstin,
      kind: billingCustomerAddresses.kind,
      label: billingCustomerAddresses.label,
      line1: billingCustomerAddresses.line1,
      line2: billingCustomerAddresses.line2,
      line3: billingCustomerAddresses.line3,
      line4: billingCustomerAddresses.line4,
      city: billingCustomerAddresses.city,
      stateName: billingCustomerAddresses.stateName,
      country: billingCustomerAddresses.country,
      pincode: billingCustomerAddresses.pincode,
    })
    .from(billingCustomerAddresses)
    .innerJoin(billingCustomers, eq(billingCustomers.id, billingCustomerAddresses.customerId))
    .where(isNull(billingCustomers.deletedAt))
    .orderBy(asc(billingCustomers.name), asc(billingCustomerAddresses.kind), asc(billingCustomerAddresses.sortOrder));

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: r.customerName,
    clientCode: r.clientCode,
    gstin: r.gstin,
    kind: r.kind,
    label: r.label,
    lines: [r.line1, r.line2, r.line3, r.line4].filter((v): v is string => Boolean(v?.trim())),
    city: r.city,
    stateName: r.stateName,
    country: r.country,
    pincode: r.pincode,
  }));
}

export interface BinRow {
  id: string;
  kind: "customer" | "option";
  title: string;
  detail: string;
  deletedAt: Date;
  deletedByName: string | null;
}

/**
 * THE RECYCLE BIN — deleted customers and removed dropdown options together.
 *
 * One screen for both because "where did that go" is one question, and a person
 * who has just removed the wrong thing should not have to know which of two
 * bins to look in.
 */
export async function listRecycleBin(): Promise<BinRow[]> {
  const customers = await db
    .select({
      id: billingCustomers.id,
      name: billingCustomers.name,
      clientCode: billingCustomers.clientCode,
      gstin: billingCustomers.gstin,
      deletedAt: billingCustomers.deletedAt,
      deletedByName: employees.name,
    })
    .from(billingCustomers)
    .leftJoin(employees, eq(employees.id, billingCustomers.deletedById))
    .where(isNotNull(billingCustomers.deletedAt))
    .orderBy(desc(billingCustomers.deletedAt));

  const options = await db
    .select({
      id: billingLookups.id,
      kind: billingLookups.kind,
      value: billingLookups.value,
      deletedAt: billingLookups.deletedAt,
    })
    .from(billingLookups)
    .where(isNotNull(billingLookups.deletedAt))
    .orderBy(desc(billingLookups.deletedAt));

  const out: BinRow[] = [
    ...customers.map((c) => ({
      id: c.id,
      kind: "customer" as const,
      title: c.name,
      detail: [c.clientCode, c.gstin].filter(Boolean).join(" · ") || "Customer",
      deletedAt: c.deletedAt!,
      deletedByName: c.deletedByName,
    })),
    ...options.map((o) => ({
      id: o.id,
      kind: "option" as const,
      title: o.value,
      detail: `Dropdown option · ${o.kind.replace(/_/g, " ")}`,
      deletedAt: o.deletedAt!,
      deletedByName: null,
    })),
  ];
  return out.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

/** Next client code in the CL-0001 series the master displays. */
export async function nextClientCode(): Promise<string> {
  const [row] = await db
    .select({
      n: sql<number>`coalesce(max(nullif(regexp_replace(${billingCustomers.clientCode}, '\\D', '', 'g'), '')::int), 0)`,
    })
    .from(billingCustomers)
    .where(isNotNull(billingCustomers.clientCode));
  return `CL-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** The sales people the KYC form offers. */
export async function assignableEmployees(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}

/* ─────────────────────────── one customer, in full ─────────────────────── */

export interface CustomerDetail {
  id: string;
  name: string;
  clientCode: string | null;
  gstin: string | null;
  pan: string | null;
  msmeNo: string | null;
  gstRegType: string | null;
  currency: string;
  country: string;
  stateName: string | null;
  grade: string | null;
  salesPersonId: string | null;
  salesPersonName: string | null;
  isExport: boolean;
  isActive: boolean;
  tags: string[];
  customerTypes: string[];
  industryTypes: string[];
  productTypes: string[];
  paymentTerms: string | null;
  freightCharges: string | null;
  creditDays: string | null;
  creditLimit: string | null;
  transporter: string | null;
  quantityDeviation: string | null;
  otherReferences: string | null;
  notes: string | null;
  businessCategory: string | null;
  natureOfBusiness: string | null;
  linkedinUrl: string | null;
  instagramHandle: string | null;
  subscription: string | null;
  emi: string | null;
  moduleWisePayment: string | null;
  introducer: CustomerIntroducer | null;
  createdAt: string;
  contacts: {
    firstName: string; lastName: string; phone: string; whatsapp: string; email: string;
    designation: string; department: string; notes: string;
  }[];
  addresses: {
    kind: "billing" | "shipping";
    line1: string; line2: string; line3: string; line4: string;
    city: string; stateName: string; country: string; pincode: string;
  }[];
  documents: { id: string; slot: string; fileName: string; contentType: string | null; url: string | null }[];
}

/**
 * Everything on one client — the KYC fields, every contact and address, and
 * the attached files with short-lived signed URLs. Feeds Quick View, the Full
 * Record page, the PDF view and the Edit form, so the four can never disagree.
 * Null when the client does not exist or is in the recycle bin.
 */
export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const [c] = await db
    .select({ c: billingCustomers, salesPersonName: employees.name })
    .from(billingCustomers)
    .leftJoin(employees, eq(employees.id, billingCustomers.salesPersonId))
    .where(and(eq(billingCustomers.id, id), isNull(billingCustomers.deletedAt)))
    .limit(1);
  if (!c) return null;

  // One at a time — parallel child reads have stalled on the pooler before
  // (see listBillToCustomers in billing-documents.ts).
  const contacts = await db
    .select()
    .from(billingCustomerContacts)
    .where(eq(billingCustomerContacts.customerId, id))
    .orderBy(asc(billingCustomerContacts.sortOrder));
  const addresses = await db
    .select()
    .from(billingCustomerAddresses)
    .where(eq(billingCustomerAddresses.customerId, id))
    .orderBy(asc(billingCustomerAddresses.sortOrder));
  /* The documents table may not exist yet on a database where 0233 has not
     run — a missing attachment list must not take the whole record down. */
  let docs: (typeof billingCustomerDocuments.$inferSelect)[] = [];
  try {
    docs = await db
      .select()
      .from(billingCustomerDocuments)
      .where(eq(billingCustomerDocuments.customerId, id))
      .orderBy(asc(billingCustomerDocuments.uploadedAt));
  } catch {
    docs = [];
  }

  const documents = await Promise.all(
    docs.map(async (d) => ({
      id: d.id,
      slot: d.slot,
      fileName: d.fileName,
      contentType: d.contentType,
      url: await createSignedObjectUrl(DOCUMENTS_BUCKET, d.storagePath, 60 * 30).catch(() => null),
    })),
  );

  const s = (v: string | null | undefined) => v ?? "";
  const r = c.c;
  return {
    id: r.id,
    name: r.name,
    clientCode: r.clientCode,
    gstin: r.gstin,
    pan: r.pan,
    msmeNo: r.msmeNo,
    gstRegType: r.gstRegType,
    currency: r.currency,
    country: r.country,
    stateName: r.stateName,
    grade: r.grade,
    salesPersonId: r.salesPersonId,
    salesPersonName: c.salesPersonName,
    isExport: r.isExport,
    isActive: r.isActive,
    tags: r.tags,
    customerTypes: r.customerTypes,
    industryTypes: r.industryTypes,
    productTypes: r.productTypes,
    paymentTerms: r.paymentTerms,
    freightCharges: r.freightCharges,
    creditDays: r.creditDays,
    creditLimit: r.creditLimit,
    transporter: r.transporter,
    quantityDeviation: r.quantityDeviation,
    otherReferences: r.otherReferences,
    notes: r.notes,
    businessCategory: r.businessCategory,
    natureOfBusiness: r.natureOfBusiness,
    linkedinUrl: r.linkedinUrl,
    instagramHandle: r.instagramHandle,
    subscription: r.subscription,
    emi: r.emi,
    moduleWisePayment: r.moduleWisePayment,
    introducer: r.introducer ?? null,
    createdAt: r.createdAt.toISOString(),
    contacts: contacts.map((x) => ({
      firstName: s(x.firstName), lastName: s(x.lastName), phone: s(x.phone), whatsapp: s(x.whatsapp), email: s(x.email),
      designation: s(x.designation), department: s(x.department), notes: s(x.notes),
    })),
    addresses: addresses.map((a) => ({
      kind: a.kind === "shipping" ? "shipping" : "billing",
      line1: s(a.line1), line2: s(a.line2), line3: s(a.line3), line4: s(a.line4),
      city: s(a.city), stateName: s(a.stateName), country: a.country || "India", pincode: s(a.pincode),
    })),
    documents,
  };
}
