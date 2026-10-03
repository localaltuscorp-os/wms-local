"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Crown,
  Info,
  Layers3,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";

type Person = { id: string; name: string; detail: string };
type Assignment = { head: string; associate: string; developers: string[] };
type PageItem = { id: string; label: string; path: string; assignment?: Assignment };
type ModuleItem = { id: string; label: string; detail: string; assignment: Assignment; pages: PageItem[] };

const PEOPLE: Person[] = [
  { id: "test-a", name: "Test User A", detail: "Operations" },
  { id: "test-b", name: "Test User B", detail: "Operations" },
  { id: "test-c", name: "Test Developer A", detail: "Engineering" },
  { id: "test-d", name: "Test Developer B", detail: "Engineering" },
  { id: "test-e", name: "Test User C", detail: "People" },
  { id: "test-f", name: "Test Developer C", detail: "Engineering" },
];

const INITIAL_MODULES: ModuleItem[] = [
  {
    id: "attendance",
    label: "Attendance",
    detail: "Punches, reviews, insights and working-day rules",
    assignment: { head: "test-a", associate: "test-b", developers: ["test-c"] },
    pages: [
      { id: "dashboard", label: "Dashboard", path: "/attendance/dashboard" },
      { id: "insights", label: "Insights", path: "/attendance/insights" },
      { id: "work-session", label: "Work-session review", path: "/attendance/work-session/review" },
      { id: "settings", label: "Attendance settings", path: "/admin/settings/attendance", assignment: { head: "test-e", associate: "test-b", developers: ["test-c", "test-d"] } },
    ],
  },
  {
    id: "tasks",
    label: "Tasks & planning",
    detail: "Tasks, daily commitments and weekly goals",
    assignment: { head: "test-b", associate: "test-a", developers: ["test-d"] },
    pages: [
      { id: "tasks", label: "Tasks", path: "/tasks" },
      { id: "plan", label: "Plan my day", path: "/daily-checklist" },
      { id: "weekly", label: "Weekly goals", path: "/weekly-goals" },
    ],
  },
  {
    id: "people",
    label: "People & HR",
    detail: "Employee records, letters, policies and hierarchy",
    assignment: { head: "test-e", associate: "test-a", developers: ["test-c", "test-f"] },
    pages: [
      { id: "employees", label: "Employees", path: "/admin/employees" },
      { id: "hierarchy", label: "Reporting hierarchy", path: "/admin/hierarchy" },
      { id: "letters", label: "Letters", path: "/hr/letters" },
      { id: "policies", label: "Policies", path: "/hr/policies" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    detail: "Billing, payments, incentive payouts and masters",
    assignment: { head: "test-a", associate: "test-e", developers: ["test-f"] },
    pages: [
      { id: "billing", label: "Billing", path: "/billing" },
      { id: "payments", label: "Payments", path: "/accounts/payments" },
      { id: "incentives", label: "Incentive payouts", path: "/accounts/incentive-payments" },
    ],
  },
];

export function AccessArchitectureDemo() {
  const [modules, setModules] = React.useState(INITIAL_MODULES);
  const [moduleId, setModuleId] = React.useState(INITIAL_MODULES[0]!.id);
  const [editingPageId, setEditingPageId] = React.useState<string | null>(null);
  const active = modules.find((module) => module.id === moduleId) ?? modules[0]!;
  const editingPage = active.pages.find((page) => page.id === editingPageId) ?? null;

  function updateModule(assignment: Assignment) {
    setModules((current) => current.map((module) => module.id === active.id ? { ...module, assignment } : module));
  }

  function updatePage(pageId: string, assignment: Assignment | undefined) {
    setModules((current) => current.map((module) => module.id !== active.id ? module : {
      ...module,
      pages: module.pages.map((page) => page.id === pageId ? { ...page, assignment } : page),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><Sparkles size={16} /></span>
          <div>
            <p className="text-[13px] font-extrabold">Interactive concept demo</p>
            <p className="mt-0.5 text-[12px] leading-5 text-blue-800">Try assignments and page overrides. Nothing here is connected to permissions or saved to the database.</p>
          </div>
        </div>
        <button type="button" onClick={() => { setModules(INITIAL_MODULES); setModuleId(INITIAL_MODULES[0]!.id); setEditingPageId(null); }} className="inline-flex h-9 items-center gap-2 rounded-full border border-blue-200 bg-white px-3.5 text-[12px] font-bold text-blue-800 hover:bg-blue-100"><RotateCcw size={14} /> Reset demo</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-muted">Modules</p>
            <p className="mt-1 text-[12px] text-ink-subtle">Choose an area to manage its ownership.</p>
          </div>
          <div className="divide-y divide-hairline">
            {modules.map((module) => (
              <button key={module.id} type="button" onClick={() => { setModuleId(module.id); setEditingPageId(null); }} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${module.id === active.id ? "bg-altus-red-soft" : "hover:bg-surface-soft"}`}>
                <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${module.id === active.id ? "bg-white text-altus-red" : "bg-surface-soft text-ink-muted"}`}><Layers3 size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-extrabold text-ink-strong">{module.label}</span><span className="block text-[11px] text-ink-subtle">{module.pages.length} pages · {module.assignment.developers.length} developer{module.assignment.developers.length === 1 ? "" : "s"}</span></span>
                <ChevronRight size={15} className="text-ink-subtle" />
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline bg-surface-soft px-5 py-4">
              <div><p className="text-[20px] font-extrabold tracking-[-0.02em] text-ink-strong">{active.label}</p><p className="mt-1 text-[12.5px] text-ink-muted">{active.detail}</p></div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-ink-muted shadow-sm"><ShieldCheck size={13} className="text-altus-red" /> Assigned by Super Admin</span>
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-3">
              <RoleCard role="Head" description="Primary owner and final operational authority." icon={<Crown size={18} />} tone="red" personId={active.assignment.head} onPerson={(head) => updateModule({ ...active.assignment, head })} />
              <RoleCard role="Associate" description="Replacement for the Head with the same access." icon={<ArrowRightLeft size={18} />} tone="green" personId={active.assignment.associate} onPerson={(associate) => updateModule({ ...active.assignment, associate })} />
              <DeveloperCard developerIds={active.assignment.developers} onChange={(developers) => updateModule({ ...active.assignment, developers })} />
            </div>
            <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-950">
              <Info size={15} className="mt-0.5 shrink-0" />
              <p><strong>Developer means technical ownership.</strong> It identifies who maintains the code for this area; it does not automatically reveal business records or bypass normal access checks.</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline px-5 py-4">
              <div><p className="text-[16px] font-extrabold text-ink-strong">Page-level ownership</p><p className="mt-1 text-[12px] text-ink-muted">Pages inherit the module team unless Super Admin creates an override.</p></div>
              <div className="flex gap-2 text-[10.5px] font-bold"><Badge text="Inherited" tone="slate" /><Badge text="Custom override" tone="amber" /></div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(220px,1fr)_150px_150px_190px_110px] border-b border-hairline bg-surface-soft px-4 py-2 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-subtle"><span>Page</span><span>Head</span><span>Associate</span><span>Developers</span><span /></div>
                <div className="divide-y divide-hairline">
                  {active.pages.map((page) => {
                    const assignment = page.assignment ?? active.assignment;
                    return <div key={page.id} className="grid grid-cols-[minmax(220px,1fr)_150px_150px_190px_110px] items-center gap-2 px-4 py-3 hover:bg-surface-soft">
                      <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-[13px] font-bold text-ink-strong">{page.label}</span><Badge text={page.assignment ? "Custom" : "Inherited"} tone={page.assignment ? "amber" : "slate"} /></div><p className="mt-0.5 truncate font-mono text-[10.5px] text-ink-subtle">{page.path}</p></div>
                      <PersonCompact id={assignment.head} />
                      <PersonCompact id={assignment.associate} />
                      <p className="truncate text-[12px] font-semibold text-ink-soft">{assignment.developers.map(personName).join(", ") || "None"}</p>
                      <button type="button" onClick={() => setEditingPageId(page.id)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-hairline bg-white px-3 text-[11.5px] font-bold text-ink-soft hover:border-hairline-strong hover:text-ink-strong">Configure <ChevronRight size={13} /></button>
                    </div>;
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {editingPage && <PageEditor moduleAssignment={active.assignment} page={editingPage} onClose={() => setEditingPageId(null)} onSave={(assignment) => { updatePage(editingPage.id, assignment); setEditingPageId(null); }} />}
    </div>
  );
}

function RoleCard({ role, description, icon, tone, personId, onPerson }: { role: string; description: string; icon: React.ReactNode; tone: "red" | "green"; personId: string; onPerson: (id: string) => void }) {
  const classes = tone === "red" ? "bg-altus-red-soft text-altus-red" : "bg-emerald-50 text-emerald-700";
  return <div className="rounded-2xl border border-hairline p-4"><div className="flex items-center gap-3"><span className={`inline-flex size-10 items-center justify-center rounded-xl ${classes}`}>{icon}</span><div><p className="text-[14px] font-extrabold text-ink-strong">{role}</p><p className="text-[11px] text-ink-subtle">{description}</p></div></div><label className="mt-4 block"><span className="mb-1.5 block text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">Assigned person</span><select value={personId} onChange={(event) => onPerson(event.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface-soft px-3 text-[12.5px] font-bold text-ink-strong outline-none focus:border-altus-red">{PEOPLE.filter((person) => !person.detail.includes("Engineering")).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>;
}

function DeveloperCard({ developerIds, onChange }: { developerIds: string[]; onChange: (ids: string[]) => void }) {
  const developers = PEOPLE.filter((person) => person.detail === "Engineering");
  return <div className="rounded-2xl border border-hairline p-4"><div className="flex items-center gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Code2 size={18} /></span><div><p className="text-[14px] font-extrabold text-ink-strong">Developers</p><p className="text-[11px] text-ink-subtle">Technical owners assigned by Super Admin.</p></div></div><div className="mt-3 flex flex-wrap gap-1.5">{developers.map((person) => { const active = developerIds.includes(person.id); return <button key={person.id} type="button" onClick={() => onChange(active ? developerIds.filter((id) => id !== person.id) : [...developerIds, person.id])} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-bold ${active ? "border-violet-200 bg-violet-50 text-violet-800" : "border-hairline bg-white text-ink-muted"}`}>{active && <Check size={11} />}{person.name}</button>; })}</div></div>;
}

function PageEditor({ moduleAssignment, page, onClose, onSave }: { moduleAssignment: Assignment; page: PageItem; onClose: () => void; onSave: (assignment: Assignment | undefined) => void }) {
  const [custom, setCustom] = React.useState(Boolean(page.assignment));
  const [assignment, setAssignment] = React.useState(page.assignment ?? moduleAssignment);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={`Configure ${page.label}`}><div className="w-full max-w-[640px] rounded-3xl border border-hairline bg-surface-card p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Braces size={17} className="text-altus-red" /><p className="text-[20px] font-extrabold text-ink-strong">{page.label}</p></div><p className="mt-1 font-mono text-[11px] text-ink-subtle">{page.path}</p></div><button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded-xl border border-hairline text-ink-muted"><X size={15} /></button></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => { setCustom(false); setAssignment(moduleAssignment); }} className={`rounded-2xl border p-4 text-left ${!custom ? "border-altus-red bg-altus-red-soft" : "border-hairline"}`}><UsersRound size={18} className="mb-2 text-altus-red" /><p className="text-[13px] font-extrabold text-ink-strong">Inherit module team</p><p className="mt-1 text-[11.5px] text-ink-muted">Automatically follows future module assignment changes.</p></button><button type="button" onClick={() => setCustom(true)} className={`rounded-2xl border p-4 text-left ${custom ? "border-amber-300 bg-amber-50" : "border-hairline"}`}><UserRoundCheck size={18} className="mb-2 text-amber-700" /><p className="text-[13px] font-extrabold text-ink-strong">Custom page team</p><p className="mt-1 text-[11.5px] text-ink-muted">Override one or more roles only for this page.</p></button></div>{custom && <div className="mt-4 grid gap-3 sm:grid-cols-2"><EditorSelect label="Head" value={assignment.head} onChange={(head) => setAssignment({ ...assignment, head })} /><EditorSelect label="Associate · same access" value={assignment.associate} onChange={(associate) => setAssignment({ ...assignment, associate })} /><div className="sm:col-span-2"><p className="mb-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">Developers · technical owners</p><DeveloperCard developerIds={assignment.developers} onChange={(developers) => setAssignment({ ...assignment, developers })} /></div></div>}<div className="mt-5 flex justify-end gap-2 border-t border-hairline pt-4"><button type="button" onClick={onClose} className="h-9 rounded-full border border-hairline px-4 text-[12px] font-bold text-ink-muted">Cancel</button><button type="button" onClick={() => onSave(custom ? assignment : undefined)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-altus-red px-4 text-[12px] font-bold text-white"><Check size={14} /> Apply in demo</button></div></div></div>;
}

function EditorSelect({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) { return <label><span className="mb-1.5 block text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-hairline bg-surface-soft px-3 text-[12.5px] font-bold text-ink-strong">{PEOPLE.filter((person) => person.detail !== "Engineering").map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>; }
function PersonCompact({ id }: { id: string }) { const person = PEOPLE.find((item) => item.id === id); return <span className="truncate text-[12px] font-semibold text-ink-soft">{person?.name ?? "Unassigned"}</span>; }
function personName(id: string) { return PEOPLE.find((person) => person.id === id)?.name ?? "Unknown"; }
function Badge({ text, tone }: { text: string; tone: "slate" | "amber" }) { return <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.05em] ${tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{text}</span>; }
