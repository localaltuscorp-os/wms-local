import { requireAccountsAccess } from "@/lib/accounts/access";
import { listCcCards, listCcMonths } from "@/lib/queries/accounts-cc";
import { fyStartYearFor } from "@/lib/accounts/cc";
import { ccMasterFilename, renderCcMasterXlsx } from "@/lib/exports/cc-master-xlsx";

/**
 * GET /accounts/cc-tracker/export?fy=YYYY  (downloads an .xlsx)
 *
 * The whole Credit Cards Master for one financial year as a spreadsheet that
 * mirrors the source sheet: 9 static card columns, then 12 monthly blocks of 9
 * fields (Apr→Mar). A safety-blanket backup now that the app is the source of
 * truth.
 *
 * The workbook itself is built in lib/exports/cc-master-xlsx.ts — moved there so
 * the frozen panes can be unit-tested. They previously did not work at all: the
 * old SheetJS `ws["!freeze"]` was a silent no-op, and on a 117-column sheet that
 * left every exported file unreadable in the middle. See that module.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAccountsAccess();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const curFy = fyStartYearFor(now.getFullYear(), now.getMonth() + 1);
  const rawFy = parseInt(String(url.searchParams.get("fy") ?? ""), 10);
  const fy = Number.isFinite(rawFy) && rawFy >= 2000 && rawFy <= 2100 ? rawFy : curFy;

  const [cards, months] = await Promise.all([listCcCards(fy), listCcMonths(fy)]);
  const buffer = await renderCcMasterXlsx({ fy, cards, months });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ccMasterFilename(fy)}"`,
      "Cache-Control": "no-store",
    },
  });
}
