import { DashboardHeader } from "@/components/layout/header";
import { IndexHubBoard } from "@/components/index-hub/index-hub-board";
import { requireUser } from "@/lib/auth/current";
import { canDeleteIndexHub } from "@/lib/index-hub/access";
import { listIndexSections } from "@/lib/queries/index-hub";

export const dynamic = "force-dynamic";

export default async function IndexHubPage() {
  const me = await requireUser();
  const sections = await listIndexSections();

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <IndexHubBoard
        sections={sections}
        isAdmin={me.isAdmin}
        canDelete={canDeleteIndexHub(me.email)}
      />
    </>
  );
}
