import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { getNodeContext, listNodeActions } from "@/lib/queries/projects";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const KIND_LABEL: Record<string, string> = {
  project: "Project",
  milestone: "Milestone",
  result: "Result",
  action: "Action",
  sub_action: "Sub-Action",
};

export default async function ProjectNodePage({ params }: PageProps) {
  const { id } = await params;
  await requireUser();
  const ctx = await getNodeContext(id);
  if (!ctx) notFound();
  const [actions, statusDisplay] = await Promise.all([
    listNodeActions(ctx.descendantIds),
    getStatusDisplayMap(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <Link
          href={"/projects" as Route}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong mb-5"
        >
          <ArrowLeft size={16} strokeWidth={2.2} />
          All projects
        </Link>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ink-subtle">
          {ctx.path.length > 0 ? ctx.path.join(" / ") + " · " : ""}
          {KIND_LABEL[ctx.node.kind]}
        </div>
        <h1 className="text-display-lg text-ink-strong mt-1">{ctx.node.name}</h1>
        <p className="text-body-lg text-ink-subtle mt-1">
          {actions.length} {actions.length === 1 ? "task" : "tasks"} linked
          {ctx.node.kind !== "sub_action" ? " (incl. sub-items)" : ""}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {actions.length === 0 ? (
            <p className="text-[14px] text-ink-subtle py-8 text-center">
              No tasks linked yet. Connect a task from its form using the Project
              picker.
            </p>
          ) : (
            actions.map((a) => {
              const sd = statusDisplay[a.status];
              return (
                <Link
                  key={a.id}
                  href={`/tasks/${a.id}/focus` as Route}
                  className="rounded-chip bg-white border border-hairline px-4 py-3 hover:shadow-md transition-shadow flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-ink-strong truncate">
                      {a.description || a.title}
                    </span>
                    {a.doerName && (
                      <span className="text-[12px] text-ink-subtle">{a.doerName}</span>
                    )}
                  </span>
                  <span
                    className="shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                    style={{
                      background: `var(--color-${sd.color}-bg)`,
                      color: `var(--color-${sd.color}-deep)`,
                    }}
                  >
                    {sd.label}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </main>
      <DashboardFooter />
    </>
  );
}
