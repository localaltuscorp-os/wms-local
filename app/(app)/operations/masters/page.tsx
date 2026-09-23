import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Library } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { OPERATIONS_MASTERS, type OperationsMasterTopic } from "@/lib/operations/nav";
import { loadMastersCounts } from "@/lib/queries/operations-masters";

export const dynamic = "force-dynamic";

const TOPICS: OperationsMasterTopic[] = ["Checklist", "Events", "Job Description"];

/**
 * OPERATIONS → MASTERS (account holder, 2026-09-15).
 *
 * Every master the room keeps, grouped by topic, each with what it holds. The
 * rail's Masters section and the tab strip reach each one directly; this page
 * is where you see all of them at once.
 */
export default async function OperationsMastersPage() {
  await requireWorkspace("operations");
  const c = await loadMastersCounts();

  const fmt = (v: number | null, one: string, many: string) =>
    v === null ? `— ${many}` : `${v.toLocaleString("en-IN")} ${v === 1 ? one : many}`;
  const stats: Record<string, string[]> = {
    "/operations/masters/checklist": [
      fmt(c.checklistMasters, "master", "masters"),
      fmt(c.checklistRows, "row", "rows"),
    ],
    "/operations/masters/events": [
      fmt(c.eventCategories, "category", "categories"),
      fmt(c.batchTypes, "batch type", "batch types"),
    ],
    "/operations/masters/jd": [
      fmt(c.positions, "position", "positions"),
      fmt(c.generalJds, "JD task", "JD tasks"),
    ],
    "/operations/masters/person-jd": [
      fmt(c.personalJds, "personal task", "personal tasks"),
      fmt(c.peopleWithPersonalJd, "person", "people"),
    ],
    "/operations/masters/recruitment-jd": [fmt(c.recruitmentJds, "role", "roles")],
  };

  return (
    <PageShell>
      <MastersHeader
        Icon={Library}
        title="Masters"
      />

      <div className="flex flex-col gap-7">
        {TOPICS.map((topic) => (
          <section key={topic}>
            <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500">{topic}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {OPERATIONS_MASTERS.filter((m) => m.topic === topic).map((m) => (
                <Link
                  key={m.href}
                  href={m.href as Route}
                  className="group flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-red-200 hover:shadow-sm"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: "#FEE2E2", color: "#A80400" }}
                  >
                    <m.Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[15px] font-bold text-slate-900">
                      {m.label}
                      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-slate-500">{m.blurb}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {stats[m.href]?.map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600">
                          {s}
                        </span>
                      ))}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
