import "server-only";
import { requireUser } from "@/lib/auth/current";
import { loadManageablePeople } from "@/lib/queries/compliance-board";
import { buildComplianceTemplate } from "./bulk-template";
import type { ComplianceKind } from "./schedule";

/**
 * GET /dcc/wcc/template.xlsx and /dcc/mcc/template.xlsx — the bulk-upload
 * workbook for the signed-in viewer: its Employee list is exactly the people
 * they may add compliances for, so the sheet cannot offer someone the upload
 * would then refuse.
 */
export async function complianceTemplateResponse(kind: ComplianceKind): Promise<Response> {
  const me = await requireUser();
  const people = await loadManageablePeople(me);
  const buffer = await buildComplianceTemplate({ kind, people });
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Altus-${kind.toUpperCase()}-Bulk-Upload-Template.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
