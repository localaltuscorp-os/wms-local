"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { billingCustomers, billingLookups, departments, employeeDepartments } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditLookup, lookupList, type LookupList } from "@/lib/billing/lookups";
import type { Employee } from "@/db/schema";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "That input is not valid.";
}

/**
 * THE PERMISSION GATE for the two description masters.
 *
 * Manan, 2026-09-17: only Accounts and he may add to Product Description and
 * Service Description. Everything else on the master is open.
 *
 * The department is read here rather than passed from the browser for the
 * obvious reason — a client that can say which team it belongs to is not a
 * permission check. Read once per action; these lists are edited rarely.
 */
type Guard =
  | { ok: false; error: string }
  | { ok: true; me: Employee; list: LookupList };

async function guard(kind: string): Promise<Guard> {
  const me = await requireWorkspace("billing");
  const list = lookupList(kind);
  if (!list) return { ok: false, error: `"${kind}" is not a list on this master.` };

  if (list.restricted) {
    const rows = await db
      .select({ name: departments.name })
      .from(employeeDepartments)
      .innerJoin(departments, eq(departments.id, employeeDepartments.departmentId))
      .where(eq(employeeDepartments.employeeId, me.id));
    if (!canEditLookup(list, me, rows.map((r) => r.name))) {
      return {
        ok: false,
        error:
          `${list.label} can only be changed by Accounts or by Manan Vasa — these options are ` +
          `printed on documents that leave the company.`,
      };
    }
  }
  return { ok: true, me, list };
}

function revalidate() {
  revalidatePath("/billing/customers/new");
  revalidatePath("/billing/recycle-bin");
}

const RestoreSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["customer", "option"]),
});

/**
 * PUT SOMETHING BACK from the recycle bin.
 *
 * Restoring is clearing `deleted_at` — the row never left, so everything it
 * referenced and everything that referenced it is still intact and no ids
 * change. That is the whole reason removal is a timestamp.
 *
 * A restored dropdown option can collide with one added in the meantime, since
 * the unique index only covers live rows. Checked here so the answer is a
 * sentence rather than a constraint violation.
 */
export async function restoreFromBinAction(raw: unknown): Promise<ActionResult> {
  const parsed = RestoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, kind } = parsed.data;

  const me = await requireWorkspace("billing");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (kind === "customer") {
    await db
      .update(billingCustomers)
      .set({ deletedAt: null, deletedById: null })
      .where(eq(billingCustomers.id, id));
    revalidatePath("/billing/customers");
    revalidatePath("/billing/customers/addresses");
    revalidatePath("/billing/recycle-bin");
    return { ok: true };
  }

  const [row] = await db
    .select({ kind: billingLookups.kind, value: billingLookups.value })
    .from(billingLookups)
    .where(eq(billingLookups.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That option no longer exists." };

  const g = await guard(row.kind);
  if (!g.ok) return { ok: false, error: g.error };

  const clash = await db
    .select({ id: billingLookups.id })
    .from(billingLookups)
    .where(
      and(
        eq(billingLookups.kind, row.kind),
        sql`lower(${billingLookups.value}) = lower(${row.value})`,
        isNull(billingLookups.deletedAt),
      ),
    )
    .limit(1);
  if (clash.length > 0) {
    return {
      ok: false,
      error: `"${row.value}" was added back to ${g.list.label} in the meantime, so there is nothing to restore.`,
    };
  }

  await db.update(billingLookups).set({ deletedAt: null }).where(eq(billingLookups.id, id));
  revalidate();
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE DROPDOWN MASTER — Customer Master DD (/billing/customers/dropdowns).
 *
 * Six mutations against `billing_lookups`, every one of them through `guard()`
 * above, so the two restricted description lists are re-checked on the server
 * each time. A dropdown the client hides is a courtesy; this is the control.
 *
 * MIND THE DEFAULTS. A list with nothing saved shows the registry's defaults
 * (lib/billing/lookups.ts) and reads `isDefault` — those are NOT database rows,
 * they carry synthetic `default:<kind>:<i>` ids, and nothing can be renamed,
 * removed or reordered until the list is written down. `saveLookupDefaults`
 * writes it down, and `add` does it implicitly rather than leaving a list of
 * one where twelve were showing.
 *
 * REMOVAL IS A TIMESTAMP, never a DELETE — the same rule as the rest of the
 * module, and what lets the Recycle Bin put an option back with its id intact.
 * ═══════════════════════════════════════════════════════════════════════════ */

const KindSchema = z.object({ kind: z.string().min(1) });
const AddSchema = z.object({
  kind: z.string().min(1),
  value: z.string().trim().min(1, "Type the option first.").max(200, "That option is too long."),
});
const RenameSchema = z.object({
  id: z.string().uuid(),
  value: z.string().trim().min(1, "The option cannot be blank.").max(200, "That option is too long."),
});
const IdSchema = z.object({ id: z.string().uuid() });
const MoveSchema = z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) });

/** The live rows of one list, in display order. */
async function liveOptions(kind: string) {
  return db
    .select({ id: billingLookups.id, value: billingLookups.value, sortOrder: billingLookups.sortOrder })
    .from(billingLookups)
    .where(and(eq(billingLookups.kind, kind), isNull(billingLookups.deletedAt)))
    .orderBy(asc(billingLookups.sortOrder), asc(billingLookups.value));
}

/** Is this value already live in the list? Case-insensitive, like the index. */
async function takenIn(kind: string, value: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: billingLookups.id })
    .from(billingLookups)
    .where(
      and(
        eq(billingLookups.kind, kind),
        sql`lower(${billingLookups.value}) = lower(${value})`,
        isNull(billingLookups.deletedAt),
      ),
    );
  return rows.some((r) => r.id !== exceptId);
}

/** Copy the registry's suggestions in, so the list becomes editable data. */
export async function saveLookupDefaultsAction(raw: unknown): Promise<ActionResult> {
  const parsed = KindSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const g = await guard(parsed.data.kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  const existing = await liveOptions(g.list.kind);
  if (existing.length > 0) return { ok: false, error: `${g.list.label} is already saved.` };
  if (g.list.defaults.length === 0) return { ok: false, error: `${g.list.label} has no defaults to save.` };

  await db.insert(billingLookups).values(
    g.list.defaults.map((value, i) => ({
      kind: g.list.kind,
      value,
      sortOrder: i,
      createdById: g.me.id,
    })),
  );
  revalidate();
  return { ok: true };
}

/** Add one option to the end of a list. */
export async function addLookupOptionAction(raw: unknown): Promise<ActionResult> {
  const parsed = AddSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { kind, value } = parsed.data;
  const g = await guard(kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  /* A list still on its defaults has no rows behind it, so adding to it alone
     would leave one option where twelve were showing. Write the defaults down
     first, then append — which is what somebody adding to a list expects. */
  const existing = await liveOptions(kind);
  if (existing.length === 0 && g.list.defaults.length > 0) {
    await db.insert(billingLookups).values(
      g.list.defaults.map((v, i) => ({ kind, value: v, sortOrder: i, createdById: g.me.id })),
    );
  }

  if (await takenIn(kind, value)) {
    return { ok: false, error: `"${value}" is already in ${g.list.label}.` };
  }

  const rows = await liveOptions(kind);
  const next = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.sortOrder)) + 1;
  await db.insert(billingLookups).values({ kind, value, sortOrder: next, createdById: g.me.id });
  revalidate();
  return { ok: true };
}

/** Rename in place. The id does not change, so nothing naming it is orphaned. */
export async function renameLookupOptionAction(raw: unknown): Promise<ActionResult> {
  const parsed = RenameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, value } = parsed.data;

  const [row] = await db
    .select({ kind: billingLookups.kind })
    .from(billingLookups)
    .where(eq(billingLookups.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That option no longer exists." };

  const g = await guard(row.kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  if (await takenIn(row.kind, value, id)) {
    return { ok: false, error: `"${value}" is already in ${g.list.label}.` };
  }
  await db.update(billingLookups).set({ value }).where(eq(billingLookups.id, id));
  revalidate();
  return { ok: true };
}

/** Remove an option — `deleted_at`, so the Recycle Bin can put it back. */
export async function removeLookupOptionAction(raw: unknown): Promise<ActionResult> {
  const parsed = IdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id } = parsed.data;

  const [row] = await db
    .select({ kind: billingLookups.kind })
    .from(billingLookups)
    .where(eq(billingLookups.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That option no longer exists." };

  const g = await guard(row.kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  await db.update(billingLookups).set({ deletedAt: new Date() }).where(eq(billingLookups.id, id));
  revalidate();
  return { ok: true };
}

/**
 * Move an option one place up or down.
 *
 * SWAPS THE TWO `sort_order` VALUES rather than renumbering the whole list, so
 * a move is two writes whatever the list's length, and a list somebody else is
 * editing at the same moment cannot be renumbered out from under them.
 */
export async function moveLookupOptionAction(raw: unknown): Promise<ActionResult> {
  const parsed = MoveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, direction } = parsed.data;

  const [row] = await db
    .select({ kind: billingLookups.kind })
    .from(billingLookups)
    .where(eq(billingLookups.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That option no longer exists." };

  const g = await guard(row.kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  const rows = await liveOptions(row.kind);
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  // Already at the end it can move to: nothing to do, and not an error.
  if (i < 0 || j < 0 || j >= rows.length) return { ok: true };
  const a = rows[i]!;
  const b = rows[j]!;
  await db.update(billingLookups).set({ sortOrder: b.sortOrder }).where(eq(billingLookups.id, a.id));
  await db.update(billingLookups).set({ sortOrder: a.sortOrder }).where(eq(billingLookups.id, b.id));
  revalidate();
  return { ok: true };
}

/**
 * Put a list back to the registry's defaults.
 *
 * The current options are REMOVED, not dropped — they go to the Recycle Bin
 * like any other removal, so a reset somebody regrets is recoverable option by
 * option. With no live rows left the list shows its defaults again.
 */
export async function resetLookupAction(raw: unknown): Promise<ActionResult> {
  const parsed = KindSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const g = await guard(parsed.data.kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  await db
    .update(billingLookups)
    .set({ deletedAt: new Date() })
    .where(and(eq(billingLookups.kind, g.list.kind), isNull(billingLookups.deletedAt)));
  revalidate();
  return { ok: true };
}

const BulkSchema = z.object({
  kind: z.string().min(1),
  text: z.string().max(100_000),
});

/**
 * PASTE A COLUMN IN — one option per line.
 *
 * The filtering here is the contract the card's counter mirrors exactly: trim,
 * drop blanks, drop anything past 200 characters, drop case-insensitive repeats
 * WITHIN the paste, and drop what the list already holds. Counting raw lines
 * instead would promise twelve and add eight the moment somebody re-pastes a
 * column that overlaps what is there — which is the common case, not the rare
 * one. The card says how many will actually land before you commit.
 */
export async function bulkAddLookupOptionsAction(raw: unknown): Promise<ActionResult> {
  const parsed = BulkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { kind, text } = parsed.data;
  const g = await guard(kind);
  if (!g.ok) return { ok: false, error: g.error };
  const limited = rateLimitOrError(g.me.id, "write");
  if (limited) return limited;

  /* Same reason as `add`: a list still on its defaults has no rows, so pasting
     into it alone would leave only the pasted values where the suggestions
     were showing. Write the defaults down first. */
  let existing = await liveOptions(kind);
  if (existing.length === 0 && g.list.defaults.length > 0) {
    await db.insert(billingLookups).values(
      g.list.defaults.map((v, i) => ({ kind, value: v, sortOrder: i, createdById: g.me.id })),
    );
    existing = await liveOptions(kind);
  }

  const seen = new Set(existing.map((o) => o.value.trim().toLowerCase()));
  const wanted: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.length > 200) continue;
    const k = clean.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    wanted.push(clean);
  }
  if (wanted.length === 0) return { ok: false, error: "Nothing new to add." };

  let sortOrder = existing.length === 0 ? -1 : Math.max(...existing.map((o) => o.sortOrder));
  await db.insert(billingLookups).values(
    wanted.map((value) => ({ kind, value, sortOrder: ++sortOrder, createdById: g.me.id })),
  );
  revalidate();
  return { ok: true };
}
