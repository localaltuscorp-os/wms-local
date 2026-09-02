"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Search, X, Plus, Mic, ImageIcon, AlertTriangle, Clock, Star } from "lucide-react";
import type { FeedbackRow, FeedbackStats } from "@/lib/queries/feedback";
import { FEEDBACK_TEMPLATES, type FeedbackType } from "@/lib/training/feedback-templates";

function useCountUp(target: number, run = true) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!run) { setN(target); return; }
    let raf = 0; const start = performance.now(); const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
}

function StatCard({ label, value, tone, suffix, delay = 0, icon }: { label: string; value: number; tone: string; suffix?: string; delay?: number; icon?: React.ReactNode }) {
  const n = useCountUp(value);
  return (
    <div className="wg-rise relative overflow-hidden rounded-section border border-hairline bg-surface-card p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: `${delay}ms` }}>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full" style={{ background: `color-mix(in srgb, var(${tone}) 16%, transparent)`, filter: "blur(8px)" }} />
      <div className="relative flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</span>
        <span style={{ color: `var(${tone})` }}>{icon}</span>
      </div>
      <div className="relative mt-2 tabular-nums" style={{ fontFamily: "var(--font-display), var(--font-serif), serif", fontWeight: 800, fontSize: 38, lineHeight: 1, color: "var(--color-ink-strong)" }}>
        {n}{suffix}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: FeedbackRow }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    open: { bg: "var(--color-surface-track)", fg: "var(--color-ink-soft)", label: "Open" },
    escalated: { bg: "color-mix(in srgb, var(--color-amber) 16%, transparent)", fg: "var(--color-amber-deep)", label: "Escalated" },
    resolved: { bg: "color-mix(in srgb, var(--color-green) 16%, transparent)", fg: "var(--color-green-deep)", label: "Resolved" },
    signed_off: { bg: "color-mix(in srgb, var(--color-green) 22%, transparent)", fg: "var(--color-green-deep)", label: "Signed Off" },
    archived: { bg: "var(--color-surface-track)", fg: "var(--color-ink-subtle)", label: "Archived" },
  };
  const s = map[row.status] ?? map.open;
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: s!.bg, color: s!.fg }}>{s!.label}</span>;
}

export function FeedbackDashboard({ rows, stats, canNew }: { rows: FeedbackRow[]; stats: FeedbackStats; canNew: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (type && r.type !== type) return false;
      if (needle) {
        const hay = [r.ratedName, r.clientName, r.service, r.q1, r.q2].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, status, type]);
  const hasFilters = q || status || type;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat strip */}
      <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-sm:grid-cols-2">
        <StatCard label="Total" value={stats.total} tone="--color-altus-red" delay={0} />
        <StatCard label="Open" value={stats.open} tone="--color-blue" delay={40} />
        <StatCard label="Escalated" value={stats.escalated} tone="--color-amber" delay={80} icon={<AlertTriangle size={16} />} />
        <StatCard label="Resolved" value={stats.resolved} tone="--color-green" delay={120} />
        <StatCard label="Overdue >72h" value={stats.overdue} tone="--color-altus-red" delay={160} icon={<Clock size={16} />} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-[300px] max-md:w-full items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3">
          <Search size={17} strokeWidth={2.2} style={{ color: "var(--color-ink-subtle)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Local search — feedback" title="Local search — filters only the list on this page" aria-label="Local search — feedback — this page only" className="w-full bg-transparent py-2.5 outline-none text-[15px] font-medium text-ink-strong placeholder:text-ink-subtle placeholder:font-normal" />
        </div>
        <select className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="open">Open</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="signed_off">Signed Off</option>
        </select>
        <select className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All Types</option>
          {(Object.keys(FEEDBACK_TEMPLATES) as FeedbackType[]).map((t) => <option key={t} value={t}>{FEEDBACK_TEMPLATES[t].label}</option>)}
        </select>
        {hasFilters && <button type="button" onClick={() => { setQ(""); setStatus(""); setType(""); }} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-card px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"><X size={15} /> Clear</button>}
        <div className="ml-auto" />
        {canNew && <Link href={"/training/feedback/new" as Route} className="inline-flex items-center gap-2 rounded-xl py-2.5 px-5 text-[15px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}><Plus size={17} /> New Feedback</Link>}
      </div>

      <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 1000 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-hairline)" }}>
              {["Date", "Rated", "Client", "Service", "Type", "Rating", "Status", "TAT", ""].map((h) => <th key={h} className="px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle whitespace-nowrap" style={{ background: "var(--color-surface-soft)" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-16 text-center text-[15px] font-semibold text-ink-muted">No feedback yet.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/training/feedback/${r.id}` as Route)} className="cursor-pointer transition-colors hover:bg-surface-soft" style={{ borderBottom: "1px solid var(--color-hairline)" }}>
                <td className="px-4 py-3 text-[14px] text-ink-soft tabular-nums">{r.feedbackDate}</td>
                <td className="px-4 py-3 text-[14px]"><span className="font-semibold text-ink-strong">{r.ratedName}</span></td>
                <td className="px-4 py-3 text-[14px] text-ink-soft">{r.clientName || "—"}</td>
                <td className="px-4 py-3 text-[14px] text-ink-soft">{r.service || "—"}</td>
                <td className="px-4 py-3 text-[14px] text-ink-soft">{FEEDBACK_TEMPLATES[r.type as FeedbackType]?.label ?? r.type}</td>
                <td className="px-4 py-3">{r.rating ? <span className="inline-flex items-center gap-1 font-bold tabular-nums" style={{ color: "var(--color-amber-deep)" }}><Star size={13} style={{ fill: "var(--color-amber)", color: "var(--color-amber)" }} />{r.rating}</span> : <span className="text-ink-subtle">—</span>}</td>
                <td className="px-4 py-3"><StatusBadge row={r} /></td>
                <td className="px-4 py-3 text-[13.5px]">{r.resolution ? <span className="font-semibold tabular-nums text-ink-soft">{r.tatHours}h</span> : r.overdue ? <span className="inline-flex items-center gap-1 font-bold" style={{ color: "var(--color-altus-red-deep)" }}><Clock size={12} /> &gt;72h</span> : <span className="text-ink-subtle">—</span>}</td>
                <td className="px-4 py-3">{(r.hasVoice || r.hasPicture) && <span className="inline-flex items-center gap-1.5 text-ink-subtle">{r.hasVoice && <Mic size={14} />}{r.hasPicture && <ImageIcon size={14} />}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
