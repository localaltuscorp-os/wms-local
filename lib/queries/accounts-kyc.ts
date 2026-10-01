import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsKycDocuments } from "@/db/schema";

export interface KycDocumentRow {
  id: string;
  person: string;
  documentType: string;
  documentNumber: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  fileLink: string | null;
  notes: string | null;
}

export async function listKycDocuments(): Promise<KycDocumentRow[]> {
  return db.select({
    id: accountsKycDocuments.id,
    person: accountsKycDocuments.person,
    documentType: accountsKycDocuments.documentType,
    documentNumber: accountsKycDocuments.documentNumber,
    issuedOn: accountsKycDocuments.issuedOn,
    expiresOn: accountsKycDocuments.expiresOn,
    fileLink: accountsKycDocuments.fileLink,
    notes: accountsKycDocuments.notes,
  }).from(accountsKycDocuments)
    .where(eq(accountsKycDocuments.archived, false))
    .orderBy(asc(accountsKycDocuments.sortOrder), asc(accountsKycDocuments.person));
}
