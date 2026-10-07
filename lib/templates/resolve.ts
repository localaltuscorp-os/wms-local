import "server-only";

import { getObject } from "@/lib/storage/objects";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getTemplateOverride } from "@/lib/queries/template-files";
import { XLSX_CONTENT_TYPE, templateDef, templateFieldId } from "./registry";
import { TEMPLATE_KEYS } from "./keys";
import { buildTasksTemplate } from "./tasks";
import { buildGoalsTemplate } from "./goals";
import { buildAccountsTaskListTemplate } from "./accounts-task-list";
import { buildWeeklyGoalsTemplate } from "./weekly-goals";
import { buildProjectsTemplate, projectsTemplateFileName } from "./projects";
import { requiredFieldsForTemplate, requiredHeader } from "./field-config";
import { buildComplianceTemplate } from "@/lib/compliance/bulk-template";
import { loadManageablePeople } from "@/lib/queries/compliance-board";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { listActiveProductNames } from "@/lib/queries/products";
import { jdTemplateMatrix } from "@/lib/jd/bulk";
import { checklistTemplateMatrix } from "@/lib/operations/checklist-bulk";
import { buildVendorTemplate } from "./vendors";
import { listActiveVendorCategories } from "@/lib/queries/ops-vendors";
import { OUTSTANDING_TEMPLATE_HEADERS, COLLECTION_TEMPLATE_HEADERS } from "@/lib/exports/outstanding-rich";
import * as XLSX from "xlsx";

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
  /** Contextual schema selected by the caller (for example checklist run/master). */
  variant?: string | null;
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
      {
        const required = new Set(await requiredFieldsForTemplate(key, "default"));
      return {
        buffer: await buildTasksTemplate(required),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };
      }

    case TEMPLATE_KEYS.goals: {
      const built = await buildGoalsTemplate({
        level: opts.level ?? "",
        periodKey: opts.periodKey ?? "",
      });
      return { buffer: built.buffer, contentType: XLSX_CONTENT_TYPE, fileName: built.fileName };
    }

    case TEMPLATE_KEYS.weeklyGoals:
      {
        const required = new Set(await requiredFieldsForTemplate(key, "default"));
      return {
        buffer: await buildWeeklyGoalsTemplate(required),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };
      }

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
      const required = new Set(await requiredFieldsForTemplate(key, String(kind).replace(/-/g, "_")));
      return {
        buffer: await buildProjectsTemplate(kind, required),
        contentType: XLSX_CONTENT_TYPE,
        fileName: projectsTemplateFileName(kind),
      };
    }

    case TEMPLATE_KEYS.accountsTaskList:
      {
        const required = new Set(await requiredFieldsForTemplate(key, opts.variant ?? "task_list"));
      return {
        buffer: buildAccountsTaskListTemplate(required, opts.variant ?? "task_list"),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };
      }

    case TEMPLATE_KEYS.wcc:
    case TEMPLATE_KEYS.mcc: {
      const kind = key === TEMPLATE_KEYS.wcc ? "wcc" : "mcc";
      const me = await requireUser();
      const people = await loadManageablePeople(me);
      const required = new Set(await requiredFieldsForTemplate(key, "default"));
      return { buffer: await buildComplianceTemplate({ kind, people, required }), contentType: XLSX_CONTENT_TYPE, fileName: def.fileName };
    }

    case TEMPLATE_KEYS.incentiveEntries: {
      const { buildIncentiveRequestTemplate } = await import("@/lib/incentive/bulk-request");
      const required = new Set(await requiredFieldsForTemplate(key, "default"));
      return { buffer: await buildIncentiveRequestTemplate(required), contentType: XLSX_CONTENT_TYPE, fileName: def.fileName };
    }

    case TEMPLATE_KEYS.jobDescriptions:
      return matrixTemplate(def.fileName, "Job Descriptions", jdTemplateMatrix(), key, opts.variant ?? "generic");
    case TEMPLATE_KEYS.operationsChecklist:
      return matrixTemplate(def.fileName, "Checklist", checklistTemplateMatrix(opts.variant?.startsWith("master") ? "master" : "run", Boolean(opts.variant?.endsWith("_event"))), key, opts.variant ?? "run");
    case TEMPLATE_KEYS.vendors: {
      const [required, categories] = await Promise.all([
        requiredFieldsForTemplate(key, "default"),
        listActiveVendorCategories(),
      ]);
      return {
        buffer: await buildVendorTemplate(categories.map((category) => category.name), new Set(required)),
        contentType: XLSX_CONTENT_TYPE,
        fileName: def.fileName,
      };
    }
    case TEMPLATE_KEYS.outstanding:
      return headerTemplate(def.fileName, "Outstanding", OUTSTANDING_TEMPLATE_HEADERS.map((label) => ({ id: templateFieldId(label), label })), key, "default");
    case TEMPLATE_KEYS.collections:
      return headerTemplate(def.fileName, "Collection", COLLECTION_TEMPLATE_HEADERS.map((label) => ({ id: templateFieldId(label), label })), key, "default");

    default:
      return null;
  }
}

async function headerTemplate(
  fileName: string,
  sheetName: string,
  fields: readonly { id: string; label: string }[],
  key: string,
  variant: string,
): Promise<ResolvedTemplate> {
  const required = new Set(await requiredFieldsForTemplate(key, variant));
  const ws = XLSX.utils.aoa_to_sheet([fields.map((field) => requiredHeader(field.label, field.id || templateFieldId(field.label), required))]);
  ws["!cols"] = fields.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, contentType: XLSX_CONTENT_TYPE, fileName };
}

async function matrixTemplate(
  fileName: string,
  sheetName: string,
  matrix: string[][],
  key: string,
  variant: string,
): Promise<ResolvedTemplate> {
  const def = templateDef(key)?.variants?.find((item) => item.id === variant);
  const fields = def?.fields ?? [];
  const required = new Set(await requiredFieldsForTemplate(key, variant));
  const header = matrix[0] ?? [];
  const marked = header.map((label, index) => requiredHeader(label, fields[index]?.id ?? label, required));
  const ws = XLSX.utils.aoa_to_sheet([marked, ...matrix.slice(1)]);
  ws["!cols"] = header.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, contentType: XLSX_CONTENT_TYPE, fileName };
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
