"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, tasks, settingsEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  CreateClientSchema,
  UpdateClientSchema,
  ClientIdSchema,
  type CreateClientInput,
  type UpdateClientInput,
} from "@/lib/validators/client";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function revalidateClientSurfaces() {
  revalidatePath("/admin/clients");
  revalidatePath("/tasks/new");
  revalidatePath("/tasks");
  revalidatePath("/");
  // A client rename rewrites `tasks.title` in place (see updateClient),
  // which means cached task-derived data (nav counts, listDistinctSubjects)
  // is now stale. Invalidate the tasks tag too — `updateTag` only
  // works inside server actions, which this helper is exclusively
  // called from.
  updateTag(CACHE_TAGS.tasks);
  // Drop the cached `listActiveClientNames` payload so the picker
  // immediately reflects new/renamed/deactivated clients.
  updateTag(CACHE_TAGS.clients);
}

export async function createClient(
  input: CreateClientInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();

  const parsed = CreateClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Reject case-insensitive duplicates so the unique constraint never
  // surfaces as a raw DB error.
  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(sql`lower(${clients.name}) = lower(${parsed.data.name})`)
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "A client with this name already exists." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(clients)
      .values({
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 100,
      })
      .returning();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: inserted.id,
      actorId: me.id,
      eventType: "created",
      toValue: { name: inserted.name, sortOrder: inserted.sortOrder },
    });
  } catch (err) {
    console.error("[createClient] audit write failed", err);
  }

  revalidateClientSurfaces();
  return { ok: true, id: inserted.id };
}

export async function deleteClient(
  clientId: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, parsedId.data),
  });
  if (!client) return { ok: false, error: "Client not found" };

  // Roster-only delete: `clients` is just the picker list (no FK from tasks),
  // so removing a row leaves every task untouched — tasks keep their existing
  // Client Name text. This only removes the name from the picker.
  try {
    await db.delete(clients).where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(settingsEvents).values({
      scope: "client",
      targetId: client.id,
      actorId: me.id,
      eventType: "deleted",
      fromValue: { name: client.name },
      toValue: null,
    });
  } catch (err) {
    console.error("[deleteClient] audit write failed", err);
  }

  revalidateClientSurfaces();
  return { ok: true };
}

export async function updateClient(
  clientId: string,
  fields: UpdateClientInput,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const parsedId = ClientIdSchema.safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0]?.message ?? "Invalid client id" };
  }

  const parsed = UpdateClientSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, parsedId.data),
  });
  if (!client) return { ok: false, error: "Client not found" };

  // Block a rename that collides (case-insensitive) with another client.
  if (parsed.data.name !== undefined && parsed.data.name !== client.name) {
    const clash = await db
      .select({ id: clients.id })
      .from(clients)
      .where(sql`lower(${clients.name}) = lower(${parsed.data.name})`)
      .limit(1);
    if (clash[0] && clash[0].id !== client.id) {
      return { ok: false, error: "A client with this name already exists." };
    }
  }

  const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;

  try {
    await db.update(clients).set(patch).where(eq(clients.id, client.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("clients_name_unique")) {
      return { ok: false, error: "A client with this name already exists." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  // A client name IS the task's title (the "Client Name" field), so a
  // rename must propagate to every task filed under the old name to keep
  // the picker, exports and detail views consistent.
  if (parsed.data.name !== undefined && parsed.data.name !== client.name) {
    try {
      await db
        .update(tasks)
        .set({ title: parsed.data.name })
        .where(sql`lower(${tasks.title}) = lower(${client.name})`);
    } catch (err) {
      console.error("[updateClient] failed to propagate rename to tasks.title", err);
    }
  }

  try {
    const fromValue: Record<string, unknown> = {};
    const toValue: Record<string, unknown> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== client.name) {
      fromValue.name = client.name;
      toValue.name = parsed.data.name;
    }
    if (parsed.data.isActive !== undefined && parsed.data.isActive !== client.isActive) {
      fromValue.isActive = client.isActive;
      toValue.isActive = parsed.data.isActive;
    }
    if (parsed.data.sortOrder !== undefined && parsed.data.sortOrder !== client.sortOrder) {
      fromValue.sortOrder = client.sortOrder;
      toValue.sortOrder = parsed.data.sortOrder;
    }
    if (Object.keys(toValue).length > 0) {
      await db.insert(settingsEvents).values({
        scope: "client",
        targetId: client.id,
        actorId: me.id,
        eventType: "updated",
        fromValue,
        toValue,
      });
    }
  } catch (err) {
    console.error("[updateClient] audit write failed", err);
  }

  revalidateClientSurfaces();
  return { ok: true };
}
