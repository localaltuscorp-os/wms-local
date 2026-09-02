"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incentiveRequests, orgSettings } from "@/db/schema";
import { INCENTIVE_TYPES } from "@/db/enums";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { validateIncentiveDetails } from "@/lib/incentive-fields";
import { defaultIncentiveAmount, incentiveLabel } from "@/lib/incentive-amount";
import { syncSheetIncentives, type SyncResult } from "@/lib/incentive-sheets";
import { ensureIncentiveColumns } from "@/lib/ensure-incentive-schema";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const CreateSchema = z
  .object({
    type: z.enum(INCENTIVE_TYPES),
    details: z.record(z.string(), z.string()),
  })
  .strict();

/** File a new incentive request (any signed-in employee, for themselves). */
export async function createIncentiveRequest(input: {
  type: (typeof INCENTIVE_TYPES)[number];
  details: Record<string, string>;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const validated = validateIncentiveDetails(parsed.data.type, parsed.data.details);
  if (!validated.ok) return validated;

  let inserted;
  try {
    await ensureIncentiveColumns();
    [inserted] = await db
      .insert(incentiveRequests)
      .values({
        employeeId: me.id,
        type: parsed.data.type,
        details: validated.details,
        amount: defaultIncentiveAmount(parsed.data.type, validated.details),
        label: incentiveLabel(parsed.data.type, validated.details),
        source: "form",
      })
      .returning({ id: incentiveRequests.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/incentive");
  return { ok: true, id: inserted.id };
}

const DecideSchema = z
  .object({
    id: z.string().uuid(),
    verdict: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

/** Admin verdict on a pending request. Re-deciding an already-decided
 *  request is allowed (corrections) — the latest verdict wins. */
export async function decideIncentiveRequest(input: {
  id: string;
  verdict: "approved" | "rejected";
  note?: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.incentiveRequests.findFirst({
    where: eq(incentiveRequests.id, parsed.data.id),
  });
  if (!existing) return { ok: false, error: "Request not found" };

  try {
    await db
      .update(incentiveRequests)
      .set({
        status: parsed.data.verdict,
        decidedById: me.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.note ? parsed.data.note : null,
        updatedAt: new Date(),
      })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/incentive");
  return { ok: true };
}

/* ================================================================== */
/* Admin ledger actions — amount override, payment, manual conditions */
/* ================================================================== */

const AmountSchema = z.object({ id: z.string().uuid(), amount: z.coerce.number().int().min(0).max(10_000_000) }).strict();

/** Admin overrides the ₹ amount of any incentive. */
export async function setIncentiveAmount(input: { id: string; amount: number }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AmountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid amount" };
  try {
    await db.update(incentiveRequests)
      .set({ amount: parsed.data.amount, updatedAt: new Date() })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  revalidatePath("/incentive/dashboard");
  return { ok: true };
}

const PaymentSchema = z.object({
  id: z.string().uuid(),
  paid: z.boolean(),
  paidAmt: z.coerce.number().int().min(0).max(10_000_000),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).strict();

/** Admin records a payout against an incentive. */
export async function setIncentivePayment(input: {
  id: string; paid: boolean; paidAmt: number; paidDate?: string | null;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = PaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment" };
  try {
    await db.update(incentiveRequests)
      .set({
        paid: parsed.data.paid,
        paidAmt: parsed.data.paidAmt,
        paidDate: parsed.data.paidDate ? parsed.data.paidDate : null,
        updatedAt: new Date(),
      })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  revalidatePath("/incentive/dashboard");
  return { ok: true };
}

const ConditionsSchema = z.object({
  id: z.string().uuid(),
  conditions: z.record(z.string(), z.string()),
}).strict();

/** Admin sets the per-scheme manual condition columns. */
export async function setIncentiveConditions(input: {
  id: string; conditions: Record<string, string>;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = ConditionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid conditions" };
  try {
    await db.update(incentiveRequests)
      .set({ conditions: parsed.data.conditions, updatedAt: new Date() })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  return { ok: true };
}

/* ================================================================== */
/* Project incentives — set per-employee amounts on a project, which   */
/* flow into the same ledger (source='project') for admin approval.    */
/* ================================================================== */

export interface ProjectIncentiveRow { employeeId: string; amount: number }

const ProjectIncentivesSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(200),
  rows: z.array(z.object({
    employeeId: z.string().uuid(),
    amount: z.coerce.number().int().min(0).max(10_000_000),
  })).max(50),
}).strict();

/**
 * Replace the project's incentive entries with the given (employee, amount)
 * set. Existing project-source rows for this project are removed first so the
 * panel is the source of truth; new rows enter the ledger as pending.
 */
export async function saveProjectIncentives(input: {
  projectId: string; projectName: string; rows: ProjectIncentiveRow[];
}): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ProjectIncentivesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const clean = parsed.data.rows.filter((r) => r.amount > 0);
  try {
    await ensureIncentiveColumns();
    await db.delete(incentiveRequests).where(
      and(eq(incentiveRequests.source, "project"), eq(incentiveRequests.sourceRef, parsed.data.projectId)),
    );
    if (clean.length > 0) {
      await db.insert(incentiveRequests).values(
        clean.map((r) => ({
          employeeId: r.employeeId,
          type: "project" as const,
          details: {},
          amount: r.amount,
          label: parsed.data.projectName,
          source: "project",
          sourceRef: parsed.data.projectId,
        })),
      );
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  revalidatePath("/incentive/dashboard");
  return { ok: true };
}

/** Load this project's current incentive (employee, amount) rows. */
export async function getProjectIncentives(projectId: string): Promise<ProjectIncentiveRow[]> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return [];
  const rows = await db
    .select({ employeeId: incentiveRequests.employeeId, amount: incentiveRequests.amount })
    .from(incentiveRequests)
    .where(and(eq(incentiveRequests.source, "project"), eq(incentiveRequests.sourceRef, projectId)));
  return rows;
}

/* ================================================================== */
/* Archive / delete                                                    */
/* ================================================================== */

const ArchiveSchema = z.object({ id: z.string().uuid(), archived: z.boolean() }).strict();

/** Admin archives (or restores) an incentive entry — moves it to/from the
 *  Archived view without deleting it. */
export async function setIncentiveArchived(input: { id: string; archived: boolean }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ArchiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  try {
    await db.update(incentiveRequests)
      .set({ archived: parsed.data.archived, updatedAt: new Date() })
      .where(eq(incentiveRequests.id, parsed.data.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  revalidatePath("/incentive/dashboard");
  return { ok: true };
}

/** Admin permanently deletes an incentive entry. */
export async function deleteIncentiveEntry(input: { id: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(input.id).success) return { ok: false, error: "Invalid id" };
  try {
    await db.delete(incentiveRequests).where(eq(incentiveRequests.id, input.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  revalidatePath("/incentive/dashboard");
  return { ok: true };
}

/** Admin reassigns the earning employee for a single incentive entry. */
export async function setIncentiveEmployee(input: { id: string; employeeId: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(input.id).success) return { ok: false, error: "Invalid id" };
  if (!z.string().uuid().safeParse(input.employeeId).success) return { ok: false, error: "Invalid employee" };
  try {
    await db.update(incentiveRequests)
      .set({ employeeId: input.employeeId, updatedAt: new Date() })
      .where(eq(incentiveRequests.id, input.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  revalidatePath("/incentive/dashboard");
  return { ok: true };
}

/** Admin sets the permanent default earner for "PS Sold through Social Media". */
export async function setIncentiveSocialEarner(input: { name: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Pick an employee." };
  try {
    await db.update(orgSettings).set({ incentiveSocialEarner: name, updatedAt: new Date() }).where(eq(orgSettings.id, 1));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/incentive");
  return { ok: true };
}

/* ================================================================== */
/* Sheet-sourced incentives — sync 10 Qualified Leads + 10 Referrals   */
/* from the Apps Script endpoint and auto-create ledger entries.       */
/* ================================================================== */

/** Admin pulls the Qualified Leads / Participant Leads sheets and recomputes
 *  the milestone incentives into the ledger (idempotent). */
export async function syncIncentivesFromSheets(): Promise<ActionResult<{ result: SyncResult }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  // Default to the deployed Apps Script web app; an env var overrides it if set.
  const DEFAULT_SHEETS_WEBAPP_URL =
    "https://script.google.com/macros/s/AKfycbwIJZndFUBIZxoVN0xGa3vUV0M2f3f1bhTLdK5KoY7JrrwikXVqzOQVwCT3kfSNgKTi/exec";
  const url = process.env.INCENTIVE_SHEETS_WEBAPP_URL || DEFAULT_SHEETS_WEBAPP_URL;
  if (!url) return { ok: false, error: "Set INCENTIVE_SHEETS_WEBAPP_URL in your environment first." };
  try {
    await ensureIncentiveColumns(); // self-heals org_settings.incentive_social_earner too
    let earner: string | undefined;
    try {
      const [cfg] = await db.select({ earner: orgSettings.incentiveSocialEarner }).from(orgSettings).where(eq(orgSettings.id, 1)).limit(1);
      earner = cfg?.earner;
    } catch { /* not migrated yet — fall back to the sheet's default */ }
    const result = await syncSheetIncentives(url, earner);
    revalidatePath("/incentive");
    revalidatePath("/incentive/dashboard");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: `Sync failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
