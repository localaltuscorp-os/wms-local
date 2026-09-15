"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Check, Layers, Lock, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, UserRound, Users, X, Archive } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { describeSchedule } from "@/lib/dcc/master";
import type { DccItemRow } from "@/lib/queries/dcc";
import type { DccMasterItemRow, MasterDesignationRow, MasterEmployee } from "@/lib/queries/dcc-masters";
import { createDccMasterItem, setDccMasterItemActive, updateDccMasterItem } from "@/app/(app)/dcc/masters/actions";
import { createDccItem, deleteDccItem, updateDccItem } from "@/app/(app)/dcc/actions";

/**
 * DCC MASTER — two views, mirroring the Job Description:
 *   · Position Masters: the master DCC of each designation.
 *   · Employee DCC: one person's DCC — what their position's master gives them
 *     (read-only here) and what is specific to them.
 */

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const PANEL_SHADOW = "0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -20px rgba(15,23,42,0.22)";
const INPUT =
  "w-full rounded-xl border border-hairline-strong bg-white px-3 py-2.5 text-[14px] text-ink-strong outline-none transition-colors focus:border-[#16a34a]";

type Result = { ok: boolean; error?: string };

interface KpiValues {
  section: string;
  code: string;
  title: string;
  frequency: string;
  targetNumber: string;
  unit: string;
}
const EMPTY: KpiValues = { section: "", code: "", title: "", frequency: "", targetNumber: "", unit: "" };

function valuesOf(r: { section: string | null; code: string | null; title: string; frequency: string | null; targetNumber: string | null; unit: string | null }): KpiValues {
  return {
    section: r.section ?? "",
    code: r.code ?? "",
    title: r.title,
    frequency: r.frequency ?? "",
    targetNumber: r.targetNumber ?? "",
    unit: r.unit ?? "",
  };
}
const payloadOf = (v: KpiValues) => ({
  section: v.section || null,
  code: v.code || null,
  title: v.title,
  frequency: v.frequency || null,
  targetNumber: v.targetNumber || null,
  unit: v.unit || null,
});

export function DccMasterView(props: {
  view: "position" | "employee";
  canAuthor: boolean;
  missing: boolean;
  designations: MasterDesignationRow[];
  items: DccMasterItemRow[];
  selectedDesignationId: string | null;
  people: MasterEmployee[];
  employeeId: string;
  meId: string;
  employeeItems: DccItemRow[];
  canManageEmployee: boolean;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="inline-flex w-fit rounded-xl bg-surface-card p-1" style={{ boxShadow: PANEL_SHADOW }}>
        <TabLink href="/dcc/masters" active={props.view === "position"} icon={<Layers size={15} />}>
          Position Masters
        </TabLink>
        <TabLink href={`/dcc/masters?view=employee&emp=${props.employeeId}`} active={props.view === "employee"} icon={<UserRound size={15} />}>
          Employee DCC
        </TabLink>
      </div>

      {props.missing && (
        <p className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: "#FFFBEB", color: "#92400E", boxShadow: "inset 0 0 0 1px #FCD34D" }}>
          <TriangleAlert size={16} className="shrink-0" /> DCC Master isn&apos;t set up in the database yet — migration 0230 must be applied.
        </p>
      )}

      {props.view === "position" ? (
        <PositionMasters {...props} />
      ) : (
        <EmployeeDcc {...props} />
      )}
    </section>
  );
}

function TabLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      scroll={false}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13.5px] font-bold transition-colors ${active ? "text-white" : "text-ink-soft hover:text-[#15803d]"}`}
      style={active ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` } : undefined}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      {children}
    </Link>
  );
}

/* ───────────────────────────── Position Masters ─────────────────────────── */

function PositionMasters({ canAuthor, missing, designations, items, selectedDesignationId }: React.ComponentProps<typeof DccMasterView>) {
  const router = useRouter();
  const selected =
    designations.find((d) => d.id === selectedDesignationId) ??
    designations.find((d) => d.holders.length > 0) ??
    designations[0] ??
    null;
  const rows = React.useMemo(
    () =>
      items
        .filter((i) => i.designationId === selected?.id)
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder),
    [items, selected?.id],
  );
  const sections = React.useMemo(() => distinct(items.map((i) => i.section)), [items]);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (!selected) {
    return <Empty title="No positions yet" body="Designations are set on each employee in HR. Once there is one, its DCC Master can be built here." />;
  }

  const holdersText = selected.holders.length
    ? selected.holders.map((h) => h.name).join(", ")
    : "Nobody holds this position right now.";
  const reach = `${selected.holders.length} ${selected.holders.length === 1 ? "person" : "people"}`;

  function retire(r: DccMasterItemRow) {
    if (!selected) return;
    if (r.isActive && !window.confirm(`Retire "${r.title}"? It leaves the DCC of all ${reach} in ${selected.name}. Their history is kept.`)) return;
    start(async () => {
      const res = await setDccMasterItemActive({ id: r.id, isActive: !r.isActive });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: r.isActive ? "KPI retired from the master." : "KPI restored to the master.", type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {designations.map((d) => {
          const on = d.id === selected.id;
          return (
            <Link
              key={d.id}
              href={`/dcc/masters?designation=${d.id}` as Route}
              scroll={false}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${on ? "text-white" : "bg-surface-card text-ink-soft hover:text-[#15803d]"}`}
              style={on ? { background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` } : { boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
            >
              {d.name}
              <span className={`rounded-full px-1.5 text-[11.5px] tabular-nums ${on ? "bg-white/20" : "bg-surface-soft text-ink-subtle"}`}>
                {d.holders.length} · {d.activeKpis}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="-mt-2 text-[12px] font-semibold text-ink-subtle">Each chip: people in the position · KPIs in its master.</p>

      <div className="rounded-[22px] bg-surface-card p-5 max-md:p-4" style={{ boxShadow: PANEL_SHADOW }}>
        <div className="flex flex-wrap items-start gap-3">
          <span className="inline-grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, #16a34a 10%, transparent)", color: GREEN_DEEP }}>
            <Layers size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-black tracking-tight text-ink-strong">{selected.name} · DCC Master</h2>
            <p className="mt-0.5 flex items-start gap-1.5 text-[13px] font-semibold text-ink-subtle">
              <Users size={14} className="mt-0.5 shrink-0" /> <span>Applies to {reach}: {holdersText}</span>
            </p>
          </div>
          {canAuthor && !missing && !adding && (
            <button
              onClick={() => { setAdding(true); setEditingId(null); }}
              className="wg-btn inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
            >
              <Plus size={16} /> Add KPI to master
            </button>
          )}
        </div>

        {!canAuthor && (
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
            <Lock size={13} /> Only Manan Sir and the super-admins can change a DCC Master.
          </p>
        )}

        {adding && (
          <div className="mt-4">
            <KpiForm
              initial={EMPTY}
              sections={sections}
              submitLabel={`Add to ${selected.name}`}
              onCancel={() => setAdding(false)}
              onSubmit={async (v) => {
                const res = await createDccMasterItem({ designationId: selected.id, ...payloadOf(v) });
                if (res.ok) {
                  fireToast({ message: `Added — now on the DCC of ${reach}.`, type: "success" });
                  setAdding(false);
                  router.refresh();
                }
                return res;
              }}
            />
          </div>
        )}

        <div className="mt-4">
          {rows.length === 0 ? (
            <Empty title="This master is empty" body={canAuthor ? "Add the KPIs every person in this position should fill." : "No KPIs have been added to this position yet."} />
          ) : (
            <KpiTable>
              {rows.map((r, i) =>
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td colSpan={6} className="px-3 py-3">
                      <KpiForm
                        initial={valuesOf(r)}
                        sections={sections}
                        submitLabel="Save for everyone"
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (v) => {
                          const res = await updateDccMasterItem({ id: r.id, ...payloadOf(v) });
                          if (res.ok) {
                            fireToast({ message: `Saved — updated for ${reach}.`, type: "success" });
                            setEditingId(null);
                            router.refresh();
                          }
                          return res;
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <KpiRow
                    key={r.id}
                    n={i + 1}
                    row={r}
                    muted={!r.isActive}
                    badge={!r.isActive ? <Chip tone="grey">Retired</Chip> : null}
                    actions={
                      canAuthor ? (
                        <>
                          {r.isActive && <IconButton label="Edit" onClick={() => { setEditingId(r.id); setAdding(false); }}><Pencil size={14} /></IconButton>}
                          <IconButton label={r.isActive ? "Retire" : "Restore"} onClick={() => retire(r)} disabled={pending} danger={r.isActive}>
                            {r.isActive ? <Archive size={14} /> : <RotateCcw size={14} />}
                          </IconButton>
                        </>
                      ) : null
                    }
                  />
                ),
              )}
            </KpiTable>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Employee DCC ────────────────────────────── */

function EmployeeDcc({ designations, people, employeeId, meId, employeeItems, canManageEmployee }: React.ComponentProps<typeof DccMasterView>) {
  const router = useRouter();
  const person = people.find((p) => p.id === employeeId);
  const designation = designations.find((d) => d.id === person?.designationId) ?? null;
  const fromMaster = employeeItems.filter((i) => i.masterDesignation);
  const specific = employeeItems.filter((i) => !i.masterDesignation);
  const sections = React.useMemo(() => distinct(employeeItems.map((i) => i.section)), [employeeItems]);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const firstName = (person?.name ?? "").split(" ")[0] || "this person";

  function remove(it: DccItemRow) {
    if (!window.confirm(`Delete "${it.title}" from ${firstName}'s DCC? Its history is kept.`)) return;
    start(async () => {
      const res = await deleteDccItem(it.id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "KPI removed.", type: "info" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-surface-card px-4 py-3" style={{ boxShadow: PANEL_SHADOW }}>
        <UserRound size={18} className="text-ink-subtle" />
        <select
          value={employeeId}
          onChange={(e) => router.push(`/dcc/masters?view=employee&emp=${e.target.value}` as Route, { scroll: false })}
          className="bg-transparent text-[16px] font-bold text-ink-strong outline-none"
          aria-label="Choose an employee"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (me)` : p.name}</option>
          ))}
        </select>
        <Chip tone={designation ? "green" : "amber"}>{designation ? designation.name : "No designation"}</Chip>
        <Link href={`/dcc?emp=${employeeId}` as Route} className="ml-auto text-[13px] font-bold hover:underline" style={{ color: GREEN_DEEP }}>
          Open their DCC board →
        </Link>
      </div>

      <div className="rounded-[22px] bg-surface-card p-5 max-md:p-4" style={{ boxShadow: PANEL_SHADOW }}>
        <SectionTitle icon={<Layers size={16} />} title={designation ? `From the ${designation.name} master` : "From a position master"} count={fromMaster.length}>
          {designation && (
            <Link href={`/dcc/masters?designation=${designation.id}` as Route} className="text-[12.5px] font-bold hover:underline" style={{ color: GREEN_DEEP }}>
              View master
            </Link>
          )}
        </SectionTitle>
        {fromMaster.length === 0 ? (
          <p className="mt-3 text-[13.5px] font-medium text-ink-subtle">
            {designation
              ? `The ${designation.name} master has no KPIs yet.`
              : `${firstName} has no designation, so no master applies. Set one in HR.`}
          </p>
        ) : (
          <div className="mt-3">
            <KpiTable>
              {fromMaster.map((it, i) => (
                <KpiRow key={it.id} n={i + 1} row={it} badge={<Chip tone="green"><Lock size={11} /> Master</Chip>} actions={null} />
              ))}
            </KpiTable>
          </div>
        )}
      </div>

      <div className="rounded-[22px] bg-surface-card p-5 max-md:p-4" style={{ boxShadow: PANEL_SHADOW }}>
        <SectionTitle icon={<UserRound size={16} />} title={`Specific to ${firstName}`} count={specific.length}>
          {canManageEmployee && !adding && (
            <button
              onClick={() => { setAdding(true); setEditingId(null); }}
              className="wg-btn inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}
            >
              <Plus size={15} /> Add specific KPI
            </button>
          )}
        </SectionTitle>

        {adding && (
          <div className="mt-4">
            <KpiForm
              initial={EMPTY}
              sections={sections}
              submitLabel={`Add for ${firstName}`}
              onCancel={() => setAdding(false)}
              onSubmit={async (v) => {
                const res = await createDccItem({ ownerEmployeeId: employeeId, ...payloadOf(v) });
                if (res.ok) {
                  fireToast({ message: "KPI added.", type: "success" });
                  setAdding(false);
                  router.refresh();
                }
                return res;
              }}
            />
          </div>
        )}

        {specific.length === 0 ? (
          <p className="mt-3 text-[13.5px] font-medium text-ink-subtle">No KPIs specific to {firstName}.</p>
        ) : (
          <div className="mt-3">
            <KpiTable>
              {specific.map((it, i) =>
                editingId === it.id ? (
                  <tr key={it.id}>
                    <td colSpan={6} className="px-3 py-3">
                      <KpiForm
                        initial={valuesOf(it)}
                        sections={sections}
                        submitLabel="Save"
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (v) => {
                          const res = await updateDccItem({ id: it.id, ...payloadOf(v) });
                          if (res.ok) {
                            fireToast({ message: "KPI saved.", type: "success" });
                            setEditingId(null);
                            router.refresh();
                          }
                          return res;
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <KpiRow
                    key={it.id}
                    n={i + 1}
                    row={it}
                    badge={null}
                    actions={
                      canManageEmployee ? (
                        <>
                          <IconButton label="Edit" onClick={() => { setEditingId(it.id); setAdding(false); }}><Pencil size={14} /></IconButton>
                          {it.deleteLocked ? (
                            <span className="grid size-8 place-items-center text-ink-subtle" title="Given by Manan Sir. Only he can delete it."><Lock size={14} /></span>
                          ) : (
                            <IconButton label="Delete" onClick={() => remove(it)} disabled={pending} danger><Trash2 size={14} /></IconButton>
                          )}
                        </>
                      ) : null
                    }
                  />
                ),
              )}
            </KpiTable>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Primitives ─────────────────────────────── */

function KpiForm({ initial, sections, submitLabel, onSubmit, onCancel }: {
  initial: KpiValues;
  sections: string[];
  submitLabel: string;
  onSubmit: (v: KpiValues) => Promise<Result>;
  onCancel: () => void;
}) {
  const [v, setV] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const listId = React.useId();
  const schedule = describeSchedule(v.frequency);
  const set = (k: keyof KpiValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((cur) => ({ ...cur, [k]: e.target.value }));

  function save() {
    if (!v.title.trim()) { fireToast({ message: "A title is required.", type: "error" }); return; }
    start(async () => {
      const res = await onSubmit(v);
      if (!res.ok) fireToast({ message: res.error ?? "Couldn't save.", type: "error" });
    });
  }

  return (
    <div className="rounded-2xl bg-surface-soft p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="grid grid-cols-6 gap-2.5 max-md:grid-cols-2">
        <input autoFocus value={v.title} onChange={set("title")} placeholder="KPI title *" className={`${INPUT} col-span-6 max-md:col-span-2`} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <input value={v.section} onChange={set("section")} list={listId} placeholder="Section" className={`${INPUT} col-span-2`} />
        <input value={v.code} onChange={set("code")} placeholder="Code (A1)" className={`${INPUT} col-span-1`} />
        <input value={v.frequency} onChange={set("frequency")} placeholder="Frequency (Daily, Wed & Sat…)" className={`${INPUT} col-span-3 max-md:col-span-1`} />
        <input value={v.targetNumber} onChange={set("targetNumber")} placeholder="Target number" inputMode="decimal" className={`${INPUT} col-span-2 max-md:col-span-1`} />
        <input value={v.unit} onChange={set("unit")} placeholder="Unit (calls, count…)" className={`${INPUT} col-span-2 max-md:col-span-1`} />
      </div>
      <datalist id={listId}>{sections.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`text-[12.5px] font-semibold ${schedule.warn ? "text-[#b45309]" : "text-ink-subtle"}`}>
          {schedule.warn && <TriangleAlert size={12} className="mr-1 inline" />}
          Shows as: {schedule.label}
        </span>
        <button onClick={onCancel} className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-bold text-ink-soft hover:bg-white"><X size={14} /> Cancel</button>
        <button onClick={save} disabled={pending} className="wg-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}>
          <Check size={15} /> {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function KpiTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <table className="w-full min-w-[760px] text-[13.5px]">
        <thead>
          <tr className="border-b border-hairline bg-surface-soft text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle">
            <th className="w-12 px-3 py-2.5 text-right">#</th>
            <th className="w-44 px-3 py-2.5">Section</th>
            <th className="px-3 py-2.5">KPI</th>
            <th className="w-56 px-3 py-2.5">Frequency</th>
            <th className="w-32 px-3 py-2.5">Target</th>
            <th className="w-24 px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function KpiRow({ n, row, badge, actions, muted }: {
  n: number;
  row: { section: string | null; code: string | null; title: string; frequency: string | null; targetNumber: string | null; unit: string | null };
  badge: React.ReactNode;
  actions: React.ReactNode;
  muted?: boolean;
}) {
  const schedule = describeSchedule(row.frequency);
  return (
    <tr className={`border-b border-hairline last:border-b-0 ${muted ? "opacity-55" : ""}`}>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-subtle">{n}</td>
      <td className="px-3 py-2.5 font-semibold text-ink-soft">{row.section || "—"}</td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {row.code && <span className="rounded-md bg-surface-soft px-1.5 py-0.5 text-[12px] font-extrabold tabular-nums text-ink-muted">{row.code}</span>}
          <span className="font-bold text-ink-strong">{row.title}</span>
          {badge}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="font-semibold text-ink-soft">{row.frequency || "—"}</div>
        <div className={`text-[11.5px] font-semibold ${schedule.warn ? "text-[#b45309]" : "text-ink-subtle"}`}>{schedule.label}</div>
      </td>
      <td className="px-3 py-2.5 font-semibold text-ink-soft">{row.targetNumber ? `${Number(row.targetNumber)}${row.unit ? ` ${row.unit}` : ""}` : row.unit || "—"}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1">{actions}</div>
      </td>
    </tr>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-lg text-ink-subtle transition-colors disabled:opacity-50 ${danger ? "hover:text-altus-red" : "hover:text-[#15803d]"}`}
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
    >
      {children}
    </button>
  );
}

function Chip({ tone, children }: { tone: "green" | "grey" | "amber"; children: React.ReactNode }) {
  const style =
    tone === "green"
      ? { background: "color-mix(in srgb, #16a34a 12%, transparent)", color: GREEN_DEEP }
      : tone === "amber"
        ? { background: "#FFFBEB", color: "#92400E" }
        : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" };
  return <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-bold" style={style}>{children}</span>;
}

function SectionTitle({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="inline-grid size-8 place-items-center rounded-[10px]" style={{ background: "color-mix(in srgb, #16a34a 10%, transparent)", color: GREEN_DEEP }}>{icon}</span>
      <h3 className="text-[15px] font-black tracking-tight text-ink-strong">{title}</h3>
      <span className="text-[13px] font-bold text-ink-subtle">{count}</span>
      <span className="ml-auto">{children}</span>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline-strong px-6 py-10 text-center">
      <p className="text-[14.5px] font-bold text-ink-strong">{title}</p>
      <p className="mt-1 text-[13px] text-ink-subtle">{body}</p>
    </div>
  );
}

function distinct(values: (string | null)[]): string[] {
  const seen: string[] = [];
  for (const v of values) {
    const s = (v ?? "").trim();
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen;
}
