"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Flame, Trophy, ChevronRight, AlertTriangle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { DccPerson, DccItemRow, DccEntryRow } from "@/lib/queries/dcc";
import { scheduledDueOn, isoDate } from "@/lib/dcc/util";

type ItemLite = Pick<DccItemRow, "id" | "ownerEmployeeId" | "weekdays" | "targetNumber">;
type EntryLite = DccEntryRow & { ownerEmployeeId: string };
type ReviewRow = { ownerEmployeeId: string; reviewDate: string; status: string | null; note: string | null };

interface Props {
  meId: string;
  people: DccPerson[];
  items: ItemLite[];
  entries: EntryLite[];
  reviews: ReviewRow[];
  today: string;
}

const key = (itemId: string, date: string) => `${itemId}|${date}`;
function dObj(iso: string) { const [y, m, d] = iso.split("-").map(Number); return new Date(y!, (m ?? 1) - 1, d ?? 1); }

export function DccDashboard({ meId, people, items, entries, reviews, today }: Props) {
  const entryMap = React.useMemo(() => {
    const m = new Map<string, EntryLite>();
    for (const e of entries) m.set(key(e.itemId, e.entryDate), e);
    return m;
  }, [entries]);

  const itemsByOwner = React.useMemo(() => {
    const m = new Map<string, ItemLite[]>();
    for (const it of items) { const l = m.get(it.ownerEmployeeId); if (l) l.push(it); else m.set(it.ownerEmployeeId, [it]); }
    return m;
  }, [items]);

  const last7 = React.useMemo(() => {
    const out: string[] = [];
    const d = dObj(today); d.setDate(d.getDate() - 6);
    for (let i = 0; i < 7; i++) { out.push(isoDate(d)); d.setDate(d.getDate() + 1); }
    return out;
  }, [today]);

  const rows = React.useMemo(() => {
    return people.map((p) => {
      const own = itemsByOwner.get(p.id) ?? [];
      // today
      const dueToday = own.filter((it) => scheduledDueOn(it, dObj(today)));
      let doneToday = 0, filledToday = 0;
      for (const it of dueToday) {
        const e = entryMap.get(key(it.id, today));
        if (e && (e.status || e.valueNumber || e.note)) filledToday++;
        if ((e?.status ?? "").toLowerCase() === "done") doneToday++;
      }
      // 7-day average completion (done / due)
      let due7 = 0, done7 = 0;
      for (const iso of last7) {
        for (const it of own) {
          if (!scheduledDueOn(it, dObj(iso))) continue;
          due7++;
          if ((entryMap.get(key(it.id, iso))?.status ?? "").toLowerCase() === "done") done7++;
        }
      }
      // streak (consecutive filled days ending today)
      let streak = 0;
      const sd = dObj(today);
      for (let i = 0; i < 30; i++) {
        const iso = isoDate(sd);
        const due = own.filter((it) => scheduledDueOn(it, sd));
        if (due.length > 0) {
          const allFilled = due.every((it) => { const e = entryMap.get(key(it.id, iso)); return e && (e.status || e.valueNumber || e.note); });
          if (!allFilled) break;
          streak++;
        }
        sd.setDate(sd.getDate() - 1);
      }
      const todayPct = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : -1;
      const weekPct = due7 ? Math.round((done7 / due7) * 100) : -1;
      const review = reviews.find((r) => r.ownerEmployeeId === p.id && r.reviewDate === today);
      return { p, total: own.length, dueToday: dueToday.length, doneToday, filledToday, todayPct, weekPct, streak, review };
    });
  }, [people, itemsByOwner, entryMap, last7, today, reviews]);

  const filledTotal = rows.reduce((a, r) => a + r.filledToday, 0);
  const dueTotal = rows.reduce((a, r) => a + r.dueToday, 0);
  const doneTotal = rows.reduce((a, r) => a + r.doneToday, 0);
  const notFilled = rows.filter((r) => r.dueToday > 0 && r.filledToday < r.dueToday);

  const leaderboard = [...rows].filter((r) => r.weekPct >= 0).sort((a, b) => b.weekPct - a.weekPct).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 max-md:grid-cols-2">
        <StatCard label="Filled today" value={`${dueTotal ? Math.round((filledTotal / dueTotal) * 100) : 0}%`} sub={`${filledTotal}/${dueTotal} entries`} tone="ink" />
        <StatCard label="Done today" value={`${dueTotal ? Math.round((doneTotal / dueTotal) * 100) : 0}%`} sub={`${doneTotal} done`} tone={dueTotal && doneTotal / dueTotal >= 0.8 ? "green" : "amber"} />
        <StatCard label="People on track" value={`${rows.filter((r) => r.dueToday > 0 && r.filledToday >= r.dueToday).length}`} sub={`of ${rows.filter((r) => r.dueToday > 0).length}`} tone="green" />
        <StatCard label="Need to fill" value={`${notFilled.length}`} sub="not yet complete" tone={notFilled.length ? "red" : "green"} />
      </div>

      <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1">
        {/* Roster */}
        <div className="col-span-2 max-lg:col-span-1">
          <h3 className="mb-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">Team roster — today</h3>
          <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {rows.length === 0 && <p className="px-5 py-10 text-center text-[14px] font-semibold text-ink-muted">No people in your scope yet.</p>}
            {rows.map((r, i) => (
              <Link key={r.p.id} href={`/dcc?emp=${r.p.id}` as Route} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[color:var(--color-surface-track,#eef2f7)] ${i === 0 ? "" : "border-t border-hairline"}`}>
                <Avatar name={r.p.name} avatarUrl={r.p.avatarUrl} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold text-ink-strong">{r.p.name}{r.p.id === meId ? " (me)" : ""}</p>
                  <p className="text-[12px] font-semibold text-ink-subtle">{r.total} KPIs · {r.dueToday} due today</p>
                </div>
                {r.streak > 0 && (
                  <span className="flex items-center gap-1 text-[12px] font-bold text-ink-muted"><Flame size={13} style={{ color: "var(--color-altus-red)" }} />{r.streak}</span>
                )}
                <div className="w-28 max-md:w-20">
                  <Bar pct={r.todayPct} />
                  <p className="mt-1 text-right text-[11px] font-bold text-ink-subtle tabular-nums">{r.todayPct < 0 ? "—" : `${r.doneToday}/${r.dueToday}`}</p>
                </div>
                {r.review?.status === "approved" && <span className="rounded-md bg-[color:color-mix(in_srgb,var(--color-green)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-extrabold" style={{ color: "var(--color-green-deep)" }}>✓</span>}
                {r.review?.status === "needs_rework" && <AlertTriangle size={14} style={{ color: "var(--color-altus-red)" }} />}
                <ChevronRight size={16} className="text-ink-subtle" />
              </Link>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink-muted"><Trophy size={14} style={{ color: "var(--color-amber,#f59e0b)" }} /> 7-day leaders</h3>
          <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            {leaderboard.length === 0 && <p className="px-5 py-8 text-center text-[13px] font-semibold text-ink-muted">No data yet.</p>}
            {leaderboard.map((r, i) => (
              <div key={r.p.id} className={`flex items-center gap-3 px-4 py-2.5 ${i === 0 ? "" : "border-t border-hairline"}`}>
                <span className="w-5 text-center text-[14px] font-extrabold tabular-nums" style={{ color: i === 0 ? "var(--color-amber,#f59e0b)" : "var(--color-ink-subtle)" }}>{i + 1}</span>
                <Avatar name={r.p.name} avatarUrl={r.p.avatarUrl} size={30} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink-strong">{r.p.name}</span>
                <span className="text-[14px] font-extrabold tabular-nums" style={{ color: r.weekPct >= 80 ? "var(--color-green-deep)" : r.weekPct >= 60 ? "var(--color-amber,#f59e0b)" : "var(--color-altus-red-deep)" }}>{r.weekPct}%</span>
              </div>
            ))}
          </div>

          {notFilled.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 px-1 text-[12px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--color-altus-red-deep)" }}>Yet to complete today</h3>
              <div className="flex flex-wrap gap-2">
                {notFilled.map((r) => (
                  <Link key={r.p.id} href={`/dcc?emp=${r.p.id}` as Route} className="flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red">
                    <Avatar name={r.p.name} avatarUrl={r.p.avatarUrl} size={20} /> {r.p.name.split(" ")[0]}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "ink" | "green" | "amber" | "red" }) {
  const color = tone === "green" ? "var(--color-green-deep)" : tone === "amber" ? "var(--color-amber,#f59e0b)" : tone === "red" ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)";
  return (
    <div className="rounded-2xl border border-hairline-strong bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <p className="text-[11.5px] font-bold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-[28px] font-extrabold leading-none tabular-nums" style={{ fontFamily: "var(--font-display), system-ui", color }}>{value}</p>
      <p className="mt-1 text-[12px] font-semibold text-ink-subtle">{sub}</p>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "var(--color-green)" : pct >= 60 ? "var(--color-amber,#f59e0b)" : pct >= 1 ? "var(--color-altus-red)" : "var(--color-hairline-strong)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-track,#eef2f7)]">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct < 0 ? 0 : pct}%`, background: color }} />
    </div>
  );
}
