"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ExternalLink, Loader2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { getDccDashboardDetail } from "@/app/(app)/dcc/dashboard/actions";
import type { DashboardPerson } from "@/lib/dcc/dashboard";
import type { DccDetailDay } from "@/lib/dcc/dashboard-detail";
import { OutcomeChip } from "./ui";
import { longDate, shortDate } from "./format";

export interface DrawerTarget {
  person: DashboardPerson;
  from: string;
  to: string;
}

/**
 * One person's due KPIs, newest day first — what every row, cell and card on
 * the DCC dashboard opens.
 *
 * Fetched on open (see getDccDashboardDetail). A slide-over rather than a jump
 * to /dcc so the reader keeps their place, filters and scroll on the dashboard;
 * "Open DCC board" is there for when they do want to act.
 */
export function DccDetailDrawer({
  target,
  today,
  onClose,
}: {
  target: DrawerTarget | null;
  today: string;
  onClose: () => void;
}) {
  const key = target ? `${target.person.id}|${target.from}|${target.to}` : null;

  /* Each result is stamped with the target it was fetched FOR. Anything not
     stamped with the current target is simply "loading" — so switching from one
     person to another can never flash the previous person's days, and the
     effect never has to reset state synchronously before it fetches. */
  const [fetched, setFetched] = React.useState<
    | { key: string; kind: "error"; message: string }
    | { key: string; kind: "ok"; days: DccDetailDay[] }
    | null
  >(null);
  const state: { kind: "loading" } | NonNullable<typeof fetched> =
    fetched && fetched.key === key ? fetched : { kind: "loading" };

  React.useEffect(() => {
    if (!target || !key) return;
    let live = true;
    getDccDashboardDetail({ ownerId: target.person.id, from: target.from, to: target.to })
      .then((res) => {
        if (!live) return;
        setFetched(res.ok ? { key, kind: "ok", days: res.days } : { key, kind: "error", message: res.error });
      })
      .catch(() => {
        if (live) setFetched({ key, kind: "error", message: "Couldn't load the detail. Try again." });
      });
    return () => {
      live = false;
    };
    // `key` captures everything about the target that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  React.useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [target, onClose]);

  if (!target) return null;

  const span = target.from === target.to ? longDate(target.from) : `${shortDate(target.from)} – ${shortDate(target.to)}`;
  const counts =
    state.kind === "ok"
      ? state.days.reduce(
          (acc, d) => {
            for (const r of d.rows) {
              acc.due++;
              if (r.outcome === "done") acc.done++;
              if (r.outcome === "unfilled" && d.date !== today) acc.missed++;
            }
            return acc;
          },
          { due: 0, done: 0, missed: 0 },
        )
      : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${target.person.name} DCC`}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 backdrop-blur-xs"
      />
      <aside
        className="relative flex h-full w-full max-w-2xl flex-col border-l bg-white shadow-2xl"
        style={{ animation: "drawerIn 180ms ease-out" }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-3.5">
          <Avatar name={target.person.name} avatarUrl={target.person.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-slate-900">{target.person.name}</h2>
            <p className="truncate text-[12px] font-medium text-slate-500">
              {span}
              {counts && ` · ${counts.done}/${counts.due} done · ${counts.missed} missed`}
            </p>
          </div>
          <Link
            href={`/dcc?emp=${target.person.id}` as Route}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={13} /> Open DCC board
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.kind === "loading" && (
            <p className="flex items-center justify-center gap-2 py-16 text-[13px] font-semibold text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </p>
          )}
          {state.kind === "error" && (
            <p className="py-16 text-center text-[13px] font-semibold text-rose-700">{state.message}</p>
          )}
          {state.kind === "ok" && state.days.length === 0 && (
            <p className="py-16 text-center text-[13px] font-semibold text-slate-500">No KPIs were due in this window.</p>
          )}
          {state.kind === "ok" &&
            state.days.map((day) => {
              const done = day.rows.filter((r) => r.outcome === "done").length;
              return (
                <section key={day.date} className="mb-5">
                  <div className="mb-2 flex items-baseline justify-between border-b border-slate-100 pb-1.5">
                    <h3 className={`text-[13px] font-extrabold ${day.date === today ? "text-[var(--color-altus-red)]" : "text-slate-900"}`}>
                      {longDate(day.date)}
                      {day.date === today && " · Today"}
                    </h3>
                    <span className="text-[12px] font-bold tabular-nums text-slate-500">
                      {done}/{day.rows.length} done
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {day.rows.map((r) => (
                      <li key={r.itemId} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <OutcomeChip outcome={r.outcome} isToday={day.date === today} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-slate-800">
                            {r.code && <span className="mr-1.5 font-mono text-[11px] text-slate-400">{r.code}</span>}
                            {r.title}
                          </p>
                          {(r.value || r.note) && (
                            <p className="mt-0.5 text-[12px] text-slate-500">
                              {r.value && <span className="font-bold tabular-nums text-slate-700">{r.value}</span>}
                              {r.value && r.note && " · "}
                              {r.note}
                            </p>
                          )}
                        </div>
                        {r.section && (
                          <span className="hidden max-w-[140px] shrink-0 truncate text-[11px] font-semibold text-slate-400 sm:block">
                            {r.section}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      </aside>
    </div>
  );
}
