"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Plus,
  ArrowRight,
  CornerUpRight,
  Target,
  Circle,
  Trash2,
  Loader2,
  CheckCircle2,
  Flag,
  Briefcase,
  ExternalLink,
  Clock,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { ScoreRing } from "@/components/weekly-goals/score-ring";
import { fireToast } from "@/lib/toast";
import {
  pullGoalToToday,
  addStandaloneItem,
  closeItem,
  removeItem,
  moveOverdueToToday,
  setAssignedTaskDone,
} from "@/app/(app)/daily-checklist/actions";
import { MIN_DAILY_ITEMS } from "@/lib/daily-checklist/constants";
import { formatDate, localDateString } from "@/lib/format";
import type { DailyItem, OverdueItem, PullableGoal } from "@/lib/queries/daily-checklist";

/** Shared visible focus ring for keyboard users (brand-red on neutral surfaces). */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

interface Props {
  // Kept for the daily-checklist-view call shape; the gate is served by
  // DailyPlanGate, so this surface is always the in-app page.
  mode?: "page" | "gate";
  greetingName?: string;
  today: { weekday: string; date: string };
  items: DailyItem[];
  overdue: OverdueItem[];
  pullable: PullableGoal[];
}

export function DayLedger({ today, items: pItems, overdue: pOverdue, pullable: pPullable }: Props) {
  const router = useRouter();
  // Per-action busy key — NOT useTransition. A transition kept `pending` true
  // through the whole (slow) server refresh, disabling every button so you
  // couldn't add a second item. `busyId` clears the moment the action returns;
  // the refresh runs in the background.
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Server-driven: the list updates optimistically from each action's returned
  // row, then a background router.refresh() re-syncs from the server.
  const [items, setItems] = React.useState(pItems);
  const [overdue, setOverdue] = React.useState(pOverdue);
  const [pullable, setPullable] = React.useState(pPullable);
  React.useEffect(() => setItems(pItems), [pItems]);
  React.useEffect(() => setOverdue(pOverdue), [pOverdue]);
  React.useEffect(() => setPullable(pPullable), [pPullable]);

  const assigned = items.filter((i) => i.source === "assigned");
  const personal = items.filter((i) => i.source === "personal");
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pendingCount = total - doneCount;
  const goalCount = items.filter((i) => i.origin === "goal_related").length;

  type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string };
  async function act(key: string, fn: () => Promise<Res>, onOk: (r: { ok: true; [k: string]: unknown }) => void) {
    setBusyId(key);
    try {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      // Apply the result optimistically so the list updates instantly, then
      // refresh in the background to re-sync from the server. Neither blocks the
      // buttons (busyId clears in `finally`).
      onOk(res);
      router.refresh();
    } catch (e: unknown) {
      fireToast({ message: e instanceof Error ? e.message : "Something went wrong.", type: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const onPull = (g: PullableGoal) =>
    act(g.id, () => pullGoalToToday(g.id), (r) => {
      const item = (r as unknown as { item: DailyItem | null }).item;
      if (item) setItems((p) => [...p, item]);
      setPullable((p) => p.filter((x) => x.id !== g.id));
    });

  const onAdd = (fd: FormData) =>
    act("add", () => addStandaloneItem(fd), (r) => setItems((p) => [...p, (r as unknown as { item: DailyItem }).item]));

  const onMoveOverdue = () =>
    act("overdue", () => moveOverdueToToday(), (r) => {
      setItems((p) => [...p, ...(r as unknown as { items: DailyItem[] }).items]);
      setOverdue([]);
    });

  // Check-off routes to the RIGHT record: an assigned item writes to the task
  // itself (single source of truth → flows to the manager's dashboard); a
  // personal item closes its own checklist row.
  const onToggle = (it: DailyItem, done: boolean) =>
    act(
      it.id,
      () =>
        it.source === "assigned"
          ? setAssignedTaskDone(it.taskId ?? it.id, done)
          : closeItem(it.id, done),
      () =>
        setItems((p) =>
          p.map((x) =>
            x.id === it.id ? { ...x, done, status: done ? "done" : "not_started" } : x,
          ),
        ),
    );

  const onNote = (it: DailyItem, note: string) =>
    act(it.id, () => closeItem(it.id, it.done, note), () => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, doneNote: note } : x))));

  const onRemove = (it: DailyItem) =>
    act(it.id, () => removeItem(it.id), () => setItems((p) => p.filter((x) => x.id !== it.id)));

  return (
    <div className="w-full px-8 max-md:px-4 pt-6 pb-16">
      <div className="w-full">
        {/* ── Centered, compact header (no left-right gap) ── */}
        <header
          className="wg-rise relative overflow-hidden rounded-2xl bg-surface-card border border-hairline px-5 py-3 mb-3 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          />
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-altus-red">
            {today.weekday}
          </div>
          <div className="mt-0.5 flex items-baseline justify-center gap-3 flex-wrap">
            <h1
              className="font-bold text-ink-strong"
              style={{
                fontSize: "clamp(26px, 3vw, 36px)",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              Today
            </h1>
            <span className="font-semibold text-ink-subtle" style={{ fontSize: 14 }}>
              {today.date}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
            <HeroChip label="Committed" value={total} />
            <HeroChip label="Done" value={doneCount} tone="green" />
            <HeroChip label="Pending" value={pendingCount} tone="amber" />
            {goalCount > 0 && <HeroChip label="Goal-Linked" value={goalCount} tone="red" />}
          </div>
        </header>

        {/* ── Overdue strip ── */}
        {overdue.length > 0 && (
          <div
            className="wg-rise shrink-0 mb-3 flex items-center justify-between gap-3 rounded-section border px-4 py-2.5"
            style={{ borderColor: "var(--color-amber)", background: "color-mix(in srgb, var(--color-amber) 9%, transparent)", animationDelay: "80ms" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CornerUpRight size={18} strokeWidth={2.4} style={{ color: "var(--color-amber-deep)" }} className="shrink-0" />
              <span className="font-semibold text-ink-strong truncate" style={{ fontSize: 14 }}>
                {overdue.length} unfinished item{overdue.length === 1 ? "" : "s"} from earlier
              </span>
            </div>
            <button
              type="button"
              onClick={onMoveOverdue}
              disabled={busyId === "overdue"}
              className={`wg-btn cursor-pointer inline-flex items-center gap-1.5 rounded-md py-2 px-3.5 text-[13px] font-bold text-white shrink-0 disabled:opacity-50 ${FOCUS_RING}`}
              style={{ background: "linear-gradient(135deg, var(--color-amber), var(--color-amber-deep))" }}
            >
              {busyId === "overdue" ? <Loader2 size={14} className="animate-spin" /> : <CornerUpRight size={14} strokeWidth={2.6} />}
              Carry Forward to Today
            </button>
          </div>
        )}

        {/* ── Day-ready banner (full width, prominent) ── */}
        <DailyMin5 count={total} assignedCount={assigned.length} />

        {/* ── Two-column body: ledger (main) + intelligence sidebar ── */}
        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1 items-start">
          {/* MAIN — the commitments ledger */}
          <section
            className="wg-rise lg:col-span-2 min-w-0 rounded-section bg-surface-card border border-hairline p-6 max-md:p-5"
            style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)", animationDelay: "140ms" }}
          >
            <div className="mb-4 flex items-center justify-between gap-3 shrink-0">
              <h2
                className="font-bold text-ink-strong"
                style={{ fontSize: 24, letterSpacing: "-0.015em" }}
              >
                Today&apos;s Commitments
              </h2>
              {total > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold tabular-nums"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red-deep)" }}
                >
                  {doneCount}/{total} closed
                </span>
              )}
            </div>

            <div>
            {total === 0 ? (
              <div className="py-12 text-center">
                <div
                  className="mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-2xl"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", color: "var(--color-altus-red)" }}
                >
                  <Plus size={26} strokeWidth={2.4} />
                </div>
                <p className="font-bold text-ink-strong" style={{ fontSize: 19 }}>Nothing planned yet</p>
                <p className="mx-auto mt-1.5 max-w-[44ch] font-medium text-ink-subtle" style={{ fontSize: 15.5, lineHeight: 1.5 }}>
                  Tasks your manager assigns for today appear here automatically. Add your own personal
                  items below, or pull from your weekly goals on the right.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {assigned.length > 0 && (
                  <SectionGroup
                    icon={<Briefcase size={14} strokeWidth={2.6} />}
                    label="Assigned by your manager"
                    count={assigned.length}
                    tone="blue"
                  >
                    {assigned.map((it) => (
                      <LedgerRow
                        key={`a-${it.id}`}
                        item={it}
                        assigned
                        busy={busyId === it.id}
                        onToggle={(done) => onToggle(it, done)}
                        onNote={(note) => onNote(it, note)}
                        onRemove={() => onRemove(it)}
                      />
                    ))}
                  </SectionGroup>
                )}
                {personal.length > 0 && (
                  <SectionGroup
                    icon={<Circle size={10} strokeWidth={0} fill="currentColor" />}
                    label="Personal"
                    count={personal.length}
                    tone="red"
                  >
                    {personal.map((it) => (
                      <LedgerRow
                        key={`p-${it.id}`}
                        item={it}
                        busy={busyId === it.id}
                        onToggle={(done) => onToggle(it, done)}
                        onNote={(note) => onNote(it, note)}
                        onRemove={() => onRemove(it)}
                      />
                    ))}
                  </SectionGroup>
                )}
              </div>
            )}
            </div>

            <AddItem busy={busyId === "add"} onAdd={onAdd} />
          </section>

          {/* SIDEBAR — pull goals · at a glance · the ritual */}
          <aside className="space-y-5 min-w-0">
            {pullable.length > 0 && (
              <section
                className="wg-rise rounded-section bg-surface-card border border-hairline p-5"
                style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)", animationDelay: "200ms" }}
              >
                <h3 className="font-bold text-ink-strong mb-1" style={{ fontSize: 17 }}>Pull from Weekly Goals</h3>
                <p className="text-ink-subtle mb-3" style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                  Commit a goal to today — it joins as a goal-related item.
                </p>
                {/* Capped + scrollable: a long goal list must NOT stretch the page
                    tall (leaving the short ledger column with a big empty gap). */}
                <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {pullable.map((g) => (
                    <li
                      key={g.id}
                      className="rounded-xl border border-hairline px-3.5 py-2.5 transition-colors hover:border-altus-red/40 hover:bg-altus-red/[0.02]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Target size={16} strokeWidth={2.2} style={{ color: "var(--color-altus-red)" }} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink-strong truncate" style={{ fontSize: 14.5 }}>
                            {g.targetDone || g.subject || "Weekly goal"}
                          </div>
                          {(g.client || g.subject) && (
                            <div className="text-ink-subtle truncate" style={{ fontSize: 12.5 }}>
                              {[g.client, g.subject].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <span className="tabular-nums font-bold text-ink-subtle shrink-0" style={{ fontSize: 12 }}>
                          {g.weight} wt
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPull(g)}
                        disabled={busyId === g.id}
                        aria-label={`Add "${g.targetDone || g.subject || "Weekly goal"}" to today`}
                        className={`wg-btn cursor-pointer mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-surface-card py-1.5 px-3 text-[13px] font-semibold text-ink-strong hover:border-altus-red hover:text-altus-red disabled:opacity-50 ${FOCUS_RING}`}
                      >
                        {busyId === g.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} strokeWidth={2.4} />}
                        Move to Today
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <AtAGlance committed={total} done={doneCount} pending={pendingCount} goalCount={goalCount} />
            <HowItWorks />
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── day-ready banner (green once at least one item is planned) ── */
function DailyMin5({ count, assignedCount }: { count: number; assignedCount: number }) {
  const met = count >= 1;
  return (
    <div
      className={`wg-rise shrink-0 mb-3 flex items-center justify-between gap-4 flex-wrap rounded-section p-4 ${met ? "" : "wg-nudge"}`}
      style={{
        background: met
          ? "color-mix(in srgb, var(--color-green) 7%, #fff)"
          : "color-mix(in srgb, var(--color-altus-red) 6%, #fff)",
        border: `1px solid ${met ? "color-mix(in srgb, var(--color-green) 30%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 28%, transparent)"}`,
        animationDelay: "100ms",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: met
              ? "color-mix(in srgb, var(--color-green) 16%, transparent)"
              : "color-mix(in srgb, var(--color-altus-red) 14%, transparent)",
            color: met ? "var(--color-green-deep)" : "var(--color-altus-red)",
          }}
        >
          {met ? <CheckCircle2 size={22} strokeWidth={2.4} /> : <Flag size={21} strokeWidth={2.4} />}
        </span>
        <div className="min-w-0">
          <div className="font-bold text-ink-strong" style={{ fontSize: 17 }}>
            {met ? "Your day is planned — you're set to clock in" : "Nothing planned yet — add one item to start your day"}
          </div>
          <div className="font-semibold text-ink-soft" style={{ fontSize: 14 }}>
            {assignedCount > 0
              ? `${assignedCount} task${assignedCount === 1 ? "" : "s"} assigned by your manager · ${count} planned in total.`
              : "Your assigned tasks appear here automatically — add personal items any time."}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── sidebar: today at a glance (stat bars) ── */
function AtAGlance({ committed, done, pending, goalCount }: { committed: number; done: number; pending: number; goalCount: number }) {
  const rows: { label: string; value: number; tone: "slate" | "green" | "amber" | "red" }[] = [
    { label: "Committed", value: committed, tone: "slate" },
    { label: "Done", value: done, tone: "green" },
    { label: "Pending", value: pending, tone: "amber" },
    { label: "Goal-Linked", value: goalCount, tone: "red" },
  ];
  const max = Math.max(committed, 1);
  const pct = committed > 0 ? (done / committed) * 100 : 0;
  return (
    <section
      className="wg-rise rounded-section bg-surface-card border border-hairline p-5"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)", animationDelay: "260ms" }}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className={pct >= 100 ? "wg-ring-glow shrink-0" : "shrink-0"}>
          <ScoreRing value={pct} size={56} label={`${Math.round(pct)}% of today done`} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-ink-strong" style={{ fontSize: 17 }}>Today at a Glance</h3>
          <p className="font-semibold text-ink-subtle" style={{ fontSize: 13 }}>
            {done}/{committed} done · {Math.round(pct)}%
          </p>
        </div>
      </div>
      <div className="space-y-3.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-ink-soft" style={{ fontSize: 14 }}>{r.label}</span>
              <span className="tabular-nums font-black text-ink-strong" style={{ fontSize: 17 }}>{r.value}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, background: `linear-gradient(90deg, var(--color-${r.tone}), var(--color-${r.tone}-deep))` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── sidebar: the daily ritual (dark guidance panel) ── */
function HowItWorks() {
  const steps = [
    { n: "1", t: "Plan", d: `Plan at least ${MIN_DAILY_ITEMS} things you'll get done today — pulled from goals or your own.` },
    { n: "2", t: "Do", d: "Work through them — this is your checklist for the day." },
    { n: "3", t: "Close Out", d: "Tonight, tick what's done and note what slipped." },
  ];
  return (
    <section
      className="wg-rise rounded-section border p-5"
      style={{ background: "linear-gradient(135deg, #1C1511, #0E0B09)", borderColor: "rgba(255,255,255,0.08)", animationDelay: "320ms" }}
    >
      <h3 className="font-bold mb-3.5" style={{ fontSize: 16, color: "#F7F4ED" }}>The Daily Ritual</h3>
      <ol className="space-y-3.5">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              {s.n}
            </span>
            <div>
              <div className="font-bold" style={{ fontSize: 14.5, color: "#F7F4ED" }}>{s.t}</div>
              <div className="font-medium" style={{ fontSize: 13, color: "rgba(247,244,237,0.62)", lineHeight: 1.45 }}>{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── stat chip for the (light) header ── */
function HeroChip({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  const dot = tone ? `var(--color-${tone})` : "var(--color-ink-subtle)";
  const bg = tone ? `color-mix(in srgb, var(--color-${tone}) 9%, #fff)` : "var(--color-surface-soft, #F4F4F5)";
  const border = tone ? `color-mix(in srgb, var(--color-${tone}) 26%, transparent)` : "var(--color-hairline)";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />
      <span className="tabular-nums font-black text-ink-strong" style={{ fontSize: 14.5 }}>{value}</span>
      <span className="font-semibold text-ink-subtle" style={{ fontSize: 12.5 }}>{label}</span>
    </span>
  );
}

/* ── a labelled group of rows (Assigned by manager · Personal) ── */
function SectionGroup({
  icon,
  label,
  count,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "blue" | "red";
  children: React.ReactNode;
}) {
  const color = tone === "blue" ? "#2563eb" : "var(--color-altus-red)";
  const tint = tone === "blue" ? "color-mix(in srgb, #2563eb 9%, transparent)" : "color-mix(in srgb, var(--color-altus-red) 8%, transparent)";
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em]" style={{ background: tint, color }}>
          {icon}
          {label}
        </span>
        <span className="tabular-nums text-[12px] font-bold text-ink-subtle">{count}</span>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--color-hairline)" }}>
        {children}
      </ul>
    </div>
  );
}

/** Deterministic IST date label (same on server + client → no hydration drift). */
function dueLabel(d: Date): string {
  return formatDate(localDateString("Asia/Kolkata", new Date(d)));
}

/* ── one ledger row (assigned task OR personal item) ── */
function LedgerRow({
  item,
  assigned = false,
  busy,
  onToggle,
  onNote,
  onRemove,
}: {
  item: DailyItem;
  assigned?: boolean;
  busy: boolean;
  onToggle: (done: boolean) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = React.useState(item.doneNote ?? "");
  const goal = item.origin === "goal_related";
  const overdue = assigned && item.dueAt != null && new Date(item.dueAt).getTime() < Date.now();
  const dot = assigned ? "#2563eb" : goal ? "var(--color-altus-red)" : "var(--color-ink-subtle)";

  return (
    <li className="flex items-start gap-3 py-3 group">
      <button
        type="button"
        onClick={() => onToggle(!item.done)}
        disabled={busy}
        aria-pressed={item.done}
        title={item.done ? "Mark not done" : "Mark done"}
        aria-label={item.done ? "Mark not done" : "Mark done"}
        className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors disabled:opacity-50 ${FOCUS_RING}`}
        style={
          item.done
            ? { background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))", borderColor: "var(--color-green-deep)" }
            : { borderColor: "var(--color-ink-soft)", background: "#fff" }
        }
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin text-ink-subtle" />
        ) : item.done ? (
          <Check size={17} strokeWidth={3.4} className="text-white" />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 min-w-0">
          <span aria-hidden className="inline-flex shrink-0 mt-1.5" style={{ color: dot }}>
            <Circle size={8} strokeWidth={0} fill="currentColor" />
          </span>
          {assigned && item.taskId ? (
            <Link
              href={`/tasks/${item.taskId}` as Route}
              className={`group/link min-w-0 inline-flex items-center gap-1 font-semibold break-words ${item.done ? "text-ink-subtle line-through" : "text-ink-strong hover:text-[#2563eb]"}`}
              style={{ fontSize: 16.5, overflowWrap: "anywhere" }}
            >
              {item.title}
              <ExternalLink size={13} strokeWidth={2.4} className="shrink-0 opacity-0 group-hover/link:opacity-100" />
            </Link>
          ) : (
            <span
              className={`min-w-0 font-semibold break-words ${item.done ? "text-ink-subtle line-through" : "text-ink-strong"}`}
              style={{ fontSize: 16.5, overflowWrap: "anywhere" }}
            >
              {item.title}
            </span>
          )}
          {item.movedFromDate && (
            <span className="text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0" style={{ color: "var(--color-amber-deep)", background: "color-mix(in srgb, var(--color-amber) 14%, transparent)" }}>
              carried
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          {assigned ? (
            <>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#2563eb" }}>
                Assigned{item.taskNo != null ? ` · #${item.taskNo}` : ""}
              </span>
              {item.dueAt && (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold"
                  style={
                    overdue
                      ? { color: "var(--color-amber-deep)", background: "color-mix(in srgb, var(--color-amber) 15%, transparent)" }
                      : { color: "var(--color-ink-subtle)", background: "var(--color-surface-soft)" }
                  }
                >
                  <Clock size={11} strokeWidth={2.6} />
                  {overdue ? "Overdue · " : "Due "}
                  {dueLabel(item.dueAt)}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: goal ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}>
              {goal ? "Goal" : "Personal"}
            </span>
          )}
          {(item.client || item.subject) && (
            <span className="text-ink-subtle truncate" style={{ fontSize: 12 }}>
              · {[item.client, item.subject].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        {/* Personal items get a night close-out note; assigned tasks are edited on
            the task itself, so no note field here. */}
        {!assigned && (
          <input
            type="text"
            defaultValue={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if ((note ?? "") !== (item.doneNote ?? "")) onNote(note);
            }}
            placeholder="Add a note on what happened…"
            className={`mt-1.5 w-full bg-transparent text-[13px] text-ink-soft placeholder:text-ink-subtle border-b border-transparent focus:border-hairline-strong py-0.5 ${FOCUS_RING}`}
          />
        )}
      </div>

      {/* Only personal items can be removed — a manager-assigned task can't be
          deleted from someone's day (it lives on the task itself). */}
      {!assigned && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove "${item.title}"`}
          className={`mt-0.5 shrink-0 rounded-md p-1 text-ink-subtle hover:text-altus-red transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-md:opacity-100 disabled:opacity-30 ${FOCUS_RING}`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} strokeWidth={2.2} />}
        </button>
      )}
    </li>
  );
}

/* ── add ad-hoc item ── */
function AddItem({ busy, onAdd }: { busy: boolean; onAdd: (fd: FormData) => void }) {
  const ref = React.useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={(fd) => {
        onAdd(fd);
        ref.current?.reset();
      }}
      className="mt-4 shrink-0"
    >
      <div
        className="flex items-center gap-2.5 rounded-2xl border-2 bg-surface-card px-3 py-2 transition-colors focus-within:border-[var(--color-altus-red)]"
        style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
      >
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
        >
          <Plus size={19} strokeWidth={2.6} />
        </span>
        <input
          name="title"
          type="text"
          required
          maxLength={280}
          autoComplete="off"
          aria-label="Add something you'll get done today"
          placeholder="Add something you'll get done today…"
          className={`flex-1 min-w-0 bg-transparent text-[16px] font-medium text-ink-strong placeholder:text-ink-subtle py-2 ${FOCUS_RING}`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`wg-btn wg-sheen cursor-pointer inline-flex shrink-0 items-center gap-2 rounded-xl py-3 px-6 text-[15px] font-bold text-white disabled:opacity-50 ${FOCUS_RING}`}
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 8px 20px -10px rgba(225,6,0,0.5)" }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.8} />}
          Add
        </button>
      </div>
      <p className="mt-2 text-[12.5px] font-medium text-ink-subtle">
        Press Enter to add · plan at least {MIN_DAILY_ITEMS} to start your day.
      </p>
    </form>
  );
}
