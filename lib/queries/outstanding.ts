import "server-only";
import { asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  employees,
  outstandingEntries,
  outstandingFollowups,
  outstandingContracts,
  outstandingInstallments,
  outstandingCollections,
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
  outstandingResponsibles,
} from "@/db/schema";
import type { OutstandingStatus, OutstandingCycle } from "@/db/enums";
import { generateSchedule } from "@/lib/outstanding/schedule";
import { allocatePayments } from "@/lib/outstanding/allocate";
import { buildDashboard } from "@/lib/outstanding/aggregate";
import { applyOutstandingFilters } from "@/lib/outstanding/filters";
import type {
  ContractInput,
  StoredInstallment,
  CollectionInput,
  DerivedInstallment,
} from "@/lib/outstanding/types";
import type { CollectionAggRow } from "@/lib/outstanding/aggregate";
import type { OutstandingFilters } from "@/lib/outstanding/filters";

/** Drizzle `date` columns come back as strings (YYYY-MM-DD), but guard for Date. */
function toISODate(v: string | Date): string {
  return typeof v === "string" ? v : v.toISOString().slice(0, 10);
}

export interface OutstandingFollowupRow {
  id: string;
  actorName: string;
  note: string;
  promisedDate: string | null;
  amountReceived: number | null;
  createdAt: Date;
}

export interface OutstandingEntryRow {
  id: string;
  client: string;
  particulars: string | null;
  amount: number;
  amountReceived: number;
  balance: number;
  dueDate: string | null;
  status: OutstandingStatus;
  ownerId: string | null;
  ownerName: string | null;
  createdByName: string | null;
  createdAt: Date;
  followups: OutstandingFollowupRow[];
}

/**
 * The full receivables ledger, newest first, with each entry's follow-up
 * log embedded (small-team scale — a few hundred rows at most).
 */
export async function listOutstandingEntries(): Promise<OutstandingEntryRow[]> {
  const owner = alias(employees, "owner");
  const creator = alias(employees, "creator");
  const entries = await db
    .select({
      id: outstandingEntries.id,
      client: outstandingEntries.client,
      particulars: outstandingEntries.particulars,
      amount: outstandingEntries.amount,
      amountReceived: outstandingEntries.amountReceived,
      dueDate: outstandingEntries.dueDate,
      status: outstandingEntries.status,
      ownerId: outstandingEntries.ownerId,
      ownerName: owner.name,
      createdByName: creator.name,
      createdAt: outstandingEntries.createdAt,
    })
    .from(outstandingEntries)
    .leftJoin(owner, eq(outstandingEntries.ownerId, owner.id))
    .leftJoin(creator, eq(outstandingEntries.createdById, creator.id))
    .orderBy(desc(outstandingEntries.createdAt))
    .limit(500);

  const ids = entries.map((e) => e.id);
  const followups = ids.length
    ? await db
        .select({
          id: outstandingFollowups.id,
          entryId: outstandingFollowups.entryId,
          actorName: employees.name,
          note: outstandingFollowups.note,
          promisedDate: outstandingFollowups.promisedDate,
          amountReceived: outstandingFollowups.amountReceived,
          createdAt: outstandingFollowups.createdAt,
        })
        .from(outstandingFollowups)
        .innerJoin(employees, eq(outstandingFollowups.actorId, employees.id))
        .where(inArray(outstandingFollowups.entryId, ids))
        .orderBy(desc(outstandingFollowups.createdAt))
    : [];

  const byEntry = new Map<string, OutstandingFollowupRow[]>();
  for (const f of followups) {
    const list = byEntry.get(f.entryId) ?? [];
    list.push({
      id: f.id,
      actorName: f.actorName,
      note: f.note,
      promisedDate: f.promisedDate,
      amountReceived: f.amountReceived === null ? null : Number(f.amountReceived),
      createdAt: f.createdAt,
    });
    byEntry.set(f.entryId, list);
  }

  return entries.map((e) => {
    const amount = Number(e.amount);
    const received = Number(e.amountReceived);
    return {
      id: e.id,
      client: e.client,
      particulars: e.particulars,
      amount,
      amountReceived: received,
      balance: Math.max(0, amount - received),
      dueDate: e.dueDate,
      status: e.status,
      ownerId: e.ownerId,
      ownerName: e.ownerName ?? null,
      createdByName: e.createdByName ?? null,
      createdAt: e.createdAt,
      followups: byEntry.get(e.id) ?? [],
    };
  });
}

// ── v2 query layer (contracts → derived installments → dashboard) ──────────

export interface CollectionDisplayRow {
  id: string;
  clientName: string;
  amount: number;
  paymentMode: string | null;
  responsible: string | null;
  comments: string | null;
  collectedAt: string;
}

export interface LoadedOutstanding {
  derived: DerivedInstallment[];
  collectionsDisplay: CollectionDisplayRow[];
  collectionAgg: CollectionAggRow[];
}

/** Denormalized contract fields carried onto every (stored or synthetic) installment. */
interface ContractDenorm {
  clientName: string;
  entityName: string | null;
  responsibleName: string | null;
  productName: string | null;
  cycle: string;
  pdcReceived: boolean;
  expectedModeName: string | null;
}

/**
 * Load every live contract, materialize its installment schedule (stored rows
 * if present, otherwise generated on the fly), allocate collections against the
 * schedule, and return the derived rows plus the collection aggregates/display
 * rows. Pure-engine logic is reused — this layer only wires the DB to it.
 *
 * `today`/`horizon` are passed in by the caller; nothing here calls `new Date()`.
 */
export async function loadOutstanding(
  today: string,
  horizon: string,
): Promise<LoadedOutstanding> {
  const product = alias(outstandingProducts, "product");
  const entity = alias(outstandingEntitiesTbl, "entity");
  const expectedMode = alias(outstandingPaymentModes, "expected_mode");
  const responsible = alias(outstandingResponsibles, "responsible");

  // 1. Contracts (non-written-off) with denormalized names.
  const contractRows = await db
    .select({
      id: outstandingContracts.id,
      clientName: outstandingContracts.clientName,
      cycle: outstandingContracts.cycle,
      baseAmount: outstandingContracts.baseAmount,
      gstRate: outstandingContracts.gstRate,
      startDate: outstandingContracts.startDate,
      periods: outstandingContracts.periods,
      endDate: outstandingContracts.endDate,
      status: outstandingContracts.status,
      pdcReceived: outstandingContracts.pdcReceived,
      productName: product.name,
      entityName: entity.name,
      responsibleName: responsible.name,
      expectedModeName: expectedMode.name,
    })
    .from(outstandingContracts)
    .leftJoin(product, eq(outstandingContracts.productId, product.id))
    .leftJoin(entity, eq(outstandingContracts.entityId, entity.id))
    .leftJoin(responsible, eq(outstandingContracts.responsibleId, responsible.id))
    .leftJoin(expectedMode, eq(outstandingContracts.expectedModeId, expectedMode.id))
    .where(ne(outstandingContracts.status, "written_off"));

  const contractInputs = new Map<string, ContractInput>();
  const denorm = new Map<string, ContractDenorm>();
  for (const c of contractRows) {
    contractInputs.set(c.id, {
      id: c.id,
      clientName: c.clientName,
      cycle: c.cycle as OutstandingCycle,
      baseAmount: Number(c.baseAmount),
      gstRate: c.gstRate,
      startDate: toISODate(c.startDate),
      periods: c.periods,
      endDate: c.endDate == null ? null : toISODate(c.endDate),
      status: c.status,
    });
    denorm.set(c.id, {
      clientName: c.clientName,
      entityName: c.entityName ?? null,
      responsibleName: c.responsibleName ?? null,
      productName: c.productName ?? null,
      cycle: c.cycle,
      pdcReceived: c.pdcReceived,
      expectedModeName: c.expectedModeName ?? null,
    });
  }

  const contractIds = [...contractInputs.keys()];

  // 2. Stored installments for those contracts, grouped by contract.
  const installmentRows = contractIds.length
    ? await db
        .select({
          id: outstandingInstallments.id,
          contractId: outstandingInstallments.contractId,
          periodIndex: outstandingInstallments.periodIndex,
          dueDate: outstandingInstallments.dueDate,
          amount: outstandingInstallments.amount,
        })
        .from(outstandingInstallments)
        .where(inArray(outstandingInstallments.contractId, contractIds))
    : [];

  const storedByContract = new Map<string, typeof installmentRows>();
  for (const row of installmentRows) {
    if (!row.contractId) continue;
    const list = storedByContract.get(row.contractId);
    if (list) list.push(row);
    else storedByContract.set(row.contractId, [row]);
  }

  const allStored: StoredInstallment[] = [];
  for (const id of contractIds) {
    const input = contractInputs.get(id)!;
    const d = denorm.get(id)!;
    const attach = (base: {
      id: string;
      contractId: string;
      clientName: string;
      periodIndex: number | null;
      dueDate: string;
      amount: number;
    }): StoredInstallment => ({
      ...base,
      entityName: d.entityName,
      responsibleName: d.responsibleName,
      productName: d.productName,
      cycle: d.cycle,
      pdcReceived: d.pdcReceived,
      expectedModeName: d.expectedModeName,
    });
    const stored = storedByContract.get(id);
    if (stored && stored.length > 0) {
      for (const row of stored) {
        allStored.push(
          attach({
            id: row.id,
            contractId: id,
            clientName: d.clientName,
            periodIndex: row.periodIndex,
            dueDate: toISODate(row.dueDate),
            amount: Number(row.amount),
          }),
        );
      }
    } else {
      for (const spec of generateSchedule(input, horizon)) {
        allStored.push(
          attach({
            id: `${id}:${spec.periodIndex}`,
            contractId: id,
            clientName: d.clientName,
            periodIndex: spec.periodIndex,
            dueDate: spec.dueDate,
            amount: spec.amount,
          }),
        );
      }
    }
  }

  // 3. Collections with payment-mode + responsible names.
  const collResponsible = alias(outstandingResponsibles, "coll_responsible");
  const collectionRows = await db
    .select({
      id: outstandingCollections.id,
      clientName: outstandingCollections.clientName,
      contractId: outstandingCollections.contractId,
      amount: outstandingCollections.amount,
      collectedAt: outstandingCollections.collectedAt,
      comments: outstandingCollections.comments,
      paymentModeName: outstandingPaymentModes.name,
      responsibleName: collResponsible.name,
    })
    .from(outstandingCollections)
    .leftJoin(
      outstandingPaymentModes,
      eq(outstandingCollections.paymentModeId, outstandingPaymentModes.id),
    )
    .leftJoin(
      collResponsible,
      eq(outstandingCollections.responsibleId, collResponsible.id),
    )
    .orderBy(desc(outstandingCollections.collectedAt));

  const collectionInputs: CollectionInput[] = [];
  const collectionAgg: CollectionAggRow[] = [];
  const collectionsDisplay: CollectionDisplayRow[] = [];
  for (const c of collectionRows) {
    const amount = Number(c.amount);
    const collectedAt = toISODate(c.collectedAt);
    collectionInputs.push({
      id: c.id,
      clientName: c.clientName,
      contractId: c.contractId,
      amount,
      collectedAt,
    });
    collectionAgg.push({
      clientName: c.clientName,
      amount,
      paymentMode: c.paymentModeName ?? "Unknown",
      responsible: c.responsibleName ?? "—",
    });
    collectionsDisplay.push({
      id: c.id,
      clientName: c.clientName,
      amount,
      paymentMode: c.paymentModeName ?? null,
      responsible: c.responsibleName ?? null,
      comments: c.comments,
      collectedAt,
    });
  }

  // 4. Allocate — spread in allocatePayments preserves denormalized fields.
  const derived = allocatePayments(allStored, collectionInputs, today);

  return { derived, collectionsDisplay, collectionAgg };
}

/**
 * Apply filters to the derived rows + collection aggregates, then build the
 * dashboard. `entries` backs the "All Outstanding Entries" table (open rows
 * only, due-date ascending).
 */
export async function loadOutstandingDashboard(
  filters: OutstandingFilters,
  today: string,
  horizon: string,
): Promise<{
  dashboard: ReturnType<typeof buildDashboard>;
  entries: DerivedInstallment[];
  collectionEntries: CollectionDisplayRow[];
}> {
  const { derived, collectionsDisplay, collectionAgg } = await loadOutstanding(
    today,
    horizon,
  );

  const filteredRows = applyOutstandingFilters(derived, filters);

  // Collections carry no due date/state, so only the mode/responsible filters
  // apply. Skip month/year/entity/cycle/status filters on collections for v1.
  const filteredCollectionAgg = collectionAgg.filter(
    (c) =>
      (filters.modes.length === 0 || filters.modes.includes(c.paymentMode)) &&
      (filters.employees.length === 0 ||
        filters.employees.includes(c.responsible)),
  );

  const dashboard = buildDashboard(filteredRows, filteredCollectionAgg);

  const entries = filteredRows
    .filter((r) => r.state !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // The "Total Collection Entries" table mirrors the same mode/responsible
  // filters applied to the aggregates above. `paymentMode`/`responsible` are
  // nullable here (aggregates coerce to "Unknown"/"—"), so match the same way.
  const collectionEntries = collectionsDisplay.filter(
    (c) =>
      (filters.modes.length === 0 ||
        filters.modes.includes(c.paymentMode ?? "Unknown")) &&
      (filters.employees.length === 0 ||
        filters.employees.includes(c.responsible ?? "—")),
  );

  return { dashboard, entries, collectionEntries };
}

// ── Admin contract management (Milestone 6) ────────────────────────────────

export interface AdminContractRow {
  id: string;
  clientName: string;
  contactPhone: string | null;
  productId: string | null;
  productName: string | null;
  entityId: string | null;
  entityName: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  expectedModeId: string | null;
  expectedModeName: string | null;
  cycle: OutstandingCycle;
  baseAmount: number;
  gstRate: number;
  startDate: string;
  periods: number | null;
  endDate: string | null;
  pdcReceived: boolean;
  comments: string | null;
  status: "active" | "closed" | "written_off";
  installmentCount: number;
  createdAt: Date;
}

/**
 * Every contract (all statuses, incl. written-off) with denormalized
 * product / entity / responsible / payment-mode names and a count of its
 * installments. Newest first. Backs the admin "Manage Contracts" page.
 */
export async function listOutstandingContractsAdmin(): Promise<
  AdminContractRow[]
> {
  const product = alias(outstandingProducts, "product");
  const entity = alias(outstandingEntitiesTbl, "entity");
  const expectedMode = alias(outstandingPaymentModes, "expected_mode");
  const responsible = alias(outstandingResponsibles, "responsible");

  const rows = await db
    .select({
      id: outstandingContracts.id,
      clientName: outstandingContracts.clientName,
      contactPhone: outstandingContracts.contactPhone,
      productId: outstandingContracts.productId,
      productName: product.name,
      entityId: outstandingContracts.entityId,
      entityName: entity.name,
      responsibleId: outstandingContracts.responsibleId,
      responsibleName: responsible.name,
      expectedModeId: outstandingContracts.expectedModeId,
      expectedModeName: expectedMode.name,
      cycle: outstandingContracts.cycle,
      baseAmount: outstandingContracts.baseAmount,
      gstRate: outstandingContracts.gstRate,
      startDate: outstandingContracts.startDate,
      periods: outstandingContracts.periods,
      endDate: outstandingContracts.endDate,
      pdcReceived: outstandingContracts.pdcReceived,
      comments: outstandingContracts.comments,
      status: outstandingContracts.status,
      installmentCount: sql<number>`count(${outstandingInstallments.id})::int`,
      createdAt: outstandingContracts.createdAt,
    })
    .from(outstandingContracts)
    .leftJoin(product, eq(outstandingContracts.productId, product.id))
    .leftJoin(entity, eq(outstandingContracts.entityId, entity.id))
    .leftJoin(responsible, eq(outstandingContracts.responsibleId, responsible.id))
    .leftJoin(expectedMode, eq(outstandingContracts.expectedModeId, expectedMode.id))
    .leftJoin(
      outstandingInstallments,
      eq(outstandingInstallments.contractId, outstandingContracts.id),
    )
    .groupBy(
      outstandingContracts.id,
      product.name,
      entity.name,
      responsible.name,
      expectedMode.name,
    )
    .orderBy(desc(outstandingContracts.createdAt));

  return rows.map((c) => ({
    id: c.id,
    clientName: c.clientName,
    contactPhone: c.contactPhone,
    productId: c.productId,
    productName: c.productName ?? null,
    entityId: c.entityId,
    entityName: c.entityName ?? null,
    responsibleId: c.responsibleId,
    responsibleName: c.responsibleName ?? null,
    expectedModeId: c.expectedModeId,
    expectedModeName: c.expectedModeName ?? null,
    cycle: c.cycle as OutstandingCycle,
    baseAmount: Number(c.baseAmount),
    gstRate: c.gstRate,
    startDate: toISODate(c.startDate),
    periods: c.periods,
    endDate: c.endDate == null ? null : toISODate(c.endDate),
    pdcReceived: c.pdcReceived,
    comments: c.comments,
    status: c.status,
    installmentCount: c.installmentCount,
    createdAt: c.createdAt,
  }));
}

export interface AdminInstallmentRow {
  id: string;
  periodIndex: number | null;
  dueDate: string;
  amount: number;
  isOverride: boolean;
}

/**
 * A single contract's installments (period index, due date, amount, override
 * flag) ordered by due date. Backs the admin installment editor.
 */
export async function listInstallmentsForContract(
  contractId: string,
): Promise<AdminInstallmentRow[]> {
  const rows = await db
    .select({
      id: outstandingInstallments.id,
      periodIndex: outstandingInstallments.periodIndex,
      dueDate: outstandingInstallments.dueDate,
      amount: outstandingInstallments.amount,
      isOverride: outstandingInstallments.isOverride,
    })
    .from(outstandingInstallments)
    .where(eq(outstandingInstallments.contractId, contractId))
    .orderBy(asc(outstandingInstallments.dueDate));

  return rows.map((r) => ({
    id: r.id,
    periodIndex: r.periodIndex,
    dueDate: toISODate(r.dueDate),
    amount: Number(r.amount),
    isOverride: r.isOverride,
  }));
}
