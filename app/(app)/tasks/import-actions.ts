"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { db, tasks } from "@/lib/db";
import { taskEvents, employees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { afterResponse } from "@/lib/after";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { deriveShortId, nextShortIdCandidate } from "@/lib/import/short-id";
import { notify } from "@/lib/notifications/dispatch";
import {
  buildImportPreview,
  type ImportPreview,
  type RosterEntry,
} from "@/lib/import/task-import";

async function activeRoster(): Promise<RosterEntry[]> {
  return db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true));
}

/** Dry-run: parse + validate the uploaded file, resolve people, return a
 *  per-row preview. No DB writes. Admin-only. */
export async function previewTaskImport(formData: FormData): Promise<ImportPreview> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { rows: [], totalRows: 0, validCount: 0, errorCount: 0, fatal: "No file uploaded." };
  }
  const roster = await activeRoster();
  return buildImportPreview(file, roster);
}

export interface CommitImportResult {
  ok: boolean;
  created: number;
  skipped: number;
  error?: string;
}

/** Re-parse the file server-side (never trusting the client) and create every
 *  valid row. Batched insert + deferred notifications so a large import stays
 *  fast and a notification failure can't abort it. Admin-only. */
export async function commitTaskImport(formData: FormData): Promise<CommitImportResult> {
  const me = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, created: 0, skipped: 0, error: "No file uploaded." };
  }

  const roster = await activeRoster();
  const preview = await buildImportPreview(file, roster);
  if (preview.fatal) {
    return { ok: false, created: 0, skipped: 0, error: preview.fatal };
  }

  const valid = preview.rows.filter((r) => r.ok);
  const skipped = preview.rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, created: 0, skipped, error: "No valid rows to import." };
  }

  const notifyIntents: Array<Parameters<typeof notify>[0]> = [];
  let created = 0;

  try {
    for (const row of valid) {
      const taskId = crypto.randomUUID();
      let attempt = 0;
      let inserted: { id: string } | undefined;
      while (attempt < 23) {
        const shortId =
          attempt === 0 ? deriveShortId(taskId) : nextShortIdCandidate(taskId, attempt);
        if (!shortId) break;
        try {
          [inserted] = await db
            .insert(tasks)
            .values({
              id: taskId,
              title: row.client, // form's "Client Name" → title + client
              client: row.client,
              description: row.description,
              subject: row.subject,
              notes: row.notes,
              doerId: row.doerId!,
              initiatorId: row.initiatorId!,
              priority: row.priority,
              dueAt: new Date(row.dueAt!),
              tags: row.tags.length > 0 ? row.tags : null,
              createdById: me.id,
              shortId,
              status: "dont_know", // lands in "Not Read" like the form
            })
            .returning({ id: tasks.id });
          break;
        } catch (err: unknown) {
          const e = err as { code?: string; constraint?: string };
          if (e?.code === "23505" && e?.constraint === "tasks_short_id_uidx") {
            attempt++;
            continue;
          }
          throw err;
        }
      }
      if (!inserted) continue;

      // Best-effort audit row — never abort the batch over it.
      try {
        await db.insert(taskEvents).values({
          taskId: inserted.id,
          actorId: me.id,
          eventType: "created",
          toValue: {
            title: row.client,
            doerId: row.doerId,
            initiatorId: row.initiatorId,
            priority: row.priority,
            dueAt: row.dueAt,
            tags: row.tags.length > 0 ? row.tags : null,
            via: "import",
          },
        });
      } catch {
        // ignore — task already created
      }

      const label = row.subject || row.client;
      if (row.doerId && row.doerId !== me.id) {
        notifyIntents.push({
          userId: row.doerId,
          kind: "task_assigned",
          title: `${me.name} assigned you '${label}'`,
          taskId: inserted.id,
          actorId: me.id,
        });
      }
      if (row.initiatorId && row.initiatorId !== me.id && row.initiatorId !== row.doerId) {
        notifyIntents.push({
          userId: row.initiatorId,
          kind: "task_initiated",
          title: `${me.name} made you initiator on '${label}'`,
          taskId: inserted.id,
          actorId: me.id,
        });
      }
      created += 1;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Some rows may have committed before the failure — report what we have.
    return { ok: false, created, skipped, error: `Import stopped after ${created}: ${msg}` };
  }

  // Fire notifications after the response so the import stays snappy.
  if (notifyIntents.length > 0) {
    afterResponse(async () => {
      for (const intent of notifyIntents) await notify(intent);
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/archived");
  revalidatePath("/");
  updateTag(CACHE_TAGS.tasks);
  updateTag(CACHE_TAGS.subjects);

  return { ok: true, created, skipped };
}
