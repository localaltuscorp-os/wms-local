import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documentEvents,
  documents,
  taskEvents,
  tasks,
} from "@/db/schema";

export interface ActivityRow {
  id: string;
  at: string;                                  // ISO
  kind: "task" | "comment" | "document";
  eventType: string;
  summary: string;
  href: string | null;
}

/**
 * Last-30-day union of task events + document events created by the user.
 * Reverse-chronological, capped at 200 rows.
 */
export async function getRecentActivity(
  employeeId: string,
  limit = 60,
): Promise<ActivityRow[]> {
  const since = sql`now() - interval '30 days'`;

  const [taskRows, docRows] = await Promise.all([
    db
      .select({
        id: taskEvents.id,
        at: taskEvents.createdAt,
        eventType: taskEvents.eventType,
        taskId: taskEvents.taskId,
        toValue: taskEvents.toValue,
        taskTitle: tasks.title,
        taskShortId: tasks.shortId,
      })
      .from(taskEvents)
      .leftJoin(tasks, eq(tasks.id, taskEvents.taskId))
      .where(
        and(eq(taskEvents.actorId, employeeId), gte(taskEvents.createdAt, since)),
      )
      .orderBy(desc(taskEvents.createdAt))
      .limit(limit),
    db
      .select({
        id: documentEvents.id,
        at: documentEvents.createdAt,
        eventType: documentEvents.eventType,
        documentId: documentEvents.documentId,
        documentTitle: documents.title,
      })
      .from(documentEvents)
      .leftJoin(documents, eq(documents.id, documentEvents.documentId))
      .where(
        and(
          eq(documentEvents.actorId, employeeId),
          gte(documentEvents.createdAt, since),
        ),
      )
      .orderBy(desc(documentEvents.createdAt))
      .limit(limit),
  ]);

  const merged: ActivityRow[] = [
    ...taskRows.map((r): ActivityRow => {
      const subject =
        (r.taskShortId ? `${r.taskShortId} · ` : "") +
        (r.taskTitle ?? "Task");
      const isComment = r.eventType === "commented";
      return {
        id: `t-${r.id}`,
        at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
        kind: isComment ? "comment" : "task",
        eventType: r.eventType,
        summary: summarizeTaskEvent(r.eventType, subject),
        href: r.taskId ? `/tasks/${r.taskId}` : null,
      };
    }),
    ...docRows.map((r): ActivityRow => ({
      id: `d-${r.id}`,
      at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
      kind: "document",
      eventType: r.eventType,
      summary: summarizeDocumentEvent(r.eventType, r.documentTitle ?? "document"),
      href: "/documents",
    })),
  ];

  merged.sort((a, b) => (a.at < b.at ? 1 : -1));
  return merged.slice(0, limit);
}

function summarizeTaskEvent(eventType: string, subject: string): string {
  switch (eventType) {
    case "created":         return `Created task “${subject}”`;
    case "status_changed":  return `Moved task “${subject}”`;
    case "approved":        return `Approved task “${subject}”`;
    case "declined":        return `Declined task “${subject}”`;
    case "reassigned":      return `Reassigned task “${subject}”`;
    case "transferred":     return `Transferred task “${subject}”`;
    case "cancelled":       return `Cancelled task “${subject}”`;
    case "commented":       return `Commented on “${subject}”`;
    case "edited":          return `Edited task “${subject}”`;
    default:                return `${eventType} on “${subject}”`;
  }
}

function summarizeDocumentEvent(eventType: string, title: string): string {
  switch (eventType) {
    case "created":              return `Uploaded document “${title}”`;
    case "renamed":              return `Renamed document to “${title}”`;
    case "description_changed":  return `Updated description on “${title}”`;
    case "file_replaced":        return `Replaced file in “${title}”`;
    case "deleted":              return `Deleted document “${title}”`;
    default:                     return `${eventType} on document “${title}”`;
  }
}
