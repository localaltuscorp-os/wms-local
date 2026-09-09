"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ClipboardCheck, ExternalLink, Loader2, Sparkles, Sunrise } from "lucide-react";
import { PRIORITY_LABELS, USER_TASK_STATUSES } from "@/db/enums";
import type { TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { fireToast } from "@/lib/toast";
import { OverdueTag, SourceTag, fmtYmd } from "@/components/goals/plan/source-tag";
import { setItemProgress, closeMyDay, startMyDay } from "@/app/(app)/goals/plan/actions";
import { autoPunch } from "@/components/attendance/auto-punch";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import type { MyDayItem, MyDayPayload } from "@/app/(app)/my-day/payload";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const GRADIENT = `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`;
const RISK = "var(--color-red-deep)";
const WARN = "var(--color-amber-deep)";

const PLAN_HREF = "/goals/plan" as Route;

/**
 * My Day — the EXECUTION half of the daily loop.
 *
 * Plan My Day answers "what am I going to work on today?"; this answers "what
 * do I need to work on right now?". Both read and write the SAME
 * `daily_checklist` rows, so there is one daily plan, not two — this page just
 * drops the pull columns and adds the doing actions: tick it off, move a WMS
 * task's status, open the underlying task.
 *
 * Visual language is deliberately identical to the planner (same card, border,
 * tag and accent vocabulary) so the two read as two views of one system.
 */
export function MyDayBoard({ payload }: { payload: MyDayPayload }) {
  const [items, setItems] = React.useState<MyDayItem[]>(payload.items);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [dayBusy, setDayBusy] = React.useState<null | "start" | "finish">(null);
  const [started, setStarted] = React.useState(payload.started);
  const [closed, setClosed] = React.useState(payload.closed);

  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const remaining = total - doneCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  /** Tick a commitment off. Same `setItemProgress` the planner and close-out
   *  use, so completion reflects to the origin task / weekly goal identically. */
  const onToggleDone = React.useCallback((item: MyDayItem) => {
    const done = !item.done;
    const pctNext = done ? 100 : 0;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done, donePct: pctNext } : i)));
    setBusyId(item.id);
    void setItemProgress(item.id, { done, pct: pctNext })
      .then((r) => {
        if (!r.ok) {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, done: !done, donePct: done ? 0 : 100 } : i)),
          );
          fireToast({ message: r.error, type: "error" });
        }
      })
      .finally(() => setBusyId(null));
  }, []);

  /**
   * Move a WMS task's status without leaving the page. Uses the existing
   * `setTaskStatus` action, so the permission matrix, audit trail and
   * notifications behave exactly as they do on the task page. The action
   * returns a fresh `updatedAt`, which we store so a second change in a row
   * doesn't bounce off the optimistic lock.
   */
  const onStatusChange = React.useCallback((item: MyDayItem, status: TaskStatus) => {
    if (!item.taskId || !item.taskUpdatedAt) return;
    const previous = item.status;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    setBusyId(item.id);
    void setTaskStatus(item.taskId, status, item.taskUpdatedAt)
      .then((r) => {
        if (r.ok) {
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, taskUpdatedAt: r.updatedAt } : i)));
          return;
        }
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: previous } : i)));
        fireToast({
          message:
            r.error === "stale"
              ? "That task changed elsewhere — refresh and try again."
              : (r.message ?? "Couldn't update that status."),
          type: "error",
        });
      })
      .finally(() => setBusyId(null));
  }, []);

  const onStartDay = React.useCallback(() => {
    setDayBusy("start");
    void startMyDay()
      .then((r) => {
        if (!r.ok) return fireToast({ message: r.error, type: "error" });
        setStarted(true);
        // Start My Day → the existing Check In.
        void autoPunch("in");
      })
      .finally(() => setDayBusy(null));
  }, []);

  const onFinishDay = React.useCallback(() => {
    setDayBusy("finish");
    void closeMyDay()
      .then((r) => {
        if (!r.ok) return fireToast({ message: r.error, type: "error" });
        setClosed(true);
        // Finish My Day → the existing Check Out, so nobody has to go to
        // Employees › Attendance to clock out.
        void autoPunch("out");
      })
      .finally(() => setDayBusy(null));
  }, []);

  /* ── Nothing planned → send them to the planner, don't invent work here ── */
  if (total === 0) {
    return (
      <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-8 text-center max-md:p-6">
        <span
          className="mx-auto grid size-12 place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT_DEEP }}
        >
          <Sunrise size={22} />
        </span>
        <h2
          className="mt-3 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}
        >
          Nothing planned for today yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] text-ink-muted">
          My Day shows the work you committed to in Daily Goals &amp; Commitments. Line up your goals and tasks there
          first — they&apos;ll appear here ready to work through.
        </p>
        <Link
          href={PLAN_HREF}
          className="wg-btn mt-5 inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white shadow-[0_8px_22px_rgba(124,45,18,0.28)]"
          style={{ background: GRADIENT }}
        >
          Daily Goals &amp; Commitments <ArrowRight size={15} />
        </Link>
      </section>
    );
  }

  return (
    <section className="wg-rise rounded-2xl border border-hairline bg-surface-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="truncate text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.01em" }}
          >
            Today&apos;s Work
          </h2>
          <p className="truncate text-[11px] text-ink-muted">
            {closed
              ? "Day closed — here's how it went."
              : remaining === 0
                ? "Everything's done — nice."
                : `${remaining} still to do`}
          </p>
        </div>
        <span className="shrink-0 text-right">
          <span
            className="block text-[17px] font-black tabular-nums leading-none"
            style={{ color: doneCount === total ? "var(--color-green-deep)" : "var(--color-ink-strong)" }}
          >
            {doneCount} / {total}
          </span>
          <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted">Done</span>
        </span>
      </header>

      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-surface-track">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: doneCount === total ? "var(--color-green-deep)" : GRADIENT }}
        />
      </div>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <WorkRow
              key={item.id}
              item={item}
              today={payload.ymd}
              busy={busyId === item.id}
              readOnly={closed}
              onToggleDone={onToggleDone}
              onStatusChange={onStatusChange}
            />
          ))}
        </AnimatePresence>
      </ul>

      {/* ── Also due today, but NOT on the plan ──────────────────────────────
          Sir wanted one view of "my today" with goals and tasks CLUBBED
          together. The list above is only what was committed to; this is the
          rest of what the day is asking for — read-only, so it never quietly
          becomes a second plan. Adding one is still a deliberate act on the
          planner. */}
      {payload.alsoDue.length > 0 && (
        <section className="mt-5 border-t border-hairline pt-4">
          <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            Also due today · not on your plan
            <span className="ml-1.5 tabular-nums text-ink-muted">({payload.alsoDue.length})</span>
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {payload.alsoDue.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2"
              >
                <SourceTag kind={it.kind} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong" title={it.title}>
                  {it.title}
                </span>
                {it.taskNo != null && (
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-subtle">#{it.taskNo}</span>
                )}
                {it.overdue && <OverdueTag />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3 max-sm:flex-col max-sm:items-stretch">
        <p className="text-[11px] text-ink-muted">
          {closed ? (
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: ACCENT_DEEP }}>
              <Sparkles size={13} /> That&apos;s a wrap on today.
            </span>
          ) : started ? (
            "Your day is running — tick work off as you go."
          ) : (
            "Start your day when you're ready to begin."
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2 max-sm:flex-col max-sm:items-stretch">
          <Link
            href={PLAN_HREF}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-chip border border-hairline bg-surface-card px-3 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-hairline-strong"
          >
            Adjust plan
          </Link>
          {!closed && !started ? (
            <button
              type="button"
              onClick={onStartDay}
              disabled={dayBusy != null}
              className="wg-btn wg-sheen inline-flex h-9 items-center justify-center gap-2 rounded-chip px-4 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: GRADIENT }}
            >
              {dayBusy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Sunrise size={14} />} Start My Day
            </button>
          ) : null}
          {!closed && started ? (
            <button
              type="button"
              onClick={onFinishDay}
              disabled={dayBusy != null}
              className="wg-btn wg-sheen inline-flex h-9 items-center justify-center gap-2 rounded-chip px-4 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: GRADIENT }}
            >
              {dayBusy === "finish" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Finish Day
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/* One line of today's work                                                */
/* ----------------------------------------------------------------------- */

function WorkRow({
  item,
  today,
  busy,
  readOnly,
  onToggleDone,
  onStatusChange,
}: {
  item: MyDayItem;
  today: string;
  busy: boolean;
  readOnly: boolean;
  onToggleDone: (item: MyDayItem) => void;
  onStatusChange: (item: MyDayItem, status: TaskStatus) => void;
}) {
  const isTask = item.kind === "task" && item.taskId;
  const dueToday = item.dueYmd === today;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="list-none rounded-chip border bg-surface-card px-3 py-2.5"
      style={{
        borderColor: item.done ? "color-mix(in srgb, var(--color-green) 32%, transparent)" : "var(--color-hairline)",
        background: item.done ? "color-mix(in srgb, var(--color-green) 4%, transparent)" : undefined,
      }}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => onToggleDone(item)}
          disabled={busy || readOnly}
          aria-pressed={item.done}
          aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} complete`}
          className="mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-2 disabled:opacity-60"
          style={
            item.done
              ? { background: "var(--color-green-deep)", borderColor: "var(--color-green-deep)", outlineColor: ACCENT }
              : { borderColor: "var(--color-hairline-strong)", outlineColor: ACCENT }
          }
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin text-ink-muted" />
          ) : item.done ? (
            <Check size={12} strokeWidth={3.5} className="text-white" />
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div
            className={
              "truncate text-[13.5px] leading-[19px] " +
              (item.done ? "font-medium text-ink-muted line-through" : "font-semibold text-ink-strong")
            }
          >
            {item.title}
          </div>

          {/* Identity — where this came from. */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-[15px] text-ink-muted">
            <SourceTag kind={item.kind} />
            {item.taskNo ? <span className="tabular-nums">#{item.taskNo}</span> : null}
            {item.client ? <span className="truncate">{item.client}</span> : null}
            {!isTask && item.subtitle ? <span className="truncate">{item.subtitle}</span> : null}
          </div>

          {/* Execution state — only WMS-linked work has due / priority / status. */}
          {isTask ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-[15px] text-ink-muted">
              {item.overdue ? (
                <>
                  <OverdueTag />
                  <span className="font-semibold tabular-nums" style={{ color: RISK }}>
                    {fmtYmd(item.dueYmd)}
                  </span>
                </>
              ) : dueToday ? (
                <span className="font-semibold" style={{ color: WARN }}>
                  Due today
                </span>
              ) : item.dueYmd ? (
                <span className="tabular-nums">Due {fmtYmd(item.dueYmd)}</span>
              ) : null}
              {item.priority ? (
                <span
                  className={item.priority === "imp_urgent" ? "font-semibold" : undefined}
                  style={item.priority === "imp_urgent" ? { color: RISK } : undefined}
                >
                  {PRIORITY_LABELS[item.priority]}
                </span>
              ) : null}

              {/* Update status in place — the primary execution action for a
                  WMS task, short of ticking it off entirely. */}
              {readOnly ? (
                item.status ? <span>{STATUS_LABELS_FALLBACK[item.status] ?? item.status}</span> : null
              ) : (
                <label className="inline-flex items-center gap-1">
                  <span className="sr-only">Status for {item.title}</span>
                  <select
                    value={item.status ?? ""}
                    disabled={busy}
                    onChange={(e) => onStatusChange(item, e.target.value as TaskStatus)}
                    className="h-6 rounded-md border border-hairline bg-surface-card px-1 text-[11px] font-semibold text-ink-soft focus-visible:outline-2 disabled:opacity-60"
                    style={{ outlineColor: ACCENT }}
                  >
                    {/* A task may sit on a status the picker no longer offers
                        (a retired value on imported data) — keep it selectable
                        so the control never silently mis-reports the truth. */}
                    {item.status && !USER_TASK_STATUSES.includes(item.status as never) ? (
                      <option value={item.status}>{STATUS_LABELS_FALLBACK[item.status] ?? item.status}</option>
                    ) : null}
                    {USER_TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS_FALLBACK[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <Link
                href={`/tasks/${item.taskId}` as Route}
                className="inline-flex items-center gap-1 font-semibold transition-colors hover:underline"
                style={{ color: ACCENT_DEEP }}
              >
                Open <ExternalLink size={11} />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}
