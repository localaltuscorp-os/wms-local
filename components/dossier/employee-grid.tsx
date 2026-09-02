"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Search, FolderOpen, FileText } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { DossierEmployeeCard } from "@/lib/queries/dossier";
import { formatDate } from "@/lib/format";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(iso);
}

export function EmployeeGrid({ employees }: { employees: DossierEmployeeCard[] }) {
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(s) || (e.designation ?? "").toLowerCase().includes(s));
  }, [q, employees]);

  return (
    <div className="flex flex-col gap-4">
      {/* search */}
      <div className="relative max-w-[420px]">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Local search — a person" title="Local search — filters only the list on this page" aria-label="Local search — a person — this page only"
          className="w-full rounded-pill border border-hairline bg-surface-card py-2.5 pl-10 pr-4 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
          style={{ boxShadow: "0 6px 20px -16px rgba(15,23,42,0.4)" }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {filtered.map((e, i) => (
          <Link
            key={e.id}
            href={`/dossier?emp=${e.id}` as Route}
            className="wg-rise group relative overflow-hidden rounded-[20px] bg-surface-card p-5 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 34px -26px rgba(15,23,42,0.35)" }}
          >
            {/* accent wash */}
            <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--color-altus-red) 12%, transparent), transparent 70%)" }} />
            <div className="flex items-center gap-3">
              <Avatar name={e.name} avatarUrl={e.avatarUrl} size={46} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15.5px] font-black text-ink-strong">{e.name}</div>
                <div className="truncate text-[12.5px] font-semibold text-ink-muted">{e.designation ?? "—"}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-soft">
                <FileText size={14} className="text-ink-subtle" />
                <span className="tabular-nums">{e.docCount}</span> document{e.docCount === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-subtle">
                <FolderOpen size={13} />
                {fmtDate(e.lastUpdated) ? `Updated ${fmtDate(e.lastUpdated)}` : "Empty"}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-[20px] border border-solid border-hairline-strong bg-surface-card px-6 py-10 text-center text-[14px] font-semibold text-ink-subtle">
          No one matches “{q}”.
        </div>
      )}
    </div>
  );
}
