"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  Lock,
  LockOpen,
  Plus,
  CalendarClock,
  CircleSlash,
  Snowflake,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import { MODULE_THEME } from "@/lib/module-theme";
import {
  setCommitProgress,
  toggleNextWeekAdopt,
  addNextWeekGoal,
  freezeWeekCommit,
  unfreezeWeekCommit,
} from "@/app/(app)/goals/commit/actions";
import {
  type CommitData,
  type CommitMember,
  type CommitGoalRow,
  memberDone,
  memberProgressFilled,
  memberNextCommitted,
} from "./types";

const ACCENT = "#E10600"; // Altus red — in-module chrome is brand red
const ACCENT_DEEP = "#A80400"; // Altus red deep

/** Google-style grade colour for a % value (≥70 green, 40–69 amber, <40 red). */
function gradeColor(pct: number): string {
  if (pct >= 70) return "#15803d";
  if (pct >= 40) return "#b45309";
  return "#b91c1c";
}

const DISPLAY = "var(--font-display), system-ui, sans-serif";

export function CommitWorkspace({ data }: { data: CommitData }) {
  const [members, setMembers] = React.useState<CommitMember[]>(data.members);
  const [selectedId, setSelectedId] = React.useState<string>(
    data.members[0]?.employeeId ?? "",
  );
  const [isPending, startTransition] = React.useTransition();

  // Reconcile with server truth after each action's revalidate.
  React.useEffect(() => {
    setMembers(data.members);
  }, [data.members]);

  const selected = members.find((m) => m.employeeId === selectedId) ?? members[0];
  const doneCount = members.filter(memberDone).length;

  /** Patch one goal in local state for a snappy optimistic feel. */
  const patchGoal = React.useCallback(
    (
      memberId: string,
      week: "thisWeek" | "nextWeek",
      goalId: string,
      patch: Partial<CommitGoalRow>,
    ) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.employeeId !== memberId
            ? m
            : { ...m, [week]: m[week].map((g) => (g.id === goalId ? { ...g, ...patch } : g)) },
        ),
      );
    },
    [],
  );

  const run = React.useCallback(
    (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => {
      startTransition(async () => {
        const res = await fn();
        if (!res.ok) fireToast({ message: res.error ?? "Something went wrong", type: "error" });
        else if (okMsg) fireToast({ message: okMsg, type: "success" });
      });
    },
    [],
  );

  const onSetProgress = (member: CommitMember, goal: CommitGoalRow, pct: number) => {
    patchGoal(member.employeeId, "thisWeek", goal.id, { pctDone: pct, filled: true });
    run(() => setCommitProgress({ id: goal.id, pctDone: pct }));
  };

  const onToggleAdopt = (member: CommitMember, goal: CommitGoalRow) => {
    const next = !goal.adopted;
    patchGoal(member.employeeId, "nextWeek", goal.id, { adopted: next });
    run(() => toggleNextWeekAdopt({ id: goal.id, adopted: next }));
  };

  const onAdd = (member: CommitMember, title: string) => {
    run(async () => {
      const res = await addNextWeekGoal({ employeeId: member.employeeId, title });
      return res;
    }, "Goal added for next week");
  };

  const onFreeze = (member: CommitMember) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.employeeId !== member.employeeId
          ? m
          : { ...m, nextWeek: m.nextWeek.map((g) => (g.adopted ? { ...g, committed: true } : g)) },
      ),
    );
    run(
      () => freezeWeekCommit({ employeeId: member.employeeId, weekStart: data.weekStart }),
      `Next week frozen for ${member.isSelf ? "you" : member.name.split(" ")[0]}`,
    );
  };

  const onUnfreeze = (member: CommitMember) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.employeeId !== member.employeeId
          ? m
          : { ...m, nextWeek: m.nextWeek.map((g) => ({ ...g, committed: false })) },
      ),
    );
    run(() => unfreezeWeekCommit({ employeeId: member.employeeId, weekStart: data.weekStart }));
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* ---------- Hero ---------- */}
      <header className="wg-rise mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Snowflake size={13} strokeWidth={2.5} />
              Saturday Commit
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: "clamp(28px, 3.4vw, 42px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
                marginTop: 8,
                maxWidth: "22ch",
              }}
            >
              Close this week, commit the next
            </h1>
            <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15 }}>
              Score <b className="text-ink-strong">{data.thisWeekLabel}</b>, then adopt and freeze
              your goals for <b className="text-ink-strong">{data.nextWeekLabel}</b>.
            </p>
          </div>

          {/* Overall status ring */}
          <div
            className="relative isolate flex items-center gap-3 overflow-hidden rounded-2xl border border-hairline bg-surface-card px-5 py-3"
            style={{ "--kpi-tone": ACCENT, "--kpi-tone-deep": ACCENT_DEEP } as React.CSSProperties}
          >
            <div aria-hidden className="kpi-aurora-primary" style={{ "--kpi-index": 0 } as React.CSSProperties} />
            <div aria-hidden className="kpi-aurora-secondary" />
            <div className="relative z-10 text-right">
              <div className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">
                Committed
              </div>
              <div
                className="text-ink-strong tabular-nums"
                style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 24, lineHeight: 1 }}
              >
                {doneCount}
                <span className="text-ink-soft" style={{ fontSize: 16 }}>
                  {" "}
                  / {members.length}
                </span>
              </div>
            </div>
            <div
              className="relative z-10 grid h-11 w-11 place-items-center rounded-full"
              style={{
                background:
                  doneCount === members.length && members.length > 0
                    ? "linear-gradient(135deg,#15803d,#166534)"
                    : `${ACCENT}1a`,
                color: doneCount === members.length && members.length > 0 ? "#fff" : ACCENT_DEEP,
              }}
            >
              {doneCount === members.length && members.length > 0 ? (
                <Check size={22} strokeWidth={3} />
              ) : (
                <CalendarClock size={20} strokeWidth={2.4} />
              )}
            </div>
          </div>
        </div>

        {!data.isSaturday && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-hairline bg-surface-soft px-4 py-2.5 text-[13.5px] font-medium text-ink-muted">
            <Sparkles size={15} style={{ color: ACCENT }} />
            You&apos;re preparing early — the Saturday punch-out commit gate goes live on Saturday
            (IST). Everything here still saves.
          </div>
        )}
      </header>

      {/* ---------- Member rail (managers) ---------- */}
      {members.length > 1 && (
        <div className="wg-rise mb-5 flex flex-wrap gap-2" style={{ animationDelay: "60ms" }}>
          {members.map((m) => {
            const done = memberDone(m);
            const active = m.employeeId === selectedId;
            return (
              <button
                key={m.employeeId}
                type="button"
                onClick={() => setSelectedId(m.employeeId)}
                className={`wg-btn group inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-[13px] font-semibold ${active ? "wg-sheen" : ""}`}
                style={{
                  borderColor: active ? ACCENT : "var(--color-hairline)",
                  background: active ? `${ACCENT}12` : "var(--surface-card)",
                  color: active ? ACCENT_DEEP : "var(--ink-muted)",
                }}
              >
                <EmployeeAvatar name={m.name} size="sm" />
                <span>{m.isSelf ? "You" : m.name}</span>
                <span
                  className="grid h-4 w-4 place-items-center rounded-full text-white"
                  style={{ background: done ? "#15803d" : "var(--color-hairline-strong)" }}
                >
                  {done && <Check size={11} strokeWidth={3.5} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- Selected member panels ---------- */}
      {selected ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.employeeId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="grid gap-5 lg:grid-cols-2"
          >
            <ThisWeekCard
              member={selected}
              label={data.thisWeekLabel}
              disabled={isPending}
              onSetProgress={onSetProgress}
            />
            <NextWeekCard
              member={selected}
              label={data.nextWeekLabel}
              disabled={isPending}
              onToggleAdopt={onToggleAdopt}
              onAdd={onAdd}
              onFreeze={onFreeze}
              onUnfreeze={onUnfreeze}
            />
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="rounded-2xl border border-hairline bg-surface-card p-10 text-center text-ink-muted">
          No goals to commit yet.
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* This week — fill progress                                           */
/* ================================================================== */

function ThisWeekCard({
  member,
  label,
  disabled,
  onSetProgress,
}: {
  member: CommitMember;
  label: string;
  disabled: boolean;
  onSetProgress: (m: CommitMember, g: CommitGoalRow, pct: number) => void;
}) {
  const adopted = member.thisWeek.filter((g) => g.adopted);
  const filled = memberProgressFilled(member);
  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5">
      <CardHeader
        eyebrow="Step 1 · This week"
        title={label}
        done={filled && adopted.length > 0}
        doneLabel="Progress filled"
      />
      {adopted.length === 0 ? (
        <Empty text="No goals this week — nothing to score." />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {adopted.map((g) => (
            <li key={g.id} className="rounded-xl border border-hairline bg-surface-soft/60 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-ink-soft">#{g.position}</span>
                    {g.filled ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{ background: "#15803d" }}
                      >
                        <Check size={10} strokeWidth={3.5} /> Filled
                      </span>
                    ) : (
                      <span className="inline-flex rounded-pill bg-surface-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                        Pending
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[14px] font-semibold text-ink-strong">{g.title}</p>
                  {(g.client || g.subject) && (
                    <p className="truncate text-[12px] text-ink-soft">
                      {[g.client, g.subject].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div
                  className="shrink-0 tabular-nums"
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 900,
                    fontSize: 22,
                    color: gradeColor(g.pctDone),
                  }}
                >
                  {g.pctDone}%
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={g.pctDone}
                  disabled={disabled}
                  onChange={(e) => onSetProgress(member, g, Number(e.target.value))}
                  aria-label={`Progress for ${g.title}`}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-hairline"
                  style={{ accentColor: ACCENT }}
                />
                <div className="flex shrink-0 gap-1">
                  {[0, 50, 100].map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSetProgress(member, g, v)}
                      className="wg-btn rounded-md border border-hairline px-1.5 py-0.5 text-[11px] font-bold text-ink-muted hover:border-hairline-strong hover:text-ink-strong disabled:opacity-50"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {g.acceptPct != null && (
                <p className="mt-1.5 text-[11px] font-medium text-ink-soft">
                  Manager accepted {g.acceptPct}%
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== */
/* Next week — commit & freeze                                         */
/* ================================================================== */

function NextWeekCard({
  member,
  label,
  disabled,
  onToggleAdopt,
  onAdd,
  onFreeze,
  onUnfreeze,
}: {
  member: CommitMember;
  label: string;
  disabled: boolean;
  onToggleAdopt: (m: CommitMember, g: CommitGoalRow) => void;
  onAdd: (m: CommitMember, title: string) => void;
  onFreeze: (m: CommitMember) => void;
  onUnfreeze: (m: CommitMember) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const adopted = member.nextWeek.filter((g) => g.adopted);
  const committed = memberNextCommitted(member);
  const frozen = adopted.length > 0 && adopted.every((g) => g.committed);

  const submitAdd = () => {
    const t = draft.trim();
    if (!t) return;
    onAdd(member, t);
    setDraft("");
  };

  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5">
      <CardHeader
        eyebrow="Step 2 · Next week"
        title={label}
        done={committed}
        doneLabel="Frozen"
      />

      <ul className="mt-4 flex flex-col gap-2">
        {member.nextWeek.length === 0 && (
          <Empty text="No goals cascaded yet — add what you'll commit to below." />
        )}
        {member.nextWeek.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-soft/60 p-3"
            style={{ opacity: g.adopted ? 1 : 0.5 }}
          >
            <button
              type="button"
              disabled={disabled || frozen}
              onClick={() => onToggleAdopt(member, g)}
              aria-label={g.adopted ? "Drop this goal" : "Adopt this goal"}
              title={g.adopted ? "Drop from next week" : "Adopt for next week"}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-60"
              style={{
                borderColor: g.adopted ? ACCENT : "var(--color-hairline-strong)",
                background: g.adopted ? ACCENT : "transparent",
                color: g.adopted ? "#fff" : "var(--ink-soft)",
              }}
            >
              {g.adopted ? <Check size={14} strokeWidth={3} /> : <CircleSlash size={13} />}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[14px] font-semibold text-ink-strong"
                style={{ textDecoration: g.adopted ? "none" : "line-through" }}
              >
                {g.title}
              </p>
              {(g.client || g.subject) && (
                <p className="truncate text-[12px] text-ink-soft">
                  {[g.client, g.subject].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {g.committed && (
              <Lock size={14} style={{ color: ACCENT_DEEP }} aria-label="Frozen" />
            )}
          </li>
        ))}
      </ul>

      {/* Add extra */}
      {!frozen && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitAdd();
              }
            }}
            placeholder="Add another goal for next week…"
            className="h-10 w-full rounded-chip border border-hairline bg-surface-soft px-3 text-[14px] text-ink-strong outline-none placeholder:text-ink-soft focus:border-hairline-strong"
          />
          <Button
            variant="outline"
            onClick={submitAdd}
            disabled={disabled || !draft.trim()}
            className="brand-btn shrink-0"
          >
            <Plus size={16} /> Add
          </Button>
        </div>
      )}

      {/* Freeze / Unfreeze */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <p className="text-[12.5px] font-medium text-ink-muted">
          {frozen
            ? "Committed and frozen. Your manager reviews it Monday."
            : `${adopted.length} goal${adopted.length === 1 ? "" : "s"} ready to commit.`}
        </p>
        {frozen ? (
          <Button variant="ghost" onClick={() => onUnfreeze(member)} disabled={disabled} className="brand-btn">
            <LockOpen size={16} /> Unfreeze
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => onFreeze(member)}
            disabled={disabled || adopted.length === 0}
            className="brand-btn wg-sheen"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Snowflake size={16} /> Freeze next week
          </Button>
        )}
      </div>
    </section>
  );
}

/* ================================================================== */
/* Small shared bits                                                   */
/* ================================================================== */

function CardHeader({
  eyebrow,
  title,
  done,
  doneLabel,
}: {
  eyebrow: string;
  title: string;
  done: boolean;
  doneLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
          {eyebrow}
        </div>
        <h2
          className="text-ink-strong"
          style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
      </div>
      {done && (
        <span
          className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: "#15803d" }}
        >
          <Check size={12} strokeWidth={3.5} /> {doneLabel}
        </span>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-hairline-strong bg-surface-soft/40 px-4 py-6 text-center text-[13.5px] font-medium text-ink-soft">
      {text}
    </div>
  );
}
