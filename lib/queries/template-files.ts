import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { templateFiles } from "@/db/schema";
import { TEMPLATE_REGISTRY } from "@/lib/templates/registry";

/** The override record for one template key, or null when it is still built-in. */
export interface TemplateOverride {
  storagePath: string;
  contentType: string;
  fileName: string;
  fileSize: number;
}

export async function getTemplateOverride(key: string): Promise<TemplateOverride | null> {
  const [row] = await db
    .select({
      storagePath: templateFiles.storagePath,
      contentType: templateFiles.contentType,
      fileName: templateFiles.fileName,
      fileSize: templateFiles.fileSize,
    })
    .from(templateFiles)
    .where(eq(templateFiles.key, key))
    .limit(1);
  if (!row) return null;
  return {
    storagePath: row.storagePath,
    contentType: row.contentType,
    fileName: row.fileName,
    fileSize: row.fileSize,
  };
}

/** One Upload Master row — a registry entry merged with its override, if any. */
export interface TemplateMasterRow {
  key: string;
  name: string;
  fileName: string;
  lastEdited: Date | null;
  overridden: boolean;
  fileSize: number | null;
}

/**
 * The Upload Master list: every template in the registry, with its override
 * metadata merged in. `lastEdited` is null (and `overridden` false) for a
 * template nobody has replaced.
 */
export async function listTemplateFiles(): Promise<TemplateMasterRow[]> {
  const overrides = await db
    .select({
      key: templateFiles.key,
      updatedAt: templateFiles.updatedAt,
      fileSize: templateFiles.fileSize,
    })
    .from(templateFiles);

  const byKey = new Map(overrides.map((o) => [o.key, o]));

  return TEMPLATE_REGISTRY.map((t) => {
    const ov = byKey.get(t.key);
    return {
      key: t.key,
      name: t.name,
      fileName: t.fileName,
      lastEdited: ov ? ov.updatedAt : null,
      overridden: Boolean(ov),
      fileSize: ov ? ov.fileSize : null,
    };
  });
}
