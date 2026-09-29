import { redirect } from "next/navigation";
import type { Route } from "next";
import { KeyRound } from "lucide-react";
import { requireUser, getSignedInEmployee } from "@/lib/auth/current";
import { canOpenDelegatedAccess, delegationCandidates } from "@/lib/auth/delegation-permission";
import { requireModuleView } from "@/lib/permissions/resolve";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { listScopedAccessGrants } from "@/lib/queries/delegated-access";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { TemporaryAccessPanel } from "@/components/admin/temporary-access-panel";

export const dynamic = "force-dynamic";

export default async function TemporaryAccessPage() {
  await requireUser();
  const me = await getSignedInEmployee();
  if (!me) redirect("/login" as Route);
  await requireModuleView("control-panel.temporary-access");
  if (!(await canOpenDelegatedAccess(me))) redirect("/control-panel/roles" as Route);

  const [{ targets }, grants] = await Promise.all([delegationCandidates(me), listScopedAccessGrants()]);
  const nodes = allPermissionNodes();
  const modules = nodes.filter((node) => node.depth === 1).map((module) => ({
    key: module.key,
    label: module.label,
    options: nodes.filter((node) => node.depth === 2 && node.ancestors[0] === module.key)
      .map((node) => ({ key: node.key, label: node.label })),
  }));

  return (
    <AdminSection eyebrow="Control Panel" title="Temporary access" subtitle="Temporary scope intersects existing access. It never grants roles or capabilities." icon={KeyRound}>
      <TemporaryAccessPanel employees={targets} modules={modules} grants={grants.map((grant) => ({ ...grant, expiresAt: grant.expiresAt.toISOString(), revokedAt: grant.revokedAt?.toISOString() ?? null }))} />
    </AdminSection>
  );
}
