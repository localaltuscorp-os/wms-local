import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { loadDccScope, canFillFor } from "@/lib/dcc/access";
import { checkDccEntryWindow } from "@/lib/dcc/entry-lock";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { describeDay, shiftDays } from "@/lib/dcc/sp1";
import { loadSp1Day, loadSp1People } from "@/lib/queries/dcc-sp1";
import { localDateString } from "@/lib/format";
import { CallLogForm } from "@/components/dcc/call-log/call-log-form";

export const dynamic = "force-dynamic";

/**
 * EMPLOYEES → DCC → CALL LOG (DCC-SPEC §7).
 *
 * The screen the old module never had: it could report call outcomes but had no
 * way to enter them, so the report was permanently empty and looked broken.
 *
 * Opens on YOUR today. `?person=` fills for somebody you manage; `?date=` moves
 * the day, and a closed day renders read-only rather than disappearing — seeing
 * that yesterday is locked is more useful than being unable to find yesterday.
 */
export default async function DccCallLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; person?: string }>;
}) {
  const me = await requireUser();
  const [scope, sp] = await Promise.all([loadDccScope(me), searchParams]);

  const today = localDateString("Asia/Kolkata");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;

  // Who am I filling for? Anyone I may fill for; otherwise myself.
  const wanted = sp.person && canFillFor(scope, sp.person) ? sp.person : me.id;
  const people = await loadSp1People([...scope.visibleIds]);
  const fillable = people.filter((p) => canFillFor(scope, p.id));
  const person = people.find((p) => p.id === wanted);

  const { counts, missing } = await loadSp1Day(wanted, date);

  const window = checkDccEntryWindow({
    date,
    today,
    canEditPast: canEditPastDccEntries(me.email),
  });
  const editable = window.ok && canFillFor(scope, wanted) && !missing;

  const { label, weekday } = describeDay(date);
  const qs = (over: { date?: string; person?: string }) => {
    const p = new URLSearchParams();
    const d = over.date ?? date;
    if (d !== today) p.set("date", d);
    const who = over.person ?? wanted;
    if (who !== me.id) p.set("person", who);
    const s = p.toString();
    return (s ? `/dcc/call-log?${s}` : "/dcc/call-log") as Route;
  };

  return (
    <PageShell width="standard">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">Call Log</h1>
          <p className="text-[13px] text-ink-muted">
            {label} · {weekday}
            {date === today ? " · today" : ""}
          </p>
        </div>
        <nav aria-label="Move the day" className="flex items-center gap-1.5">
          <Link
            href={qs({ date: shiftDays(date, -1) })}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Link>
          <Link
            href={qs({ date: today })}
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
            href={qs({ date: shiftDays(date, 1) })}
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

      {missing && (
        <p
          className="mb-3 flex items-start gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            The call log isn&apos;t set up in this database yet — migration{" "}
            <code className="font-mono">0235_dcc_call_logs.sql</code> has not been applied. The form
            below is read-only until it is.
          </span>
        </p>
      )}

      {fillable.length > 1 && (
        <nav aria-label="Whose day" className="mb-3 flex flex-wrap gap-1.5">
          {fillable.map((p) => (
            <Link
              key={p.id}
              href={qs({ person: p.id })}
              aria-current={wanted === p.id ? "true" : undefined}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                wanted === p.id
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p.id === me.id ? "Me" : p.name}
            </Link>
          ))}
        </nav>
      )}

      <CallLogForm
        employeeId={wanted}
        date={date}
        initial={counts}
        editable={editable}
        lockedReason={window.ok ? undefined : window.error}
        personName={wanted === me.id ? undefined : person?.name}
      />

      <p className="mt-3 text-[11.5px] text-ink-subtle">
        A day closes at 11:59 pm IST. After that only Manan Sir can change it — the same rule that
        governs compliance entries, so &ldquo;yesterday&rdquo; means one thing across the whole
        module.
      </p>
    </PageShell>
  );
}
