import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { listProjectTree } from "@/lib/queries/projects";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;
  const requested = firstString(sp.p);
  const [tree, employees] = await Promise.all([
    listProjectTree(),
    listEmployeeOptions(),
  ]);

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
        />
      </main>
      <DashboardFooter />
    </>
  );
}
