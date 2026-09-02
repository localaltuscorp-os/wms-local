import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  outstandingContracts,
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
  outstandingResponsibles,
  designations,
  payingEntities,
  employees,
} from "@/db/schema";

export interface RosterOption {
  id: string;
  name: string;
}

export interface RosterRowWithCount {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
}

/** Active products, ordered by sortOrder then name. Drives the contract form picker. */
export async function listOutstandingProducts(): Promise<RosterOption[]> {
  return db
    .select({ id: outstandingProducts.id, name: outstandingProducts.name })
    .from(outstandingProducts)
    .where(eq(outstandingProducts.isActive, true))
    .orderBy(asc(outstandingProducts.sortOrder), asc(outstandingProducts.name));
}

/** Active entities, ordered by sortOrder then name. */
export async function listOutstandingEntities(): Promise<RosterOption[]> {
  return db
    .select({ id: outstandingEntitiesTbl.id, name: outstandingEntitiesTbl.name })
    .from(outstandingEntitiesTbl)
    .where(eq(outstandingEntitiesTbl.isActive, true))
    .orderBy(
      asc(outstandingEntitiesTbl.sortOrder),
      asc(outstandingEntitiesTbl.name),
    );
}

/** Active responsibles, ordered by sortOrder then name. Drives the contract/collection form picker. */
export async function listOutstandingResponsibles(): Promise<RosterOption[]> {
  return db
    .select({ id: outstandingResponsibles.id, name: outstandingResponsibles.name })
    .from(outstandingResponsibles)
    .where(eq(outstandingResponsibles.isActive, true))
    .orderBy(
      asc(outstandingResponsibles.sortOrder),
      asc(outstandingResponsibles.name),
    );
}

/** Active payment modes, ordered by sortOrder then name. */
export async function listOutstandingPaymentModes(): Promise<RosterOption[]> {
  return db
    .select({ id: outstandingPaymentModes.id, name: outstandingPaymentModes.name })
    .from(outstandingPaymentModes)
    .where(eq(outstandingPaymentModes.isActive, true))
    .orderBy(
      asc(outstandingPaymentModes.sortOrder),
      asc(outstandingPaymentModes.name),
    );
}

/**
 * Every product (active + inactive) plus a count of contracts referencing it.
 * Backs the /admin roster management table. Sorted by name.
 */
export async function listOutstandingProductsWithCounts(): Promise<
  RosterRowWithCount[]
> {
  const rows = await db
    .select({
      id: outstandingProducts.id,
      name: outstandingProducts.name,
      isActive: outstandingProducts.isActive,
      sortOrder: outstandingProducts.sortOrder,
      usageCount: sql<number>`count(${outstandingContracts.id})::int`,
    })
    .from(outstandingProducts)
    .leftJoin(
      outstandingContracts,
      eq(outstandingContracts.productId, outstandingProducts.id),
    )
    .groupBy(outstandingProducts.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Every entity (active + inactive) plus a count of contracts referencing it.
 */
export async function listOutstandingEntitiesWithCounts(): Promise<
  RosterRowWithCount[]
> {
  const rows = await db
    .select({
      id: outstandingEntitiesTbl.id,
      name: outstandingEntitiesTbl.name,
      isActive: outstandingEntitiesTbl.isActive,
      sortOrder: outstandingEntitiesTbl.sortOrder,
      usageCount: sql<number>`count(${outstandingContracts.id})::int`,
    })
    .from(outstandingEntitiesTbl)
    .leftJoin(
      outstandingContracts,
      eq(outstandingContracts.entityId, outstandingEntitiesTbl.id),
    )
    .groupBy(outstandingEntitiesTbl.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Every responsible (active + inactive) plus a count of contracts referencing
 * it via responsible_id.
 */
export async function listOutstandingResponsiblesWithCounts(): Promise<
  RosterRowWithCount[]
> {
  const rows = await db
    .select({
      id: outstandingResponsibles.id,
      name: outstandingResponsibles.name,
      isActive: outstandingResponsibles.isActive,
      sortOrder: outstandingResponsibles.sortOrder,
      usageCount: sql<number>`count(${outstandingContracts.id})::int`,
    })
    .from(outstandingResponsibles)
    .leftJoin(
      outstandingContracts,
      eq(outstandingContracts.responsibleId, outstandingResponsibles.id),
    )
    .groupBy(outstandingResponsibles.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Every payment mode (active + inactive) plus a count of contracts whose
 * expected_mode_id references it.
 */
export async function listOutstandingPaymentModesWithCounts(): Promise<
  RosterRowWithCount[]
> {
  const rows = await db
    .select({
      id: outstandingPaymentModes.id,
      name: outstandingPaymentModes.name,
      isActive: outstandingPaymentModes.isActive,
      sortOrder: outstandingPaymentModes.sortOrder,
      usageCount: sql<number>`count(${outstandingContracts.id})::int`,
    })
    .from(outstandingPaymentModes)
    .leftJoin(
      outstandingContracts,
      eq(outstandingContracts.expectedModeId, outstandingPaymentModes.id),
    )
    .groupBy(outstandingPaymentModes.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Every designation (active + inactive) plus a count of employees referencing
 * it via designation_id. Backs the /admin/designations roster table.
 */
export async function listDesignationsWithCounts(): Promise<
  RosterRowWithCount[]
> {
  const rows = await db
    .select({
      id: designations.id,
      name: designations.name,
      isActive: designations.isActive,
      sortOrder: designations.sortOrder,
      usageCount: sql<number>`count(${employees.id})::int`,
    })
    .from(designations)
    .leftJoin(employees, eq(employees.designationId, designations.id))
    .groupBy(designations.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * Every paying entity (active + inactive) plus a count of employees referencing
 * it via paying_entity_id. Backs the /admin/paying-entities roster table.
 */
export async function listPayingEntitiesWithCounts(): Promise<
  RosterRowWithCount[]
> {
  const rows = await db
    .select({
      id: payingEntities.id,
      name: payingEntities.name,
      isActive: payingEntities.isActive,
      sortOrder: payingEntities.sortOrder,
      usageCount: sql<number>`count(${employees.id})::int`,
    })
    .from(payingEntities)
    .leftJoin(employees, eq(employees.payingEntityId, payingEntities.id))
    .groupBy(payingEntities.id);
  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
