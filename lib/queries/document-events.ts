import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentEvents, employees } from "@/db/schema";

export interface DocumentEventRow {
  id: string;
  documentId: string | null;
  documentTitle: string;
  eventType:
    | "created"
    | "renamed"
    | "description_changed"
    | "file_replaced"
    | "deleted";
  fromValue: unknown;
  toValue: unknown;
  actorId: string;
  actorName: string | null;
  createdAt: Date;
}

/**
 * Phase 3.5 surface — the recent rows in `document_events` joined with
 * actor name. Used by the /admin/settings Integrations tab (or wherever
 * admin oversight lives). Read-only.
 */
export async function listRecentDocumentEvents(opts: {
  limit?: number;
} = {}): Promise<DocumentEventRow[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const rows = await db
    .select({
      id: documentEvents.id,
      documentId: documentEvents.documentId,
      documentTitle: documentEvents.documentTitle,
      eventType: documentEvents.eventType,
      fromValue: documentEvents.fromValue,
      toValue: documentEvents.toValue,
      actorId: documentEvents.actorId,
      actorName: employees.name,
      createdAt: documentEvents.createdAt,
    })
    .from(documentEvents)
    .leftJoin(employees, eq(employees.id, documentEvents.actorId))
    .orderBy(desc(documentEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    eventType: r.eventType as DocumentEventRow["eventType"],
    actorName: r.actorName ?? null,
  }));
}
