"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import type { Route } from "next";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  INITIATOR_COLUMN_ORDER,
  INITIATOR_COLUMN_LABEL,
  INITIATOR_COLUMN_TONE,
  NO_VERDICT_COL,
  canSetInitiatorStatus,
  initiatorColumnFor,
  isInitiatorStatus,
  type InitiatorColId,
  type StatusActor,
} from "@/lib/status/axes";
import { DOER_STATUS_LABEL, effectiveDoerStatus } from "@/lib/status/axes";
import { setTaskInitiatorStatus } from "@/app/(app)/tasks/actions";
import { formatDate } from "@/lib/format";

/**
 * THE INITIATOR BOARD — the other half of the kanban's [ Doer | Initiator ]
 * toggle.
 *
 * WHY A SECOND COMPONENT RATHER THAN A PROP ON THE FIRST. `kanban-board.tsx` is
 * the doer board and carries a lot that is specific to it: per-column drag
 * ordering persisted to localStorage, a 10-second Undo with a restore-to-exact-
 * slot origin record, admin column reordering, "Show more" paging. All of that
 * is about arranging a long working queue. The initiator board answers a
 * different question — "what have I ruled on, and what is still waiting?" —
 * over five fixed columns that nobody reorders, so threading an `axis` prop
 * through the other board's drag machinery would have made both boards harder
 * to read in order to share code neither needs.
 *
 * What the two DO share is the vocabulary, and that is shared properly:
 * `lib/status/axes.ts` owns the columns, the labels, the colours and the
 * permission rule, and the server action re-checks the same rule before it
 * writes.
 *
 * NO VERDICT LEADS THE BOARD. Work nobody has ruled on is the queue an
 * initiator is here to clear, so it is the first column rather than an absence.
 * It is also the one column you cannot drag INTO: un-deciding is not a
 * decision, and there is no value to write.
 */

export interface InitiatorCard {
  id: string;
  taskNo: number | null;
  title: string;
  description: string | null;
  client: string | null;
  subject: string | null;
  /** Doer status — shown on the card, because a verdict without the progress it
   *  is ruling on is half a sentence. */
  status: string;
  approvalStatus: string | null;
  archived: boolean;
  dueAt: Date | string | null;
  doerId: string;
  doerName: string;
  initiatorId: string | null;
  updatedAt: Date | string;
}

interface Props {
  cards: InitiatorCard[];
  /** The signed-in user, for the permission check the dropdown renders from. */
  me: { id: string; isAdmin: boolean };
}

const asDate = (v: Date | string | null): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v);

function actorFor(me: Props["me"], card: InitiatorCard): StatusActor {
  return {
    id: me.id,
    isAdmin: me.isAdmin,
    isInitiator: card.initiatorId === me.id,
    isDoer: card.doerId === me.id,
    isSupervisor: false,
  };
}

export function InitiatorKanbanBoard({ cards, me }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  // Optimistic overlay: card id → the column it was just moved to. Cleared by
  // the refresh that follows a successful write.
  const [moved, setMoved] = React.useState<Record<string, InitiatorColId>>({});

  const columnOf = React.useCallback(
    (c: InitiatorCard): InitiatorColId => moved[c.id] ?? initiatorColumnFor(c),
    [moved],
  );

  const byColumn = React.useMemo(() => {
    const out = new Map<InitiatorColId, InitiatorCard[]>();
    for (const col of INITIATOR_COLUMN_ORDER) out.set(col, []);
    for (const c of cards) out.get(columnOf(c))?.push(c);
    return out;
  }, [cards, columnOf]);

  async function move(card: InitiatorCard, to: InitiatorColId) {
    if (to === NO_VERDICT_COL || !isInitiatorStatus(to)) return;
    if (columnOf(card) === to) return;

    const allowed = canSetInitiatorStatus(actorFor(me, card), to);
    if (!allowed.ok) {
      fireToast({ type: "error", message: allowed.reason });
      return;
    }

    const from = columnOf(card);
    setPending(card.id);
    setMoved((m) => ({ ...m, [card.id]: to }));
    const res = await setTaskInitiatorStatus(
      card.id,
      to,
      asDate(card.updatedAt)?.toISOString(),
    );
    setPending(null);
    if (!res.ok) {
      // Put it back where it was — an optimistic move that the server refused
      // must not leave the board asserting something untrue.
      setMoved((m) => ({ ...m, [card.id]: from }));
      fireToast({ type: "error", message: res.message ?? "Could not update." });
      return;
    }
    fireToast({
      type: "success",
      message: `Marked ${INITIATOR_COLUMN_LABEL[to]}.`,
    });
    scheduleReconcile(() => router.refresh());
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {INITIATOR_COLUMN_ORDER.map((col) => {
        const list = byColumn.get(col) ?? [];
        const tone = INITIATOR_COLUMN_TONE[col];
        const droppable = col !== NO_VERDICT_COL;
        return (
          <section
            key={col}
            className="flex w-[288px] shrink-0 flex-col rounded-card border border-hairline bg-surface-subtle"
            onDragOver={(e) => {
              if (droppable) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!droppable) return;
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              const card = cards.find((c) => c.id === id);
              if (card) void move(card, col);
            }}
          >
            <header
              className="flex items-center justify-between gap-2 rounded-t-card border-b border-hairline px-3 py-2"
              style={{ borderTop: `3px solid ${tone}` }}
            >
              <span className="text-[13px] font-bold text-ink-strong">
                {INITIATOR_COLUMN_LABEL[col]}
              </span>
              <span
                className="rounded-pill px-2 py-0.5 text-[11.5px] font-bold text-white"
                style={{ background: tone }}
              >
                {list.length}
              </span>
            </header>

            <div className="flex flex-col gap-2 p-2">
              {list.length === 0 && (
                <p className="px-1 py-6 text-center text-[12.5px] text-ink-faint">
                  {col === NO_VERDICT_COL ? "Everything has a verdict." : "Nothing here."}
                </p>
              )}
              {list.map((c) => {
                const canRule = canSetInitiatorStatus(actorFor(me, c), "approved").ok;
                const busy = pending === c.id;
                const due = asDate(c.dueAt);
                return (
                  <article
                    key={c.id}
                    draggable={canRule && !busy}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                    className="group rounded-card border border-hairline bg-surface-card p-2.5"
                    style={{
                      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                      cursor: canRule ? "grab" : "default",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/tasks/${c.id}` as Route}
                        className="text-[13px] font-semibold leading-snug text-ink-strong hover:underline"
                      >
                        {c.description ?? c.title}
                      </Link>
                      {busy ? (
                        <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-ink-faint" />
                      ) : !canRule ? (
                        <Lock
                          size={12}
                          className="mt-1 shrink-0 text-ink-faint"
                          aria-label="Only the initiator or an admin can rule on this"
                        />
                      ) : null}
                    </div>

                    {/* The doer's answer, beside the initiator's. Two axes, one
                        card — the whole reason the split is worth having. */}
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-soft">
                      <span className="rounded-pill border border-hairline px-1.5 py-0.5 font-semibold">
                        {DOER_STATUS_LABEL[effectiveDoerStatus(c.status)]}
                      </span>
                      {c.client && <span className="truncate">{c.client}</span>}
                      {due && <span>· {formatDate(due)}</span>}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                        <EmployeeAvatar name={c.doerName} size="xs" />
                        <span className="truncate">{c.doerName}</span>
                      </span>
                      {canRule && (
                        <select
                          aria-label="Initiator status"
                          className="rounded-pill border border-hairline bg-surface-subtle px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-soft"
                          value={columnOf(c) === NO_VERDICT_COL ? "" : columnOf(c)}
                          disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (isInitiatorStatus(v)) void move(c, v);
                          }}
                        >
                          <option value="" disabled>
                            No Verdict
                          </option>
                          {INITIATOR_COLUMN_ORDER.filter(
                            (x): x is Exclude<InitiatorColId, typeof NO_VERDICT_COL> =>
                              x !== NO_VERDICT_COL,
                          ).map((x) => (
                            <option key={x} value={x}>
                              {INITIATOR_COLUMN_LABEL[x]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
