import { requireAccountsAccess } from "@/lib/accounts/access";
import { templateResponse } from "@/lib/templates/download";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const dynamic = "force-dynamic";

/**
 * GET /accounts/task-list/template
 *
 * The Accounts Task List bulk-import workbook. Kept as a stable URL for the
 * Task List dialog; the bytes come from the same call every other download door
 * makes, so Upload Master's replacement applies here too.
 */
export async function GET(request: Request): Promise<Response> {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  await requireAccountsAccess();
  return templateResponse(TEMPLATE_KEYS.accountsTaskList);
}
