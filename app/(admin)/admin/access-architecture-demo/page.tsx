import { Boxes } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { AccessArchitectureDemo } from "@/components/admin/access-architecture-demo";

export const dynamic = "force-dynamic";

export default async function AccessArchitectureDemoPage() {
  await requireAdmin();

  return (
    <AdminSection
      title="Module ownership"
      subtitle="Live concept demo for assigning a Head, replacement Associate, and technical Developers at module and page level."
      icon={Boxes}
      stats={[
        { label: "Demo modules", value: 4 },
        { label: "Model", value: "Module + page" },
      ]}
    >
      <AccessArchitectureDemo />
    </AdminSection>
  );
}
