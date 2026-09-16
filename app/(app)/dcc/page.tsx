import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, Gauge } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { localDateString } from "@/lib/format";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { checkDccEntryWindow } from "@/lib/dcc/entry-lock";
import { scheduledDueOn, type DccStatus } from "@/lib/dcc/util";
import { describeDay, shiftDays } from "@/lib/dcc/sp1";
import { listOwnerEntries, listOwnerItems } from "@/lib/queries/dcc";
import { loadMasterLinksForItems } from "@/lib/dcc/master-sync";
import { loadSp1Day } from "@/lib/queries/dcc-sp1";
import { metricsOf } from "@/lib/dcc/sp1";
import { DccBoard, type BoardRow } from "@/components/dcc/board/dcc-board";

export const dynamic = "force-dynamic";

/**
 * EMPLOYEES → DCC → MY DAY (DCC-SPEC §6).
 *
 * Your compliances for one day, and nothing else. It is deliberately the
 * smallest screen in the module: it is opened daily, usually in a hurry, and
 * everything that is not "what do I owe today" belongs behind one of the other
 * four doors.
 *
 * `?date=` moves the day. A closed day still RENDERS — read-only, with the
 * reason — because being unable to see yesterday is worse than being unable to
 * change it.
 */
export default async function DccPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;

  const today = localDateString("Asia/Kolkata");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;

  const [items, entries] = await Promise.all([
    listOwnerItems(me.id),
    listOwnerEntries(me.id, date),
  ]);

  // Which of this person's compliances are actually due on this date. The board
  // shows the DAY, not the bank — a weekly duty on the wrong weekday is noise
  // that makes the real list harder to finish.
  const day = new Date(`${date}T00:00:00Z`);
  const due = items.filter((it) =>
    scheduledDueOn(
      { weekdays: it.weekdays, scheduleKind: it.scheduleKind, isParticipantList: it.isParticipantList },
      day,
    ),
  );

  // Where each compliance came from, so the person can see which rows are the
  // position's and therefore not theirs to edit. Degrades to "none" before 0230.
  const masters = await loadMasterLinksForItems(due.map((d) => d.id)).catch(
    () => new Map<string, string>(),
  );

  const byItem = new Map(entries.filter((e) => e.entryDate === date && !e.subjectId).map((e) => [e.itemId, e]));

  const rows: BoardRow[] = due.map((it) => {
    const e = byItem.get(it.id);
    return {
      itemId: it.id,
      title: it.title,
      section: it.section,
      code: it.code,
      targetNumber: it.targetNumber,
      unit: it.unit,
      masterDesignation: masters.get(it.id) ?? null,
      status: (e?.status as DccStatus | undefined) ?? null,
      note: e?.note ?? null,
      value: e?.valueNumber ?? null,
    };
  });

  const window = checkDccEntryWindow({
    date,
    today,
    canEditPast: canEditPastDccEntries(me.email),
  });

  const done = rows.filter((r) => r.status === "Done").length;
  const { counts } = await loadSp1Day(me.id, date);
  const calls = metricsOf(counts);

  const { label, weekday } = describeDay(date);
  const qs = (d: string) => ((d === today ? "/dcc" : `/dcc?date=${d}`) as Route);

  return (
    <PageShell width="standard">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">My Day</h1>
          <p className="text-[13px] text-ink-muted">
            {label} · {weekday}
            {date === today ? " · today" : ""} — {done} of {rows.length} done
            {calls.totalCalls > 0 ? ` · ${calls.totalCalls} calls logged` : ""}
          </p>
        </div>
        <nav aria-label="Move the day" className="flex items-center gap-1.5">
          <Link
            href={qs(shiftDays(date, -1))}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Link>
          <Link
            href={qs(today)}
            aria-disabled={date === today}
            className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-[12.5px] font-semibold ${
              date === today
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Today
          </Link>
          <Link
            href={qs(shiftDays(date, 1))}
            aria-disabled={date >= today}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12.5px] font-semibold ${
              date >= today
                ? "pointer-events-none border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      {!window.ok && (
        <p className="mb-3 rounded-xl bg-slate-100 px-4 py-2.5 text-[13px] font-medium text-slate-600">
          {window.error}
        </p>
      )}

      <DccBoard
        rows={rows}
        date={date}
        editable={window.ok}
        lockedReason={window.ok ? undefined : window.error}
      />

      <Link
        href={("/dcc/call-log" + (date === today ? "" : `?date=${date}`)) as Route}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Gauge className="h-4 w-4" aria-hidden />
        {calls.totalCalls > 0
          ? `Call log — ${calls.totalCalls} calls, ${calls.connected} connected`
          : "Log today's calls"}
      </Link>
    </PageShell>
  );
}
