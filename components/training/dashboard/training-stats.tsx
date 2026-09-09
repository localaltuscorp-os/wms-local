"use client";

import * as React from "react";
import { BookOpen, Users, Eye, XCircle, GraduationCap } from "lucide-react";
import type { TrainingDashboardStats } from "@/lib/queries/training";

function useCountUp(target: number) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / 700); setN(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function Stat({ label, value, tone, icon, delay }: { label: string; value: number; tone: string; icon: React.ReactNode; delay: number }) {
  const n = useCountUp(value);
  return (
    <div className="wg-rise relative overflow-hidden rounded-section border border-hairline bg-surface-card p-5" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: `${delay}ms` }}>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full" style={{ background: `color-mix(in srgb, var(${tone}) 16%, transparent)`, filter: "blur(8px)" }} />
      <div className="relative flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</span>
        <span style={{ color: `var(${tone})` }}>{icon}</span>
      </div>
      <div className="relative mt-2 tabular-nums" style={{ fontFamily: "var(--font-display), var(--font-serif), serif", fontWeight: 800, fontSize: 38, lineHeight: 1, color: "var(--color-ink-strong)" }}>{n}</div>
    </div>
  );
}

function PassRing({ pct }: { pct: number | null }) {
  const size = 150, stroke = 13, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [shown, setShown] = React.useState(0);
  const target = pct ?? 0;
  React.useEffect(() => { let raf = 0; const s = performance.now(); const tick = (t: number) => { const p = Math.min(1, (t - s) / 800); setShown(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [target]);
  const tone = pct == null ? "--color-ink-subtle" : pct >= 80 ? "--color-green" : pct >= 60 ? "--color-amber" : "--color-altus-red";
  return (
    <div className="wg-rise flex items-center gap-6 rounded-section border border-hairline bg-surface-card p-6 max-md:flex-col max-md:text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-track)" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(${tone})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} style={{ filter: `drop-shadow(0 2px 8px color-mix(in srgb, var(${tone}) 45%, transparent))` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular-nums" style={{ fontFamily: "var(--font-display), var(--font-serif), serif", fontWeight: 800, fontSize: 38, color: "var(--color-ink-strong)" }}>{pct == null ? "—" : `${Math.round(shown)}%`}</span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">pass rate</span>
        </div>
      </div>
      <div>
        <h2 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>Test Performance</h2>
        <p className="mt-1 font-medium text-ink-muted" style={{ fontSize: 15 }}>Across all test attempts taken in the Training Centre.</p>
      </div>
    </div>
  );
}

export function TrainingStats({ stats }: { stats: TrainingDashboardStats }) {
  const maxSubject = Math.max(1, ...stats.bySubject.map((s) => s.count));
  return (
    <div className="flex flex-col gap-6">
      <PassRing pct={stats.passRate} />
      <div className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-sm:grid-cols-2">
        <Stat label="Materials" value={stats.materials} tone="--color-altus-red" icon={<BookOpen size={16} />} delay={0} />
        <Stat label="Induction" value={stats.inductionMaterials} tone="--color-purple" icon={<GraduationCap size={16} />} delay={40} />
        <Stat label="Employees" value={stats.employees} tone="--color-blue" icon={<Users size={16} />} delay={80} />
        <Stat label="Watches" value={stats.watches} tone="--color-green" icon={<Eye size={16} />} delay={120} />
        <Stat label="Failed tests" value={stats.failedTests} tone="--color-altus-red" icon={<XCircle size={16} />} delay={160} />
      </div>

      {stats.bySubject.length > 0 && (
        <div className="wg-rise rounded-section border border-hairline bg-surface-card p-6" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: "200ms" }}>
          <h2 className="mb-4 font-bold text-ink-strong" style={{ fontSize: 18 }}>Material by Subject</h2>
          <div className="flex flex-col gap-2.5">
            {stats.bySubject.map((s) => (
              <div key={s.subject} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-[13.5px] font-semibold text-ink-soft">{s.subject}</span>
                <div className="h-7 flex-1 overflow-hidden rounded-lg" style={{ background: "var(--color-surface-track)" }}>
                  <div className="h-full rounded-lg" style={{ width: `${(s.count / maxSubject) * 100}%`, background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))", transition: "width 700ms cubic-bezier(0.2,0.7,0.3,1)" }} />
                </div>
                <span className="w-8 shrink-0 text-right text-[14px] font-bold tabular-nums text-ink-strong">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
