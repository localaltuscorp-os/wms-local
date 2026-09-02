import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsItFolders } from "@/db/schema";

export interface ItFolderRow {
  id: string;
  entity: string;
  fy: string | null;
  folderLink: string | null;
  notes: string | null;
  sortOrder: number | null;
}

export async function listItFolders(): Promise<ItFolderRow[]> {
  return db
    .select({
      id: accountsItFolders.id,
      entity: accountsItFolders.entity,
      fy: accountsItFolders.fy,
      folderLink: accountsItFolders.folderLink,
      notes: accountsItFolders.notes,
      sortOrder: accountsItFolders.sortOrder,
    })
    .from(accountsItFolders)
    .where(eq(accountsItFolders.archived, false))
    .orderBy(asc(accountsItFolders.sortOrder), asc(accountsItFolders.entity));
}
