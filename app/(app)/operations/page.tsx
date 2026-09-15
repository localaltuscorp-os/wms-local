import { requireWorkspace } from "@/lib/auth/workspace-access";
import { OperationsHome } from "@/components/operations/operations-home";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS front door — the four-area card deck.
 *
 * Guarded IN THE PAGE, not only by the (app) layout: the layout gate alone is
 * not reliable on prod, which is the same reason every other room's landing
 * re-asserts here.
 *
 * The room itself is OPEN (see canAccessWorkspace) because it holds areas at
 * different access levels — Hand-holding is open to everyone while Monthly
 * Events Master is admin-only. Gating the room on admin would take Hand-holding
 * away from the people who use it; the per-area rules live on the area's own
 * rail items and pages.
 */
export default async function OperationsPage() {
  await requireWorkspace("operations");
  return <OperationsHome />;
}
