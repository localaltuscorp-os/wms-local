import Link from "next/link";
import type { Route } from "next";
import { Plus, Library, GraduationCap, Share2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listMaterials, isManager } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listSelfLearningLibrary, listShareLibrary } from "@/lib/queries/learning-library";
import { MaterialsTable } from "@/components/training/materials-table";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "materials", label: "Trainings", Icon: Library },
  { id: "self-learning", label: "Self Learning", Icon: GraduationCap },
  { id: "shares", label: "Learning Shares", Icon: Share2 },
] as const;

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireWorkspace("training");
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "materials";
  const active = TABS.some((t) => t.id === tab) ? tab : "materials";

  const manager = (await isManager(me.id)) || me.isAdmin || isSuperAdmin(me.email);
  const canManage = manager;

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  const [rows, employeeOptions, selfLearning, shares] = await Promise.all([
    listMaterials(me.id, { includeArchived: manager }),
    listEmployeeOptions(),
    active === "self-learning" ? listSelfLearningLibrary(me, from, to) : Promise.resolve([]),
    active === "shares" ? listShareLibrary(from, to) : Promise.resolve([]),
  ]);
  const employeesById = Object.fromEntries(employeeOptions.map((e) => [e.id, e.name]));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>
              Learning Library
            </span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 6 }}>
              Learning Library
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Every training, self-learning entry and learning share — searchable in one place.
            </p>
          </div>
          {canManage && active === "materials" && (
            <Link href={"/training/new" as Route} className="inline-flex items-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}>
              <Plus size={17} strokeWidth={2.6} /> Add Material
            </Link>
          )}
        </header>

        <div className="mb-5 flex gap-2 border-b border-hairline">
          {TABS.map(({ id, label, Icon }) => (
            <Link
              key={id}
              href={(`/training?tab=${id}`) as Route}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-[14px] font-bold transition-colors"
              style={{ color: active === id ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)", borderBottom: active === id ? "2px solid var(--color-altus-red)" : "2px solid transparent" }}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </div>

        {active === "materials" && <MaterialsTable rows={rows} employeesById={employeesById} canManage={canManage} />}

        {active === "self-learning" && (
          <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.06)] text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Person</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Function</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Topic</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Source</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Date</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Time</th>
                </tr>
              </thead>
              <tbody>
                {selfLearning.map((r) => (
                  <tr key={r.id} className="border-b border-[rgba(15,23,42,0.04)]">
                    <td className="px-4 py-2.5 font-bold text-ink-strong">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.functionName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-strong">{r.title}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.source ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.learnDate}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink-strong">{r.minutes} min</td>
                  </tr>
                ))}
                {selfLearning.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-subtle">No self-learning logged yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {active === "shares" && (
          <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.06)] text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Person</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Topic</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Week</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">Time</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((r) => (
                  <tr key={r.id} className="border-b border-[rgba(15,23,42,0.04)]">
                    <td className="px-4 py-2.5 font-bold text-ink-strong">{r.employeeName}</td>
                    <td className="px-4 py-2.5 text-ink-strong">{r.topic}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.weekStart}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink-strong">{r.minutes} min</td>
                  </tr>
                ))}
                {shares.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-subtle">No shares yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
