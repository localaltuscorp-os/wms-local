import { NextResponse } from "next/server";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { resolveTemplate } from "@/lib/templates/resolve";
import { XLSX_CONTENT_TYPE } from "@/lib/templates/registry";
import { buildAccountsTaskListTemplate } from "@/lib/templates/accounts-task-list";

export const dynamic = "force-dynamic";

/**
 * GET /accounts/task-list/template
 *
 * The Accounts Task List bulk-import workbook. Serves the admin's uploaded
 * replacement if one exists (Upload Master), else the built-in — see
 * lib/templates/accounts-task-list.ts.
 */
export async function GET() {
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
