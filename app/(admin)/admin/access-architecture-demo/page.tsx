import { Boxes } from "lucide-react";
import { forbiddenError, getSignedInEmployee, requireUser } from "@/lib/auth/current";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { AccessArchitectureDemo } from "@/components/admin/access-architecture-demo";
import { hasDatabaseSuperAdminGrant } from "@/lib/security/super-admin-grants";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { listOwnershipAssignments, listOwnershipPeople } from "@/lib/queries/module-ownership";

export const dynamic = "force-dynamic";

export default async function AccessArchitectureDemoPage() {
  await requireUser();
  const actor = await getSignedInEmployee();
  if (!actor || !(await hasDatabaseSuperAdminGrant(actor.id))) throw forbiddenError();
  const [people, assignments] = await Promise.all([
    listOwnershipPeople(),
    listOwnershipAssignments(),
  ]);
  const nodes = allPermissionNodes().map((node) => ({
    key: node.key,
    label: node.label,
    depth: node.depth,
    ancestors: [...node.ancestors],
    routes: [...(node.routes ?? [])],
  }));

  return (
    <AdminSection
      title="Module ownership"
      subtitle="Assign operational Heads and Associates, plus technical Developers, for every module and page."
      icon={Boxes}
      stats={[
        { label: "Catalogue items", value: nodes.length },
        { label: "Assignments", value: new Set(assignments.map((row) => row.nodeKey)).size },
      ]}
    >
      <AccessArchitectureDemo nodes={nodes} people={people} assignments={assignments} />
    </AdminSection>
  );
}
