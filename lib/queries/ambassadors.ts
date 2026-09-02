import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import {
  ambAmbassadors,
  ambProducts,
  ambReferrals,
  ambPayouts,
  ambActivities,
  ambDocuments,
  ambAmbassadorProducts,
  employees,
  clients,
} from "@/db/schema";
import { WON_STAGES, type Stage } from "@/lib/ambassadors/stages";

const RETRY = { attempts: 2, timeoutMs: [6000, 12000] as number[] };
const n = (v: string | number | null): number => (v == null ? 0 : Number(v));

// ── Products lookup ─────────────────────────────────────────────────────────
export interface AmbProductOption { id: string; name: string }

export async function listAmbProducts(): Promise<AmbProductOption[]> {
  return withRetry(
    () =>
      db
        .select({ id: ambProducts.id, name: ambProducts.name })
        .from(ambProducts)
        .where(eq(ambProducts.isActive, true))
        .orderBy(asc(ambProducts.sortOrder), asc(ambProducts.name)),
    { ...RETRY, label: "amb.listProducts" },
  );
}

// ── Registry list with per-ambassador rollups ───────────────────────────────
export interface AmbassadorListRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: string;
  tier: string | null;
  partnerScore: number | null;
  payoutType: string;
  payoutValue: number;
  monthlyTarget: number | null;
  referrals: number;
  converted: number;
  revenue: number;
  commissionPending: number;
  commissionPaid: number;
}

export async function listAmbassadors(opts?: { includeArchived?: boolean }): Promise<AmbassadorListRow[]> {
  const wonSql = sql`(${ambReferrals.stage} in ('won','payment','commission_generated','commission_paid'))`;
  const rows = await withRetry(
    () =>
      db
        .select({
          id: ambAmbassadors.id,
          name: ambAmbassadors.name,
          company: ambAmbassadors.company,
          email: ambAmbassadors.email,
          phone: ambAmbassadors.phone,
          photoUrl: ambAmbassadors.photoUrl,
          ownerId: ambAmbassadors.ownerId,
          ownerName: employees.name,
          status: ambAmbassadors.status,
          tier: ambAmbassadors.tier,
          partnerScore: ambAmbassadors.partnerScore,
          payoutType: ambAmbassadors.payoutType,
          payoutValue: ambAmbassadors.payoutValue,
          monthlyTarget: ambAmbassadors.monthlyTarget,
          referrals: sql<number>`count(${ambReferrals.id})`,
          converted: sql<number>`count(*) filter (where ${wonSql})`,
          revenue: sql<number>`coalesce(sum(${ambReferrals.dealAmount}) filter (where ${wonSql}), 0)`,
          commissionPending: sql<number>`coalesce(sum(${ambReferrals.commissionAmount}) filter (where ${ambReferrals.commissionStatus} <> 'paid' and ${wonSql}), 0)`,
          commissionPaid: sql<number>`coalesce(sum(${ambReferrals.commissionAmount}) filter (where ${ambReferrals.commissionStatus} = 'paid'), 0)`,
        })
        .from(ambAmbassadors)
        .leftJoin(employees, eq(employees.id, ambAmbassadors.ownerId))
        .leftJoin(ambReferrals, eq(ambReferrals.ambassadorId, ambAmbassadors.id))
        .where(opts?.includeArchived ? sql`true` : eq(ambAmbassadors.archived, false))
        .groupBy(ambAmbassadors.id, employees.name)
        .orderBy(desc(sql`coalesce(${ambAmbassadors.partnerScore}, 0)`), asc(ambAmbassadors.name)),
    { ...RETRY, label: "amb.listAmbassadors" },
  );
  return rows.map((r) => ({
    ...r,
    partnerScore: r.partnerScore == null ? null : n(r.partnerScore),
    payoutValue: n(r.payoutValue),
    monthlyTarget: r.monthlyTarget == null ? null : n(r.monthlyTarget),
    referrals: n(r.referrals),
    converted: n(r.converted),
    revenue: n(r.revenue),
    commissionPending: n(r.commissionPending),
    commissionPaid: n(r.commissionPaid),
  }));
}

// ── Referral rows (pipeline + per-ambassador) ───────────────────────────────
export interface ReferralRow {
  id: string;
  ambassadorId: string;
  ambassadorName: string;
  prospectName: string;
  prospectCompany: string | null;
  prospectPhone: string | null;
  prospectEmail: string | null;
  prospectNotes: string | null;
  receivedOn: string;
  stage: Stage;
  assignedToId: string | null;
  assignedToName: string | null;
  productId: string | null;
  productName: string | null;
  dealAmount: number | null;
  outcome: string;
  expectedClose: string | null;
  commissionAmount: number | null;
  commissionBasis: string | null;
  commissionStatus: string;
  clientId: string | null;
  createdAt: string;
}

function mapReferral(r: Record<string, unknown>): ReferralRow {
  return {
    id: r.id as string,
    ambassadorId: r.ambassadorId as string,
    ambassadorName: (r.ambassadorName as string) ?? "",
    prospectName: r.prospectName as string,
    prospectCompany: (r.prospectCompany as string) ?? null,
    prospectPhone: (r.prospectPhone as string) ?? null,
    prospectEmail: (r.prospectEmail as string) ?? null,
    prospectNotes: (r.prospectNotes as string) ?? null,
    receivedOn: r.receivedOn as string,
    stage: r.stage as Stage,
    assignedToId: (r.assignedToId as string) ?? null,
    assignedToName: (r.assignedToName as string) ?? null,
    productId: (r.productId as string) ?? null,
    productName: (r.productName as string) ?? null,
    dealAmount: r.dealAmount == null ? null : n(r.dealAmount as string),
    outcome: r.outcome as string,
    expectedClose: (r.expectedClose as string) ?? null,
    commissionAmount: r.commissionAmount == null ? null : n(r.commissionAmount as string),
    commissionBasis: (r.commissionBasis as string) ?? null,
    commissionStatus: r.commissionStatus as string,
    clientId: (r.clientId as string) ?? null,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

const referralSelect = {
  id: ambReferrals.id,
  ambassadorId: ambReferrals.ambassadorId,
  ambassadorName: ambAmbassadors.name,
  prospectName: ambReferrals.prospectName,
  prospectCompany: ambReferrals.prospectCompany,
  prospectPhone: ambReferrals.prospectPhone,
  prospectEmail: ambReferrals.prospectEmail,
  prospectNotes: ambReferrals.prospectNotes,
  receivedOn: ambReferrals.receivedOn,
  stage: ambReferrals.stage,
  assignedToId: ambReferrals.assignedToId,
  assignedToName: employees.name,
  productId: ambReferrals.productId,
  productName: ambProducts.name,
  dealAmount: ambReferrals.dealAmount,
  outcome: ambReferrals.outcome,
  expectedClose: ambReferrals.expectedClose,
  commissionAmount: ambReferrals.commissionAmount,
  commissionBasis: ambReferrals.commissionBasis,
  commissionStatus: ambReferrals.commissionStatus,
  clientId: ambReferrals.clientId,
  createdAt: ambReferrals.createdAt,
};

export async function listReferrals(filters?: { ambassadorId?: string }): Promise<ReferralRow[]> {
  const where = filters?.ambassadorId ? eq(ambReferrals.ambassadorId, filters.ambassadorId) : sql`true`;
  const rows = await withRetry(
    () =>
      db
        .select(referralSelect)
        .from(ambReferrals)
        .leftJoin(ambAmbassadors, eq(ambAmbassadors.id, ambReferrals.ambassadorId))
        .leftJoin(employees, eq(employees.id, ambReferrals.assignedToId))
        .leftJoin(ambProducts, eq(ambProducts.id, ambReferrals.productId))
        .where(where)
        .orderBy(desc(ambReferrals.createdAt)),
    { ...RETRY, label: "amb.listReferrals" },
  );
  return rows.map(mapReferral);
}

// ── Full ambassador detail (workspace) ──────────────────────────────────────
export interface ActivityRow {
  id: string;
  referralId: string | null;
  type: string;
  title: string | null;
  body: string | null;
  occurredAt: string;
  remindAt: string | null;
  done: boolean;
  createdByName: string | null;
}

export interface PayoutRow {
  id: string;
  amount: number;
  paidOn: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  createdByName: string | null;
}

export interface DocumentRow {
  id: string;
  name: string;
  version: number;
  storageKey: string;
  mime: string | null;
  sizeBytes: number | null;
  supersedesId: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface AmbassadorDetail {
  ambassador: typeof ambAmbassadors.$inferSelect & { ownerName: string | null; clientName?: never };
  products: AmbProductOption[];
  referrals: ReferralRow[];
  activities: ActivityRow[];
  payouts: PayoutRow[];
  documents: DocumentRow[];
}

export async function getAmbassador(id: string): Promise<AmbassadorDetail | null> {
  const [row] = await withRetry(
    () =>
      db
        .select({ a: ambAmbassadors, ownerName: employees.name })
        .from(ambAmbassadors)
        .leftJoin(employees, eq(employees.id, ambAmbassadors.ownerId))
        .where(eq(ambAmbassadors.id, id))
        .limit(1),
    { ...RETRY, label: "amb.getAmbassador" },
  );
  if (!row) return null;

  const [products, referrals, activities, payouts, documents] = await Promise.all([
    db
      .select({ id: ambProducts.id, name: ambProducts.name })
      .from(ambAmbassadorProducts)
      .innerJoin(ambProducts, eq(ambProducts.id, ambAmbassadorProducts.productId))
      .where(eq(ambAmbassadorProducts.ambassadorId, id))
      .orderBy(asc(ambProducts.sortOrder)),
    listReferrals({ ambassadorId: id }),
    db
      .select({
        id: ambActivities.id,
        referralId: ambActivities.referralId,
        type: ambActivities.type,
        title: ambActivities.title,
        body: ambActivities.body,
        occurredAt: ambActivities.occurredAt,
        remindAt: ambActivities.remindAt,
        done: ambActivities.done,
        createdByName: employees.name,
      })
      .from(ambActivities)
      .leftJoin(employees, eq(employees.id, ambActivities.createdById))
      .where(eq(ambActivities.ambassadorId, id))
      .orderBy(desc(ambActivities.occurredAt)),
    db
      .select({
        id: ambPayouts.id,
        amount: ambPayouts.amount,
        paidOn: ambPayouts.paidOn,
        method: ambPayouts.method,
        reference: ambPayouts.reference,
        note: ambPayouts.note,
        createdByName: employees.name,
      })
      .from(ambPayouts)
      .leftJoin(employees, eq(employees.id, ambPayouts.createdById))
      .where(eq(ambPayouts.ambassadorId, id))
      .orderBy(desc(ambPayouts.paidOn)),
    db
      .select({
        id: ambDocuments.id,
        name: ambDocuments.name,
        version: ambDocuments.version,
        storageKey: ambDocuments.storageKey,
        mime: ambDocuments.mime,
        sizeBytes: ambDocuments.sizeBytes,
        supersedesId: ambDocuments.supersedesId,
        uploadedByName: employees.name,
        createdAt: ambDocuments.createdAt,
      })
      .from(ambDocuments)
      .leftJoin(employees, eq(employees.id, ambDocuments.uploadedById))
      .where(eq(ambDocuments.ambassadorId, id))
      .orderBy(desc(ambDocuments.createdAt)),
  ]);

  return {
    ambassador: { ...row.a, ownerName: row.ownerName },
    products,
    referrals,
    activities: activities.map((r) => ({
      ...r,
      occurredAt: r.occurredAt.toISOString(),
      remindAt: r.remindAt ? r.remindAt.toISOString() : null,
    })),
    payouts: payouts.map((r) => ({ ...r, amount: n(r.amount) })),
    documents: documents.map((r) => ({
      ...r,
      sizeBytes: r.sizeBytes == null ? null : Number(r.sizeBytes),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ── Executive dashboard metrics ─────────────────────────────────────────────
export interface DashboardMetrics {
  activeAmbassadors: number;
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number; // 0..1
  revenue: number;
  commissionPending: number;
  commissionPaid: number;
  funnel: { stage: Stage; count: number }[];
  leaderboard: { id: string; name: string; tier: string | null; revenue: number; converted: number; score: number | null }[];
}

export async function dashboardMetrics(): Promise<DashboardMetrics> {
  const list = await listAmbassadors();
  const referralAgg = await withRetry(
    () =>
      db
        .select({ stage: ambReferrals.stage, count: sql<number>`count(*)` })
        .from(ambReferrals)
        .groupBy(ambReferrals.stage),
    { ...RETRY, label: "amb.funnel" },
  );

  const funnelMap = new Map<string, number>(referralAgg.map((r) => [r.stage, n(r.count)]));
  const totalReferrals = list.reduce((a, x) => a + x.referrals, 0);
  const convertedReferrals = list.reduce((a, x) => a + x.converted, 0);
  const revenue = list.reduce((a, x) => a + x.revenue, 0);
  const commissionPending = list.reduce((a, x) => a + x.commissionPending, 0);
  const commissionPaid = list.reduce((a, x) => a + x.commissionPaid, 0);

  const funnel = (
    ["received", "assigned", "qualified", "meeting", "proposal", "negotiation", "won", "payment", "commission_generated", "commission_paid", "lost"] as Stage[]
  ).map((stage) => ({ stage, count: funnelMap.get(stage) ?? 0 }));

  const leaderboard = [...list]
    .sort((a, b) => b.revenue - a.revenue || b.converted - a.converted)
    .slice(0, 8)
    .map((x) => ({ id: x.id, name: x.name, tier: x.tier, revenue: x.revenue, converted: x.converted, score: x.partnerScore }));

  return {
    activeAmbassadors: list.filter((x) => x.status === "active").length,
    totalReferrals,
    convertedReferrals,
    conversionRate: totalReferrals > 0 ? convertedReferrals / totalReferrals : 0,
    revenue,
    commissionPending,
    commissionPaid,
    funnel,
    leaderboard,
  };
}

// ── Commission center ───────────────────────────────────────────────────────
export interface CommissionRow extends ReferralRow {
  ownerName: string | null;
}

/** Referrals with a generated/pending commission (owed money), newest first. */
export async function commissionLedger(): Promise<{ owed: ReferralRow[]; paid: ReferralRow[] }> {
  const wonStages = WON_STAGES as readonly string[];
  const rows = await withRetry(
    () =>
      db
        .select(referralSelect)
        .from(ambReferrals)
        .leftJoin(ambAmbassadors, eq(ambAmbassadors.id, ambReferrals.ambassadorId))
        .leftJoin(employees, eq(employees.id, ambReferrals.assignedToId))
        .leftJoin(ambProducts, eq(ambProducts.id, ambReferrals.productId))
        .where(and(inArray(ambReferrals.stage, wonStages as string[])))
        .orderBy(desc(ambReferrals.wonAt)),
    { ...RETRY, label: "amb.commissionLedger" },
  );
  const mapped = rows.map(mapReferral);
  return {
    owed: mapped.filter((r) => r.commissionStatus !== "paid"),
    paid: mapped.filter((r) => r.commissionStatus === "paid"),
  };
}
