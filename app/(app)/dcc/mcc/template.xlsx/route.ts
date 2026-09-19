import { complianceTemplateResponse } from "@/lib/compliance/bulk-template-response";

/** GET /dcc/mcc/template.xlsx — the MCC bulk-upload workbook (lib/compliance/bulk-template.ts). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return complianceTemplateResponse("mcc");
}
