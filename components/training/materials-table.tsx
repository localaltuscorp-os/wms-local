"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X, FileText, Film, Table2, GraduationCap, Check, Archive, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { archiveMaterial, deleteMaterial } from "@/app/(app)/training/actions";
import type { TcMaterialRow } from "@/lib/queries/training";

type SortKey = "addedOn" | "subject" | "los";

const CHIP = "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export function MaterialsTable({
  rows,
  employeesById,
  canManage = false,
}: {
  rows: TcMaterialRow[];
  employeesById: Record<string, string>;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [inductionOnly, setInductionOnly] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "addedOn", dir: "desc" });

  const archivedCount = React.useMemo(() => rows.filter((r) => r.archived).length, [rows]);

  async function onArchive(e: React.MouseEvent, r: TcMaterialRow) {
    e.stopPropagation();
    setBusyId(r.id);
    const res = await archiveMaterial(r.id, !r.archived);
    setBusyId(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: r.archived ? "Restored." : "Archived.", type: "success" });
    router.refresh();
  }
  async function onDelete(e: React.MouseEvent, r: TcMaterialRow) {
    e.stopPropagation();
    const name = r.fileName || r.subject || "this material";
    if (!confirm(`Delete ${name} permanently? Its tests, questions and all attempt/watch records are removed too. This can't be undone.`)) return;
    setBusyId(r.id);
    const res = await deleteMaterial(r.id);
    setBusyId(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Deleted.", type: "success" });
    router.refresh();
  }

  const subjects = React.useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.subject && s.add(r.subject));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (r.archived && !showArchived) return false;
      if (subject && r.subject !== subject) return false;
      if (inductionOnly && !r.partOfInduction) return false;
      if (needle) {
        const hay = [r.subject, r.los, r.fileName, r.version].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = (a[sort.key] ?? "") as string;
      const bv = (b[sort.key] ?? "") as string;
      return av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true }) * dir;
    });
    return out;
  }, [rows, q, subject, inductionOnly, showArchived, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  const inductionCount = React.useMemo(() => rows.filter((r) => r.partOfInduction && (showArchived || !r.archived)).length, [rows, showArchived]);
  const hasFilters = q || subject || inductionOnly;

  function creators(ids: string[]): string {
    const names = ids.map((id) => employeesById[id]).filter(Boolean) as string[];
    if (names.length === 0) return "—";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-[300px] max-md:w-full items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — materials" title="Local search — filters only the list on this page" aria-label="Local search — materials — this page only" className="w-full bg-transparent py-2.5 outline-none text-[15px] font-medium text-ink-strong placeholder:text-ink-subtle placeholder:font-normal" />
        </div>
        <select className={CHIP} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter by subject">
          <option value="">All Subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Induction toggle pill — one tap to see only induction sessions. */}
        <button
          type="button"
          onClick={() => setInductionOnly((v) => !v)}
          aria-pressed={inductionOnly}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-bold transition-colors"
          style={
            inductionOnly
              ? { background: "linear-gradient(135deg, var(--color-purple), var(--color-purple-deep))", color: "#fff", boxShadow: "0 6px 16px -8px rgba(124,58,237,0.6)" }
              : { border: "1px solid var(--color-hairline-strong)", background: "#fff", color: "var(--color-ink-soft)" }
          }
        >
          <GraduationCap size={15} strokeWidth={2.4} />
          Induction
          {inductionCount > 0 && (
            <span className="tabular-nums" style={{ opacity: inductionOnly ? 0.9 : 0.6 }}>· {inductionCount}</span>
          )}
        </button>
        {canManage && archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-bold transition-colors"
            style={
              showArchived
                ? { background: "var(--color-ink-strong)", color: "#fff" }
                : { border: "1px solid var(--color-hairline-strong)", background: "#fff", color: "var(--color-ink-soft)" }
            }
          >
            <Archive size={15} strokeWidth={2.4} /> Archived
            <span className="tabular-nums" style={{ opacity: showArchived ? 0.9 : 0.6 }}>· {archivedCount}</span>
          </button>
        )}
        {hasFilters && (
          <button type="button" onClick={() => { setQ(""); setSubject(""); setInductionOnly(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-card px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "material" : "materials"}{hasFilters ? ` · filtered from ${rows.length}` : ""}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 920 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th label="Added" sortKey="addedOn" sort={sort} onSort={toggleSort} />
              <Th label="Subject" sortKey="subject" sort={sort} onSort={toggleSort} />
              <Th label="LOS" sortKey="los" sort={sort} onSort={toggleSort} />
              <Th label="Material" />
              <Th label="Version" />
              <Th label="Created by" />
              <Th label="Induction" />
              <Th label="Watched" />
              {canManage && <Th label="" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={canManage ? 9 : 8} className="px-5 py-16 text-center text-[15px] font-semibold text-ink-muted">No materials match.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/training/${r.id}` as Route)} className="cursor-pointer transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)", opacity: r.archived ? 0.6 : 1 }}>
                  <Td>{fmtDate(r.addedOn)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {r.subject ? <span className="font-semibold text-ink-strong">{r.subject}</span> : <Dim />}
                      {r.archived && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--color-surface-track)", color: "var(--color-ink-subtle)" }}><Archive size={11} /> Archived</span>}
                    </span>
                  </Td>
                  <Td>{r.los || <Dim />}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      {r.videoUrl ? <Film size={16} style={{ color: "var(--color-altus-red)" }} /> : r.fileType === "pdf" ? <FileText size={16} style={{ color: "var(--color-altus-red)" }} /> : r.fileType === "xls" ? <Table2 size={16} style={{ color: "var(--color-green-deep)" }} /> : <Film size={16} style={{ color: "var(--color-altus-red)" }} />}
                      <span className="truncate max-w-[220px] text-ink-strong">{r.fileName || (r.videoUrl ? "Video link" : "—")}</span>
                    </span>
                  </Td>
                  <Td>{r.version || <Dim />}</Td>
                  <Td>{creators(r.createdByIds)}</Td>
                  <Td>{r.partOfInduction ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-purple) 14%, transparent)", color: "var(--color-purple-deep)" }}><GraduationCap size={12} /> Induction</span> : <Dim />}</Td>
                  <Td>{r.watchedByMe ? <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}><Check size={12} strokeWidth={3} /> Watched</span> : <Dim />}</Td>
                  {canManage && (
                    <Td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={(e) => onArchive(e, r)} disabled={busyId === r.id} title={r.archived ? "Restore" : "Archive"} aria-label={r.archived ? "Restore" : "Archive"} className="inline-flex size-8 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft hover:border-ink-subtle disabled:opacity-50">
                          {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : r.archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                        </button>
                        <button type="button" onClick={(e) => onDelete(e, r)} disabled={busyId === r.id} title="Delete" aria-label="Delete" className="inline-flex size-8 items-center justify-center rounded-lg border border-hairline-strong bg-white text-ink-soft hover:border-altus-red hover:text-altus-red disabled:opacity-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ label, sortKey, sort, onSort }: { label: string; sortKey?: SortKey; sort?: { key: SortKey; dir: "asc" | "desc" }; onSort?: (k: SortKey) => void }) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th className="px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap" style={{ background: "var(--color-surface-soft)" }}>
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 hover:text-ink-strong">
          {label}
          {active ? (sort!.dir === "asc" ? <ArrowUp size={13} strokeWidth={2.6} /> : <ArrowDown size={13} strokeWidth={2.6} />) : <ArrowUpDown size={13} strokeWidth={2} style={{ opacity: 0.5 }} />}
        </button>
      ) : label}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle text-[14px] text-ink-soft">{children}</td>;
}
function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}
