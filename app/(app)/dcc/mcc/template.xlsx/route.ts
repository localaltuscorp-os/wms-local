import { complianceTemplateResponse } from "@/lib/compliance/bulk-template-response";
import { apiViewDenial } from "@/lib/permissions/api-guard";

/** GET /dcc/mcc/template.xlsx — the MCC bulk-upload workbook (lib/compliance/bulk-template.ts). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking MCC hides its screen while this
  // endpoint keeps handing out the workbook. First in the body, so a denied
  // caller is refused before the template is built. Same guard, same position,
  // as /goals/template.xlsx.
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  return complianceTemplateResponse("mcc");
}
