"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Trophy, Medal, Wallet, Clock, IndianRupee } from "lucide-react";
import { INCENTIVE_TYPE_LABELS } from "@/db/enums";
import type { IncentiveDashboardData } from "@/lib/queries/incentive";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function IncentiveDashboard({ data, myId }: { data: IncentiveDashboardData; myId: string }) {
  const { totals, leaderboard, byType, byMonth } = data;
  const maxMonth = Math.max(1, ...byMonth.map((m) => m.approved));

  return (
    <main className="mx-auto max-w-[1300px] px-12 max-md:px-4 pt-8 pb-24">
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(34px,3.6vw,48px)", letterSpacing: "-0.025em", lineHeight: 1 }}>
            Incentive — Dashboard
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 17 }}>
            Approved, paid, and pending — who's earning and what's owed.
          </p>
        </div>
        <Link href={"/incentive" as Route}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold border border-hairline bg-surface-card text-ink-strong hover:brightness-95 transition-all">
          <ArrowLeft size={16} strokeWidth={2.4} /> Back to Incentive
        </Link>
      </header>

      {/* Totals */}
      <div className="mb-8 grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <StatCard label="Approved" value={inr(totals.approved)} icon={Trophy} tone="green" />
        <StatCard label="Paid" value={inr(totals.paid)} icon={Wallet} tone="blue" />
        <StatCard label="Unpaid" value={inr(totals.unpaid)} icon={Clock} tone="amber" />
        <StatCard label="Entries" value={String(totals.count)} icon={IndianRupee} tone="purple" />
      </div>

      <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1">
        {/* Leaderboard */}
        <section className="col-span-2 max-lg:col-span-1">
          <h2 className="mb-3 font-black text-ink-strong text-[20px]">Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-hidden rounded-section border border-hairline bg-surface-card">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-black/[0.015]">
                    <Th w={60}>#</Th><Th>Team member</Th>
                    <Th right>Approved</Th><Th right>Paid</Th><Th right>Unpaid</Th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((r, i) => (
                    <tr key={r.employeeId} className="border-b border-hairline last:border-0"
                      style={{ background: r.employeeId === myId ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" : undefined }}>
                      <td className="px-4 py-3"><Rank n={i + 1} /></td>
                      <td className="px-4 py-3 font-bold text-ink-strong text-[15px]">
                        {r.employeeName}
                        {r.employeeId === myId && <span className="ml-2 text-[11px] font-black text-altus-red">YOU</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-black text-ink-strong">{inr(r.approved)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-green-700">{inr(r.paid)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-700">{inr(r.unpaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* By scheme */}
        <section>
          <h2 className="mb-3 font-black text-ink-strong text-[20px]">By scheme</h2>
          <div className="rounded-section border border-hairline bg-surface-card p-4 space-y-2.5">
            {byType.length === 0 ? <Empty /> : byType.map((t) => (
              <div key={t.type} className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-bold text-ink-strong">{t.type === "project" ? "Project" : t.type === "sheet" ? "Leads & Referrals" : t.type === "weekly_goal" ? "Weekly Goals" : INCENTIVE_TYPE_LABELS[t.type]}</span>
                <span className="text-[13px] font-bold tabular-nums text-ink-soft">{inr(t.approved)} · {t.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Month trend */}
      {byMonth.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-black text-ink-strong text-[20px]">Approved by month</h2>
          <div className="rounded-section border border-hairline bg-surface-card p-6">
            <div className="flex items-end gap-3 h-44">
              {byMonth.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <span className="text-[11px] font-black tabular-nums text-ink-soft">{inr(m.approved)}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className="w-full rounded-t-md" style={{ height: `${(m.approved / maxMonth) * 100}%`, minHeight: 2, background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }} />
                  </div>
                  <span className="text-[11px] font-bold text-ink-muted whitespace-nowrap">{m.month}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Trophy; tone: string }) {
  return (
    <div className="relative bg-surface-card rounded-section overflow-hidden p-5" style={{ border: "1px solid var(--color-hairline)" }}>
      <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))` }} />
      <span className="inline-flex size-9 items-center justify-center rounded-xl mb-2" style={{ background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`, color: `var(--color-${tone}-deep)` }}>
        <Icon size={18} strokeWidth={2.3} />
      </span>
      <div className="text-[13px] font-black uppercase tracking-[0.05em] text-ink-muted">{label}</div>
      <div className="mt-0.5 font-black text-ink-strong tabular-nums" style={{ fontSize: 26 }}>{value}</div>
    </div>
  );
}

function Th({ children, right, w }: { children?: React.ReactNode; right?: boolean; w?: number }) {
  return <th className={`px-4 py-3 ${right ? "text-right" : "text-left"} text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted`} style={w ? { width: w } : undefined}>{children}</th>;
}

function Rank({ n }: { n: number }) {
  const tone = n === 1 ? "amber" : n === 2 ? "slate" : n === 3 ? "orange" : "slate";
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-full font-black tabular-nums text-[14px]"
      style={{ background: n <= 3 ? `color-mix(in srgb, var(--color-${tone}) 22%, transparent)` : "transparent", color: n <= 3 ? `var(--color-${tone}-deep)` : "var(--color-ink-muted)" }}>
      {n <= 3 ? <Medal size={16} /> : n}
    </span>
  );
}

function Empty() {
  return <div className="rounded-section border border-hairline bg-surface-card p-8 text-center text-ink-muted font-semibold">No incentive data yet.</div>;
}
