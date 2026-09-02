import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  documents,
  pinnedItems,
  projectNodes,
  tasks,
  type PinnedItem,
} from "@/db/schema";
import { PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

export type PinKind = "task" | "project" | "document";

export interface ResolvedPin {
  id: string;            // pinned_items.id
  kind: PinKind;
  itemId: string;
  sortOrder: number;
  title: string;
  href: string;
  exists: boolean;       // false if the target row was deleted
  pinnedAt: Date | string;
}

/**
 * Read the user's pinned items with their resolved titles. Cached
 * per-user; invalidated by pin/unpin/reorder.
 */
export async function getPinnedItems(
  employeeId: string,
): Promise<ResolvedPin[]> {
  return unstable_cache(
    async () => {
      const rows: PinnedItem[] = await db
        .select()
        .from(pinnedItems)
        .where(eq(pinnedItems.employeeId, employeeId))
        .orderBy(asc(pinnedItems.sortOrder), asc(pinnedItems.pinnedAt));

      if (rows.length === 0) return [];

      const taskIds = rows.filter((r) => r.kind === "task").map((r) => r.itemId);
      const projectIds = rows.filter((r) => r.kind === "project").map((r) => r.itemId);
      const docIds = rows.filter((r) => r.kind === "document").map((r) => r.itemId);

      const [taskTitles, projectTitles, docTitles] = await Promise.all([
        taskIds.length > 0
          ? db
              .select({ id: tasks.id, title: tasks.title, shortId: tasks.shortId })
              .from(tasks)
              .where(inArray(tasks.id, taskIds))
          : Promise.resolve([] as Array<{ id: string; title: string; shortId: string | null }>),
        projectIds.length > 0
          ? db
              .select({ id: projectNodes.id, name: projectNodes.name })
              .from(projectNodes)
              .where(inArray(projectNodes.id, projectIds))
          : Promise.resolve([] as Array<{ id: string; name: string }>),
        docIds.length > 0
          ? db
              .select({ id: documents.id, title: documents.title })
              .from(documents)
              .where(inArray(documents.id, docIds))
          : Promise.resolve([] as Array<{ id: string; title: string }>),
      ]);

      const tMap = new Map(taskTitles.map((t) => [t.id, t]));
      const pMap = new Map(projectTitles.map((p) => [p.id, p]));
      const dMap = new Map(docTitles.map((d) => [d.id, d]));

      return rows.map((r): ResolvedPin => {
        if (r.kind === "task") {
          const found = tMap.get(r.itemId);
          return {
            id: r.id,
            kind: "task",
            itemId: r.itemId,
            sortOrder: r.sortOrder,
            title: found
              ? found.shortId
                ? `${found.shortId} · ${found.title}`
                : found.title
              : "Task no longer exists",
            href: `/tasks/${r.itemId}`,
            exists: !!found,
            pinnedAt: r.pinnedAt,
          };
        }
        if (r.kind === "project") {
          const found = pMap.get(r.itemId);
          return {
            id: r.id,
            kind: "project",
            itemId: r.itemId,
            sortOrder: r.sortOrder,
            title: found?.name ?? "Project no longer exists",
            href: `/projects/${r.itemId}`,
            exists: !!found,
            pinnedAt: r.pinnedAt,
          };
        }
        const found = dMap.get(r.itemId);
        return {
          id: r.id,
          kind: "document",
          itemId: r.itemId,
          sortOrder: r.sortOrder,
          title: found?.title ?? "Document no longer exists",
          href: `/documents`,
          exists: !!found,
          pinnedAt: r.pinnedAt,
        };
      });
    },
    [PROFILE_CACHE_TAGS.pinnedItems(employeeId)],
    { tags: [PROFILE_CACHE_TAGS.pinnedItems(employeeId)] },
  )();
}

/** Append a pin at the end of the user's shelf. Idempotent. */
export async function appendPin(
  employeeId: string,
  kind: PinKind,
  itemId: string,
): Promise<void> {
  const [maxRow] = await db
    .select({ m: sql<number | null>`max(${pinnedItems.sortOrder})` })
    .from(pinnedItems)
    .where(eq(pinnedItems.employeeId, employeeId));
  const next = (maxRow?.m ?? -1) + 1;
  await db
    .insert(pinnedItems)
    .values({ employeeId, kind, itemId, sortOrder: next })
    .onConflictDoNothing();
}

export async function removePin(
  employeeId: string,
  pinId: string,
): Promise<void> {
  await db
    .delete(pinnedItems)
    .where(
      and(
        eq(pinnedItems.id, pinId),
        eq(pinnedItems.employeeId, employeeId),
      ),
    );
}

/** Replace the entire shelf order. Caller computes the new order. */
export async function reorderPins(
  employeeId: string,
  orderedPinIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedPinIds.length; i++) {
      await tx
        .update(pinnedItems)
        .set({ sortOrder: i })
        .where(
          and(
            eq(pinnedItems.id, orderedPinIds[i]!),
            eq(pinnedItems.employeeId, employeeId),
          ),
        );
    }
  });
}
