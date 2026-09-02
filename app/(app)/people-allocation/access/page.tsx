import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { listAccessActivity, listAllParticipants } from "@/lib/queries/people-allocation";
import { canAccessAdminPanel, canEditPerson } from "@/lib/hh/access";
import { withRetry } from "@/lib/db/with-timeout";
import { AccessPanel } from "@/components/people-allocation/access-panel";

/**
 * HAND-HOLDING › ADMIN PANEL — the Access / Permissions surface and the full
 * Access Activity log.
 *
 * WHO: Manan Vasa and the Accountant (Accounts department) — and nobody else.
 * Narrower than every other rule in the room, so it has its own predicate
 * rather than borrowing `canAddPerson`. The rail hides the entry for everyone
 * else, but the gate that MATTERS is here: a nav that omits a link is a
 * courtesy, not a permission, and the URL is guessable.
 *
 * notFound() rather than a "denied" page, so the route does not confirm its own
 * existence to someone who may not have it.
 *
 * WHAT THEY MAY DO once inside is a second question, answered by canEditPerson:
 * HR reads and adds; Admin and Ruchita also edit and delete. That split is the
 * panel's own (it disables Save and the row bins), so this page only has to
 * hand it the answer.
 */
export const dynamic = "force-dynamic";

export default async function AccessPanelPage() {
  const me = await requireUser();
  if (!(await canAccessAdminPanel(me))) notFound();

  // Same timeout/retry budget the room's other pages use: a bounced pooled
  // connection must fail fast rather than hang the page on its skeleton.
  const budget = { timeoutMs: [6000, 12000], attempts: 2 };
  const [activity, participants] = await Promise.all([
    withRetry(() => listAccessActivity(), { ...budget, label: "hh.accessPanel" }),
    withRetry(() => listAllParticipants(), { ...budget, label: "hh.bulkAddRoster" }),
  ]);

  return (
    <PageShell width="wide">
      <AccessPanel canEdit={canEditPerson(me)} activity={activity} participants={participants} />
    </PageShell>
  );
}
