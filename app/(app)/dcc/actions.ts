"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccKpiItems, dccEntries, dccReviews } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { loadDccScope, canManageItemsFor, canReviewFor, canViewFor } from "@/lib/dcc/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";
import { parseFrequency, scheduledDueOn } from "@/lib/dcc/util";
import { listOwnerItems, listOwnerEntries } from "@/lib/queries/dcc";
import { writeDccEntry, writeParticipantEntries } from "@/lib/dcc/write";
import { generateText, GeminiNotConfiguredError } from "@/lib/ai/gemini";

const PATH = "/dcc";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));
function num(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

// ── Daily fill ──────────────────────────────────────────────────────────────
const EntrySchema = z.object({
  itemId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Bad date."),
  status: optText,
  value: z.any().optional(),
  note: optText,
  // DCC v2 — participant axis. null/absent for a normal KPI fill.
  subjectId: z.string().uuid().nullable().optional(),
  // The morning gate fills with silent:true so each keystroke does NOT
  // revalidate /dcc — that auto-refresh re-runs the layout gate mid-fill and a
  // single transient hiccup would fail-open and dismiss the gate early. The
  // gate re-evaluates ONCE, when the user clicks Continue (router.refresh).
  silent: z.boolean().optional(),
});

/** Upsert (or clear) one item's entry for a day. Owner-or-super only. */
export async function setDccEntry(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = EntrySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, date, silent } = parsed.data;
  const status = parsed.data.status;
  const value = num(parsed.data.value);
  const note = parsed.data.note;
  const subjectId = parsed.data.subjectId ?? null;

  try {
    const res = await writeDccEntry({ id: me.id, email: me.email }, { itemId, date, status, value, note, subjectId });
    if (!res.ok) return res;
    if (!silent) revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Bulk-fill every active participant of a participant-list KPI for a day
 *  (the board's [All Done] / [All NA]). status null clears them. */
export async function setParticipantEntries(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z
    .object({
      itemId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Bad date."),
      status: optText,
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, date } = parsed.data;
  const status = parsed.data.status;
  try {
    const res = await writeParticipantEntries({ id: me.id, email: me.email }, { itemId, date, status });
    if (!res.ok) return res;
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── KPI item CRUD (managers for their team; super-admins anyone) ─────────────
const ItemFields = z.object({
  ownerEmployeeId: z.string().uuid(),
  section: optText,
  code: optText,
  title: z.string().trim().min(1, "A title is required.").max(2000),
  frequency: optText,
  targetNumber: z.any(),
  unit: optText,
  isParticipantList: z.boolean().optional(),
  clientId: z.string().uuid().nullable().optional(),
});
const UpdateItem = ItemFields.omit({ ownerEmployeeId: true }).extend({ id: z.string().uuid() });

export async function createDccItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ItemFields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, d.ownerEmployeeId)) return fail("You can't add KPIs for this person.");
    const maxRows = (await db
      .select({ next: sql<number>`COALESCE(MAX(${dccKpiItems.sortOrder}), 0) + 1` })
      .from(dccKpiItems)
      .where(eq(dccKpiItems.ownerEmployeeId, d.ownerEmployeeId))) as Array<{ next: number }>;
    const pf = parseFrequency(d.frequency);
    const [row] = await db
      .insert(dccKpiItems)
      .values({
        ownerEmployeeId: d.ownerEmployeeId, section: d.section, code: d.code, title: d.title,
        frequency: d.frequency, weekdays: pf.weekdays, scheduleKind: pf.scheduleKind, needsReview: pf.needsReview,
        targetNumber: num(d.targetNumber), isParticipantList: d.isParticipantList ?? false, clientId: d.clientId ?? null,
        unit: d.unit, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id,
      })
      .returning({ id: dccKpiItems.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateDccItem(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateItem.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, id)).limit(1);
    if (!item) return fail("KPI not found.");
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, item.owner)) return fail("Not allowed.");
    const pf = parseFrequency(d.frequency);
    await db.update(dccKpiItems).set({
      section: d.section, code: d.code, title: d.title, frequency: d.frequency,
      weekdays: pf.weekdays, scheduleKind: pf.scheduleKind, needsReview: pf.needsReview,
      targetNumber: num(d.targetNumber), unit: d.unit,
      ...(d.isParticipantList !== undefined ? { isParticipantList: d.isParticipantList } : {}),
      ...(d.clientId !== undefined ? { clientId: d.clientId } : {}),
      updatedAt: new Date(),
    }).where(eq(dccKpiItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteDccItem(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, id)).limit(1);
    if (!item) return fail("KPI not found.");
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, item.owner)) return fail("Not allowed.");
    await db.update(dccKpiItems).set({ archived: true, updatedAt: new Date() }).where(eq(dccKpiItems.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Participant roster + clients (fully in-app; no importer needed) ──────────

/** Resolve the owner of a KPI item and confirm the caller can manage it. */
async function guardItem(me: Parameters<typeof loadDccScope>[0], itemId: string): Promise<{ ok: true; owner: string } | { ok: false; error: string }> {
  const [item] = await db.select({ owner: dccKpiItems.ownerEmployeeId }).from(dccKpiItems).where(eq(dccKpiItems.id, itemId)).limit(1);
  if (!item) return fail("KPI not found.") as { ok: false; error: string };
  const scope = await loadDccScope(me);
  if (!canManageItemsFor(scope, item.owner)) return fail("Not allowed.") as { ok: false; error: string };
  return { ok: true, owner: item.owner };
}

/** Add a participant to a participant-list KPI — creates the person if new, links them. */
export async function addParticipant(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ itemId: z.string().uuid(), name: z.string().trim().min(1).max(200), kind: optText }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { itemId, name, kind } = parsed.data;
  try {
    const g = await guardItem(me, itemId);
    if (!g.ok) return g;
    const srows = (await db.execute(sql`
      INSERT INTO dcc_subjects (owner_employee_id, name, kind)
      VALUES (${g.owner}, ${name}, ${kind})
      ON CONFLICT (owner_employee_id, lower(name)) DO UPDATE SET name = EXCLUDED.name, kind = COALESCE(EXCLUDED.kind, dcc_subjects.kind)
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    await db.execute(sql`
      INSERT INTO dcc_item_subjects (item_id, subject_id)
      VALUES (${itemId}, ${srows[0]!.id})
      ON CONFLICT (item_id, subject_id) DO UPDATE SET archived = false
    `);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Remove a participant from a KPI (unlinks; keeps their history). */
export async function removeParticipant(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ itemId: z.string().uuid(), subjectId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { itemId, subjectId } = parsed.data;
  try {
    const g = await guardItem(me, itemId);
    if (!g.ok) return g;
    await db.execute(sql`UPDATE dcc_item_subjects SET archived = true WHERE item_id = ${itemId} AND subject_id = ${subjectId}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Rename a participant (person) across all their KPIs. */
export async function renameParticipant(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ subjectId: z.string().uuid(), name: z.string().trim().min(1).max(200), kind: optText }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { subjectId, name, kind } = parsed.data;
  try {
    const rows = (await db.execute(sql`SELECT owner_employee_id AS owner FROM dcc_subjects WHERE id = ${subjectId}`)) as unknown as Array<{ owner: string }>;
    if (!rows[0]) return fail("Participant not found.");
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, rows[0].owner)) return fail("Not allowed.");
    await db.execute(sql`UPDATE dcc_subjects SET name = ${name}, kind = COALESCE(${kind}, kind), updated_at = now() WHERE id = ${subjectId}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Create a client instance for a section (e.g. B = Lawrence & Mayo). */
export async function createDccClient(input: unknown): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ ownerEmployeeId: z.string().uuid(), section: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { ownerEmployeeId, section, name } = parsed.data;
  try {
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, ownerEmployeeId)) return fail("Not allowed.");
    const rows = (await db.execute(sql`
      INSERT INTO dcc_clients (owner_employee_id, section, name)
      VALUES (${ownerEmployeeId}, ${section}, ${name})
      ON CONFLICT (owner_employee_id, section, lower(name)) DO UPDATE SET name = EXCLUDED.name, archived = false
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    revalidatePath(PATH);
    return { ok: true, id: rows[0]!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Rename a client, or archive it (its KPIs keep their client_id but the client hides). */
export async function updateDccClient(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid(), name: optText, archived: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { id, name, archived } = parsed.data;
  try {
    const rows = (await db.execute(sql`SELECT owner_employee_id AS owner FROM dcc_clients WHERE id = ${id}`)) as unknown as Array<{ owner: string }>;
    if (!rows[0]) return fail("Client not found.");
    const scope = await loadDccScope(me);
    if (!canManageItemsFor(scope, rows[0].owner)) return fail("Not allowed.");
    await db.execute(sql`UPDATE dcc_clients SET name = COALESCE(${name}, name), archived = COALESCE(${archived ?? null}, archived), updated_at = now() WHERE id = ${id}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Manager review ───────────────────────────────────────────────────────────
const ReviewSchema = z.object({
  ownerEmployeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  status: z.enum(["approved", "needs_rework", ""]).nullable().optional(),
  note: optText,
  silent: z.boolean().optional(), // gate reviews skip revalidate (see setDccEntry)
});

export async function setDccReview(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { ownerEmployeeId, date, note, silent } = parsed.data;
  const status = parsed.data.status || null;
  try {
    const scope = await loadDccScope(me);
    if (!canReviewFor(scope, ownerEmployeeId)) return fail("You can only review your team.");
    if (!status && !note) {
      await db.delete(dccReviews).where(and(eq(dccReviews.ownerEmployeeId, ownerEmployeeId), eq(dccReviews.reviewDate, date)));
      if (!silent) revalidatePath(PATH);
      return { ok: true };
    }
    await db
      .insert(dccReviews)
      .values({ ownerEmployeeId, reviewDate: date, reviewerId: me.id, status, note })
      .onConflictDoUpdate({ target: [dccReviews.ownerEmployeeId, dccReviews.reviewDate], set: { reviewerId: me.id, status, note, updatedAt: new Date() } });
    if (!silent) revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export interface DccReviewItem {
  code: string | null;
  title: string;
  section: string | null;
  status: string | null;
  value: string | null;
  note: string | null;
}

/** Fetch one report's DCC (items due that day + their responses) for review. */
export async function getDccReviewDetail(input: unknown): Promise<ActionResult<{ items: DccReviewItem[] }>> {
  const me = await requireUser();
  const parsed = z.object({ ownerId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { ownerId, date } = parsed.data;
  try {
    const scope = await loadDccScope(me);
    if (!canReviewFor(scope, ownerId)) return fail("Not allowed.");
    const [items, entries] = await Promise.all([listOwnerItems(ownerId), listOwnerEntries(ownerId, date)]);
    const [y, m, d] = date.split("-").map(Number);
    const day = new Date(y!, (m ?? 1) - 1, d ?? 1);
    const byItem = new Map(entries.filter((e) => e.entryDate === date).map((e) => [e.itemId, e]));
    const out: DccReviewItem[] = items
      .filter((it) => scheduledDueOn(it, day))
      .map((it) => {
        const e = byItem.get(it.id);
        return { code: it.code, title: it.title, section: it.section, status: e?.status ?? null, value: e?.valueNumber ?? null, note: e?.note ?? null };
      });
    return { ok: true, items: out };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Approve every still-unreviewed report for a date (manager gate "Approve all"). */
export async function approveAllDccReviews(input: unknown): Promise<ActionResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { date } = parsed.data;
  try {
    const scope = await loadDccScope(me); // inside try: a transient pool hiccup here must NOT hit the error boundary
    const reportIds = [...scope.visibleIds].filter((id) => id !== me.id && canReviewFor(scope, id));
    if (reportIds.length === 0) return { ok: true };
    await db
      .insert(dccReviews)
      .values(reportIds.map((id) => ({ ownerEmployeeId: id, reviewDate: date, reviewerId: me.id, status: "approved" as const, note: null })))
      .onConflictDoNothing({ target: [dccReviews.ownerEmployeeId, dccReviews.reviewDate] });
    // No revalidate: the gate advances only when the manager clicks Continue
    // (router.refresh), so a mid-review re-render can't fail-open the gate.
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** AI "summarize my day" — gathers a person's entries for a date → Gemini. */
export async function summarizeDccDay(input: unknown): Promise<ActionResult<{ summary: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ ownerId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { ownerId, date } = parsed.data;
  try {
    const scope = await loadDccScope(me);
    if (!canViewFor(scope, ownerId)) return fail("Not allowed.");
    const [items, entries] = await Promise.all([listOwnerItems(ownerId), listOwnerEntries(ownerId, date)]);
    const byItem = new Map(entries.filter((e) => e.entryDate === date).map((e) => [e.itemId, e]));
    const lines = items
      .map((it) => {
        const e = byItem.get(it.id);
        if (!e || (!e.status && !e.valueNumber && !e.note)) return null;
        return `- ${it.title}: ${e.status ?? "—"}${e.valueNumber ? ` (${e.valueNumber})` : ""}${e.note ? ` — ${e.note}` : ""}`;
      })
      .filter(Boolean)
      .join("\n");
    if (!lines) return fail("Nothing filled for this day yet.");
    const prompt = `These are an employee's Daily Compliance KPI entries for ${date}. Write a concise 2-3 sentence summary of what they accomplished and what was missed or pending. Professional tone; keep any Hinglish as-is; do not invent anything.\n\n${lines}`;
    const summary = await generateText(prompt);
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) return fail("AI summary isn't set up yet (no GEMINI_API_KEY).");
    return fail(err instanceof Error ? err.message : String(err));
  }
}
