"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { accountsVasaBalances } from "@/db/schema";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";
import { listVasaCells, listVasaSnapshots } from "@/lib/queries/accounts-vasa";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import {
  snapshotFilename,
  snapshotLabel,
  quarterOf,
  quarterKey,
} from "@/lib/accounts/vasa-report";
import { sendVasaReportEmail } from "@/lib/email/vasa-report-email";

const PATH = "/accounts/vasa-family-interpersonal";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } { return { ok: false, error }; }

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));
function amt(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

const Fields = z.object({
  party: optText,
  direction: optText,
  counterparty: optText,
  amount: z.any(),
  asOn: optText,
  notes: optText,
});
const UpdateSchema = Fields.extend({ id: z.string().uuid() });

export async function createVasaBalance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = Fields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const maxRows = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsVasaBalances.sortOrder}), 0) + 1` }).from(accountsVasaBalances)) as Array<{ next: number }>;
    const [row] = await db.insert(accountsVasaBalances)
      .values({ party: d.party, direction: d.direction, counterparty: d.counterparty, amount: amt(d.amount), asOn: d.asOn, notes: d.notes, sortOrder: maxRows[0]?.next ?? 1, createdById: me.id })
      .returning({ id: accountsVasaBalances.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function updateVasaBalance(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    await db.update(accountsVasaBalances).set({ party: d.party, direction: d.direction, counterparty: d.counterparty, amount: amt(d.amount), asOn: d.asOn, notes: d.notes, updatedAt: new Date() }).where(eq(accountsVasaBalances.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

export async function deleteVasaBalance(id: string): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    await db.update(accountsVasaBalances).set({ archived: true, updatedAt: new Date() }).where(eq(accountsVasaBalances.id, id));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

// ── Matrix cell editing (each side entered by hand, compared on screen) ────────

const CellSchema = z.object({
  asOn: z.string().trim().min(1).max(40),
  rowParty: z.string().trim().min(1).max(120),
  colParty: z.string().trim().min(1).max(120),
  amount: z.any(),
});

/**
 * Set ONE matrix cell for a snapshot: (rowParty -> colParty) = amount.
 *
 * ── IT NO LONGER WRITES THE MIRROR (Sir) ───────────────────────────────────
 * This used to write the opposite cell too, as -amount, so the grid was
 * antisymmetric by construction. That made the sheet self-consistent and
 * therefore useless as a reconciliation: entering one side silently overwrote
 * whatever the other party's books said, so the two could never be seen to
 * disagree.
 *
 * Both directions are now typed by hand and compared on screen — green when
 * they agree, red when they do not (see lib/accounts/vasa-match.ts). The rule
 * here is simply that a save touches the cell it was given and nothing else. A
 * manually entered value is never overwritten by a value derived from
 * somewhere else.
 *
 * Existing charts are unaffected: they were written as mirrored pairs and so
 * read back as matching. The twelve pairs in production that were already off
 * by paise now show red instead of hiding behind a number nobody wrote.
 *
 * A blank / zero amount clears this cell (and only this cell). Same-party
 * (diagonal) is a no-op.
 */
export async function saveVasaCell(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CellSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { asOn, rowParty, colParty } = parsed.data;
  if (rowParty === colParty) return fail("A party has no balance with itself.");
  const value = amt(parsed.data.amount); // string | null

  try {
    // Delete-then-insert on the ONE direction. `accounts_vasa_balances` has no
    // unique index over (as_on, party, counterparty) to upsert against, and the
    // register also carries free-form rows from the list view, so adding one
    // would be a migration with wider consequences than this change earns.
    await db.delete(accountsVasaBalances).where(and(
      eq(accountsVasaBalances.asOn, asOn),
      eq(accountsVasaBalances.party, rowParty),
      eq(accountsVasaBalances.counterparty, colParty),
    ));

    if (value !== null && Number(value) !== 0) {
      const [maxRow] = (await db.select({ next: sql<number>`COALESCE(MAX(${accountsVasaBalances.sortOrder}), 0) + 1` }).from(accountsVasaBalances)) as Array<{ next: number }>;
      await db.insert(accountsVasaBalances).values({
        party: rowParty,
        counterparty: colParty,
        amount: value,
        direction: Number(value) < 0 ? "Owes" : "Owed by",
        asOn,
        sortOrder: maxRow?.next ?? 1,
        createdById: me.id,
      });
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/**
 * Start a new, EMPTY snapshot on a new date.
 *
 * It no longer clones the previous snapshot's balances (Sir): a new snapshot is
 * a fresh reckoning, and pre-filling it with last month's numbers makes stale
 * figures look like this month's entered ones.
 *
 * THE MARKER ROW. A snapshot is not its own record — the date list is
 * `SELECT DISTINCT as_on` over this table (see listVasaSnapshots), so a
 * snapshot with no cells simply does not exist. That is why "New Snapshot"
 * appeared to do nothing whenever there was nothing to clone: it inserted zero
 * rows, the date never appeared in the dropdown, and the click was swallowed.
 *
 * So an empty snapshot is represented by ONE row carrying only the date, with
 * party / counterparty / amount all null. It is deliberately shaped to be
 * invisible everywhere except the date list: `listVasaCells` already drops rows
 * whose party, counterparty or amount is null, so the marker can never render
 * as a balance or contribute to a net total. Deleting the snapshot removes it
 * with everything else (deleteVasaSnapshot keys on `as_on`).
 *
 * This avoids a migration for a dedicated snapshots table. The trade-off is
 * that the marker is a convention rather than a constraint — anything reading
 * this table raw must tolerate a row with no party.
 */
export async function addVasaSnapshot(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z
    .object({ newAsOn: z.string().trim().min(1).max(40) })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { newAsOn } = parsed.data;

  try {
    const exists = await db
      .select({ id: accountsVasaBalances.id })
      .from(accountsVasaBalances)
      .where(eq(accountsVasaBalances.asOn, newAsOn))
      .limit(1);
    if (exists.length) return fail(`A chart dated "${newAsOn}" already exists.`);

    const [maxRow] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${accountsVasaBalances.sortOrder}), 0) + 1` })
      .from(accountsVasaBalances)) as Array<{ next: number }>;

    await db.insert(accountsVasaBalances).values({
      party: null,
      counterparty: null,
      amount: null,
      direction: null,
      asOn: newAsOn,
      notes: "snapshot",
      sortOrder: maxRow?.next ?? 1,
      createdById: me.id,
    });

    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/** Remove an entire snapshot (all its cells) for a date. */
export async function deleteVasaSnapshot(input: unknown): Promise<ActionResult> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ asOn: z.string().trim().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  try {
    await db.delete(accountsVasaBalances).where(eq(accountsVasaBalances.asOn, parsed.data.asOn));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
}

/**
 * EMAIL — mail the currently open chart as a PDF.
 *
 * Cells already persist as they are edited (each blur writes through
 * saveVasaCell), so there is nothing left to flush: "save" here means "capture
 * THIS snapshot as a file and send it". The action re-reads the snapshot from
 * the database rather than trusting anything the client passes, so the
 * attachment is what is actually stored — not what a stale tab believes.
 *
 * The recipient is fixed by the brief. It is a constant rather than a form
 * field so a mistyped address can never send a family balance sheet to a
 * stranger; change it here if it ever needs to move.
 */
const VASA_REPORT_RECIPIENT = "manan@unleashed.in";

export async function emailVasaSnapshot(input: unknown): Promise<ActionResult<{ sentTo: string }>> {
  const { me } = await requireAccountsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z.object({ asOn: z.string().trim().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { asOn } = parsed.data;

  try {
    const [cells, snapshots, partyOpts] = await Promise.all([
      listVasaCells(),
      listVasaSnapshots(),
      listAccountsLookups("vasa_party"),
    ]);
    if (!snapshots.includes(asOn)) return fail("That chart no longer exists.");

    const parties = partyOpts.map((o) => o.name);
    const q = quarterOf(asOn);

    // pdfkit is imported LAZILY — it carries a large font payload, and this
    // module is a "use server" file reachable from the client graph.
    const { renderVasaPdf } = await import("@/lib/accounts/vasa-pdf");
    const pdf = await renderVasaPdf({
      cells,
      parties,
      asOn,
      senderName: me.name ?? null,
    });

    const res = await sendVasaReportEmail({
      to: VASA_REPORT_RECIPIENT,
      snapshotLabel: snapshotLabel(asOn),
      quarter: q ? quarterKey(q.q, q.year) : "—",
      filename: snapshotFilename(asOn, "pdf"),
      pdf,
      senderName: me.name ?? null,
      partyCount: parties.length,
    });
    if (!res.ok) return fail(res.error ?? "Could not send the email.");

    return { ok: true, sentTo: VASA_REPORT_RECIPIENT };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
