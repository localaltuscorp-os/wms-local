import "server-only";

import { getObject } from "@/lib/storage/objects";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getTemplateOverride } from "@/lib/queries/template-files";
import { XLSX_CONTENT_TYPE, templateDef } from "./registry";
import { TEMPLATE_KEYS } from "./keys";
import { buildTasksTemplate } from "./tasks";
import { buildGoalsTemplate } from "./goals";
import { buildAccountsTaskListTemplate } from "./accounts-task-list";
import { buildWeeklyGoalsTemplate } from "./weekly-goals";
import { buildProjectsTemplate, projectsTemplateFileName } from "./projects";

/**
 * Resolve a template's bytes: the administrator's uploaded replacement if one
 * exists, else the built-in. This is the single seam every download surface in
 * the application shares — the per-module route, the generic
 * /api/templates/[key] door, and Upload Master's own download button — so
 * "replace the template" applies sitewide the moment a row is written.
 */
export interface ResolvedTemplate {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

/** What a caller may vary about the BUILT-IN (a replaced file ignores these). */
export interface TemplateOptions {
  /** Goals boards: the level the workbook is pre-scoped to. */
  level?: string | null;
  /** Goals boards: the period bucket the built-in is titled for. */
  periodKey?: string | null;
  /** Project Plan: which plan kind's column set to build. */
  kind?: string | null;
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
 * The built-in for a registry key, or null when the key is unknown.
 *
 * A template whose built-in varies by parameter (Goals by level, Projects by
 * kind) builds the requested variant; a replaced file is served for every
 * variant, because the key — not the parameter — is what an administrator
 * replaced.
 */
export async function buildTemplate(
  key: string,
  opts: TemplateOptions = {},
): Promise<ResolvedTemplate | null> {
  const def = templateDef(key);
  if (!def) return null;

  switch (key) {
    case TEMPLATE_KEYS.tasks:
      return {
        buffer: await buildTasksTemplate(),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };

    case TEMPLATE_KEYS.goals: {
      const built = await buildGoalsTemplate({
        level: opts.level ?? "",
        periodKey: opts.periodKey ?? "",
      });
      return { buffer: built.buffer, contentType: XLSX_CONTENT_TYPE, fileName: built.fileName };
    }

    case TEMPLATE_KEYS.weeklyGoals:
      return {
        buffer: await buildWeeklyGoalsTemplate(),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };

    case TEMPLATE_KEYS.monthlyGoals:
    case TEMPLATE_KEYS.quarterlyGoals:
    case TEMPLATE_KEYS.yearlyGoals: {
      const built = await buildGoalsTemplate({
        level: levelOfGoalsKey(key),
        periodKey: opts.periodKey ?? "",
      });
      return { buffer: built.buffer, contentType: XLSX_CONTENT_TYPE, fileName: def.fileName };
    }

    case TEMPLATE_KEYS.projects: {
      const kind = opts.kind ?? "project";
      return {
        buffer: await buildProjectsTemplate(kind),
        contentType: XLSX_CONTENT_TYPE,
        fileName: projectsTemplateFileName(kind),
      };
    }

    case TEMPLATE_KEYS.accountsTaskList:
      return {
        buffer: buildAccountsTaskListTemplate(),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };

    default:
      return null;
  }
}

/** The Goals level each level-specific key builds its built-in for. */
function levelOfGoalsKey(key: string): string {
  switch (key) {
    case TEMPLATE_KEYS.monthlyGoals:
      return "month";
    case TEMPLATE_KEYS.quarterlyGoals:
      return "quarter";
    case TEMPLATE_KEYS.yearlyGoals:
      return "year";
    default:
      return "";
  }
}
