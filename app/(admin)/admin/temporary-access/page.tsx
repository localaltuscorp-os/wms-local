import { redirect } from "next/navigation";
import type { Route } from "next";
import { KeyRound } from "lucide-react";
import { requireUser, getSignedInEmployee } from "@/lib/auth/current";
import {
  canOpenDelegatedAccess,
  delegationCandidates,
} from "@/lib/auth/delegation-permission";
import { requireModuleView } from "@/lib/permissions/resolve";
import {
  listDelegatedGrants,
  listDelegatedAccessEvents,
} from "@/lib/queries/delegated-access";
import { AdminSection } from "@/components/admin/ui/section-shell";
import {
  TemporaryAccessPanel,
  type EventView,
  type GrantView,
} from "@/components/admin/temporary-access-panel";

/**
 * ADMIN › TEMPORARY ACCESS.
 *
 * ── WHY THE GATE IS THE ORG CHART AND NOT `isAdmin` ────────────────────────
 * The brief says a MANAGER grants this, and that ordinary employees may not
 * unless the existing role system authorises them. `canOpenDelegatedAccess`
 * derives that from `employees.manager_id` — you can open this screen because
 * people report to you, or because you hold the `delegated_access.grant_any`
 * capability. An admin with no reports has nobody to grant over and is bounced,
 * which is the honest answer rather than an empty form.
 *
 * The admin LAYOUT still applies on top of this (the whole `/admin` tree is
 * admin-only), so in practice a viewer is both. The screen's own gate is stated
 * in terms of the hierarchy because that is the rule the brief names, and
 * because it is the rule the grant action re-checks.
 *
 * ── THE VIEWER IS THE REAL SIGNED-IN PERSON ────────────────────────────────
 * Resolved with `getSignedInEmployee()`, not `getCurrentEmployee()`. Somebody
 * already inside a delegated session must not see the pickers scoped to the
 * borrowed account's team — and must not be able to chain a further grant from
 * it. The actions apply the same rule.
 */
export const dynamic = "force-dynamic";

export default async function TemporaryAccessPage() {
  await requireUser();
  const me = await getSignedInEmployee();
  if (!me) redirect("/login" as Route);

  await requireModuleView("admin.temporary-access");

  const canGrant = await canOpenDelegatedAccess(me);
  if (!canGrant) redirect("/admin" as Route);

  const [{ targets, delegates }, grants, events] = await Promise.all([
    delegationCandidates(me),
    listDelegatedGrants(50),
    listDelegatedAccessEvents(200),
  ]);

  const liveCount = grants.filter((g) => g.state === "live").length;

  // Dates are serialised to ISO strings at the boundary. The panel is a client
  // component and renders them with `toLocaleString()`, so it needs a value that
  // survives the RSC payload without the server and browser disagreeing about
  // what a Date is.
  const grantViews: GrantView[] = grants.map((g) => ({
    id: g.id,
    targetName: g.targetName,
    targetEmail: g.targetEmail,
    delegateName: g.delegateName,
    delegateEmail: g.delegateEmail,
    grantedByName: g.grantedByName,
    revokedByName: g.revokedByName,
    reason: g.reason,
    durationMinutes: g.durationMinutes,
    startsAt: g.startsAt.toISOString(),
    expiresAt: g.expiresAt.toISOString(),
    revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
    firstUsedAt: g.firstUsedAt ? g.firstUsedAt.toISOString() : null,
    lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
    useCount: g.useCount,
    state: g.state,
  }));

  const eventViews: EventView[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    detail: e.detail,
    occurredAt: e.occurredAt.toISOString(),
    targetName: e.targetName,
    delegateName: e.delegateName,
    actorName: e.actorName,
  }));

  return (
    <AdminSection
      eyebrow="Admin · Access"
      title="Temporary access"
      subtitle="Let someone act as another employee's account for a limited time — for testing, without sharing a password. The employee's own login is untouched, and every grant, session and refusal is recorded."
      icon={KeyRound}
      stats={[
        { label: "Live", value: liveCount, tone: liveCount > 0 ? "amber" : undefined },
        { label: "Grants", value: grants.length },
        { label: "Audit entries", value: events.length },
      ]}
    >
      <TemporaryAccessPanel
        targets={targets}
        delegates={delegates}
        grants={grantViews}
        events={eventViews}
        canGrant={canGrant}
      />
    </AdminSection>
  );
}
