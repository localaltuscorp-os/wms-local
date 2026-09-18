import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, getDelegation } from "@/lib/auth/current";
import { canManageTaskRosters } from "@/lib/security/capabilities";
import { isRosterOnlyPath } from "@/components/admin/roster-nav";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { DelegationBanner } from "@/components/auth/delegation-banner";

// Never cache the admin shell — it is per-user (name/email/avatar) and must be
// resolved fresh on every request so one user's render can never be served to
// another.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Admins, plus whoever may change the Subject and Client lists
  // (`task_rosters.manage` — Manan Sir, Jeevan and Rohan, 2026-09-15). Everyone
  // else is bounced cleanly to the hub instead of hitting a throwing 403
  // boundary that leaves them stuck with no way out.
  const me = await requireUser();
  const rosterManager = canManageTaskRosters(me.email);
  if (!me.isAdmin && !rosterManager) {
    redirect("/hub");
  }
  // Not an admin: here for Subjects and Clients ONLY. Any other Admin Panel
  // address — typed, bookmarked or linked — goes back to Subjects. The header is
  // set by the proxy on every request; without it there is no path to judge, and
  // the pages' own guards still apply.
  const rosterOnly = !me.isAdmin;
  if (rosterOnly) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (path && !isRosterOnlyPath(path)) redirect("/admin/subjects");
  }
  // The "acting as" banner, for the same reason the (app) layout carries it: a
  // delegated session must never look like an ordinary one, and the Admin Panel
  // is the last place where it should. (A PRIVILEGED account can never be
  // delegated — see isPrivilegedAccount in lib/auth/delegation-permission.ts —
  // but an ordinary admin can, so this branch is reachable.)
  const delegation = await getDelegation();

  // Auto sign-out on idle was removed — sessions persist like a normal app.
  return (
    <>
      {delegation && (
        <DelegationBanner
          targetName={delegation.target.name}
          delegateName={delegation.delegateName}
          expiresAtIso={delegation.expiresAt.toISOString()}
        />
      )}
      <AdminShell
        adminName={me.name}
        adminEmail={me.email}
        avatarUrl={me.avatarUrl}
        canSeeAccounts={isSuperAdmin(me.email)}
        rosterOnly={rosterOnly}
      >
        {children}
      </AdminShell>
    </>
  );
}
