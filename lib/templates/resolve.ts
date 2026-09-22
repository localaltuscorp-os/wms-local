import "server-only";

import { getObject } from "@/lib/storage/objects";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getTemplateOverride } from "@/lib/queries/template-files";
import { XLSX_CONTENT_TYPE } from "./registry";
import { buildTasksTemplate } from "./tasks";
import { buildGoalsTemplate } from "./goals";
import { buildAccountsTaskListTemplate } from "./accounts-task-list";

/**
 * Resolve a template's bytes: the admin's uploaded override if one exists, else
 * the built-in. This is the single seam the download routes and the Upload
 * Master download route share, so "replace the template" applies sitewide the
 * moment a row is written.
 */
export interface ResolvedTemplate {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export async function resolveTemplate(
  key: string,
  buildBuiltIn: () => Promise<ResolvedTemplate>,
): Promise<ResolvedTemplate> {
  const ov = await getTemplateOverride(key);
  if (ov) {
    const bytes = await getObject(DOCUMENTS_BUCKET, ov.storagePath);
    if (bytes) {
      return { buffer: bytes, contentType: ov.contentType, fileName: ov.fileName };
    }
    // The override row exists but its object is gone — fall through to the
    // built-in rather than 500, and let the admin re-upload.
  }
  return buildBuiltIn();
}

/**
 * The built-in for a registry key, or null when the key is unknown. Used by the
 * Upload Master download route, which must serve built-ins without module access.
 */
export async function buildTemplate(key: string): Promise<ResolvedTemplate | null> {
  switch (key) {
    case "tasks":
      return {
        buffer: await buildTasksTemplate(),
        contentType: XLSX_CONTENT_TYPE,
        fileName: "Altus-Tasks-Template.xlsx",
      };
    case "goals": {
      const { buffer, fileName } = await buildGoalsTemplate();
      return { buffer, contentType: XLSX_CONTENT_TYPE, fileName };
    }
    case "accounts-task-list":
      return {
        buffer: buildAccountsTaskListTemplate(),
        contentType: XLSX_CONTENT_TYPE,
        fileName: "Accounts-Task-List-Template.xlsx",
      };
    default:
      return null;
  }
}
