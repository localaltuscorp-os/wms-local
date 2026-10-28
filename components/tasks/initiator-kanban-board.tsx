"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  type InitiatorStatus,
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
 * PENDING LEADS THE BOARD. Work nobody has ruled on is the queue an
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
  /** Page-level outlet used to keep KPI cards outside the board panel. */
  kpiPortalTarget?: string;
}

const asDate = (v: Date | string | null): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v);

const INITIATOR_KPI_SPECS: Array<{
  status: InitiatorStatus;
  label: string;
  pill: string;
  border: string;
  dot: string;
}> = [
  { status: "approved", label: "Approved", pill: "bg-teal-50 text-teal-950", border: "border-teal-200", dot: "bg-teal-600" },
  { status: "not_approved", label: "Not approved", pill: "bg-rose-50 text-rose-950", border: "border-rose-200", dot: "bg-rose-600" },
  { status: "on_hold", label: "On hold", pill: "bg-amber-50 text-amber-950", border: "border-amber-200", dot: "bg-amber-600" },
  { status: "cancelled", label: "Cancelled", pill: "bg-orange-50 text-orange-950", border: "border-orange-200", dot: "bg-orange-600" },
  { status: "archived", label: "Archived", pill: "bg-fuchsia-50 text-fuchsia-950", border: "border-fuchsia-200", dot: "bg-fuchsia-600" },
];

const INITIATOR_DOER_SUMMARY_SPECS = [
  { status: "done", label: "Done", pill: "bg-emerald-50 text-emerald-950", border: "border-emerald-200", dot: "bg-emerald-600" },
  { status: "abandoned", label: "Abandoned", pill: "bg-sky-50 text-sky-950", border: "border-sky-200", dot: "bg-sky-500" },
] as const;

const INITIATOR_READ_ONLY_SUMMARY_SPECS = [
  { key: "pending", label: "Pending", pill: "bg-violet-50 text-violet-950", border: "border-violet-200", dot: "bg-violet-600" },
] as const;

function actorFor(me: Props["me"], card: InitiatorCard): StatusActor {
  return {
    id: me.id,
    isAdmin: me.isAdmin,
    isInitiator: card.initiatorId === me.id,
    isDoer: card.doerId === me.id,
    isSupervisor: false,
  };
}

export function InitiatorKanbanBoard({ cards, me, kpiPortalTarget }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  // Optimistic overlay: card id → the column it was just moved to. Cleared by
  // the refresh that follows a successful write.
  const [moved, setMoved] = React.useState<Record<string, InitiatorColId>>({});
  const [kpiTarget, setKpiTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setKpiTarget(kpiPortalTarget ? document.getElementById(kpiPortalTarget) : null);
  }, [kpiPortalTarget]);

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

  const kpiStrip = (
    <div className="flex flex-wrap items-center gap-2" aria-label="Initiator task status summary and drop targets">
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-2.5 py-1 text-slate-900">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" />
          <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>{cards.filter((card) => !card.archived).length}</span>
          <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>Total</span>
        </div>
        {/* Progress context for an initiator: these two cards deliberately read
            the doer axis, while the cards below remain initiator verdicts. */}
        {INITIATOR_DOER_SUMMARY_SPECS.map((spec) => (
          <div key={spec.status} className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 ${spec.pill} ${spec.border}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${spec.dot}`} />
            <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>
              {cards.filter((card) => !card.archived && effectiveDoerStatus(card.status) === spec.status).length}
            </span>
            <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>{spec.label}</span>
          </div>
        ))}
        {INITIATOR_READ_ONLY_SUMMARY_SPECS.filter((spec) => spec.key === "pending").map((spec) => {
          const count = spec.key === "pending"
            ? (byColumn.get(NO_VERDICT_COL)?.length ?? 0)
            : cards.filter((card) => card.approvalStatus === "cancelled").length;
          return (
            <div key={spec.key} className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 ${spec.pill} ${spec.border}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${spec.dot}`} />
              <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>{count}</span>
              <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>{spec.label}</span>
            </div>
          );
        })}
        {INITIATOR_KPI_SPECS.filter((spec) => spec.status !== "archived").map((spec) => {
          const count = byColumn.get(spec.status)?.length ?? 0;
          return (
            <div
              key={spec.status}
              className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 ${spec.pill} ${spec.border}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const card = cards.find((item) => item.id === e.dataTransfer.getData("text/plain"));
                if (card) void move(card, spec.status);
              }}
              aria-label={`Drop a task to mark it ${spec.label.toLowerCase()}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${spec.dot}`} />
              <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>{count}</span>
              <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>{spec.label}</span>
            </div>
          );
        })}
        {INITIATOR_KPI_SPECS.filter((spec) => spec.status === "archived").map((spec) => {
          const count = byColumn.get(spec.status)?.length ?? 0;
          return (
            <div
              key={spec.status}
              className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 ${spec.pill} ${spec.border}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const card = cards.find((item) => item.id === e.dataTransfer.getData("text/plain"));
                if (card) void move(card, spec.status);
              }}
              aria-label={`Drop a task to mark it ${spec.label.toLowerCase()}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${spec.dot}`} />
              <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>{count}</span>
              <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>{spec.label}</span>
            </div>
          );
        })}
    </div>
  );

  return (
    <div>
      {/* Mirrors the Tasks-section KPI position. These are verdict targets, so
          dropping an initiator-authorized card applies the chosen verdict. */}
      {kpiTarget ? createPortal(kpiStrip, kpiTarget) : <div className="mb-4">{kpiStrip}</div>}
      <div className="flex gap-4 overflow-x-auto pb-2">
      {INITIATOR_COLUMN_ORDER.map((col) => {
        const list = byColumn.get(col) ?? [];
        const tone = INITIATOR_COLUMN_TONE[col];
        const label = col === NO_VERDICT_COL ? "Pending" : INITIATOR_COLUMN_LABEL[col];
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
                {label}
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
                            Pending
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
    </div>
  );
}
