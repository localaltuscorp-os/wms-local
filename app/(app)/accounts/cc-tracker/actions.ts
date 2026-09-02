"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsCcCards, accountsCcMonths } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/accounts/cc-tracker";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const optText = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(4000).nullable().optional(),
  )
  .transform((s) => (s ? s : null));

const fyYear = z.number().int().min(2000).max(2100);

// ── Card master CRUD ───────────────────────────────────────────────────────────

const CardFields = z.object({
  fyStartYear: fyYear,
  code: optText,
  entityName: optText,
  cardName: z.string().trim().min(1, "A card name is required.").max(2000),
  ecs: optText,
  ecsFrom: optText,
  stmtPeriod: optText,
  stmtStartDay: optText,
  dueDay: optText,
  softCopyAutoEmail: optText,
});
const UpdateCardSchema = CardFields.omit({ fyStartYear: true }).extend({ id: z.string().uuid() });

export async function createCcCard(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CardFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;

  try {
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsCcCards.sortOrder}), 0) + 1` })
      .from(accountsCcCards)
      .where(eq(accountsCcCards.fyStartYear, d.fyStartYear))) as Array<{ next: number }>;
    const [row] = await db
      .insert(accountsCcCards)
      .values({ ...d, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsCcCards.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCcCard(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateCardSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;

  try {
    await db
      .update(accountsCcCards)
      .set({ ...d, updatedAt: new Date() })
      .where(eq(accountsCcCards.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteCcCard(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(accountsCcCards)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(accountsCcCards.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Un-archive a soft-deleted card so it reappears in its financial year. */
export async function restoreCcCard(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");

  try {
    await db
      .update(accountsCcCards)
      .set({ archived: false, updatedAt: new Date() })
      .where(eq(accountsCcCards.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Carry the card master forward into a new financial year: copy every
 * non-archived card's static details (entity, statement config, ECS, …) from
 * [fromFy] into [toFy] with blank months. Idempotent — a card already present in
 * [toFy] (matched on code, else on card name) is skipped, so it is safe to run
 * again to top-up newly-added cards. Returns how many were copied.
 */
const CarrySchema = z.object({ fromFy: fyYear, toFy: fyYear });
export async function carryForwardCcCards(input: unknown): Promise<ActionResult<{ copied: number; skipped: number }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CarrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { fromFy, toFy } = parsed.data;
  if (fromFy === toFy) return fail("Pick a different year to carry forward into.");

  try {
    const source = await db
      .select()
      .from(accountsCcCards)
      .where(and(eq(accountsCcCards.fyStartYear, fromFy), eq(accountsCcCards.archived, false)))
      .orderBy(accountsCcCards.sortOrder);
    if (source.length === 0) return fail(`No cards found in FY ${fromFy}-${(fromFy + 1) % 100} to carry forward.`);

    const target = await db
      .select({ code: accountsCcCards.code, cardName: accountsCcCards.cardName })
      .from(accountsCcCards)
      .where(eq(accountsCcCards.fyStartYear, toFy));
    const existingCodes = new Set(target.map((t) => (t.code ?? "").trim().toLowerCase()).filter(Boolean));
    const existingNames = new Set(target.map((t) => t.cardName.trim().toLowerCase()));

    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsCcCards.sortOrder}), 0) + 1` })
      .from(accountsCcCards)
      .where(eq(accountsCcCards.fyStartYear, toFy))) as Array<{ next: number }>;
    let sort = maxRows[0]?.next ?? 1;

    const toInsert = source
      .filter((c) => {
        const code = (c.code ?? "").trim().toLowerCase();
        if (code && existingCodes.has(code)) return false;
        return !existingNames.has(c.cardName.trim().toLowerCase());
      })
      .map((c) => ({
        fyStartYear: toFy,
        code: c.code,
        entityName: c.entityName,
        cardName: c.cardName,
        ecs: c.ecs,
        ecsFrom: c.ecsFrom,
        stmtPeriod: c.stmtPeriod,
        stmtStartDay: c.stmtStartDay,
        dueDay: c.dueDay,
        softCopyAutoEmail: c.softCopyAutoEmail,
        sortOrder: sort++,
        createdById: me.id,
      }));

    if (toInsert.length > 0) await db.insert(accountsCcCards).values(toInsert);
    revalidatePath(PATH);
    return { ok: true, copied: toInsert.length, skipped: source.length - toInsert.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Move a card one place up or down within its financial year by swapping sort
 * order with its immediate neighbour (so the list can be hand-ordered like a
 * spreadsheet's rows).
 */
const MoveSchema = z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) });
export async function moveCcCard(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, direction } = parsed.data;

  try {
    const [card] = await db
      .select({ id: accountsCcCards.id, fy: accountsCcCards.fyStartYear, sort: accountsCcCards.sortOrder })
      .from(accountsCcCards)
      .where(eq(accountsCcCards.id, id))
      .limit(1);
    if (!card) return fail("Card not found.");

    // Normalize: cards may share/lack sortOrder, so re-sequence this FY first.
    const ordered = await db
      .select({ id: accountsCcCards.id })
      .from(accountsCcCards)
      .where(and(eq(accountsCcCards.fyStartYear, card.fy), eq(accountsCcCards.archived, false)))
      .orderBy(accountsCcCards.sortOrder, accountsCcCards.code, accountsCcCards.cardName);
    const idx = ordered.findIndex((o) => o.id === id);
    if (idx === -1) return fail("Card not found.");
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ordered.length) return { ok: true }; // already at an edge — no-op

    // Rewrite sort order for the two swapped positions off a dense 1..N sequence.
    const seq = ordered.map((o, i) => ({ id: o.id, sort: i + 1 }));
    const a = seq[idx]!;
    const b = seq[swapIdx]!;
    await db.update(accountsCcCards).set({ sortOrder: b.sort, updatedAt: new Date() }).where(eq(accountsCcCards.id, a.id));
    await db.update(accountsCcCards).set({ sortOrder: a.sort, updatedAt: new Date() }).where(eq(accountsCcCards.id, b.id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Per-month tracking record ────────────────────────────────────────────────

const MonthSchema = z.object({
  cardId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  hardCopy: optText,
  googleDrive: optText,
  tallyEntry: optText,
  balanceTally: optText,
  ccPaidDate: optText,
  ccPaidAmt: optText,
  intFinChgs: optText,
  chgReversed: optText,
  notes: optText,
});

/**
 * Upsert one card's full month record. If every field is empty the row is
 * deleted so the grid stays sparse.
 */
export async function saveCcMonth(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = MonthSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { cardId, month, ...fields } = parsed.data;

  const allEmpty = Object.values(fields).every((v) => v === null);

  try {
    if (allEmpty) {
      await db
        .delete(accountsCcMonths)
        .where(and(eq(accountsCcMonths.cardId, cardId), eq(accountsCcMonths.month, month)));
      revalidatePath(PATH);
      return { ok: true };
    }

    await db
      .insert(accountsCcMonths)
      .values({ cardId, month, ...fields, updatedById: me.id })
      .onConflictDoUpdate({
        target: [accountsCcMonths.cardId, accountsCcMonths.month],
        set: { ...fields, updatedById: me.id, updatedAt: new Date() },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
