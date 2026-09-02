import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { AdminShell } from "@/components/admin/admin-shell";

// Never cache the admin shell — it is per-user (name/email/avatar) and must be
// resolved fresh on every request so one user's render can never be served to
// another.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Admins only. Non-admins (doers) are bounced cleanly to the hub instead of
  // hitting a throwing 403 boundary that leaves them stuck with no way out.
  const me = await requireUser();
  if (!me.isAdmin) {
    redirect("/hub");
  }
  // Auto sign-out on idle was removed — sessions persist like a normal app.
  return (
    <>
      <AdminShell
        adminName={me.name}
        adminEmail={me.email}
        avatarUrl={me.avatarUrl}
        canSeeAccounts={isSuperAdmin(me.email)}
      >
        {children}
      </AdminShell>
    </>
  );
}
