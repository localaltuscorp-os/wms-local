"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Plus,
  Pencil,
  History as HistoryIcon,
  Power,
  Trash2,
  X,
  Target,
  ChevronDown,
  Check,
  Sparkles,
  Info,
} from "lucide-react";
import {
  KPI_FREQUENCIES,
  KPI_FREQUENCY_LABELS,
  KPI_CHANGE_TYPE_LABELS,
  type KpiFrequency,
} from "@/db/enums";
import {
  KPI_CATALOG,
  suggestedKpisForName,
  type KpiCatalogEntry,
} from "@/lib/hr/kpi/catalog";
import { LookupSelect } from "@/components/ui/lookup-select";
import { formatDate, localDateString } from "@/lib/format";
import { quarterWindow } from "@/lib/hr/kpi/quarter";

/** Options for the searchable KPI picker: "Manual entry" + every dictionary KPI. */
const CATALOG_OPTIONS = [
  { id: "__manual__", name: "Manual entry (type below)" },
  ...KPI_CATALOG.map((e) => ({ id: e.key, name: `${e.owner} — ${e.name}` })),
];
import {
  loadKpiAssignments,
  loadKpiHistory,
  saveKpiAssignment,
  setKpiApplicable,
  setKpiStatus,
  removeKpiAssignment,
  type KpiRosterOption,
  type KpiAssignmentDTO,
  type KpiHistoryDTO,
} from "@/app/(app)/hr/kpi/actions";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/* Static CSS (no styled-jsx — see hr-landing.tsx note). */
const CSS = `
  .kpi-in { animation: kpiFade 0.4s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes kpiFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes kpiOverlay { from { opacity: 0; } to { opacity: 1; } }
  @keyframes kpiPop { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes kpiSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .kpi-switch { transition: background 0.18s ease; }
  .kpi-knob { transition: transform 0.18s cubic-bezier(0.22,1,0.36,1); }
  .kpi-lookup-trigger:hover { border-color: var(--color-ink-muted, #94a3b8); }
  .kpi-lookup-trigger[aria-expanded="true"] { border-color: var(--color-altus-red); box-shadow: 0 0 0 3px rgba(225,6,0,.13); outline: none; }
  @media (prefers-reduced-motion: reduce) { .kpi-in { animation: none !important; } }
`;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function achievement(current: string | null, target: string): number | null {
  const c = parseFloat((current ?? "").replace(/[^0-9.\-]/g, ""));
  const t = parseFloat((target ?? "").replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(c) || !Number.isFinite(t) || t === 0) return null;
  return Math.round((c / t) * 100);
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${formatDate(localDateString("Asia/Kolkata", d))}, ${time}`;
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

export function KpiWorkbench({
  roster,
  initialQuarter,
  notificationsOn,
}: {
  roster: KpiRosterOption[];
  initialQuarter: string;
  notificationsOn: boolean;
}) {
  const [employeeId, setEmployeeId] = React.useState<string | null>(null);
  const [quarter, setQuarter] = React.useState(initialQuarter);
  const [rows, setRows] = React.useState<KpiAssignmentDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<KpiAssignmentDTO | "new" | null>(null);
  const [historyFor, setHistoryFor] = React.useState<KpiAssignmentDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const employee = React.useMemo(
    () => roster.find((r) => r.id === employeeId) ?? null,
    [roster, employeeId],
  );
  const quarters = React.useMemo(() => quarterWindow(6, 2), []);
  const years = React.useMemo(
    () => [...new Set(quarters.map((q) => q.split("-")[0]!))].sort((a, b) => b.localeCompare(a)),
    [quarters],
  );

  const refresh = React.useCallback(() => {
    if (!employeeId) {
      setRows([]);
      return;
    }
    setLoading(true);
    loadKpiAssignments(employeeId, quarter)
      .then(setRows)
      .catch(() => setError("Could not load KPIs."))
      .finally(() => setLoading(false));
  }, [employeeId, quarter]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const totalWeight = rows
    .filter((r) => r.applicable && r.status === "active")
    .reduce((s, r) => s + r.weightage, 0);

  return (
    <div className="kpi-in">
      {/* Intro — just the centered brand badge (the top bar already titles the page) */}
      <div className="mb-6 flex justify-center">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          <Target size={12} strokeWidth={2.6} /> Altus · Performance
        </span>
      </div>

      {/* Controls — a compact toolbar card (employee squeezed, year-filtered quarter) */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-hairline bg-white p-3.5 shadow-[0_10px_30px_-24px_rgba(24,24,27,0.5)]">
        <div className="min-w-[240px] max-w-[440px] flex-1">
          <EmployeePicker roster={roster} value={employeeId} onChange={setEmployeeId} />
        </div>
        <QuarterSelect value={quarter} years={years} onChange={setQuarter} />
        <button
          type="button"
          disabled={!employeeId}
          onClick={() => { setError(null); setEditing("new"); }}
          className="ml-auto inline-flex h-[46px] items-center gap-2 rounded-xl px-5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 max-md:ml-0 max-md:w-full max-md:justify-center"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
        >
          <Plus size={17} strokeWidth={2.6} /> Assign KPI
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Body */}
      {!employeeId ? (
        <EmptyState
          title="Pick an employee to begin"
          sub="Choose someone above to see and manage their KPIs for the selected quarter."
        />
      ) : loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-black/[0.04]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No KPIs for ${employee?.name ?? "this employee"} in ${quarter}`}
          sub="Assign the first KPI for this quarter — pick from the appraisal dictionary or enter one manually."
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-ink-muted">
            <span>{rows.length} KPI{rows.length === 1 ? "" : "s"} · {quarter}</span>
            <span className={totalWeight === 100 ? "text-emerald-600" : totalWeight > 100 ? "text-red-600" : ""}>
              Active applicable weightage: {totalWeight}%
            </span>
          </div>
          <div className="grid gap-3">
            {rows.map((r) => (
              <AssignmentCard
                key={r.id}
                row={r}
                onEdit={() => { setError(null); setEditing(r); }}
                onHistory={() => setHistoryFor(r)}
                onToggleApplicable={(next) =>
                  startTransition(async () => {
                    const res = await setKpiApplicable({ id: r.id, applicable: next });
                    if (!res.ok) setError(res.error);
                    refresh();
                  })
                }
                onToggleStatus={() =>
                  startTransition(async () => {
                    const res = await setKpiStatus({
                      id: r.id,
                      status: r.status === "active" ? "inactive" : "active",
                    });
                    if (!res.ok) setError(res.error);
                    refresh();
                  })
                }
                onRemove={() =>
                  startTransition(async () => {
                    const res = await removeKpiAssignment({ id: r.id });
                    if (!res.ok) setError(res.error);
                    refresh();
                  })
                }
              />
            ))}
          </div>
        </>
      )}

      {editing && employee && (
        <EditorModal
          employee={employee}
          quarter={quarter}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
          onError={setError}
        />
      )}

      {historyFor && (
        <HistoryDrawer assignment={historyFor} onClose={() => setHistoryFor(null)} />
      )}

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* employee picker                                                    */
/* ------------------------------------------------------------------ */

function EmployeePicker({
  roster,
  value,
  onChange,
}: {
  roster: KpiRosterOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = roster.find((r) => r.id === value) ?? null;

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = roster.filter((r) =>
    `${r.name} ${r.designation} ${r.department}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="relative" ref={ref}>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Employee</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[46px] w-full items-center justify-between gap-2 rounded-xl border border-hairline bg-white px-4 text-left text-[14px] font-semibold text-ink-strong transition-colors hover:border-hairline-strong"
      >
        <span className="truncate">
          {selected ? selected.name : <span className="text-ink-soft">Select an employee…</span>}
          {selected?.designation && <span className="ml-2 text-[12px] font-medium text-ink-soft">{selected.designation}</span>}
        </span>
        <ChevronDown size={17} className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-hairline bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <Search size={15} className="text-ink-soft" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Local search — people" title="Local search — filters only the list on this page" aria-label="Local search — people — this page only"
              className="w-full bg-transparent text-[13.5px] font-medium outline-none placeholder:text-ink-soft"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-[13px] text-ink-soft">No matches.</div>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { onChange(r.id); setOpen(false); setQ(""); }}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink-strong">{r.name}</span>
                    <span className="block truncate text-[12px] font-medium text-ink-soft">
                      {[r.designation, r.department].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  {r.id === value && <Check size={16} style={{ color: RED }} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Year filter + Quarter — two compact selects that compose the "YYYY-Qn" value. */
function QuarterSelect({
  value,
  years,
  onChange,
}: {
  value: string;
  years: string[];
  onChange: (q: string) => void;
}) {
  const parts = value.split("-");
  const year = parts[0] ?? years[0] ?? "";
  const qtr = parts[1] ?? "Q1";
  const yearOpts = years.includes(year) ? years : [year, ...years];
  const selCls =
    "h-[46px] appearance-none rounded-xl border border-hairline bg-white pl-4 pr-9 text-[14px] font-semibold text-ink-strong outline-none transition-colors hover:border-hairline-strong focus:border-[var(--color-altus-red)]";
  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Year</label>
        <div className="relative">
          <select value={year} onChange={(e) => onChange(`${e.target.value}-${qtr}`)} className={`${selCls} w-[100px]`}>
            {yearOpts.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-soft">Quarter</label>
        <div className="relative">
          <select value={qtr} onChange={(e) => onChange(`${year}-${e.target.value}`)} className={`${selCls} w-[92px]`}>
            {["Q1", "Q2", "Q3", "Q4"].map((qq) => (<option key={qq} value={qq}>{qq}</option>))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* assignment card                                                    */
/* ------------------------------------------------------------------ */

function AssignmentCard({
  row,
  onEdit,
  onHistory,
  onToggleApplicable,
  onToggleStatus,
  onRemove,
}: {
  row: KpiAssignmentDTO;
  onEdit: () => void;
  onHistory: () => void;
  onToggleApplicable: (next: boolean) => void;
  onToggleStatus: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const pct = achievement(row.currentValue, row.targetValue);
  const inactive = row.status !== "active";
  const isDict = row.source === "dictionary";

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border bg-white p-4 transition-shadow hover:shadow-md"
      style={{
        borderColor: isDict
          ? "color-mix(in srgb, #f59e0b 32%, white)"
          : inactive
            ? "color-mix(in srgb, #71717a 25%, white)"
            : "color-mix(in srgb, #E10600 28%, white)",
        opacity: inactive ? 0.72 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-4 max-md:flex-col">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-extrabold tracking-tight text-ink-strong">{row.kpiName}</h3>
            {isDict ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider"
                style={{ background: "color-mix(in srgb, #f59e0b 16%, white)", color: "#b45309" }}
              >
                <Sparkles size={10} /> From appraisal
              </span>
            ) : (
              <>
                {row.kpiKey ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
                    <Sparkles size={10} /> Dictionary
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-black/[0.04] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
                    Manual
                  </span>
                )}
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider"
                  style={
                    inactive
                      ? { background: "color-mix(in srgb, #71717a 14%, white)", color: "#52525b" }
                      : { background: "color-mix(in srgb, #16a34a 14%, white)", color: "#15803d" }
                  }
                >
                  {inactive ? "Inactive" : "Active"}
                </span>
              </>
            )}
          </div>

          <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-4 gap-y-2.5">
            <Field label="Category" value={row.category || "—"} />
            <Field label="Frequency" value={KPI_FREQUENCY_LABELS[row.frequency as KpiFrequency] ?? row.frequency} />
            <Field label="Weightage" value={`${row.weightage}%`} />
            <Field label="Effective" value={row.effectiveQuarter} />
            <Field label="Target" value={row.targetValue || "—"} />
            <Field label="Current" value={row.currentValue?.trim() || "—"} />
            <Field
              label="Achievement"
              value={pct === null ? "—" : `${pct}%`}
              tone={pct === null ? undefined : pct >= 100 ? "green" : pct >= 60 ? "amber" : "red"}
            />
          </dl>
        </div>

        {/* right rail — inherited rows adopt; saved rows toggle/edit/remove */}
        {isDict ? (
          <div className="flex shrink-0 flex-col items-end gap-2 max-md:w-full max-md:items-stretch">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.7)" }}
            >
              <Pencil size={14} /> Adopt &amp; edit
            </button>
            <span className="max-w-[190px] text-right text-[11px] font-medium leading-snug text-ink-subtle max-md:max-w-none">
              Set in the appraisal — adopt to manage &amp; track it here.
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-3 max-md:w-full max-md:flex-row max-md:items-center max-md:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-ink-muted">Applicable This Quarter</span>
              <Toggle on={row.applicable} onClick={() => onToggleApplicable(!row.applicable)} />
              <span className="w-7 text-[12px] font-bold" style={{ color: row.applicable ? RED_DEEP : "#a1a1aa" }}>
                {row.applicable ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <IconBtn label="Edit" onClick={onEdit}><Pencil size={15} /></IconBtn>
              <IconBtn label="History" onClick={onHistory}><HistoryIcon size={15} /></IconBtn>
              <IconBtn label={inactive ? "Activate" : "Deactivate"} onClick={onToggleStatus}><Power size={15} /></IconBtn>
              {confirmRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-red-600 px-2.5 text-[12px] font-bold text-white"
                >
                  <Trash2 size={14} /> Confirm
                </button>
              ) : (
                <IconBtn label="Remove" danger onClick={() => { setConfirmRemove(true); setTimeout(() => setConfirmRemove(false), 3500); }}>
                  <Trash2 size={15} />
                </IconBtn>
              )}
            </div>
          </div>
        )}
      </div>

      {/* achievement bar */}
      {pct !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, pct))}%`,
              background: pct >= 100 ? "#16a34a" : pct >= 60 ? "#f59e0b" : RED,
            }}
          />
        </div>
      )}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  const color = tone === "green" ? "#15803d" : tone === "amber" ? "#b45309" : tone === "red" ? RED_DEEP : undefined;
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</dt>
      <dd className="mt-0.5 truncate text-[13.5px] font-bold text-ink-strong" style={color ? { color } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="kpi-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full"
      style={{ background: on ? RED : "#d4d4d8" }}
    >
      <span
        className="kpi-knob absolute left-0.5 inline-block h-5 w-5 rounded-full bg-white shadow"
        style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        danger ? "text-red-500 hover:bg-red-50" : "text-ink-soft hover:bg-surface-muted hover:text-ink-strong"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-solid border-hairline bg-white/60 px-6 py-16 text-center">
      <span
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
      >
        <Target size={26} strokeWidth={2.2} />
      </span>
      <h3 className="mt-4 text-[17px] font-extrabold tracking-tight text-ink-strong">{title}</h3>
      <p className="mt-1 max-w-[46ch] text-[13.5px] font-medium text-ink-muted">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* editor modal                                                       */
/* ------------------------------------------------------------------ */

function EditorModal({
  employee,
  quarter,
  existing,
  onClose,
  onSaved,
  onError,
}: {
  employee: KpiRosterOption;
  quarter: string;
  existing: KpiAssignmentDTO | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const suggested = React.useMemo(() => suggestedKpisForName(employee.name), [employee.name]);
  // A dictionary-inherited row is ADOPTED (created), not edited in place — its
  // synthetic "dict:" id must never be sent to the update path.
  const isEdit = existing != null && existing.source !== "dictionary";
  const [kpiKey, setKpiKey] = React.useState<string | null>(isEdit ? existing!.kpiKey ?? null : null);
  const [kpiName, setKpiName] = React.useState(existing?.kpiName ?? "");
  const [category, setCategory] = React.useState(existing?.category ?? "");
  const [frequency, setFrequency] = React.useState<KpiFrequency>(
    (existing?.frequency as KpiFrequency) ?? "monthly",
  );
  const [weightage, setWeightage] = React.useState(String(existing?.weightage ?? ""));
  const [effectiveQuarter, setEffectiveQuarter] = React.useState(existing?.effectiveQuarter ?? quarter);
  const [targetValue, setTargetValue] = React.useState(existing?.targetValue ?? "");
  const [currentValue, setCurrentValue] = React.useState(existing?.currentValue ?? "");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const quarters = React.useMemo(() => quarterWindow(6, 2), []);

  const applyCatalog = (entry: KpiCatalogEntry) => {
    setKpiKey(entry.key);
    setKpiName(entry.name);
    setCategory(entry.owner);
    setFrequency(entry.frequency);
    setWeightage(String(entry.weightage));
    setTargetValue(entry.target);
  };

  const onPickCatalog = (val: string) => {
    if (val === "__manual__") { setKpiKey(null); return; }
    const entry = KPI_CATALOG.find((e) => e.key === val) ?? suggested.find((e) => e.key === val);
    if (entry) applyCatalog(entry);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    onError("");
    if (!kpiName.trim()) { onError("KPI name is required."); return; }
    setSaving(true);
    const res = await saveKpiAssignment({
      id: isEdit ? existing!.id : undefined,
      employeeId: employee.id,
      kpiKey,
      kpiName: kpiName.trim(),
      category: category.trim(),
      frequency,
      weightage: Number(weightage || 0),
      effectiveQuarter,
      targetValue: targetValue.trim(),
      currentValue: currentValue.trim() || null,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (!res.ok) { onError(res.error); return; }
    onSaved();
  };

  // Portal to <body> so the fixed overlay escapes the transformed `.kpi-in`
  // ancestor (its entrance animation leaves a transform that would otherwise
  // become the containing block and clip the modal's header).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)", animation: "kpiOverlay 0.18s ease-out both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="max-h-[92dvh] w-full max-w-[640px] overflow-y-auto rounded-[22px] bg-white"
        style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)", border: "1px solid color-mix(in srgb, #E10600 22%, white)", animation: "kpiPop 0.24s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-white/95 px-6 py-4 backdrop-blur">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: RED_DEEP }}>
              {isEdit ? "Edit KPI" : "Assign KPI"} · {employee.name}
            </span>
            <h2
              className="mt-1 text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.05 }}
            >
              {isEdit ? kpiName || "KPI" : "New KPI assignment"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid gap-4 p-6">
          {/* catalog picker — searchable premium combobox */}
          <FieldWrap label="KPI (from appraisal dictionary, or manual)">
            <LookupSelect
              label="KPI"
              value={kpiKey ?? "__manual__"}
              onChange={(id) => onPickCatalog(id ?? "__manual__")}
              options={CATALOG_OPTIONS}
              placeholder="Search KPIs…"
              className="kpi-lookup-trigger h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong"
            />
          </FieldWrap>

          <FieldWrap label="KPI name">
            <input
              value={kpiName}
              onChange={(e) => { setKpiName(e.target.value); setKpiKey(null); }}
              placeholder="e.g. References collected"
              className="h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
            />
          </FieldWrap>

          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <FieldWrap label="Category">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Sales"
                className="h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
              />
            </FieldWrap>
            <FieldWrap label="Frequency">
              <div className="relative">
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as KpiFrequency)}
                  className="h-[44px] w-full appearance-none rounded-xl border border-hairline bg-white pl-4 pr-10 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
                >
                  {KPI_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{KPI_FREQUENCY_LABELS[f]}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              </div>
            </FieldWrap>
          </div>

          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <FieldWrap label="Weightage (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={weightage}
                onChange={(e) => setWeightage(e.target.value)}
                placeholder="0"
                className="h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
              />
            </FieldWrap>
            <FieldWrap label="Effective quarter">
              <div className="relative">
                <select
                  value={effectiveQuarter}
                  onChange={(e) => setEffectiveQuarter(e.target.value)}
                  className="h-[44px] w-full appearance-none rounded-xl border border-hairline bg-white pl-4 pr-10 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
                >
                  {Array.from(new Set([effectiveQuarter, ...quarters])).map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              </div>
            </FieldWrap>
            <FieldWrap label="Target">
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="e.g. 40"
                className="h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
              />
            </FieldWrap>
          </div>

          <FieldWrap label="Current value (optional — may be computed later)">
            <input
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              placeholder="Leave blank to compute later"
              className="h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
            />
          </FieldWrap>

          <FieldWrap label="Reason for this change (optional — recorded in history & email)">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Q2 realignment"
              className="h-[44px] w-full rounded-xl border border-hairline bg-white px-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
            />
          </FieldWrap>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-hairline bg-white/95 px-6 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-ink-muted transition-colors hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Assign KPI"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* history drawer                                                     */
/* ------------------------------------------------------------------ */

function HistoryDrawer({
  assignment,
  onClose,
}: {
  assignment: KpiAssignmentDTO;
  onClose: () => void;
}) {
  const [rows, setRows] = React.useState<KpiHistoryDTO[] | null>(null);

  React.useEffect(() => {
    loadKpiHistory(assignment.id).then(setRows).catch(() => setRows([]));
  }, [assignment.id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex justify-end"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)", animation: "kpiOverlay 0.18s ease-out both" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex h-full w-full max-w-[460px] flex-col bg-white"
        style={{ boxShadow: "-30px 0 80px -30px rgba(15,23,42,0.5)", animation: "kpiSlide 0.28s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: RED_DEEP }}>Change history</span>
            <h3 className="mt-0.5 truncate text-[16px] font-extrabold tracking-tight text-ink-strong">{assignment.kpiName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {rows === null ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-black/[0.04]" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] font-medium text-ink-soft">No history yet.</p>
          ) : (
            <ol className="relative ml-2 border-l border-hairline">
              {rows.map((h) => (
                <li key={h.id} className="relative mb-5 pl-5">
                  <span
                    className="absolute -left-[6.5px] top-1.5 h-3 w-3 rounded-full border-2 border-white"
                    style={{ background: RED }}
                  />
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white"
                      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                    >
                      {KPI_CHANGE_TYPE_LABELS[h.changeType as keyof typeof KPI_CHANGE_TYPE_LABELS] ?? h.changeType}
                    </span>
                    <span className="text-[11.5px] font-medium text-ink-soft">{fmtWhen(h.changedOn)}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-semibold text-ink-strong">
                    {h.changedByName ?? "Someone"}
                  </p>
                  <HistoryDiff previous={h.previous} updated={h.updated} />
                  {h.reason && (
                    <p className="mt-1.5 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-[12.5px] font-medium text-ink-muted">
                      “{h.reason}”
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const DIFF_FIELDS: Array<[string, string]> = [
  ["kpiName", "KPI"],
  ["category", "Category"],
  ["frequency", "Frequency"],
  ["weightage", "Weightage"],
  ["effectiveQuarter", "Effective"],
  ["targetValue", "Target"],
  ["currentValue", "Current"],
  ["applicable", "Applicable"],
  ["status", "Status"],
];

function HistoryDiff({ previous, updated }: { previous: unknown; updated: unknown }) {
  const prev = (previous ?? null) as Record<string, unknown> | null;
  const next = (updated ?? null) as Record<string, unknown> | null;
  if (!next) return null;

  const fmt = (v: unknown) =>
    v === true ? "Yes" : v === false ? "No" : v === null || v === undefined || v === "" ? "—" : String(v);

  const changed = DIFF_FIELDS.filter(([k]) => !prev || prev[k] !== next[k]);
  if (changed.length === 0) return null;

  return (
    <div className="mt-2 grid gap-1">
      {changed.map(([k, label]) => (
        <div key={k} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-[74px] shrink-0 font-bold uppercase tracking-wide text-[10.5px] text-ink-soft">{label}</span>
          {prev ? (
            <>
              <span className="text-ink-soft line-through">{fmt(prev[k])}</span>
              <span className="text-ink-soft">→</span>
              <span className="font-bold text-ink-strong">{fmt(next[k])}</span>
            </>
          ) : (
            <span className="font-bold text-ink-strong">{fmt(next[k])}</span>
          )}
        </div>
      ))}
    </div>
  );
}
