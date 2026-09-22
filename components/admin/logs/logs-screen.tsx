"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  filtersToParams,
  PAGE_SIZES,
  QUICK_RANGES,
  SORT_OPTIONS,
  type LogFilters,
} from "@/lib/logs/filters";
import { LOG_EVENT_LABELS, type LogEventType } from "@/lib/logs/events";
import type { LogPage, LogRow } from "@/lib/queries/logs";
import { MultiSelect } from "./multi-select";
import { LogDetailPanel } from "./log-detail-panel";

interface Options {
  functions: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  entities: { id: string; name: string }[];
  moduleTree: { key: string; label: string; children?: { key: string; label: string; children?: unknown[] }[] }[];
  eventTypes: { id: string; label: string }[];
  statuses: { id: string; label: string }[];
}

function flattenPages(
  nodes: Options["moduleTree"],
  out: { group: string; value: string; label: string }[] = [],
): { group: string; value: string; label: string }[] {
  for (const n of nodes) {
    if (n.children?.length) {
      for (const c of n.children) {
        out.push({ group: n.label, value: c.key, label: c.label });
      }
    }
  }
  return out;
}

function localInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoFromLocal(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function LogsScreen({
  initialFilters,
  page,
  options,
}: {
  initialFilters: LogFilters;
  page: LogPage;
  options: Options;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const f = initialFilters;

  const [selected, setSelected] = React.useState<LogRow | null>(null);
  const [search, setSearch] = React.useState(f.q);

  const go = React.useCallback(
    (patch: Partial<LogFilters>) => {
      const next: LogFilters = { ...f, ...patch, page: patch.page ?? 1 };
      router.push(`${pathname}?${filtersToParams(next)}`, { scroll: false });
    },
    [router, pathname, f],
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.q) chips.push({ key: "q", label: `“${f.q}”`, clear: () => go({ q: "" }) });
  for (const id of f.functionIds) {
    const n = options.functions.find((x) => x.id === id)?.name ?? id;
    chips.push({ key: `fn-${id}`, label: n, clear: () => go({ functionIds: f.functionIds.filter((x) => x !== id) }) });
  }
  for (const id of f.employeeIds) {
    const n = options.employees.find((x) => x.id === id)?.name ?? id;
    chips.push({ key: `emp-${id}`, label: n, clear: () => go({ employeeIds: f.employeeIds.filter((x) => x !== id) }) });
  }
  for (const id of f.entityIds) {
    const n = options.entities.find((x) => x.id === id)?.name ?? id;
    chips.push({ key: `ent-${id}`, label: n, clear: () => go({ entityIds: f.entityIds.filter((x) => x !== id) }) });
  }
  for (const key of f.nodes) {
    const flat = flattenPages(options.moduleTree);
    const n = flat.find((x) => x.value === key);
    chips.push({ key: `node-${key}`, label: n ? `${n.group} → ${n.label}` : key, clear: () => go({ nodes: f.nodes.filter((x) => x !== key) }) });
  }
  for (const t of f.eventTypes) {
    chips.push({ key: `ev-${t}`, label: LOG_EVENT_LABELS[t as LogEventType] ?? t, clear: () => go({ eventTypes: f.eventTypes.filter((x) => x !== t) }) });
  }
  for (const s of f.statuses) {
    chips.push({ key: `st-${s}`, label: s, clear: () => go({ statuses: f.statuses.filter((x) => x !== s) }) });
  }
  if (f.from || f.to) {
    chips.push({
      key: "date",
      label: `${f.from ? localInput(f.from) : "…"} – ${f.to ? localInput(f.to) : "…"}`,
      clear: () => go({ from: null, to: null }),
    });
  }

  const exportParams = filtersToParams(f).toString();
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const month = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-surface-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") go({ q: search.trim() });
              }}
              placeholder="Search person, code, resource, route, request id…"
              className="w-full rounded-lg border border-hairline bg-surface-soft py-1.5 pl-8 pr-3 text-[13px] text-ink-strong placeholder:text-ink-subtle"
            />
          </div>

          <select
            aria-label="Quick date range"
            onChange={(e) => {
              const ms = QUICK_RANGES.find((r) => r.id === e.target.value)?.ms;
              if (ms) go({ from: new Date(Date.now() - ms).toISOString(), to: null });
              else go({ from: null, to: null });
            }}
            className="cursor-pointer rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-[13px] font-bold text-ink-strong"
          >
            <option value="">Quick range</option>
            {QUICK_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          <a
            href={`/admin/logs/export?${exportParams}`}
            className="inline-flex items-center gap-1.5 rounded-pill bg-altus-red px-3.5 py-1.5 text-[13px] font-bold text-white"
          >
            <Download size={14} /> Export Excel
          </a>
          <a
            href={`/admin/logs/export?month=${month}&${exportParams}`}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-3.5 py-1.5 text-[13px] font-bold text-ink-strong"
          >
            <Download size={14} /> {month} month
          </a>

          {activeFilterCount(f) > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                router.push(pathname);
              }}
              className="inline-flex items-center gap-1 rounded-pill border border-hairline-strong px-3 py-1.5 text-[13px] font-bold text-ink-muted hover:text-ink-strong"
            >
              <X size={14} /> Clear all
            </button>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <MultiSelect
            label="Function"
            value={f.functionIds}
            onChange={(v) => go({ functionIds: v })}
            options={options.functions.map((x) => ({ value: x.id, label: x.name }))}
          />
          <MultiSelect
            label="Name"
            value={f.employeeIds}
            onChange={(v) => go({ employeeIds: v })}
            options={options.employees.map((x) => ({ value: x.id, label: x.name }))}
          />
          <MultiSelect
            label="Entity"
            value={f.entityIds}
            onChange={(v) => go({ entityIds: v })}
            options={options.entities.map((x) => ({ value: x.id, label: x.name }))}
          />
          <MultiSelect
            label="Module"
            value={f.nodes}
            onChange={(v) => go({ nodes: v })}
            groups={options.moduleTree.map((m) => ({
              label: m.label,
              options: [
                { value: m.key, label: "All of " + m.label },
                ...(m.children ?? []).map((c) => ({ value: c.key, label: c.label })),
              ],
            }))}
          />
          <MultiSelect
            label="Event"
            value={f.eventTypes}
            onChange={(v) => go({ eventTypes: v })}
            options={options.eventTypes.map((x) => ({ value: x.id, label: x.label }))}
          />
          <MultiSelect
            label="Status"
            value={f.statuses}
            onChange={(v) => go({ statuses: v })}
            options={options.statuses.map((x) => ({ value: x.id, label: x.label }))}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
            From
            <input
              type="datetime-local"
              value={localInput(f.from)}
              onChange={(e) => go({ from: isoFromLocal(e.target.value) })}
              className="rounded-lg border border-hairline bg-surface-soft px-2 py-1 text-[12.5px] text-ink-strong"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
            To
            <input
              type="datetime-local"
              value={localInput(f.to)}
              onChange={(e) => go({ to: isoFromLocal(e.target.value) })}
              className="rounded-lg border border-hairline bg-surface-soft px-2 py-1 text-[12.5px] text-ink-strong"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
            Sort
            <select
              value={f.sort}
              onChange={(e) => go({ sort: e.target.value as LogFilters["sort"] })}
              className="cursor-pointer rounded-lg border border-hairline bg-surface-soft px-2 py-1 text-[12.5px] font-bold text-ink-strong"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ── Active filter chips ───────────────────────────────────── */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface-soft px-2.5 py-1 text-[12px] font-semibold text-ink-strong"
            >
              {c.label}
              <button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`} className="text-ink-muted hover:text-ink-strong">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr>
              {["Date", "Time", "Person", "Function", "Designation", "Entity", "Module", "Page", "Activity", "Resource", "Status"].map((h) => (
                <th key={h} className="border-b border-hairline-strong px-3 py-2 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-soft"
              >
                <Td>{istDate(r.eventAt)}</Td>
                <Td>{istTime(r.eventAt)}</Td>
                <Td strong>{r.employeeName ?? "—"}</Td>
                <Td>{r.functionName ?? "—"}</Td>
                <Td>{r.designationName ?? "—"}</Td>
                <Td>{r.entityName ?? "—"}</Td>
                <Td>{r.module ?? "—"}</Td>
                <Td>{r.page ?? "—"}</Td>
                <Td strong>{LOG_EVENT_LABELS[r.eventType as LogEventType] ?? r.eventType}</Td>
                <Td>{r.resourceName ?? r.resourceId ?? "—"}</Td>
                <Td>
                  {r.status ? (
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${r.status === "DENIED" || r.status === "FAILED" ? "bg-altus-red-soft text-altus-red" : "bg-surface-soft text-ink-soft"}`}>
                      {r.status}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
            {page.rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-[13px] text-ink-subtle">
                  No logs match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-muted">
          {page.total.toLocaleString("en-IN")} records · page {f.page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            Per page
            <select
              value={String(f.pageSize)}
              onChange={(e) => go({ pageSize: Number(e.target.value) })}
              className="cursor-pointer rounded-lg border border-hairline bg-surface-soft px-2 py-1 text-[12.5px] font-bold text-ink-strong"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={f.page <= 1}
            onClick={() => go({ page: f.page - 1 })}
            className="rounded-lg border border-hairline bg-surface-soft p-1.5 text-ink-strong disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            disabled={!page.hasMore}
            onClick={() => go({ page: f.page + 1 })}
            className="rounded-lg border border-hairline bg-surface-soft p-1.5 text-ink-strong disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {selected && <LogDetailPanel log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-[12.5px] ${strong ? "font-semibold text-ink-strong" : "text-ink-soft"}`}>
      {children}
    </td>
  );
}

function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function istTime(d: Date): string {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(11, 19);
}
