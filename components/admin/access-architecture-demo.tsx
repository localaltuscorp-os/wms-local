"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  Check,
  Code2,
  Crown,
  Info,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { clearModuleOwnership, saveModuleOwnership } from "@/app/(admin)/admin/access-architecture-demo/actions";

export interface OwnershipPerson {
  id: string;
  name: string;
  department: string | null;
}

export interface OwnershipNode {
  key: string;
  label: string;
  depth: 1 | 2 | 3;
  ancestors: string[];
  routes: string[];
}

export interface OwnershipRow {
  nodeKey: string;
  role: string;
  employeeId: string;
}

interface Props {
  nodes: OwnershipNode[];
  people: OwnershipPerson[];
  assignments: OwnershipRow[];
}

type Team = { head: string; associate: string; developers: string[] };
const EMPTY: Team = { head: "", associate: "", developers: [] };

function teamAt(nodeKey: string, rows: OwnershipRow[]): Team | null {
  const direct = rows.filter((row) => row.nodeKey === nodeKey);
  if (direct.length === 0) return null;
  return {
    head: direct.find((row) => row.role === "head")?.employeeId ?? "",
    associate: direct.find((row) => row.role === "associate")?.employeeId ?? "",
    developers: direct.filter((row) => row.role === "developer").map((row) => row.employeeId),
  };
}

function effectiveTeam(node: OwnershipNode, rows: OwnershipRow[]): { team: Team; source: string | null } {
  for (const key of [node.key, ...node.ancestors.toReversed()]) {
    const team = teamAt(key, rows);
    if (team) return { team, source: key };
  }
  return { team: EMPTY, source: null };
}

export function AccessArchitectureDemo({ nodes, people, assignments: initial }: Props) {
  const router = useRouter();
  const modules = nodes.filter((node) => node.depth === 1);
  const [rows, setRows] = React.useState(initial);
  const [moduleKey, setModuleKey] = React.useState(modules[0]?.key ?? "");
  const visibleNodes = nodes.filter((node) => node.key === moduleKey || node.ancestors[0] === moduleKey);
  const [nodeKey, setNodeKey] = React.useState(moduleKey);
  const selected = nodes.find((node) => node.key === nodeKey) ?? visibleNodes[0];
  const resolved = selected ? effectiveTeam(selected, rows) : { team: EMPTY, source: null };
  const direct = selected ? teamAt(selected.key, rows) : null;
  const [team, setTeam] = React.useState<Team>(direct ?? resolved.team);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function chooseNode(key: string) {
    const next = nodes.find((node) => node.key === key);
    if (!next) return;
    setNodeKey(key);
    setTeam(teamAt(key, rows) ?? effectiveTeam(next, rows).team);
    setMessage(null);
  }

  function switchModule(key: string) {
    setModuleKey(key);
    chooseNode(key);
  }

  function save() {
    if (!selected) return;
    const form = new FormData();
    form.set("nodeKey", selected.key);
    form.set("head", team.head);
    form.set("associate", team.associate);
    team.developers.forEach((id) => form.append("developers", id));
    startTransition(async () => {
      const result = await saveModuleOwnership(form);
      if (!result.ok) return setMessage(result.error);
      setRows((current) => [
        ...current.filter((row) => row.nodeKey !== selected.key),
        { nodeKey: selected.key, role: "head", employeeId: team.head },
        { nodeKey: selected.key, role: "associate", employeeId: team.associate },
        ...team.developers.map((employeeId) => ({ nodeKey: selected.key, role: "developer", employeeId })),
      ]);
      setMessage("Ownership saved.");
      router.refresh();
    });
  }

  function clearOverride() {
    if (!selected) return;
    startTransition(async () => {
      const result = await clearModuleOwnership(selected.key);
      if (!result.ok) return setMessage(result.error);
      const nextRows = rows.filter((row) => row.nodeKey !== selected.key);
      setRows(nextRows);
      setTeam(effectiveTeam(selected, nextRows).team);
      setMessage("Assignment removed; this item now inherits from its parent.");
      router.refresh();
    });
  }

  const person = (id: string) => people.find((item) => item.id === id)?.name ?? "Unassigned";

  return (
    <div className="space-y-5">
      <div className="grid gap-2 rounded-2xl border border-hairline bg-surface-card p-2 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => (
          <button key={module.key} type="button" onClick={() => switchModule(module.key)} className={`rounded-xl px-4 py-3 text-left transition ${module.key === moduleKey ? "bg-altus-red text-white shadow-sm" : "hover:bg-surface-soft"}`}>
            <span className="block text-[13px] font-extrabold">{module.label}</span>
            <span className={`mt-0.5 block text-[10.5px] ${module.key === moduleKey ? "text-white/75" : "text-ink-subtle"}`}>{nodes.filter((node) => node.ancestors[0] === module.key).length} pages / sections</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-[14px] font-extrabold text-ink-strong">Module and pages</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">Choose any catalogue item to assign or override its team.</p>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {visibleNodes.map((node) => {
              const own = teamAt(node.key, rows);
              const effective = effectiveTeam(node, rows);
              return (
                <button key={node.key} type="button" onClick={() => chooseNode(node.key)} className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left ${node.key === nodeKey ? "bg-altus-red-soft ring-1 ring-altus-red/30" : "hover:bg-surface-soft"}`} style={{ paddingLeft: 12 + (node.depth - 1) * 16 }}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-bold text-ink-strong">{node.label}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${own ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{own ? "Custom" : effective.source ? "Inherited" : "Open"}</span>
                  </span>
                  {node.routes[0] && <span className="mt-0.5 block truncate font-mono text-[9.5px] text-ink-subtle">{node.routes[0]}</span>}
                </button>
              );
            })}
          </div>
        </section>

        {selected && <section className="rounded-2xl border border-hairline bg-surface-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
            <div>
              <p className="text-[20px] font-extrabold text-ink-strong">{selected.label}</p>
              <p className="mt-1 font-mono text-[10.5px] text-ink-subtle">{selected.key}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10.5px] font-bold text-emerald-800"><ShieldCheck size={13} /> Super Admin controlled</span>
          </div>

          {!direct && resolved.source && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11.5px] text-blue-900">Currently inherited from <strong>{nodes.find((node) => node.key === resolved.source)?.label ?? resolved.source}</strong>. Saving creates an override for this item.</div>}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <RoleSelect icon={<Crown size={17} />} label="Head" help="Primary operational owner." value={team.head} people={people} onChange={(head) => setTeam({ ...team, head })} />
            <RoleSelect icon={<ArrowRightLeft size={17} />} label="Associate" help="Same access; replaces the Head when needed." value={team.associate} people={people} onChange={(associate) => setTeam({ ...team, associate })} />
          </div>

          <div className="mt-4 rounded-2xl border border-hairline p-4">
            <div className="flex items-start gap-3"><span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Code2 size={17} /></span><div><p className="text-[13px] font-extrabold text-ink-strong">Developers</p><p className="text-[11px] text-ink-muted">Technical owners only. This assignment does not expose business data.</p></div></div>
            <div className="mt-3 grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {people.map((item) => {
                const checked = team.developers.includes(item.id);
                const operational = item.id === team.head || item.id === team.associate;
                return <label key={item.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] ${operational ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-surface-soft"}`}><input type="checkbox" checked={checked} disabled={operational} onChange={() => setTeam({ ...team, developers: checked ? team.developers.filter((id) => id !== item.id) : [...team.developers, item.id] })} /><span className="truncate font-semibold text-ink-soft">{item.name}</span></label>;
              })}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-5 text-amber-950"><Info size={15} className="mt-0.5 shrink-0" /><p>Head and Associate receive the same catalogue-level Show, View and Edit access for this item and its descendants. Sensitive feature-specific checks still apply.</p></div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <div className="text-[11.5px] font-semibold text-ink-muted">Effective: {person(team.head)} · {person(team.associate)} · {team.developers.length} developer{team.developers.length === 1 ? "" : "s"}</div>
            <div className="flex gap-2">
              {direct && <button type="button" disabled={pending} onClick={clearOverride} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-hairline px-4 text-[11.5px] font-bold text-ink-muted disabled:opacity-50"><RotateCcw size={13} /> Remove assignment</button>}
              <button type="button" disabled={pending || !team.head || !team.associate} onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-altus-red px-4 text-[11.5px] font-bold text-white disabled:opacity-50"><Save size={13} /> {pending ? "Saving…" : direct ? "Save changes" : "Create assignment"}</button>
            </div>
          </div>
          {message && <p className={`mt-3 text-right text-[11.5px] font-bold ${message.includes("saved") || message.includes("inherits") ? "text-emerald-700" : "text-altus-red"}`}>{message}</p>}
        </section>}
      </div>
    </div>
  );
}

function RoleSelect({ icon, label, help, value, people, onChange }: { icon: React.ReactNode; label: string; help: string; value: string; people: OwnershipPerson[]; onChange: (value: string) => void }) {
  return <label className="rounded-2xl border border-hairline p-4"><span className="flex items-start gap-3"><span className="inline-flex size-9 items-center justify-center rounded-xl bg-altus-red-soft text-altus-red">{icon}</span><span><span className="block text-[13px] font-extrabold text-ink-strong">{label}</span><span className="block text-[11px] text-ink-muted">{help}</span></span></span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-4 h-10 w-full rounded-xl border border-hairline bg-surface-soft px-3 text-[12px] font-bold text-ink-strong"><option value="">Select employee</option>{people.map((item) => <option key={item.id} value={item.id}>{item.name}{item.department ? ` · ${item.department}` : ""}</option>)}</select></label>;
}
