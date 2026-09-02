import { eq } from "drizzle-orm";

import { DashboardHeader } from "@/components/layout/header";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { listItemsForOwners, listEntriesForOwners } from "@/lib/queries/dcc";
import { scheduledDueOn, isoDate } from "@/lib/dcc/util";
import { DccRanking, type RankRow } from "@/components/dcc/dcc-ranking";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
function dObj(iso: string) { const [y, m, d] = iso.split("-").map(Number); return new Date(y!, (m ?? 1) - 1, d ?? 1); }

export default async function DccRankingPage() {
  await requireUser();

  const now = new Date();
  const today = isoDate(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (WINDOW_DAYS - 1));
  const fromISO = isoDate(from);

  const people = await db
    .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
    .from(employees)
    .where(eq(employees.isActive, true));
  const ids = people.map((p) => p.id);

  const [items, entries] = await Promise.all([listItemsForOwners(ids), listEntriesForOwners(ids, fromISO)]);

  const itemsByOwner = new Map<string, typeof items>();
  for (const it of items) { const l = itemsByOwner.get(it.ownerEmployeeId); if (l) l.push(it); else itemsByOwner.set(it.ownerEmployeeId, [it]); }

  const doneSet = new Set<string>();
  const filledSet = new Set<string>();
  for (const e of entries) {
    const k = `${e.itemId}|${e.entryDate}`;
    if ((e.status ?? "").trim() || e.valueNumber || e.note) filledSet.add(k);
    if ((e.status ?? "").toLowerCase() === "done") doneSet.add(k);
  }

  // window days
  const days: string[] = [];
  { const d = dObj(fromISO); for (let i = 0; i < WINDOW_DAYS; i++) { days.push(isoDate(d)); d.setDate(d.getDate() + 1); } }

  const rows: RankRow[] = people
    .map((p) => {
      const own = itemsByOwner.get(p.id) ?? [];
      if (own.length === 0) return null;
      let due = 0, done = 0;
      for (const iso of days) {
        const d = dObj(iso);
        for (const it of own) {
          if (!scheduledDueOn(it, d)) continue;
          due++;
          if (doneSet.has(`${it.id}|${iso}`)) done++;
        }
      }
      if (due === 0) return null;
      // streak: consecutive days ending today fully filled
      let streak = 0;
      const sd = dObj(today);
      for (let i = 0; i < 60; i++) {
        const iso = isoDate(sd);
        const dueItems = own.filter((it) => scheduledDueOn(it, sd));
        if (dueItems.length > 0) {
          if (!dueItems.every((it) => filledSet.has(`${it.id}|${iso}`))) break;
          streak++;
        }
        sd.setDate(sd.getDate() - 1);
      }
      const pct = Math.round((done / due) * 100);
      const streakScore = (Math.min(streak, 30) / 30) * 100;
      const score = Math.round(0.8 * pct + 0.2 * streakScore);
      return { id: p.id, name: p.name, avatarUrl: p.avatarUrl, pct, streak, score, done, due };
    })
    .filter((r): r is RankRow => r !== null)
    .sort((a, b) => b.score - a.score || b.pct - a.pct || b.streak - a.streak);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[860px] px-6 max-md:px-4 pt-10 pb-24">
        <header className="mb-7 text-center">
          <span className="block text-[13px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "var(--color-altus-red-deep)" }}>Employees · DCC</span>
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(34px, 4.6vw, 52px)", letterSpacing: "-0.03em", lineHeight: 1.04, marginTop: 8 }}>
            Compliance Ranking
          </h1>
          <p className="mt-2.5 text-[16px] font-semibold text-ink-muted">Last 30 days · compliance % blended with streak</p>
        </header>
        <DccRanking rows={rows} />
      </main>
    </>
  );
}
