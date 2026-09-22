import { NextResponse } from "next/server";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { resolveTemplate } from "@/lib/templates/resolve";
import { XLSX_CONTENT_TYPE } from "@/lib/templates/registry";
import { buildAccountsTaskListTemplate } from "@/lib/templates/accounts-task-list";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const dynamic = "force-dynamic";

/**
 * GET /accounts/task-list/template
 *
 * The Accounts Task List bulk-import workbook. Serves the admin's uploaded
 * replacement if one exists (Upload Master), else the built-in — see
 * lib/templates/accounts-task-list.ts.
 */
export async function GET(request: Request) {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireAccountsAccess();

  const { buffer, contentType, fileName } = await resolveTemplate(
    "accounts-task-list",
    async () => ({
      buffer: buildAccountsTaskListTemplate(),
      contentType: XLSX_CONTENT_TYPE,
      fileName: "Accounts-Task-List-Template.xlsx",
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
