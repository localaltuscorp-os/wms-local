import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/current";
import { AdminShell } from "@/components/admin/admin-shell";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { IdleTimerClient } from "@/components/auth/idle-timer-client";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireAdmin();
  const settings = await getOrgSettings();
  return (
    <>
      <IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes} />
      <AdminShell
        adminName={me.name}
        adminEmail={me.email}
        avatarUrl={me.avatarUrl}
      >
        {children}
      </AdminShell>
    </>
  );
}
