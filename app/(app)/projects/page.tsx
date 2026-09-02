import { DashboardHeader } from "@/components/layout/header";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { listProjectTree } from "@/lib/queries/projects";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { requireUser } from "@/lib/auth/current";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const me = await requireUser();
  const sp = await searchParams;
  const requested = firstString(sp.p);
  const [tree, employees, downline] = await Promise.all([
    listProjectTree(),
    listEmployeeOptions(),
    getDownlineIds(me.id),
  ]);

  // Only an admin OR a manager (≥1 direct/indirect report) may manage project
  // structure; everyone else is a "plain doer" who can only add results/actions.
  const canManage = me.isAdmin || downline.length > 0;

  // Pick the active project: ?p= wins if it resolves; otherwise first project.
  // The workspace's rail uses <Link> with ?p=<id>, so selection survives
  // refresh and is deep-linkable.
  const activeId =
    (requested && tree.some((p) => p.id === requested) ? requested : null) ??
    tree[0]?.id ??
    null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-12 max-md:px-4 pt-10 pb-20">
        <ProjectsWorkspace
          projects={tree}
          activeId={activeId}
          employees={employees}
          canManage={canManage}
        />
      </main>
    </>
  );
}
