import "server-only";
import { requireUser } from "@/lib/auth/current";
import { loadManageablePeople } from "@/lib/queries/compliance-board";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { buildComplianceTemplate } from "./bulk-template";
import type { ComplianceKind } from "./schedule";
import { requiredFieldsForTemplate } from "@/lib/templates/field-config";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";

/**
 * GET /dcc/wcc/template.xlsx and /dcc/mcc/template.xlsx — the bulk-upload
 * workbook for the signed-in viewer: its Employee list is exactly the people
 * they may add compliances for, so the sheet cannot offer someone the upload
 * would then refuse.
 */
export async function complianceTemplateResponse(kind: ComplianceKind): Promise<Response> {
  const me = await requireUser();
  const [people, subjects] = await Promise.all([
    loadManageablePeople(me),
    listActiveSubjectNames(),
  ]);
  const key = kind === "wcc" ? TEMPLATE_KEYS.wcc : TEMPLATE_KEYS.mcc;
  const required = new Set(await requiredFieldsForTemplate(key, "default"));
  const buffer = await buildComplianceTemplate({ kind, people, subjects, required });
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Altus-${kind.toUpperCase()}-Bulk-Upload-Template.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
