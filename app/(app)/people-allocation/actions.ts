"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  paPeople,
  paEntries,
  paCalls,
  paAmbassadors,
  hhAccessGrants,
  hhAccessActivity,
} from "@/db/schema";
import { and, lt, eq as eqOp } from "drizzle-orm";
import {
  canAddPerson,
  canEditPerson,
  canDeleteParticipant,
  canEditParticipant,
  canDeleteSectionEntry,
} from "@/lib/hh/access";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  ALLOCATION_CATEGORIES,
  HH_PARTICIPANT_MODULE_CODES,
  HH_PARTICIPANT_CALL_CODES,
  HH_CALL_TYPES,
  HH_BATCHED_SECTIONS,
  HH_DAYS,
  hhAccessRole,
  hhAccessSections,
  HH_ACCESS_SECTIONS,
  HH_ACCESS_MODULES,
} from "@/db/enums";

/** Hand-holding writes. Each action does one small, independent thing. */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): string => (e as Error)?.message ?? "Something went wrong";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SECTIONS: readonly string[] = ALLOCATION_CATEGORIES.map((c) => c.code);

async function guard() {
  const me = await requireUser();
  return rateLimitOrError(me.id) ?? null;
}

/**
 * Add a person to a roster by name. `kind` decides which tab they land on, and
 * therefore which sections they can hold.
 */
export async function addPerson(input: { name: string; kind: string }): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!(await canAddPerson(me))) return { ok: false, error: "Only Admin, HR or Ruchita can add a person" };
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name" };
  const kind = input.kind === "intern" ? "intern" : "employee";
  try {
    const [row] = await db.insert(paPeople).values({ name, kind }).returning({ id: paPeople.id });
    revalidatePath("/people-allocation");
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Remove a person from a roster. Admin only, because Postgres cascades the
 * delete through their entries and calls — this is not an undo-able tidy-up.
 */
export async function removePerson(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canEditPerson(me)) return { ok: false, error: "Only Admin or Ruchita can delete a person" };
  try {
    await db.delete(paPeople).where(eq(paPeople.id, id));
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/** Add one row under a person's section. */
export interface WeeklyCallInput {
  callType: string;
  day: string;
  durationMin: number;
}

/**
 * `personId` when the row is added under an already-open person; otherwise
 * `personName` + `personKind`, which the Add dialog sends because it now names
 * the person itself. A name not yet on the roster is CREATED rather than
 * refused — the Add flow has to stand on its own, without a prior selection.
 */
export async function addEntry(input: {
  personId?: string;
  personName?: string;
  personKind?: string;
  section: string;
  name: string;
  batchNo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  calls?: WeeklyCallInput[];
}): Promise<Result<{ id: string }>> {
  const limited = await guard();
  if (limited) return limited;

  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required" };
  if (!SECTIONS.includes(input.section)) return { ok: false, error: "Unknown section" };

  try {
    let personId = input.personId ?? "";
    if (personId) {
      const [person] = await db.select().from(paPeople).where(eq(paPeople.id, personId)).limit(1);
      if (!person) return { ok: false, error: "That person is no longer on the roster" };
    } else {
      // Resolve the dialog's own Employee/Intern pick: reuse the roster row if
      // this name is already there, and add it if not. Matching on name AND
      // kind means an employee and an intern may share a first name without
      // one being filed under the other.
      const pName = (input.personName ?? "").trim();
      if (!pName) return { ok: false, error: "Select an employee or intern" };
      const kind = input.personKind === "intern" ? "intern" : "employee";
      const [existing] = await db
        .select()
        .from(paPeople)
        .where(and(eqOp(paPeople.name, pName), eqOp(paPeople.kind, kind)))
        .limit(1);
      if (existing) personId = existing.id;
      else {
        const [created] = await db
          .insert(paPeople)
          .values({ name: pName, kind })
          .returning({ id: paPeople.id });
        personId = created!.id;
      }
    }

    for (const [label, v] of [["Start Date", input.startDate], ["End Date", input.endDate]] as const) {
      if (v && !DATE_RE.test(v)) return { ok: false, error: `${label} must be a full date` };
    }

    const [row] = await db
      .insert(paEntries)
      .values({
        personId,
        section: input.section,
        name,
        // Batch No. belongs to PS and BSS only; ignored elsewhere rather than
        // stored against a product that has no batches.
        batchNo: HH_BATCHED_SECTIONS.includes(input.section) ? input.batchNo?.trim() || null : null,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
      })
      .returning({ id: paEntries.id });

    const calls = (input.calls ?? []).filter((c) => c.callType && c.day);
    if (calls.length > 0) {
      await db.insert(paCalls).values(
        calls.map((c, i) => ({
          entryId: row!.id,
          seq: i + 1,
          callType: c.callType,
          day: c.day,
          durationMin: Number.isFinite(c.durationMin) ? Math.max(0, Math.trunc(c.durationMin)) : 0,
        })),
      );
    }
    revalidatePath("/people-allocation");
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/** Put a row on hold, or take it off. On-hold rows leave the counts and hours. */
export async function setEntryHold(id: string, onHold: boolean): Promise<Result> {
  const limited = await guard();
  if (limited) return limited;
  try {
    await db.update(paEntries).set({ onHold, updatedAt: new Date() }).where(eq(paEntries.id, id));
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Remove entries whose batch is over — an End Date strictly in the past.
 *
 * Run on page load rather than by cron: the module is the only reader, so the
 * sweep is cheap and there is nowhere for a stale row to be seen first.
 */
export async function sweepExpiredEntries(): Promise<Result<{ removed: number }>> {
  await requireUser();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const gone = await db
      .delete(paEntries)
      .where(and(lt(paEntries.endDate, today), eqOp(paEntries.onHold, false)))
      .returning({ id: paEntries.id });
    if (gone.length) revalidatePath("/people-allocation");
    return { ok: true, removed: gone.length };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

export async function removeEntry(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  // PS, BSS and the rest: Manan and Ruchita only. Enforced HERE, not merely
  // hidden — the row takes its weekly calls with it when it goes.
  if (!canDeleteSectionEntry(me)) {
    return { ok: false, error: "Only Manan and Ruchita can delete a participant" };
  }
  try {
    await db.delete(paEntries).where(eq(paEntries.id, id));
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

// ── Ambassadors (their own list) ───────────────────────────────────────────

/**
 * Ambassadors take the same Add form as participants — Product Name is the one
 * difference, being a multi-select here. Their weekly calls live in the same
 * pa_calls table, hung off ambassador_id instead of entry_id.
 */
export async function upsertAmbassador(input: {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  products?: string[];
  batchNo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  calls?: WeeklyCallInput[];
}): Promise<Result<{ id: string }>> {
  const limited = await guard();
  if (limited) return limited;
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Ambassador name is required" };

  const products = (input.products ?? []).filter((c) => SECTIONS.includes(c));
  for (const [label, v] of [["Start Date", input.startDate], ["End Date", input.endDate]] as const) {
    if (v && !DATE_RE.test(v)) return { ok: false, error: `${label} must be a full date` };
  }

  const values = {
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    products,
    // Batch No. only means something for PS and BSS, as everywhere else.
    batchNo: products.some((c) => HH_BATCHED_SECTIONS.includes(c)) ? input.batchNo?.trim() || null : null,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
  };

  try {
    let id = input.id ?? "";
    if (id) {
      await db.update(paAmbassadors).set({ ...values, updatedAt: new Date() }).where(eq(paAmbassadors.id, id));
    } else {
      const [row] = await db.insert(paAmbassadors).values(values).returning({ id: paAmbassadors.id });
      id = row!.id;
    }

    // Calls are replaced wholesale — the form always submits the full set.
    if (input.calls) {
      await db.delete(paCalls).where(eq(paCalls.ambassadorId, id));
      const calls = input.calls.filter((c) => c.callType && c.day);
      if (calls.length > 0) {
        await db.insert(paCalls).values(
          calls.map((c, i) => ({
            ambassadorId: id,
            seq: i + 1,
            callType: c.callType,
            day: c.day,
            durationMin: Number.isFinite(c.durationMin) ? Math.max(0, Math.trunc(c.durationMin)) : 0,
          })),
        );
      }
    }

    revalidatePath("/people-allocation/ambassadors");
    revalidatePath("/people-allocation");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/** Put an ambassador on hold, or take them off it. */
export async function setAmbassadorHold(id: string, onHold: boolean): Promise<Result> {
  const limited = await guard();
  if (limited) return limited;
  try {
    await db.update(paAmbassadors).set({ onHold, updatedAt: new Date() }).where(eq(paAmbassadors.id, id));
    revalidatePath("/people-allocation/ambassadors");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

export async function removeAmbassador(id: string): Promise<Result> {
  const limited = await guard();
  if (limited) return limited;
  try {
    await db.delete(paAmbassadors).where(eq(paAmbassadors.id, id));
    revalidatePath("/people-allocation/ambassadors");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

// ── Access / Permissions ───────────────────────────────────────────────────

/**
 * Record a grant from the Access dialog.
 *
 * Admin only — changing who may do what is itself an admin act. The role matrix
 * is not negotiable here either: an action the role does not carry is refused,
 * so no save can hand HR the delete button.
 */
export async function saveAccessGrant(input: {
  role: string;
  module: string;
  section: string;
  action: string;
  description?: string | null;
}): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canEditPerson(me)) return { ok: false, error: "Only Admin or Ruchita can change access" };

  const role = hhAccessRole(input.role);
  if (role.code !== input.role) return { ok: false, error: "Unknown role" };
  if (!hhAccessSections(input.module).some((sec) => sec.code === input.section)) {
    return { ok: false, error: "Pick a module and a section" };
  }
  if (!role.actions.includes(input.action)) {
    return { ok: false, error: `${role.label} cannot be granted ${input.action}` };
  }

  const description = (input.description ?? "").trim().slice(0, 250) || null;
  try {
    await db
      .insert(hhAccessGrants)
      .values({ role: role.code, module: input.module, section: input.section, action: input.action, description, createdBy: me.id })
      .onConflictDoUpdate({
        target: [hhAccessGrants.role, hhAccessGrants.module, hhAccessGrants.section, hhAccessGrants.action],
        set: { description, updatedAt: new Date() },
      });
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Append rows to the Access Activity log.
 *
 * Admin only, and the role matrix still holds: an action a role does not carry
 * cannot be logged against it, so the log can never claim HR deleted someone.
 */
export async function addAccessActivity(
  rows: {
    role: string;
    module: string;
    section: string;
    personName: string;
    action: string;
    description?: string | null;
  }[],
): Promise<Result<{ added: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canEditPerson(me)) return { ok: false, error: "Only Admin or Ruchita can change access" };
  if (rows.length === 0) return { ok: true, added: 0 };

  for (const r of rows) {
    const role = hhAccessRole(r.role);
    if (role.code !== r.role) return { ok: false, error: "Unknown role" };
    // Module and section are independent choices, so they are checked apart.
    if (!HH_ACCESS_MODULES.some((m) => m.code === r.module)) return { ok: false, error: "Pick a module" };
    if (!HH_ACCESS_SECTIONS.some((sec) => sec.code === r.section)) return { ok: false, error: "Pick a section" };
    if (!role.actions.includes(r.action)) {
      return { ok: false, error: `${role.label} cannot be granted ${r.action}` };
    }
    if (!r.personName.trim()) return { ok: false, error: "Select a person" };
  }

  // The form no longer asks for a Date or a Day, so the row is stamped with
  // when it was actually saved — one source of truth instead of a typed date
  // that could disagree with the timestamp beside it.
  const now = new Date();
  const occurredOn = now.toISOString().slice(0, 10);
  const day = HH_DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1]!.code;

  try {
    await db.insert(hhAccessActivity).values(
      rows.map((r) => ({
        role: r.role,
        module: r.module,
        section: r.section,
        personName: r.personName.trim(),
        action: r.action,
        occurredOn,
        day,
        description: (r.description ?? "").trim().slice(0, 250) || null,
        createdBy: me.id,
      })),
    );
    revalidatePath("/people-allocation");
    return { ok: true, added: rows.length };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/** The Manage column's only action. */
/**
 * Edit one stored Access Activity row in place — its module, section, person,
 * action or description.
 *
 * Every field is OPTIONAL and only what is passed is written, so the caller can
 * change a single dropdown without resending the row. Values are validated
 * against the same lists the form offers, since this action is reachable
 * without the form.
 */
export async function updateAccessActivity(
  id: string,
  patch: { module?: string; section?: string; personName?: string; action?: string; description?: string | null },
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canEditPerson(me)) return { ok: false, error: "Only Admin or Ruchita can change access" };

  const values: Record<string, unknown> = {};
  if (patch.module !== undefined) {
    if (!HH_ACCESS_MODULES.some((m) => m.code === patch.module)) return { ok: false, error: "Unknown module" };
    values.module = patch.module;
  }
  if (patch.section !== undefined) {
    if (!HH_ACCESS_SECTIONS.some((x) => x.code === patch.section)) return { ok: false, error: "Unknown section" };
    values.section = patch.section;
  }
  if (patch.personName !== undefined) {
    const name = patch.personName.trim();
    if (!name) return { ok: false, error: "Pick a person" };
    values.personName = name;
  }
  if (patch.action !== undefined) {
    if (!patch.action.trim()) return { ok: false, error: "Pick an action" };
    values.action = patch.action;
  }
  if (patch.description !== undefined) {
    const text = (patch.description ?? "").trim();
    values.description = text || null;
  }
  if (Object.keys(values).length === 0) return { ok: true };

  try {
    await db.update(hhAccessActivity).set(values).where(eq(hhAccessActivity.id, id));
    revalidatePath("/people-allocation/access");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

export async function removeAccessActivity(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canEditPerson(me)) return { ok: false, error: "Only Admin or Ruchita can change access" };
  try {
    await db.delete(hhAccessActivity).where(eq(hhAccessActivity.id, id));
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Bulk Add — put every selected person under one product in a single pass.
 *
 * Gated by canAddPerson, so HR qualifies: this is an ADD, and HR adds. It
 * grants nothing else — editing and deleting stay behind canEditPerson.
 *
 * Reuses a person's existing UNASSIGNED participant row rather than making a
 * second one. Someone already listed with no product is the same participant,
 * so bulk-adding them to PS should fill that row in, not leave a duplicate
 * sitting alongside it. Anyone already on the product is left alone, which
 * makes the whole thing safe to run twice.
 */
export async function bulkAddParticipants(input: {
  section: string;
  people: { name: string; kind: string }[];
}): Promise<Result<{ added: number; assigned: number; skipped: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!(await canAddPerson(me))) {
    return { ok: false, error: "Only Admin, HR or Ruchita can add participants" };
  }
  if (!SECTIONS.includes(input.section)) return { ok: false, error: "Unknown product" };
  if (!input.people.length) return { ok: false, error: "Select at least one person" };

  let added = 0;
  let assigned = 0;
  let skipped = 0;

  try {
    for (const p of input.people) {
      const name = (p.name ?? "").trim();
      if (!name) continue;
      const kind = p.kind === "intern" ? "intern" : "employee";

      // Same roster resolution addEntry uses: reuse the row, add it if new.
      let personId: string;
      const [person] = await db
        .select()
        .from(paPeople)
        .where(and(eqOp(paPeople.name, name), eqOp(paPeople.kind, kind)))
        .limit(1);
      if (person) personId = person.id;
      else {
        const [created] = await db.insert(paPeople).values({ name, kind }).returning({ id: paPeople.id });
        personId = created!.id;
      }

      const rows = await db.select().from(paEntries).where(eqOp(paEntries.personId, personId));
      if (rows.some((r) => r.section === input.section)) {
        skipped++;
        continue;
      }
      const spare = rows.find((r) => r.section === null);
      if (spare) {
        await db
          .update(paEntries)
          .set({ section: input.section, updatedAt: new Date() })
          .where(eqOp(paEntries.id, spare.id));
        assigned++;
      } else {
        await db.insert(paEntries).values({ personId, section: input.section, name });
        added++;
      }
    }

    revalidatePath("/people-allocation");
    revalidatePath("/people-allocation/participants");
    revalidatePath("/people-allocation/access");
    return { ok: true, added, assigned, skipped };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Set the weekday a participant sits on, from the All Participants list.
 * Editing the day is ordinary working use, so it is not gated the way deleting
 * is — only the value is checked.
 */
export async function setParticipantDay(id: string, day: string): Promise<Result> {
  const limited = await guardParticipantEdit();
  if (limited) return limited;
  if (day && !HH_DAYS.some((d) => d.code === day)) return { ok: false, error: "Pick a day" };
  try {
    await db
      .update(paEntries)
      .set({ day: day || null, updatedAt: new Date() })
      .where(eq(paEntries.id, id));
    revalidatePath("/people-allocation/participants");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Set the Module a participant sits under, from the All Participants list.
 * "" clears it back to unassigned rather than guessing on the user's behalf.
 *
 * Validated against HH_PARTICIPANT_MODULE_CODES, not the allocation sections:
 * this column also carries Tool and Follow Up, which are kinds of work rather
 * than sections anyone is allocated to.
 */
export async function setParticipantProduct(id: string, section: string): Promise<Result> {
  const limited = await guardParticipantEdit();
  if (limited) return limited;
  if (section && !HH_PARTICIPANT_MODULE_CODES.includes(section)) {
    return { ok: false, error: "Unknown module" };
  }
  try {
    await db
      .update(paEntries)
      .set({ section: section || null, updatedAt: new Date() })
      .where(eq(paEntries.id, id));
    revalidatePath("/people-allocation/participants");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Shared gate for editing a participant in place: Admin and Ruchita, never HR.
 * Enforced per action rather than trusted from a disabled control — a disabled
 * select is a courtesy, and these actions are reachable without one.
 */
async function guardParticipantEdit() {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canEditParticipant(me)) {
    return { ok: false as const, error: "Only Admin and Ruchita can edit participants" };
  }
  return null;
}

/** Set the Call a participant sits on. "" clears it. */
export async function setParticipantCall(id: string, callType: string): Promise<Result> {
  const limited = await guardParticipantEdit();
  if (limited) return limited;
  if (callType && !HH_PARTICIPANT_CALL_CODES.includes(callType)) {
    return { ok: false, error: "Pick a call between 1 and 4" };
  }
  try {
    await db
      .update(paEntries)
      .set({ callType: callType || null, updatedAt: new Date() })
      .where(eq(paEntries.id, id));
    revalidatePath("/people-allocation/participants");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Set a participant's call DURATION, in minutes. null clears it.
 *
 * Minutes, not "HH:MM": the field shows a clock, the column stores a quantity.
 * Parsing happens in the UI so a typo is caught while the field still holds it;
 * this only has to reject a number that could not be a duration.
 */
export async function setParticipantDuration(id: string, minutes: number | null): Promise<Result> {
  const limited = await guardParticipantEdit();
  if (limited) return limited;
  if (minutes !== null) {
    if (!Number.isFinite(minutes) || minutes < 0) return { ok: false, error: "Enter a duration as HH:MM" };
    // 24h is the ceiling: a longer "call" is a typo, not a meeting.
    if (minutes > 24 * 60) return { ok: false, error: "That duration is longer than a day" };
  }
  try {
    await db
      .update(paEntries)
      .set({ durationMin: minutes === null ? null : Math.trunc(minutes), updatedAt: new Date() })
      .where(eq(paEntries.id, id));
    revalidatePath("/people-allocation/participants");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Rename a participant from the All Participants list.
 *
 * Any non-empty name is accepted, not only the roster's: the picker offers the
 * rosters, but a row entered before those lists existed must still be saveable
 * without being silently rewritten.
 */
export async function setParticipantName(id: string, name: string): Promise<Result> {
  const limited = await guardParticipantEdit();
  if (limited) return limited;
  const clean = (name ?? "").trim();
  if (!clean) return { ok: false, error: "Name is required" };
  try {
    await db
      .update(paEntries)
      .set({ name: clean, updatedAt: new Date() })
      .where(eq(paEntries.id, id));
    revalidatePath("/people-allocation/participants");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}

/**
 * Delete a participant — Manan and Ruchita only, PS and BSS included.
 *
 * Enforced here and not merely hidden in the UI: a hidden button is a courtesy,
 * and this action is reachable without one.
 */
export async function deleteParticipant(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id);
  if (limited) return limited;
  if (!canDeleteParticipant(me)) {
    return { ok: false, error: "Only Manan and Ruchita can delete participants" };
  }
  try {
    await db.delete(paEntries).where(eq(paEntries.id, id));
    revalidatePath("/people-allocation/participants");
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e) };
  }
}
