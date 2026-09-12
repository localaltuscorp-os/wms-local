import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { OPERATIONS_AREAS, OPERATIONS_LANDING_AREA } from "@/lib/operations/nav";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS front door — now a FORWARDER, not a page.
 *
 * ── WHY THE CARD DECK WENT (2026-09-12) ──────────────────────────────────
 * Entering the room used to land on a deck of area cards. The account holder's
 * call: it is a menu that repeats the sidebar, and every visit cost a click
 * that told you nothing the rail was not already showing. The room now opens
 * straight onto its first area.
 *
 * ── WHY A REDIRECT AND NOT A DELETED ROUTE ───────────────────────────────
 * `/operations` is still referenced in three places that outlive this page:
 * WORKSPACE_LANDING (where the hub card and the `aw` cookie send you), the
 * permission catalog's `operations.home` node — a PERSISTED grant key, which is
 * why it is not deleted either — and whatever bookmarks people have. A 404
 * would break all three. Forwarding keeps every one of them working and leaves
 * exactly one place that decides where the room opens: this file.
 *
 * ── THE TARGET IS NAMED, NOT POSITIONAL ──────────────────────────────────
 * This was `OPERATIONS_AREAS[0]`, which was fine while the rail was ordered by
 * importance and Hand-holding led it. The rail went alphabetical on 2026-09-12
 * and Broadcasts became the first entry — so a purely cosmetic re-sort would
 * have moved where the room opens, with nothing on screen to explain it.
 *
 * Hand-holding is the landing because it was asked for, not because of where
 * the letter H falls. `OPERATIONS_LANDING_AREA` says so in one place, and this
 * still reads the rail for the href, so a moved route cannot strand it.
 */
export default async function OperationsPage() {
  await requireWorkspace("operations");
  const landing =
    OPERATIONS_AREAS.find((a) => a.id === OPERATIONS_LANDING_AREA) ?? OPERATIONS_AREAS[0]!;
  redirect(landing.href);
}
