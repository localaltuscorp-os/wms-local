import { notFound } from "next/navigation";
import { asc, eq, ne, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { listLockedAccounts } from "@/lib/auth/account-lockout";
import { listRoleHolders, mayGrantSecurityRoles, mayUnlockAccounts } from "@/lib/auth/security-roles";
import { PageShell } from "@/components/layout/page-shell";
import { AccountLocksScreen } from "@/components/auth/account-locks-screen";

export const dynamic = "force-dynamic";

/**
 * Who is locked out, the button that releases them, and who holds the role.
 *
 * NOT under /admin on purpose: that area redirects anyone without `is_admin`,
 * and Jeevan — one of the four the requirement names — is not an admin. The gate
 * here is the `account_unlock` role itself (lib/auth/security-roles.ts), so the
 * people who can use this page are exactly the people who can act on it.
 *
 * `notFound()` rather than a redirect for everyone else: a page that says
 * "forbidden" confirms the page exists, and this one has no reason to.
 */
export default async function AccountLocksPage() {
  const me = await requireUser();
  if (!(await mayUnlockAccounts(me))) notFound();

  const canGrant = mayGrantSecurityRoles(me);
  const [locked, holders, roster] = await Promise.all([
    listLockedAccounts(),
    listRoleHolders("account_unlock"),
    canGrant
      ? db
          .select({ id: employees.id, name: employees.name, email: employees.email })
          .from(employees)
          .where(and(eq(employees.isActive, true), ne(employees.accountType, "candidate")))
          .orderBy(asc(employees.name))
      : Promise.resolve([]),
  ]);

  const holderIds = new Set(holders.map((h) => h.employeeId));

  return (
    <PageShell width="narrow" style={{ maxWidth: "900px" }}>
      <AccountLocksScreen
        currentEmployeeId={me.id}
        canGrant={canGrant}
        rows={locked.map((r) => ({
          email: r.email,
          employeeName: r.employeeName,
          failedCount: r.failedCount,
          lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
          lastFailedAt: r.lastFailedAt ? r.lastFailedAt.toISOString() : null,
        }))}
        holders={holders}
        // Only people who do not already hold it — a picker offering somebody
        // who is already listed above invites a click that does nothing.
        grantable={roster.filter((p) => p.id !== me.id && !holderIds.has(p.id))}
      />
    </PageShell>
  );
}
