"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TierPill } from "@/components/ambassadors/tier-pill";
import { ScoreBadge } from "@/components/ambassadors/score-badge";
import { inr, inrCompact } from "@/lib/ambassadors/format";
import type { AmbassadorListRow } from "@/lib/queries/ambassadors";

type SortKey = "name" | "score" | "referrals" | "revenue" | "commission";

const CHIP =
  "rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]";

const TIERS = ["elite", "gold", "silver"] as const;
const STATUSES = ["active", "paused", "archived"] as const;

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  active: {
    bg: "color-mix(in srgb, var(--color-green) 14%, transparent)",
    fg: "var(--color-green-deep)",
  },
  paused: {
    bg: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
    fg: "var(--color-altus-red-deep)",
  },
  archived: { bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)" },
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.archived!;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold capitalize"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {status}
    </span>
  );
}

export function DirectoryTable({ rows }: { rows: AmbassadorListRow[] }) {
  const [q, setQ] = React.useState("");
  const [tier, setTier] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "desc",
  });

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (tier && (r.tier ?? "silver") !== tier) return false;
      if (status && r.status !== status) return false;
      if (needle) {
        const hay = [r.name, r.company, r.ownerName, r.email].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
        case "score":
          return ((a.partnerScore ?? -1) - (b.partnerScore ?? -1)) * dir;
        case "referrals":
          return (a.referrals - b.referrals) * dir;
        case "revenue":
          return (a.revenue - b.revenue) * dir;
        case "commission":
          return (a.commissionPending - b.commissionPending) * dir;
        default:
          return 0;
      }
    });
    return out;
  }, [rows, q, tier, status, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  const hasFilters = q || tier || status;
  function clearFilters() {
    setQ("");
    setTier("");
    setStatus("");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — name, company, owner" title="Local search — filters only the list on this page" aria-label="Local search — name, company, owner — this page only"
            className="w-full bg-transparent py-2.5 outline-none text-[15px] font-medium text-ink-strong placeholder:text-ink-subtle placeholder:font-normal"
          />
        </div>
        <select className={CHIP} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
          <option value="">All Tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t[0]!.toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select className={CHIP} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="bg-surface-card inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"
          >
            <X size={15} strokeWidth={2.4} /> Clear
          </button>
        )}
      </div>

      <div className="text-[13px] font-semibold text-ink-subtle">
        {filtered.length} {filtered.length === 1 ? "partner" : "partners"}
        {hasFilters ? ` · filtered from ${rows.length}` : ""}
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasFilters={!!hasFilters} />
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div
            className="hidden overflow-x-auto rounded-section border border-hairline bg-surface-card md:block"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
          >
            <table className="w-full border-collapse text-left" style={{ minWidth: 920 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                  <Th label="Ambassador" sortKey="name" sort={sort} onSort={toggleSort} />
                  <Th label="Tier" />
                  <Th label="Score" sortKey="score" sort={sort} onSort={toggleSort} />
                  <Th label="Owner" />
                  <Th label="Referrals" sortKey="referrals" sort={sort} onSort={toggleSort} />
                  <Th label="Revenue" sortKey="revenue" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Commission Owed" sortKey="commission" sort={sort} onSort={toggleSort} align="right" />
                  <Th label="Status" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="group transition-colors hover:bg-surface-soft"
                    style={{ borderBottom: "1px solid var(--color-hairline)" }}
                  >
                    <Td>
                      <Link href={`/ambassadors/${r.id}` as Route} className="flex items-center gap-3">
                        <Avatar name={r.name} avatarUrl={r.photoUrl} size={38} />
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-ink-strong group-hover:text-altus-red" style={{ fontSize: 15 }}>
                            {r.name}
                          </span>
                          {r.company && <span className="block truncate text-[12.5px] text-ink-subtle">{r.company}</span>}
                        </span>
                      </Link>
                    </Td>
                    <Td><TierPill tier={r.tier} size="sm" /></Td>
                    <Td><ScoreBadge score={r.partnerScore} size={42} /></Td>
                    <Td>
                      {r.ownerName ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={r.ownerName} size={24} />
                          <span className="text-ink-soft">{r.ownerName}</span>
                        </span>
                      ) : (
                        <Dim />
                      )}
                    </Td>
                    <Td>
                      <span className="font-bold tabular-nums text-ink-strong">{r.referrals}</span>
                      <span className="text-[12.5px] text-ink-subtle"> · {r.converted} won</span>
                    </Td>
                    <Td align="right"><span className="font-bold tabular-nums text-ink-strong">{inrCompact(r.revenue)}</span></Td>
                    <Td align="right">
                      <span
                        className="font-bold tabular-nums"
                        style={{ color: r.commissionPending > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-soft)" }}
                      >
                        {inr(r.commissionPending)}
                      </span>
                    </Td>
                    <Td><StatusBadge status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile cards ── */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/ambassadors/${r.id}` as Route}
                className="rounded-section border border-hairline bg-surface-card p-4 transition-colors active:bg-surface-soft"
                style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={r.name} avatarUrl={r.photoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink-strong" style={{ fontSize: 16 }}>{r.name}</div>
                    {r.company && <div className="truncate text-[13px] text-ink-subtle">{r.company}</div>}
                  </div>
                  <ScoreBadge score={r.partnerScore} size={44} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <TierPill tier={r.tier} size="sm" />
                  <StatusBadge status={r.status} />
                  {r.ownerName && (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
                      <Avatar name={r.ownerName} size={18} /> {r.ownerName}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3">
                  <Stat label="Referrals" value={`${r.referrals} · ${r.converted} won`} />
                  <Stat label="Revenue" value={inrCompact(r.revenue)} />
                  <Stat label="Owed" value={inr(r.commissionPending)} accent={r.commissionPending > 0} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-subtle">{label}</div>
      <div
        className="mt-0.5 font-bold tabular-nums"
        style={{ fontSize: 14, color: accent ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)" }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      className="rounded-section border border-hairline bg-surface-card px-6 py-16 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <p className="text-[16px] font-bold text-ink-strong">
        {hasFilters ? "No partners match your filters." : "No ambassadors yet."}
      </p>
      <p className="mt-1 text-[14px] font-medium text-ink-muted">
        {hasFilters
          ? "Try clearing the search or filters."
          : "Register your first referral partner to start tracking their pipeline."}
      </p>
      {!hasFilters && (
        <Link
          href={"/ambassadors/new" as Route}
          className="mt-4 inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-[14.5px] font-bold text-white transition-transform active:scale-[0.99]"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)",
          }}
        >
          <Plus size={16} strokeWidth={2.6} /> New Ambassador
        </Link>
      )}
    </div>
  );
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey?: SortKey;
  sort?: { key: SortKey; dir: "asc" | "desc" };
  onSort?: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sortKey && sort?.key === sortKey;
  return (
    <th
      className={`px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      style={{ background: "var(--color-surface-soft)" }}
    >
      {sortKey && onSort ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1.5 hover:text-ink-strong ${align === "right" ? "flex-row-reverse" : ""}`}
        >
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

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <td className={`px-4 py-3 align-middle text-[14px] text-ink-soft ${align === "right" ? "text-right" : ""}`}>
      {children}
    </td>
  );
}

function Dim() {
  return <span style={{ color: "var(--color-ink-subtle)" }}>—</span>;
}
