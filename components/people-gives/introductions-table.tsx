"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpDown, ArrowUp, ArrowDown, Plus, Search, X } from "lucide-react";
import type { PgIntroductionRow } from "@/lib/queries/people-gives";

type SortKey =
  | "receivedOn"
  | "introducer"
  | "prospectCompany"
  | "businessCategory"
  | "salesPerson";

const CHIP =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

function distinct(rows: PgIntroductionRow[], pick: (r: PgIntroductionRow) => string | null): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const v = pick(r);
    if (v) s.add(v);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export function IntroductionsTable({ rows }: { rows: PgIntroductionRow[] }) {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [salesPerson, setSalesPerson] = React.useState("");
  const [source, setSource] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "receivedOn",
    dir: "desc",
  });

  const categories = React.useMemo(() => distinct(rows, (r) => r.businessCategory), [rows]);
  const salesPeople = React.useMemo(() => distinct(rows, (r) => r.salesPerson), [rows]);
  const sources = React.useMemo(() => distinct(rows, (r) => r.referenceSource), [rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (category && r.businessCategory !== category) return false;
      if (salesPerson && r.salesPerson !== salesPerson) return false;
      if (source && r.referenceSource !== source) return false;
      if (from && r.receivedOn < from) return false;
      if (to && r.receivedOn > to) return false;
      if (needle) {
        const hay = [
          r.introducerFirstName,
          r.introducerLastName,
          r.introducerCell,
          r.prospectCompany,
          r.prospectFirstName,
          r.prospectLastName,
          r.natureOfBusiness,
          r.notes,
          r.designation,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const key = sort.key;
    out = [...out].sort((a, b) => {
      const av =
        key === "introducer"
          ? `${a.introducerLastName} ${a.introducerFirstName}`
          : key === "receivedOn"
            ? a.receivedOn
            : (a[key] ?? "");
      const bv =
        key === "introducer"
          ? `${b.introducerLastName} ${b.introducerFirstName}`
          : key === "receivedOn"
            ? b.receivedOn
            : (b[key] ?? "");
      return av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true }) * dir;
    });
    return out;
  }, [rows, q, category, salesPerson, source, from, to, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const hasFilters = q || category || salesPerson || source || from || to;
  function clearFilters() {
    setQ("");
    setCategory("");
    setSalesPerson("");
    setSource("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3"
        >
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — introducer, company, prospect, notes" title="Local search — filters only the list on this page" aria-label="Local search — introducer, company, prospect, notes — this page only"
            className="w-full bg-transparent py-2.5 outline-none text-[15px] font-medium text-ink-strong placeholder:text-ink-subtle placeholder:font-normal"
          />
        </div>
        <select className={CHIP} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by reference source">
          <option value="">All Sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={CHIP} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by business category">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={CHIP} value={salesPerson} onChange={(e) => setSalesPerson(e.target.value)} aria-label="Filter by salesperson">
          <option value="">All Salespeople</option>
          {salesPeople.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input type="date" className={CHIP} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Received from" title="Received on — from" />
        <input type="date" className={CHIP} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Received to" title="Received on — to" />
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "introduction" : "introductions"}
        {hasFilters ? ` · filtered from ${rows.length}` : ""}
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1080 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              <Th label="Received" sortKey="receivedOn" sort={sort} onSort={toggleSort} />
              <Th label="Reference" />
              <Th label="Introducer" sortKey="introducer" sort={sort} onSort={toggleSort} />
              <Th label="Prospect company" sortKey="prospectCompany" sort={sort} onSort={toggleSort} />
              <Th label="Prospect" />
              <Th label="Category" sortKey="businessCategory" sort={sort} onSort={toggleSort} />
              <Th label="Nature of business" />
              <Th label="Salesperson" sortKey="salesPerson" sort={sort} onSort={toggleSort} />
              <Th label="Reminder" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-16 text-center">
                  <p className="text-[15px] font-semibold text-ink-muted">No introductions match.</p>
                  {!hasFilters && (
                    <Link href={"/people-gives/new" as Route} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-altus-red">
                      <Plus size={15} strokeWidth={2.6} /> Add the First One
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Td>{fmtDate(r.receivedOn)}</Td>
                  <Td>{r.referenceSource ? <Badge>{r.referenceSource}</Badge> : <Dim />}</Td>
                  <Td>
                    <div className="font-semibold text-ink-strong">{r.introducerFirstName} {r.introducerLastName}</div>
                    {r.introducerCell && <div className="text-[12.5px] text-ink-subtle">{r.introducerCell}</div>}
                  </Td>
                  <Td><span className="font-semibold text-ink-strong">{r.prospectCompany}</span></Td>
                  <Td>
                    <div className="text-ink-strong">{r.prospectFirstName} {r.prospectLastName}</div>
                    {r.designation && <div className="text-[12.5px] text-ink-subtle">{r.designation}</div>}
                  </Td>
                  <Td>{r.businessCategory ? <Badge tone="slate">{r.businessCategory}</Badge> : <Dim />}</Td>
                  <Td>
                    <span className="block max-w-[280px] truncate" title={r.natureOfBusiness}>{r.natureOfBusiness}</span>
                  </Td>
                  <Td>{r.salesPerson ? <Badge tone="green">{r.salesPerson}</Badge> : <Dim />}</Td>
                  <Td>{r.nextReminderDate ? fmtDate(r.nextReminderDate) : <Dim />}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey?: SortKey;
  sort?: { key: SortKey; dir: "asc" | "desc" };
  onSort?: (k: SortKey) => void;
}) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th
      className="px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap"
      style={{ background: "var(--color-surface-soft)" }}
    >
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 hover:text-ink-strong">
          {label}
          {active ? (
            sort!.dir === "asc" ? <ArrowUp size={13} strokeWidth={2.6} /> : <ArrowDown size={13} strokeWidth={2.6} />
          ) : (
            <ArrowUpDown size={13} strokeWidth={2} style={{ opacity: 0.5 }} />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-[14px] text-ink-soft">{children}</td>;
}

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}

function Badge({ children, tone = "red" }: { children: React.ReactNode; tone?: "red" | "slate" | "green" }) {
  const map = {
    red: { bg: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", fg: "var(--color-altus-red-deep)" },
    slate: { bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)" },
    green: { bg: "color-mix(in srgb, var(--color-green) 14%, transparent)", fg: "var(--color-green-deep)" },
  }[tone];
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={{ background: map.bg, color: map.fg }}>
      {children}
    </span>
  );
}
