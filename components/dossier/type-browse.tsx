"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  FileSignature, BadgeCheck, IndianRupee, TrendingUp, ShieldCheck,
  ClipboardList, Files, Eye, Download, Calendar, type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { DOC_TYPES, docTypeMeta, type DossierDocType } from "@/lib/dossier/types";
import { formatDate } from "@/lib/format";
import type { DossierTypeRow } from "@/lib/queries/dossier";
import { DocViewer, type ViewerDoc } from "./doc-viewer";

const ICONS: Record<string, LucideIcon> = {
  FileSignature, BadgeCheck, IndianRupee, TrendingUp, ShieldCheck, ClipboardList, Files,
};
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatDate(iso);
}

export function TypeBrowse({
  active, rows, counts,
}: {
  active: DossierDocType;
  rows: DossierTypeRow[];
  counts: Record<string, number>;
}) {
  const [viewer, setViewer] = React.useState<ViewerDoc | null>(null);
  const meta = docTypeMeta(active);

  return (
    <div className="flex flex-col gap-4">
      {/* type chips */}
      <div className="flex flex-wrap gap-2">
        {DOC_TYPES.map((d) => {
          const on = d.key === active;
          const n = counts[d.key] ?? 0;
          return (
            <Link
              key={d.key}
              href={`/dossier?tab=type&type=${d.key}` as Route}
              className="inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-[13px] font-bold transition"
              style={{
                background: on ? `color-mix(in srgb, ${d.accent} 14%, transparent)` : "var(--color-surface-card)",
                color: on ? d.accent : "var(--color-ink-muted)",
                boxShadow: on ? `inset 0 0 0 1.5px ${d.accent}` : "inset 0 0 0 1px var(--color-hairline)",
              }}
            >
              {d.short}
              <span className="tabular-nums rounded-full bg-black/5 px-1.5 py-0.5 text-[11px]">{n}</span>
            </Link>
          );
        })}
      </div>

      {/* header */}
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: `color-mix(in srgb, ${meta.accent} 12%, transparent)`, color: meta.accent }}>
          {React.createElement(ICONS[meta.icon] ?? Files, { size: 21, strokeWidth: 2.2 })}
        </span>
        <div>
          <div className="text-[18px] font-black text-ink-strong">{meta.label}</div>
          <div className="text-[12.5px] font-semibold text-ink-subtle"><span className="tabular-nums">{rows.length}</span> across the team</div>
        </div>
      </div>

      {/* rows */}
      {rows.length === 0 ? (
        <div className="rounded-[20px] border border-solid border-hairline-strong bg-surface-card px-6 py-10 text-center text-[14px] font-semibold text-ink-subtle">
          No {meta.label.toLowerCase()} uploaded yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="wg-rise flex items-center gap-3 rounded-[16px] bg-surface-card p-3.5"
              style={{ animationDelay: `${Math.min(i, 16) * 25}ms`, boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 8px 26px -22px rgba(15,23,42,0.3)" }}
            >
              <Link href={`/dossier?emp=${r.employeeId}` as Route} className="shrink-0" title={`Open ${r.employeeName}'s dossier`}>
                <Avatar name={r.employeeName} avatarUrl={r.employeeAvatarUrl} size={40} />
              </Link>
              <button type="button" onClick={() => setViewer({ title: r.title, fileName: r.fileName, mimeType: r.mimeType, signedUrl: r.signedUrl })} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[14px] font-black text-ink-strong">{r.employeeName}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11.5px] font-medium text-ink-subtle">
                  <span className="truncate">{r.title}</span>
                  {fmtDate(r.effectiveDate) && <span className="inline-flex items-center gap-1 tabular-nums"><Calendar size={11} />{fmtDate(r.effectiveDate)}</span>}
                </div>
              </button>
              <button type="button" onClick={() => setViewer({ title: r.title, fileName: r.fileName, mimeType: r.mimeType, signedUrl: r.signedUrl })} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-soft hover:text-ink-strong" title="View"><Eye size={15} strokeWidth={2.3} /></button>
              {r.signedUrl && (
                <a href={r.signedUrl} download={r.fileName} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-soft hover:text-ink-strong" title="Download"><Download size={15} strokeWidth={2.3} /></a>
              )}
            </div>
          ))}
        </div>
      )}

      {viewer && <DocViewer doc={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
