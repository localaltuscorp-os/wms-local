import { complianceTemplateResponse } from "@/lib/compliance/bulk-template-response";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One Employees CC template endpoint; `kind` selects the weekly or monthly workbook. */
export async function GET(request: Request): Promise<Response> {
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  const kind = new URL(request.url).searchParams.get("kind") === "mcc" ? "mcc" : "wcc";
  return complianceTemplateResponse(kind);
}
