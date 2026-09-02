import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  pgIntroductions,
  pgReferenceSources,
  pgDesignations,
  pgBusinessCategories,
  pgSalesPeople,
  employees,
} from "@/db/schema";

export interface PgLookupOption {
  id: string;
  name: string;
}

export interface PgLookups {
  referenceSources: PgLookupOption[];
  designations: PgLookupOption[];
  businessCategories: PgLookupOption[];
  salesPeople: PgLookupOption[];
}

/** Active options for all four managed dropdowns (soft-deleted rows excluded). */
export async function listPgLookups(): Promise<PgLookups> {
  const [referenceSources, designations, businessCategories, salesPeople] =
    await Promise.all([
      db
        .select({ id: pgReferenceSources.id, name: pgReferenceSources.name })
        .from(pgReferenceSources)
        .where(eq(pgReferenceSources.isActive, true))
        .orderBy(asc(pgReferenceSources.sortOrder), asc(pgReferenceSources.name)),
      db
        .select({ id: pgDesignations.id, name: pgDesignations.name })
        .from(pgDesignations)
        .where(eq(pgDesignations.isActive, true))
        .orderBy(asc(pgDesignations.sortOrder), asc(pgDesignations.name)),
      db
        .select({ id: pgBusinessCategories.id, name: pgBusinessCategories.name })
        .from(pgBusinessCategories)
        .where(eq(pgBusinessCategories.isActive, true))
        .orderBy(asc(pgBusinessCategories.sortOrder), asc(pgBusinessCategories.name)),
      db
        .select({ id: pgSalesPeople.id, name: pgSalesPeople.name })
        .from(pgSalesPeople)
        .where(eq(pgSalesPeople.isActive, true))
        .orderBy(asc(pgSalesPeople.sortOrder), asc(pgSalesPeople.name)),
    ]);
  return { referenceSources, designations, businessCategories, salesPeople };
}

export interface PgIntroductionRow {
  id: string;
  receivedOn: string; // YYYY-MM-DD
  referenceSource: string | null;
  introducerFirstName: string;
  introducerLastName: string;
  introducerCell: string | null;
  prospectCompany: string;
  prospectFirstName: string;
  prospectLastName: string;
  designation: string | null;
  businessCategory: string | null;
  natureOfBusiness: string;
  notes: string | null;
  nextReminderDate: string | null;
  salesPerson: string | null;
  createdBy: string | null;
  createdAt: string; // ISO
}

/**
 * All introductions, newest first, with lookup display names resolved via LEFT
 * JOIN — so a soft-deleted lookup value still shows on the historical row. The
 * list view filters/sorts/searches client-side (TanStack), so we return the
 * full set; pagination can move server-side later without changing this shape.
 */
export async function listIntroductions(): Promise<PgIntroductionRow[]> {
  const rows = await db
    .select({
      id: pgIntroductions.id,
      receivedOn: pgIntroductions.receivedOn,
      referenceSource: pgReferenceSources.name,
      introducerFirstName: pgIntroductions.introducerFirstName,
      introducerLastName: pgIntroductions.introducerLastName,
      introducerCell: pgIntroductions.introducerCell,
      prospectCompany: pgIntroductions.prospectCompany,
      prospectFirstName: pgIntroductions.prospectFirstName,
      prospectLastName: pgIntroductions.prospectLastName,
      designation: pgDesignations.name,
      businessCategory: pgBusinessCategories.name,
      natureOfBusiness: pgIntroductions.natureOfBusiness,
      notes: pgIntroductions.notes,
      nextReminderDate: pgIntroductions.nextReminderDate,
      salesPerson: pgSalesPeople.name,
      createdBy: employees.name,
      createdAt: pgIntroductions.createdAt,
    })
    .from(pgIntroductions)
    .leftJoin(pgReferenceSources, eq(pgReferenceSources.id, pgIntroductions.referenceSourceId))
    .leftJoin(pgDesignations, eq(pgDesignations.id, pgIntroductions.designationId))
    .leftJoin(pgBusinessCategories, eq(pgBusinessCategories.id, pgIntroductions.businessCategoryId))
    .leftJoin(pgSalesPeople, eq(pgSalesPeople.id, pgIntroductions.salesPersonId))
    .leftJoin(employees, eq(employees.id, pgIntroductions.createdById))
    .orderBy(desc(pgIntroductions.createdAt));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
