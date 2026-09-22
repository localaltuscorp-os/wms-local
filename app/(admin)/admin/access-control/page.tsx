import { redirect } from "next/navigation";
import type { Route } from "next";
import { ShieldCheck } from "lucide-react";
import { requireAdmin, getSignedInEmployee } from "@/lib/auth/current";
import { isMasterAdmin } from "@/lib/security/capability-grants";
import { requireModuleView, canEditModule } from "@/lib/permissions/resolve";
import { listVisibilityGrants, type VisibilityGrantRow } from "@/lib/queries/visibility-grants";
import { listGrantableEmployees } from "@/lib/access/visibility";
import { AdminSection } from "@/components/admin/ui/section-shell";
import {
  AccessControlPanel,
  type GrantView,
  type PersonOption,
} from "@/components/admin/access-control/panel";

/**
 * ADMIN PANEL → ACCESS CONTROL.
 *
 * Elevated visibility, in two domains: whose WORK a person may read (WMS Tasks)
 * and whose INCENTIVE EARNINGS they may read. Everything below the screen is
 * enforced server-side — lib/tasks/scope.ts and lib/incentive/analytics/scope.ts
 * both resolve through the one rule in lib/access/visibility.ts — and this page
 * writes the rows that rule reads.
 *
 * ── WHO SEES IT, AND WHO MAY CHANGE IT ────────────────────────────────────
 * The screen is an admin module like any other (admin layout + the permission
 * matrix). WRITING a grant is narrower: a master admin, resolved from the
 * capability registry rather than from `isAdmin`, because if any admin could
 * widen their own view then "an admin does not automatically see the whole
 * organisation" would be a sentence rather than a rule. `canGrant` is resolved
 * here for the UI; the actions re-check it on the server.
 */
export const dynamic = "force-dynamic";

function toViews(rows: VisibilityGrantRow[]): GrantView[] {
  return rows.map((g) => ({
    id: g.id,
    employeeId: g.employeeId,
    employeeName: g.employeeName,
    employeeEmail: g.employeeEmail,
    targetId: g.targetId,
    targetName: g.targetName,
    note: g.note,
    grantedByName: g.grantedByName,
    createdAt: g.createdAt.toISOString(),
  }));
}

export default async function AccessControlPage() {
  await requireAdmin();
  await requireModuleView("admin.access-control");

  const me = await getSignedInEmployee();
  if (!me) redirect("/login" as Route);

  const [taskGrants, incentiveGrants, roster, matrixEdit] = await Promise.all([
    listVisibilityGrants("tasks"),
    listVisibilityGrants("incentive"),
    listGrantableEmployees(),
    canEditModule("admin.access-control"),
  ]);

  const people: PersonOption[] = roster.map((r) => ({ id: r.id, name: r.name }));
  const canGrant = matrixEdit && (await isMasterAdmin(me.email));

  const all = [...taskGrants, ...incentiveGrants];

  return (
    <AdminSection
      title="Access Control"
      subtitle="Who may read beyond their own reporting line. Everyone sees their own records and the people below them — a grant here is how somebody is given more."
      icon={ShieldCheck}
      stats={[
        { label: "Grants", value: all.length },
        { label: "Organisation-wide", value: all.filter((g) => !g.targetId).length },
      ]}
    >
      <div className="space-y-8">
        <AccessControlPanel
          domain="tasks"
          grants={toViews(taskGrants)}
          people={people}
          canGrant={canGrant}
          viewerName={me.name ?? ""}
        />
        <AccessControlPanel
          domain="incentive"
          grants={toViews(incentiveGrants)}
          people={people}
          canGrant={canGrant}
          viewerName={me.name ?? ""}
        />
      </div>
    </AdminSection>
  );
}
