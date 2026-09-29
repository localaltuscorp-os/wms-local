import Link from "next/link";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { listSelfLearning, selfLearnMinutesThisMonth } from "@/lib/queries/learning";
import { getScoreConfig } from "@/lib/queries/pms";
import { monthStart } from "@/lib/weekly-goals/week";
import { SelfLearningItem } from "@/components/training/learning/self-learning-form";
import { SelfLearningLogDialog } from "@/components/training/learning/self-learning-log-dialog";

export const dynamic = "force-dynamic";

function nextMonthStart(ms: string): string {
  const [y, m] = ms.split("-").map(Number);
  const next = m === 12 ? { y: y! + 1, m: 1 } : { y: y!, m: m! + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}-01`;
}

function nextDay(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isYmd(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function SelfLearningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireWorkspace("training");
  const sp = await searchParams;
  const selectedDate = singleParam(sp.date);
  const selectedCreator = singleParam(sp.createdBy) ?? "";
  const ms = monthStart();
  const monthEnd = nextMonthStart(ms);
  const from = isYmd(selectedDate) ? selectedDate : ms;
  const to = isYmd(selectedDate) ? nextDay(selectedDate) : monthEnd;
  const [rows, minutesThisMonth, cfg] = await Promise.all([
    listSelfLearning(me.id, from, to),
    selfLearnMinutesThisMonth(me.id),
    getScoreConfig(),
  ]);

  const targetHours = cfg.thresholds.selfLearnHoursPerMonth || 0;
  const targetMin = Math.round(targetHours * 60);
  const pct = targetMin > 0 ? Math.min(100, Math.round((minutesThisMonth / targetMin) * 100)) : 0;
  const hoursDone = (minutesThisMonth / 60).toFixed(1);
  const monthName = new Date(`${ms}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const met = targetMin > 0 && minutesThisMonth >= targetMin;
  const visibleRows = selectedCreator && selectedCreator !== me.id ? [] : rows;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 pt-6 pb-8 max-md:px-4">
        <PageCommandBar title="Self-Learning" actions={<SelfLearningLogDialog />} />

        <section className="mb-4 rounded-section border border-hairline bg-surface-card px-4 py-3">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-subtle">{monthName}</span>
            <span className="tabular-nums text-[28px] font-black leading-none text-ink-strong">{hoursDone}</span>
            <span className="text-[13px] font-bold text-ink-muted">/ {targetHours || "—"} hrs</span>
            <span className={`text-[12.5px] font-semibold ${met ? "text-green-deep" : "text-ink-muted"}`}>{met ? "Target met" : `${Math.max(0, Math.ceil((targetMin - minutesThisMonth) / 60 * 10) / 10)} hrs remaining`}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full rounded-full bg-altus-red" style={{ width: `${pct}%` }} />
          </div>
        </section>

        <form className="mb-3 flex flex-wrap items-center gap-2" action="/training/self-learning">
          <label className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong"><span className="text-ink-soft">Any Date</span><input className="min-w-0 bg-transparent outline-none" type="date" name="date" defaultValue={isYmd(selectedDate) ? selectedDate : ""} aria-label="Any Date" /></label>
          <select className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-semibold text-ink-strong" name="createdBy" defaultValue={selectedCreator} aria-label="Created By">
            <option value="">Created By</option>
            <option value={me.id}>{me.name}</option>
          </select>
          <button type="submit" className="wg-btn rounded-lg px-3 py-2 text-[13px] font-bold">Filter</button>
          {(selectedDate || selectedCreator) && <Link href={"/training/self-learning" as Route} className="px-2 py-2 text-[13px] font-bold text-ink-soft hover:text-altus-red">Clear</Link>}
        </form>

        <section className="overflow-hidden rounded-section border border-hairline bg-surface-card">
          <div className="border-b border-hairline px-4 py-2.5 text-[13px] font-bold text-ink-strong">Learning Entries</div>
          {visibleRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] font-medium text-ink-subtle">No learning logged for this filter.</p>
          ) : (
            <div className="divide-y divide-hairline">
              {visibleRows.map((row) => (
                <div key={row.id} className="px-4 py-2.5">
                  <SelfLearningItem {...row} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
