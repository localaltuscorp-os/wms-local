import { Eye } from "lucide-react";
import { listControlPanelUsers, effectiveAccessFor } from "@/lib/queries/control-panel";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { EffectiveAccessClient } from "@/components/control-panel/effective-access-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * CONTROL PANEL → EFFECTIVE ACCESS — what a user ACTUALLY has after roles,
 * direct module_permissions overrides and temporary access are all evaluated.
 * The selected person lives in the `?emp=` query so the view is shareable.
 */
export default async function EffectiveAccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const empParam = typeof sp.emp === "string" ? sp.emp : null;

  const users = await listControlPanelUsers();
  const selected = empParam ? users.find((u) => u.id === empParam) ?? null : null;
  const access = empParam ? await effectiveAccessFor(empParam) : null;

  return (
    <AdminSection
      title="Control Panel · Effective Access"
      subtitle="Permanent access from roles and direct permissions, plus temporary access — for one person."
      icon={Eye}
    >
      <EffectiveAccessClient
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        selectedId={selected?.id ?? null}
        selectedName={selected?.name ?? null}
        access={access}
      />
    </AdminSection>
  );
}
