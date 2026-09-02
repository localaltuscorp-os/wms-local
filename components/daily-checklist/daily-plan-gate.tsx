"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Plus, Check, X, Loader2, ListChecks, Sparkles, Clock3, ClipboardList,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  pullTaskToToday,
  addStandaloneItem,
  removeItem,
  moveOverdueToToday,
  autoFillFive,
} from "@/app/(app)/daily-checklist/actions";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import type {
  DailyItem, OverdueItem, PullableGoal, OpenTaskOption, PlannerGoal,
} from "@/lib/queries/daily-checklist";

/**
 * "Plan Your Day" login gate — REBUILT clean & guided (Sir, 2026-07-11).
 * ONE simple job: commit at least MIN_DAILY_ITEMS things to today, then start.
 * No weekly-goal logging (removed), no drag-and-drop (tap to add). Every list
 * scrolls inside a fixed box so a long roster can never overflow / break the UI.
 * met/ready read MIN_DAILY_ITEMS — the same constant the server wall uses, so
 * "Start my day" can never buffer on a threshold mismatch.
 */
const MIN = MIN_DAILY_ITEMS;
const GREEN = "var(--color-green)";
const GREEN_DEEP = "var(--color-green-deep)";
const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

interface Props {
  greetingName?: string;
  today: { weekday: string; date: string };
  items: DailyItem[];
  overdue: OverdueItem[];
  pullable?: PullableGoal[]; // legacy — unused
  openTasks: OpenTaskOption[];
  plannerGoals?: PlannerGoal[]; // legacy — unused (weekly goals no longer gated)
}

type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };

export function DailyPlanGate({ greetingName, today, items: pItems, overdue: pOverdue, openTasks: pOpenTasks }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(pItems);
  const [openTasks, setOpenTasks] = React.useState(pOpenTasks);
  const [overdue, setOverdue] = React.useState(pOverdue);
  const [draft, setDraft] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // COMMITTED = daily_checklist rows (personal items + tasks the user pulled) —
  // exactly what the server counts (countPlannedItems). Assigned-but-unpulled
  // tasks (source "assigned") do NOT count; they live in the pull-pool below.
  const committed = React.useMemo(() => items.filter((i) => i.source === "personal"), [items]);
  const count = committed.length;
  const met = count >= MIN;
  const remaining = Math.max(0, MIN - count);
  const ready = met;

  // Pull-pool = assigned tasks (due-today auto rows + open tasks), deduped by
  // task id, minus anything already committed. Tap one → pullTaskToToday makes
  // it a committed row and it leaves the pool.
  const pool = React.useMemo(() => {
    const committedTaskIds = new Set(committed.map((i) => i.taskId).filter(Boolean) as string[]);
    const m = new Map<string, { id: string; title: string; client: string | null; taskNo: number | null }>();
    for (const it of items) {
      if (it.source === "assigned" && it.taskId && !committedTaskIds.has(it.taskId)) {
        m.set(it.taskId, { id: it.taskId, title: it.title, client: it.client, taskNo: it.taskNo });
      }
    }
    for (const t of openTasks) {
      if (!committedTaskIds.has(t.id) && !m.has(t.id)) {
        m.set(t.id, { id: t.id, title: t.title, client: t.client, taskNo: t.taskNo });
      }
    }
    return [...m.values()];
  }, [items, openTasks, committed]);

  async function act(key: string, fn: () => Promise<Res>, onOk: (r: { ok: true } & Record<string, unknown>) => void) {
    if (busyId) return;
    setBusyId(key);
    try {
      const res = await fn();
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      onOk(res as { ok: true } & Record<string, unknown>);
    } catch (e) {
      fireToast({ message: e instanceof Error ? e.message : "Something went wrong.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  function addOwn(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (title.length < 2) { fireToast({ message: "Type what you'll do (a couple of words).", type: "error" }); return; }
    const fd = new FormData();
    fd.set("title", title);
    void act("add-own", () => addStandaloneItem(fd), (r) => {
      setItems((p) => [...p, r.item as DailyItem]);
      setDraft("");
      inputRef.current?.focus();
    });
  }

  function addTask(taskId: string) {
    void act(`task:${taskId}`, () => pullTaskToToday(taskId), (r) => {
      const item = r.item as DailyItem | null;
      if (item) setItems((p) => [...p, item]);
      setOpenTasks((p) => p.filter((t) => t.id !== taskId));
      if (!item) fireToast({ message: "That task is already on today's list.", type: "info" });
    });
  }

  function drop(itemId: string) {
    void act(`rm:${itemId}`, () => removeItem(itemId), () => {
      setItems((p) => p.filter((i) => i.id !== itemId));
    });
  }

  function bringOverdue() {
    void act("overdue", () => moveOverdueToToday(), (r) => {
      const moved = (r.items as DailyItem[]) ?? [];
      setItems((p) => [...p, ...moved]);
      setOverdue([]);
    });
  }

  function fillFromTasks() {
    void act("autofill", () => autoFillFive(), () => router.refresh());
  }

  function startDay() {
    if (!ready || entering) return;
    setEntering(true);
    router.refresh();
    // Safety: server + client share MIN so this passes, but never trap the UI.
    window.setTimeout(() => setEntering(false), 4000);
  }

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto"
      style={{ background: "radial-gradient(120% 80% at 50% -10%, #FBF7F0, #F4EEE3)" }}
    >
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col px-5 py-8 max-md:py-6">
        {/* ── Header ── */}
        <header className="wg-rise mb-5">
          <span className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}>
            <Sparkles size={13} strokeWidth={2.6} /> {today.weekday} · {today.date}
          </span>
          <h1 className="mt-3 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 900, fontSize: "clamp(26px,4vw,38px)", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            Plan Your Day{greetingName ? `, ${greetingName}` : ""}
          </h1>
          <p className="mt-1.5 text-[15px] font-medium text-ink-muted">
            Add <b className="text-ink-strong">at least {MIN} things</b>{" "}you&apos;ll work on today — type your own or tap a task. Then start.
          </p>
        </header>

        {/* ── Progress ── */}
        <div className="wg-rise mb-4 flex items-center gap-3 rounded-[18px] bg-surface-card p-4" style={{ animationDelay: "40ms", boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 30px -22px rgba(15,23,42,0.35)" }}>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: MIN }).map((_, i) => (
              <span key={i} className="h-2.5 w-8 rounded-full transition-colors duration-300" style={{ background: i < count ? `linear-gradient(90deg, ${GREEN}, ${GREEN_DEEP})` : "var(--color-surface-track)" }} />
            ))}
            {count > MIN && <span className="ml-1 text-[12px] font-bold text-[color:var(--color-green-deep)]">+{count - MIN}</span>}
          </div>
          <div className="ml-auto text-right">
            <div className="tabular-nums text-[15px] font-black text-ink-strong">{count} of {MIN}</div>
            <div className="text-[12px] font-semibold" style={{ color: met ? GREEN_DEEP : "var(--color-ink-subtle)" }}>
              {met ? "You're ready to start" : `Add ${remaining} more`}
            </div>
          </div>
        </div>

        {/* ── Today's plan ── */}
        <section className="wg-rise mb-4 rounded-[20px] bg-surface-card p-5 max-md:p-4" style={{ animationDelay: "80ms", boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 30px -22px rgba(15,23,42,0.3)" }}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="inline-grid size-9 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}><ListChecks size={18} strokeWidth={2.3} /></span>
            <h2 className="text-[16px] font-black text-ink-strong">Today&apos;s Plan</h2>
          </div>

          {committed.length === 0 ? (
            <div className="rounded-xl border border-solid border-hairline-strong px-4 py-6 text-center">
              <p className="text-[14px] font-semibold text-ink-muted">Nothing planned yet.</p>
              <p className="mt-0.5 text-[13px] text-ink-subtle">Type your first task below, or tap one from your tasks.</p>
            </div>
          ) : (
            <ul className="flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
              {committed.map((it) => (
                <li key={it.id} className="flex items-center gap-3 rounded-xl bg-surface-soft px-3.5 py-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                  <span className="inline-grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}><Check size={13} strokeWidth={3} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-ink-strong">{it.title}</div>
                    {(it.client || it.taskNo) && (
                      <div className="truncate text-[11.5px] font-semibold text-ink-subtle">
                        {it.source === "assigned" ? `Task${it.taskNo ? ` #${it.taskNo}` : ""}` : "Personal"}{it.client ? ` · ${it.client}` : ""}
                      </div>
                    )}
                  </div>
                  <button type="button" disabled={!!busyId} onClick={() => drop(it.id)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-white hover:text-[color:var(--color-altus-red)] disabled:opacity-40" aria-label="Remove"><X size={15} strokeWidth={2.4} /></button>
                </li>
              ))}
            </ul>
          )}

          {/* add your own */}
          <form onSubmit={addOwn} className="mt-3 flex gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={280}
              placeholder="What will you work on? e.g. Call Altus Corp about invoice"
              className="min-w-0 flex-1 rounded-xl border-2 border-hairline-strong bg-white px-3.5 py-2.5 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-green)]"
            />
            <button type="submit" disabled={busyId === "add-own" || draft.trim().length < 2} className="brand-btn wg-btn inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13.5px] font-bold text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}>
              {busyId === "add-own" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} strokeWidth={2.6} />} Add
            </button>
          </form>
        </section>

        {/* ── Pull from your tasks ── */}
        {(pool.length > 0 || overdue.length > 0) && (
          <section className="wg-rise mb-4 rounded-[20px] bg-surface-card p-5 max-md:p-4" style={{ animationDelay: "120ms", boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 30px -22px rgba(15,23,42,0.3)" }}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className="inline-grid size-9 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, transparent)", color: RED_DEEP }}><ClipboardList size={18} strokeWidth={2.3} /></span>
              <h2 className="text-[16px] font-black text-ink-strong">Pull from Your Tasks</h2>
              {pool.length > 0 && count < MIN && (
                <button type="button" disabled={!!busyId} onClick={fillFromTasks} className="ml-auto inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                  {busyId === "autofill" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2.4} />} Quick-Fill
                </button>
              )}
            </div>

            {overdue.length > 0 && (
              <button type="button" disabled={!!busyId} onClick={bringOverdue} className="mb-2.5 flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left disabled:opacity-50" style={{ background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 25%, transparent)" }}>
                <Clock3 size={16} className="text-[color:var(--color-altus-red)]" strokeWidth={2.3} />
                <span className="flex-1 text-[13.5px] font-bold text-ink-strong">{overdue.length} unfinished from before</span>
                <span className="text-[12.5px] font-bold text-[color:var(--color-altus-red-deep)]">{busyId === "overdue" ? "Adding…" : "Bring Forward →"}</span>
              </button>
            )}

            {pool.length > 0 && (
              <ul className="flex max-h-[240px] flex-col gap-2 overflow-y-auto pr-1">
                {pool.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl bg-surface-soft px-3.5 py-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-ink-strong">{t.title}</div>
                      <div className="truncate text-[11.5px] font-semibold text-ink-subtle">{t.taskNo ? `#${t.taskNo}` : ""}{t.client ? `${t.taskNo ? " · " : ""}${t.client}` : ""}</div>
                    </div>
                    <button type="button" disabled={!!busyId} onClick={() => addTask(t.id)} className="brand-btn inline-flex shrink-0 items-center gap-1 rounded-pill px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}>
                      {busyId === `task:${t.id}` ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} strokeWidth={2.6} />} Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Start ── */}
        <div className="wg-rise sticky bottom-4 mt-auto" style={{ animationDelay: "160ms" }}>
          <button
            type="button"
            onClick={startDay}
            disabled={!ready || entering}
            className="brand-btn wg-btn wg-sheen flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-[16px] font-black text-white transition disabled:cursor-not-allowed"
            style={{
              background: ready ? `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` : "var(--color-surface-track)",
              color: ready ? "#fff" : "var(--color-ink-subtle)",
              boxShadow: ready ? `0 16px 34px -16px ${GREEN_DEEP}` : "none",
            }}
          >
            {entering ? (
              <><Loader2 size={19} className="animate-spin" /> Starting your day…</>
            ) : ready ? (
              <>Start My Day <ArrowRight size={19} strokeWidth={2.8} /></>
            ) : (
              <>Add {remaining} more to start</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
