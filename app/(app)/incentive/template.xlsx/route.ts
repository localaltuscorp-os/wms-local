import { apiViewDenial } from "@/lib/permissions/api-guard";
import { requireAdmin } from "@/lib/auth/current";
import { templateResponse } from "@/lib/templates/download";
import { TEMPLATE_KEYS } from "@/lib/templates/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The New Incentive Request bulk-upload template.
 *
 * TWO GUARDS, AND THEY ARE DIFFERENT QUESTIONS. `requireAdmin` asks whether the
 * caller may write the ledger at all — this file hands out the roster and the
 * product list to be filled in. `apiViewDenial` asks whether the permission
 * matrix has switched the INCENTIVE module off for them, and it is the guard
 * every other handler in the application carries: a route handler renders no
 * layout, so `requirePathView` never runs for it, and without this a revoked
 * module keeps answering its endpoints. `requireAdmin` alone would let a
 * master-admin-revoked admin download it.
 */
export async function GET(request: Request): Promise<Response> {
  const denial = await apiViewDenial(request);
  if (denial) return denial;
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  return templateResponse(TEMPLATE_KEYS.incentiveEntries);
}
