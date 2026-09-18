import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { canUnlockAccounts, MAX_FAILED_ATTEMPTS } from "@/lib/auth/unlock-permission";
import { listLockedAccounts } from "@/lib/auth/account-lockout";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { AccountLocksScreen } from "@/components/auth/account-locks-screen";

export const dynamic = "force-dynamic";

/**
 * Who is locked out, and the button that releases them.
 *
 * NOT under /admin on purpose: that area redirects anyone without `is_admin`,
 * and Jeevan — one of the four the requirement names — is not an admin. The
 * gate here is the unlocker list itself, nothing else.
 *
 * `notFound()` rather than a redirect for everyone else: a page that says
 * "forbidden" confirms the page exists, and this one has no reason to.
 */
export default async function AccountLocksPage() {
  const me = await requireUser();
  if (!canUnlockAccounts(me.email)) notFound();

  const locked = await listLockedAccounts();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="narrow" style={{ maxWidth: "900px" }}>
        <AccountLocksScreen
          maxAttempts={MAX_FAILED_ATTEMPTS}
          rows={locked.map((r) => ({
            email: r.email,
            employeeName: r.employeeName,
            failedCount: r.failedCount,
            lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
            lastFailedAt: r.lastFailedAt ? r.lastFailedAt.toISOString() : null,
          }))}
        />
      </PageShell>
    </>
  );
}
