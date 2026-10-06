"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Code2,
  Crown,
  Eye,
  EyeOff,
  FolderOpen,
  Pencil,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { clearModuleOwnership, saveModuleOwnership } from "@/app/(admin)/admin/access-architecture-demo/actions";

export interface OwnershipPerson { id: string; name: string; department: string | null }
export interface OwnershipNode { key: string; label: string; depth: 1 | 2 | 3; ancestors: string[]; routes: string[] }
export interface OwnershipRow { nodeKey: string; role: string; employeeId: string; canView: boolean; canEdit: boolean }
export interface OwnershipPolicy { nodeKey: string; defaultVisibility: string }
interface AssociateDraft { employeeId: string; canEdit: boolean }
interface Draft { head: string; associates: AssociateDraft[]; developers: string[]; defaultVisibility: "everyone" | "restricted" }
interface Props { nodes: OwnershipNode[]; people: OwnershipPerson[]; assignments: OwnershipRow[]; policies: OwnershipPolicy[] }

const EMPTY: Draft = { head: "", associates: [], developers: [], defaultVisibility: "everyone" };

function directDraft(nodeKey: string, rows: OwnershipRow[], policies: OwnershipPolicy[]): Draft | null {
  const assigned = rows.filter((row) => row.nodeKey === nodeKey);
  const policy = policies.find((row) => row.nodeKey === nodeKey);
  if (!policy && assigned.length === 0) return null;
  return {
    head: assigned.find((row) => row.role === "head")?.employeeId ?? "",
    associates: assigned.filter((row) => row.role === "associate").map((row) => ({ employeeId: row.employeeId, canEdit: row.canEdit })),
    developers: assigned.filter((row) => row.role === "developer").map((row) => row.employeeId),
    defaultVisibility: policy?.defaultVisibility === "restricted" ? "restricted" : "everyone",
  };
}

function effectiveDraft(node: OwnershipNode, rows: OwnershipRow[], policies: OwnershipPolicy[]): { draft: Draft; source: string | null } {
  for (const key of [node.key, ...node.ancestors.toReversed()]) {
    const draft = directDraft(key, rows, policies);
    if (draft) return { draft, source: key };
  }
  return { draft: EMPTY, source: null };
}

export function AccessArchitectureDemo({ nodes, people, assignments: initialRows, policies: initialPolicies }: Props) {
  const router = useRouter();
  const modules = nodes.filter((node) => node.depth === 1);
  const [rows, setRows] = React.useState(initialRows);
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [moduleKey, setModuleKey] = React.useState(modules[0]?.key ?? "");
  const [nodeKey, setNodeKey] = React.useState(modules[0]?.key ?? "");
  const [query, setQuery] = React.useState("");
  const initialNode = nodes.find((node) => node.key === nodeKey);
  const [draft, setDraft] = React.useState<Draft>(initialNode ? effectiveDraft(initialNode, initialRows, initialPolicies).draft : EMPTY);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const selected = nodes.find((node) => node.key === nodeKey);
  const moduleNodes = nodes.filter((node) => node.key === moduleKey || node.ancestors[0] === moduleKey);
  const visibleNodes = moduleNodes.filter((node) => `${node.label} ${node.routes.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const direct = selected ? directDraft(selected.key, rows, policies) : null;
  const effective = selected ? effectiveDraft(selected, rows, policies) : { draft: EMPTY, source: null };

  function chooseNode(key: string) {
    const next = nodes.find((node) => node.key === key);
    if (!next) return;
    setNodeKey(key);
    setDraft(directDraft(key, rows, policies) ?? effectiveDraft(next, rows, policies).draft);
    setMessage(null);
  }

  function switchModule(key: string) {
    setModuleKey(key);
    setQuery("");
    chooseNode(key);
  }

  function save() {
    if (!selected) return;
    const form = new FormData();
    form.set("nodeKey", selected.key);
    form.set("head", draft.head);
    form.set("associates", JSON.stringify(draft.associates));
    form.set("defaultVisibility", draft.defaultVisibility);
    draft.developers.forEach((id) => form.append("developers", id));
    startTransition(async () => {
      const result = await saveModuleOwnership(form);
      if (!result.ok) return setMessage(result.error);
      const nextRows: OwnershipRow[] = [
        ...rows.filter((row) => row.nodeKey !== selected.key),
        ...(draft.head ? [{ nodeKey: selected.key, role: "head", employeeId: draft.head, canView: true, canEdit: true }] : []),
        ...draft.associates.map((item) => ({ nodeKey: selected.key, role: "associate", employeeId: item.employeeId, canView: true, canEdit: item.canEdit })),
        ...draft.developers.map((employeeId) => ({ nodeKey: selected.key, role: "developer", employeeId, canView: true, canEdit: true })),
      ];
      setRows(nextRows);
      setPolicies((current) => [...current.filter((item) => item.nodeKey !== selected.key), { nodeKey: selected.key, defaultVisibility: draft.defaultVisibility }]);
      setMessage("Access policy saved.");
      router.refresh();
    });
  }

  function clearOverride() {
    if (!selected) return;
    startTransition(async () => {
      const result = await clearModuleOwnership(selected.key);
      if (!result.ok) return setMessage(result.error);
      const nextRows = rows.filter((row) => row.nodeKey !== selected.key);
      const nextPolicies = policies.filter((item) => item.nodeKey !== selected.key);
      setRows(nextRows);
      setPolicies(nextPolicies);
      setDraft(effectiveDraft(selected, nextRows, nextPolicies).draft);
      setMessage("Override removed; parent settings now apply.");
      router.refresh();
    });
  }

  const unavailable = new Set([draft.head, ...draft.associates.map((item) => item.employeeId), ...draft.developers].filter(Boolean));
  const personName = (id: string) => people.find((item) => item.id === id)?.name ?? "Unknown";

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-card shadow-sm">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2"><FolderOpen size={18} className="text-altus-red" /><p className="text-[16px] font-extrabold text-ink-strong">Module Directory</p></div>
          <span className="text-[10px] font-semibold text-ink-subtle">{nodes.length} items</span>
        </div>
        <div className="slim-scroll flex gap-1 overflow-x-auto border-b border-hairline p-2">
          {modules.map((module) => (
            <button key={module.key} type="button" onClick={() => switchModule(module.key)} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold ${module.key === moduleKey ? "bg-ink-strong text-white" : "bg-surface-soft text-ink-soft hover:bg-hairline"}`}>
              {module.label} <span className="ml-1 opacity-65">{nodes.filter((node) => node.ancestors[0] === module.key).length}</span>
            </button>
          ))}
        </div>
        <div className="p-3">
          <label className="flex h-10 items-center gap-2 rounded-xl bg-[#eef3ff] px-3 text-ink-muted"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sub-pages or routes…" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-ink-subtle" /></label>
        </div>
        <div className="slim-scroll max-h-[620px] space-y-1 overflow-y-auto px-2 pb-3">
          {visibleNodes.map((node, index) => {
            const own = directDraft(node.key, rows, policies);
            const inherited = effectiveDraft(node, rows, policies);
            const configured = Boolean(own);
            const restricted = (own ?? inherited.draft).defaultVisibility === "restricted";
            return <button key={node.key} type="button" onClick={() => chooseNode(node.key)} className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left ${node.key === nodeKey ? "bg-[#e5edff] ring-1 ring-blue-200" : "hover:bg-surface-soft"}`}>
              <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md ${configured ? "bg-slate-950 text-white" : restricted ? "bg-red-100 text-red-700" : "bg-[#eef3ff] text-slate-700"}`}>{configured ? <Check size={16} /> : restricted ? <EyeOff size={16} /> : index % 2 ? <UsersRound size={16} /> : <Eye size={16} />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-bold text-ink-strong">{node.label}</span><span className="block truncate font-mono text-[9.5px] text-ink-subtle">{node.routes[0] ?? node.key}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${configured ? "bg-emerald-950 text-emerald-300" : restricted ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{configured ? "Configured" : inherited.source ? "Inherited" : "Default"}</span>
              <ChevronRight size={14} className="shrink-0 text-ink-subtle" />
            </button>;
          })}
        </div>
      </section>

      {selected && <section className="rounded-2xl border border-hairline bg-surface-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div><p className="text-[19px] font-extrabold text-ink-strong">{selected.label}</p><p className="mt-1 font-mono text-[10px] text-ink-subtle">{selected.routes[0] ?? selected.key}</p></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[9.5px] font-bold text-emerald-800"><ShieldCheck size={12} /> Super Admin</span>
        </div>

        <div className="space-y-4 p-5">
          {!direct && effective.source && <p className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-900">Inherited from <strong>{nodes.find((node) => node.key === effective.source)?.label}</strong>. Saving creates an override here.</p>}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.08em] text-ink-muted">Default visibility</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <PolicyOption active={draft.defaultVisibility === "everyone"} icon={<Eye size={16} />} title="Visible to everyone" note="Everyone may view; only assigned people may edit." onClick={() => setDraft({ ...draft, defaultVisibility: "everyone" })} />
              <PolicyOption active={draft.defaultVisibility === "restricted"} icon={<EyeOff size={16} />} title="Restricted" note="Only assigned people may view or edit." onClick={() => setDraft({ ...draft, defaultVisibility: "restricted" })} />
            </div>
          </div>

          <div className="rounded-xl border border-hairline p-4">
            <div className="flex items-center gap-2"><Crown size={16} className="text-altus-red" /><p className="text-[12.5px] font-extrabold text-ink-strong">Head</p><AccessPills edit /></div>
            <select value={draft.head} onChange={(event) => setDraft({ ...draft, head: event.target.value })} className="mt-3 h-10 w-full rounded-lg border border-hairline bg-surface-soft px-3 text-[12px] font-semibold"><option value="">No Head selected</option>{people.filter((person) => !unavailable.has(person.id) || person.id === draft.head).map((person) => <option key={person.id} value={person.id}>{person.name}{person.department ? ` · ${person.department}` : ""}</option>)}</select>
          </div>

          <div className="rounded-xl border border-hairline p-4">
            <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><UsersRound size={16} className="text-blue-700" /><p className="text-[12.5px] font-extrabold text-ink-strong">Associates</p></div><span className="text-[10px] text-ink-subtle">Multiple · View or Edit</span></div>
            <div className="mt-3 flex gap-2"><select id="associate-picker" defaultValue="" className="h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-soft px-3 text-[11.5px]"><option value="">Select associate…</option>{people.filter((person) => !unavailable.has(person.id)).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button type="button" onClick={() => { const select = document.getElementById("associate-picker") as HTMLSelectElement | null; const employeeId = select?.value ?? ""; if (!employeeId) return; setDraft({ ...draft, associates: [...draft.associates, { employeeId, canEdit: false }] }); if (select) select.value = ""; }} className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-950 px-3 text-[10.5px] font-bold text-white"><UserPlus size={13} /> Add</button></div>
            <div className="mt-2 space-y-1.5">{draft.associates.map((associate) => <div key={associate.employeeId} className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-2"><span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">{personName(associate.employeeId)}</span><button type="button" onClick={() => setDraft({ ...draft, associates: draft.associates.map((item) => item.employeeId === associate.employeeId ? { ...item, canEdit: false } : item) })} className={`rounded-full px-2 py-1 text-[9px] font-bold ${!associate.canEdit ? "bg-blue-100 text-blue-800" : "text-ink-muted"}`}>View</button><button type="button" onClick={() => setDraft({ ...draft, associates: draft.associates.map((item) => item.employeeId === associate.employeeId ? { ...item, canEdit: true } : item) })} className={`rounded-full px-2 py-1 text-[9px] font-bold ${associate.canEdit ? "bg-amber-100 text-amber-800" : "text-ink-muted"}`}>Edit + View</button><button type="button" onClick={() => setDraft({ ...draft, associates: draft.associates.filter((item) => item.employeeId !== associate.employeeId) })} className="text-[14px] text-ink-subtle hover:text-altus-red">×</button></div>)}</div>
          </div>

          <div className="rounded-xl border border-hairline p-4">
            <div className="flex items-center gap-2"><Code2 size={16} className="text-violet-700" /><p className="text-[12.5px] font-extrabold text-ink-strong">Developers</p><AccessPills edit /><span className="ml-auto text-[10px] text-ink-subtle">Multiple</span></div>
            <div className="mt-3 grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{people.map((person) => { const checked = draft.developers.includes(person.id); const blocked = unavailable.has(person.id) && !checked; return <label key={person.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10.5px] ${blocked ? "opacity-35" : "cursor-pointer hover:bg-surface-soft"}`}><input type="checkbox" checked={checked} disabled={blocked} onChange={() => setDraft({ ...draft, developers: checked ? draft.developers.filter((id) => id !== person.id) : [...draft.developers, person.id] })} /><span className="truncate font-semibold">{person.name}</span></label>; })}</div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <p className="text-[10.5px] text-ink-muted"><strong>Edit</strong> includes create, update and delete. Edit always includes View.</p>
            <div className="flex gap-2">{direct && <button type="button" disabled={pending} onClick={clearOverride} className="inline-flex h-9 items-center gap-1 rounded-full border border-hairline px-3 text-[10.5px] font-bold text-ink-muted"><RotateCcw size={12} /> Inherit</button>}<button type="button" disabled={pending} onClick={save} className="inline-flex h-9 items-center gap-1 rounded-full bg-altus-red px-4 text-[10.5px] font-bold text-white disabled:opacity-50"><Save size={12} /> {pending ? "Saving…" : "Save policy"}</button></div>
          </div>
          {message && <p className={`text-right text-[11px] font-bold ${message.includes("saved") || message.includes("removed") ? "text-emerald-700" : "text-altus-red"}`}>{message}</p>}
        </div>
      </section>}
    </div>
  );
}

function PolicyOption({ active, icon, title, note, onClick }: { active: boolean; icon: React.ReactNode; title: string; note: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left ${active ? "border-blue-300 bg-[#eef3ff]" : "border-hairline"}`}><span className="flex items-center gap-2 text-[11.5px] font-extrabold text-ink-strong">{icon}{title}{active && <Check size={13} className="ml-auto text-blue-700" />}</span><span className="mt-1 block text-[9.5px] leading-4 text-ink-muted">{note}</span></button>; }
function AccessPills({ edit }: { edit?: boolean }) { return <span className="ml-auto flex gap-1"><span className="rounded-full bg-blue-100 px-2 py-0.5 text-[8.5px] font-black text-blue-800"><Eye size={9} className="mr-0.5 inline" />View</span>{edit && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[8.5px] font-black text-amber-800"><Pencil size={9} className="mr-0.5 inline" />Edit</span>}</span>; }
