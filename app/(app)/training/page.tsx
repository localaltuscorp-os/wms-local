import Link from "next/link";
import type { Route } from "next";
import { Plus, Library, GraduationCap, Share2 } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
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

type LibraryTab = (typeof TABS)[number]["id"];

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isYmd(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireWorkspace("training");
  const sp = await searchParams;
  const requestedTab = singleParam(sp.tab);
  const active: LibraryTab = TABS.find((tab) => tab.id === requestedTab)?.id ?? "materials";
  const selectedDate = singleParam(sp.date);
  const selectedCreator = singleParam(sp.createdBy) ?? "";
  const manager = (await isManager(me.id)) || me.isAdmin || isSuperAdmin(me.email);

  const now = new Date();
  const from = isYmd(selectedDate)
    ? selectedDate
    : new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
  const to = isYmd(selectedDate) ? selectedDate : now.toISOString().slice(0, 10);

  const [rows, employeeOptions, selfLearning, shares] = await Promise.all([
    listMaterials(me.id, { includeArchived: manager }),
    listEmployeeOptions(),
    active === "self-learning" ? listSelfLearningLibrary(me, from, to) : Promise.resolve([]),
    active === "shares" ? listShareLibrary(from, to) : Promise.resolve([]),
  ]);
  const employeesById = Object.fromEntries(employeeOptions.map((employee) => [employee.id, employee.name]));
  const visibleSelfLearning = selectedCreator ? selfLearning.filter((row) => row.employeeId === selectedCreator) : selfLearning;
  const visibleShares = selectedCreator ? shares.filter((row) => row.employeeId === selectedCreator) : shares;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4">
        <PageCommandBar
          title="Learning Library"
          actions={manager && active === "materials" ? (
            <Link href={"/training/new" as Route} className="brand-btn inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white">
              <Plus size={16} strokeWidth={2.5} /> Add Material
            </Link>
          ) : undefined}
        />

        <div className="mb-4 flex gap-1 border-b border-hairline">
          {TABS.map(({ id, label, Icon }) => (
            <Link
              key={id}
              href={`/training?tab=${id}` as Route}
              className="inline-flex items-center gap-2 px-3 py-2 text-[13px] font-bold transition-colors"
              style={{ color: active === id ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)", borderBottom: active === id ? "2px solid var(--color-altus-red)" : "2px solid transparent" }}
            >
              <Icon size={15} /> {label}
            </Link>
          ))}
        </div>

        {active === "materials" && <MaterialsTable rows={rows} employeesById={employeesById} canManage={manager} />}

        {active === "self-learning" && (
          <>
            <LibraryFilters active="self-learning" date={isYmd(selectedDate) ? selectedDate : ""} createdBy={selectedCreator} employees={employeeOptions} />
            <LibraryTable headers={["Person", "Function", "Topic", "Source", "Date", "Time"]} empty="No self-learning logged yet.">
              {visibleSelfLearning.map((row) => (
                <tr key={row.id} className="border-b border-hairline last:border-b-0">
                  <Cell strong>{row.employeeName}</Cell>
                  <Cell>{row.functionName ?? "—"}</Cell>
                  <Cell strong>{row.title}</Cell>
                  <Cell>{row.source ?? "—"}</Cell>
                  <Cell>{row.learnDate}</Cell>
                  <Cell strong>{row.minutes} min</Cell>
                </tr>
              ))}
            </LibraryTable>
          </>
        )}

        {active === "shares" && (
          <>
            <LibraryFilters active="shares" date={isYmd(selectedDate) ? selectedDate : ""} createdBy={selectedCreator} employees={employeeOptions} />
            <LibraryTable headers={["Person", "Topic", "Week", "Time"]} empty="No shares yet.">
              {visibleShares.map((row) => (
                <tr key={row.id} className="border-b border-hairline last:border-b-0">
                  <Cell strong>{row.employeeName}</Cell>
                  <Cell strong>{row.topic}</Cell>
                  <Cell>{row.weekStart}</Cell>
                  <Cell strong>{row.minutes} min</Cell>
                </tr>
              ))}
            </LibraryTable>
          </>
        )}
      </main>
    </>
  );
}

function LibraryFilters({
  active,
  date,
  createdBy,
  employees,
}: {
  active: Exclude<LibraryTab, "materials">;
  date: string;
  createdBy: string;
  employees: { id: string; name: string }[];
}) {
  return (
    <form className="mb-3 flex flex-wrap items-center gap-2" action="/training">
      <input type="hidden" name="tab" value={active} />
      <label className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong"><span className="text-ink-soft">Any Date</span><input className="min-w-0 bg-transparent outline-none" type="date" name="date" defaultValue={date} aria-label="Any Date" /></label>
      <select className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong" name="createdBy" defaultValue={createdBy} aria-label="Created By">
        <option value="">Created By</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
      </select>
      <button type="submit" className="wg-btn rounded-lg px-3 py-2 text-[13px] font-bold">Filter</button>
      {(date || createdBy) && <Link href={`/training?tab=${active}` as Route} className="px-2 py-2 text-[13px] font-bold text-ink-soft hover:text-altus-red">Clear</Link>}
    </form>
  );
}

function LibraryTable({
  headers,
  empty,
  children,
}: {
  headers: string[];
  empty: string;
  children: React.ReactNode;
}) {
  const rows = Array.isArray(children) ? children : [children];
  return (
    <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead><tr className="border-b border-hairline bg-surface-soft text-left">{headers.map((header) => <th key={header} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{header}</th>)}</tr></thead>
        <tbody>{rows.length > 0 ? children : <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-ink-subtle">{empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}

function Cell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return <td className={`px-4 py-2.5 ${strong ? "font-semibold text-ink-strong" : "text-ink-soft"}`}>{children}</td>;
}
