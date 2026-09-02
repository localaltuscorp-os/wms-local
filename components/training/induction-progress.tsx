"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, Eye, ClipboardCheck, GraduationCap } from "lucide-react";
import type { InductionItem } from "@/lib/queries/training";

function Ring({ pct }: { pct: number }) {
  const size = 132, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / 800); setShown(pct * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [pct]);
  const done = pct >= 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? "var(--color-green)" : "var(--color-altus-red)"} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} style={{ filter: `drop-shadow(0 2px 8px color-mix(in srgb, ${done ? "var(--color-green)" : "var(--color-altus-red)"} 45%, transparent))` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular-nums" style={{ fontFamily: "var(--font-display), var(--font-serif), serif", fontWeight: 800, fontSize: 34, color: "var(--color-ink-strong)" }}>{Math.round(shown)}%</span>
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">complete</span>
      </div>
    </div>
  );
}

function Chip({ on, label, icon }: { on: boolean | null; label: string; icon: React.ReactNode }) {
  if (on === null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={on ? { background: "color-mix(in srgb, var(--color-green) 15%, transparent)", color: "var(--color-green-deep)" } : { background: "var(--color-surface-track)", color: "var(--color-ink-subtle)" }}>
      {on ? <Check size={12} strokeWidth={3} /> : icon} {label}
    </span>
  );
}

export function InductionProgress({ items }: { items: InductionItem[] }) {
  const complete = items.filter((i) => i.complete).length;
  const pct = items.length ? Math.round((complete / items.length) * 100) : 100;

  if (items.length === 0) {
    return <div className="rounded-section border border-hairline bg-surface-card p-10 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <GraduationCap size={36} strokeWidth={1.6} className="mx-auto mb-3" style={{ color: "var(--color-ink-subtle)" }} />
      <p className="text-[15px] font-semibold text-ink-muted">No induction assigned to your department yet.</p>
    </div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="wg-rise flex items-center gap-6 rounded-section border border-hairline bg-surface-card p-6 max-md:flex-col max-md:text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <Ring pct={pct} />
        <div>
          <h2 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>{complete} of {items.length} done</h2>
          <p className="mt-1 font-medium text-ink-muted" style={{ fontSize: 15 }}>Watch each item and pass its tests to complete your induction.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <Link key={it.id} href={`/training/${it.id}` as Route} className="wg-rise group flex items-center gap-4 rounded-section border border-hairline bg-surface-card p-4 transition-colors hover:border-altus-red" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: `${i * 30}ms` }}>
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl" style={it.complete ? { background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))" } : { background: "var(--color-surface-track)" }}>
              {it.complete ? <Check size={20} strokeWidth={3} className="text-white" /> : <GraduationCap size={20} style={{ color: "var(--color-ink-subtle)" }} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink-strong" style={{ fontSize: 15.5 }}>{it.fileName || (it.videoUrl ? "Video material" : it.subject || "Material")}</div>
              <div className="text-[13px] font-medium text-ink-subtle">{[it.subject, it.los].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Chip on={it.watched} label="Watched" icon={<Eye size={12} />} />
              <Chip on={it.test1Passed} label="Test 1" icon={<ClipboardCheck size={12} />} />
              <Chip on={it.test2Passed} label="Test 2" icon={<ClipboardCheck size={12} />} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
