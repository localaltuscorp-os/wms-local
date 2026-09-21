"use client";

import * as React from "react";
import { CheckCircle2, Clock3, Inbox, MessageCircleQuestion } from "lucide-react";
import { TicketList } from "@/components/hr/ticket-list/ticket-list";
import { statusCardTokens, type StatusCardKey } from "@/lib/status-palette";
import {
  filterRows,
  summarise,
  type QueryFilter,
} from "@/lib/hr/query-summary";
import type { TicketListRow } from "@/lib/queries/hr-support";

/**
 * YOUR QUESTIONS — the key cards, and the list they filter.
 *
 * ── THE CARDS ARE CONTROLS, NOT DECORATION ────────────────────────────────
 * A row of numbers nobody can click is a poster. Each card here is a toggle
 * over the list directly beneath it, and the one that is on says so with a ring
 * rather than only a colour — so the state is visible to someone who cannot
 * tell the tints apart, and to anyone looking at a screenshot.
 *
 * ── WHY THREE BUCKETS AND NOT SIX ─────────────────────────────────────────
 * The table has six statuses; the person who asked the question has three
 * concerns — is it still with HR, does it need something from me, is it done.
 * `lib/hr/query-summary.ts` owns that mapping so these cards and the badges on
 * the rows cannot drift.
 *
 * Empty cards stay VISIBLE but go inert: "0 waiting on you" is a useful thing
 * to be told, and a card that vanishes when it empties makes the row jump about
 * as tickets move between states.
 */
export function QueriesBoard({ rows }: { rows: TicketListRow[] }) {
  const [filter, setFilter] = React.useState<QueryFilter>("all");
  const s = React.useMemo(() => summarise(rows), [rows]);
  const shown = React.useMemo(() => filterRows(rows, filter), [rows, filter]);

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-hairline-strong bg-surface-card px-6 py-12 text-center">
        <Inbox size={26} className="mx-auto text-ink-subtle" aria-hidden />
        <p className="mt-3 text-[14.5px] font-semibold text-ink-strong">
          You haven&apos;t asked anything yet.
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Use the box above — HR replies here, and you&apos;ll get a notification.
        </p>
      </section>
    );
  }

  const cards = [
    {
      key: "all" as QueryFilter,
      card: "total" as StatusCardKey,
      label: "All questions",
      value: s.total,
      icon: <MessageCircleQuestion size={15} strokeWidth={2.4} />,
    },
    {
      key: "withHr" as QueryFilter,
      card: "needInfo" as StatusCardKey,
      label: "With HR",
      value: s.withHr,
      icon: <Clock3 size={15} strokeWidth={2.4} />,
    },
    {
      key: "waitingOnYou" as QueryFilter,
      card: "pending" as StatusCardKey,
      label: "Waiting on you",
      value: s.waitingOnYou,
      icon: <MessageCircleQuestion size={15} strokeWidth={2.4} />,
    },
    {
      key: "resolved" as QueryFilter,
      card: "done" as StatusCardKey,
      label: "Resolved",
      value: s.resolved,
      icon: <CheckCircle2 size={15} strokeWidth={2.4} />,
    },
  ];

  return (
    <section aria-label="Your questions">
      {/* Four across only once there is room for four. At `sm` the cards sat
          in a ~480px column and every label truncated to "ALL QUEST…" /
          "WAITING O…", which is a worse card than a taller grid. */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {cards.map((c) => {
          const t = statusCardTokens(c.card);
          const on = filter === c.key;
          // "All" never empties while rows exist; the other three can, and an
          // empty bucket is not a filter worth offering.
          const inert = c.value === 0 && c.key !== "all";
          return (
            <button
              key={c.key}
              type="button"
              disabled={inert}
              aria-pressed={on}
              onClick={() => setFilter(on ? "all" : c.key)}
              className={`rounded-xl border p-3 text-left shadow-sm transition ${t.shell} ${
                on ? `ring-2 ring-inset ${t.ring}` : ""
              } ${inert ? "cursor-default opacity-55" : "hover:shadow-md"}`}
            >
              <span
                className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] ${t.label}`}
              >
                {c.icon}
                <span className="truncate">{c.label}</span>
              </span>
              <span
                className={`mt-1.5 block tabular-nums leading-none ${t.value}`}
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 26,
                }}
              >
                {c.value}
              </span>
            </button>
          );
        })}
      </div>

      {filter !== "all" && (
        <p className="mb-2 text-[12.5px] text-ink-muted">
          Showing {shown.length} of {s.total}.{" "}
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="font-bold text-ink-strong underline underline-offset-2"
          >
            Show all
          </button>
        </p>
      )}

      <TicketList
        rows={shown}
        handlerView={false}
        empty="No questions in this state."
      />
    </section>
  );
}
