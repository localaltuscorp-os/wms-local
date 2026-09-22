import { requireAccountsAccess } from "@/lib/accounts/access";
import { templateResponse } from "@/lib/templates/download";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";

export const dynamic = "force-dynamic";

/**
 * GET /accounts/task-list/template
 *
 * The Accounts Task List bulk-import workbook. Kept as a stable URL for the
 * Task List dialog; the bytes come from the same call every other download door
 * makes, so Upload Master's replacement applies here too.
 */
export async function GET(): Promise<Response> {
  await requireAccountsAccess();
  return templateResponse(TEMPLATE_KEYS.accountsTaskList);
}
