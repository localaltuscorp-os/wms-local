"use client";

/**
 * Goals Canvas — RITUAL BANNER (Phase 6, design §2.6 + §4.1).
 *
 * The Saturday self-commit and Monday manager-approve rituals surfaced as
 * CONTEXTUAL STATES of the canvas — not separate pages. Every predicate, stamp
 * and gate is REUSED byte-for-byte; only the surface is new:
 *
 *   · Saturday "Close your week"  — fill THIS week's progress
 *     (`setCommitProgress` → stamps `pct_updated_at`, the exact "filled"
 *     signal `weekCommitSatisfied` reads) + adopt/add NEXT week's goals and
 *     FREEZE them (`freezeWeekCommit` → stamps `committed_at`; its full-scope
 *     Manan WhatsApp dispatch trigger rides along unchanged).
 *   · Monday "Approve your team's week" — the manager's downline with accept-%
 *     (`setMemberAccept`), Approve-all (`approveMemberWeek` → stamps
 *     `approved_by_manager_at`, what `managerApproveSatisfied` reads) and
 *     Require-change send-back (`requireGoalChange`).
 *
 * VISIBILITY — a state, not a nag:
 *   · auto: only when the matching GATE flag is ON (server env via
 *     `props.ritualGates`, default OFF) AND it's the ritual's day (IST) — the
 *     banner mirrors exactly what blocks the punch, nothing else;
 *   · forced: `?ritual=commit|approve` (nuqs) — the DEEP-LINK STATE the
 *     /goals/commit + /goals/approve route aliases and the punch-gate error
 *     toasts land on, open any day for prep (same semantics as the old pages).
 *
 * DATA — lazy, self-scoped, leak-proof (§3.3): `loadCommitRitual` /
 * `loadApproveRitual` take ZERO client params; the server derives self + own
 * downline from the session. A peer's downline can never appear here.
 *
 * HARD LAWS: amber identity (no brand red); zero eager queries; motion
 * reduced-motion-gated; keyboard-first (Enter commits, Esc collapses); zoom is
 * STATE — no CSS transform ancestors.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  CornerUpLeft,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Snowflake,
  Undo2,
  X,
} from "lucide-react";
import { isSaturdayIST, istDow } from "@/lib/goals/gate-day";
import { fireToast } from "@/lib/toast";
import { ACCENT, ACCENT_DEEP, SPRING, accentMix, SEM_GREEN } from "./tokens";
import {
  setCommitProgress,
  toggleNextWeekAdopt,
  addNextWeekGoal,
  freezeWeekCommit,
  unfreezeWeekCommit,
} from "@/app/(app)/goals/commit/actions";
import {
  setMemberAccept,
  approveMemberWeek,
  requireGoalChange,
} from "@/app/(app)/goals/approve/actions";
import {
  loadCommitRitual,
  loadApproveRitual,
  type ApproveRitualData,
} from "@/app/(app)/goals/cascade/ritual-actions";
import {
  memberProgressFilled,
  memberNextCommitted,
  memberDone,
  type CommitData,
  type CommitGoalRow,
  type CommitMember,
} from "@/components/goals/commit/types";
import { allApproved, type ApproveGoal, type ApproveMember } from "@/components/goals/approve/types";
import { useCanvasShell } from "./shell-context";
import type { WeeklyActionResult } from "./optimistic";
import type { WeeklyDTO } from "./types";

/* ------------------------------------------------------------------ */

/* Accent, ramp + spring come from the design contract (tokens.ts, §2.0). */
const GREEN = SEM_GREEN;
const PCT_CHIPS = [0, 25, 50, 75, 100] as const;

const ritualParser = parseAsStringLiteral(["commit", "approve"] as const);

/* ------------------------------------------------------------------ */
/* Shared atoms                                                        */
/* ------------------------------------------------------------------ */

function StatusChip(props: {
  done: boolean;
  doneLabel: string;
  pendingLabel: string;
}): React.JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={
        props.done
          ? { color: GREEN, background: "color-mix(in srgb, #15803d 12%, transparent)" }
          : { color: ACCENT_DEEP, background: accentMix(12) }
      }
    >
      {props.done && <Check size={11} strokeWidth={3} />}
      {props.done ? props.doneLabel : props.pendingLabel}
    </span>
  );
}

/** The collapsed one-line banner shell shared by both rituals. */
function BannerShell(props: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  summary: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: (() => void) | null;
  children: React.ReactNode;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  return (
    <section
      className="overflow-hidden rounded-section border"
      style={{
        borderColor: accentMix(35),
        background: `linear-gradient(135deg, ${accentMix(7)}, var(--color-surface-card) 55%)`,
        boxShadow: "0 16px 40px -30px rgba(120,53,15,0.35)",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && props.expanded) {
          e.stopPropagation();
          props.onToggle();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          {props.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[15px] font-bold text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.01em" }}
          >
            {props.title}
          </p>
          <p className="truncate text-[12.5px] font-semibold text-ink-subtle">{props.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {props.summary}
          <button
            type="button"
            onClick={props.onToggle}
            aria-expanded={props.expanded}
            className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            {props.expanded ? "Hide" : "Open"}
            <motion.span animate={{ rotate: props.expanded ? 180 : 0 }} transition={reduced ? { duration: 0 } : SPRING}>
              <ChevronDown size={13} strokeWidth={3} />
            </motion.span>
          </button>
          {props.onDismiss && (
            <button
              type="button"
              onClick={props.onDismiss}
              aria-label="Dismiss for now"
              className="grid size-7 place-items-center rounded-full text-ink-faint transition-colors hover:text-ink-strong"
              style={{ background: "transparent" }}
            >
              <X size={14} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {props.expanded && (
          <motion.div
            key="body"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : SPRING}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: accentMix(25) }}>
              {props.children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function LoadingRow(props: { label: string }): React.JSX.Element {
  return (
    <p className="inline-flex items-center gap-2 py-2 text-[13px] font-bold text-ink-subtle">
      <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} />
      {props.label}
    </p>
  );
}

function ErrorRow(props: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <p className="flex items-center gap-3 py-2 text-[13px] font-bold text-ink-subtle">
      {props.message}
      <button
        type="button"
        onClick={props.onRetry}
        className="rounded-chip px-2 py-1 text-[12px] font-bold"
        style={{ color: ACCENT_DEEP, background: accentMix(10) }}
      >
        Retry
      </button>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* % editor — chips + exact input (keyboard-first)                     */
/* ------------------------------------------------------------------ */

function PctEditor(props: {
  value: number;
  disabled: boolean;
  onCommit: (pct: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = React.useState<string>(String(props.value));
  React.useEffect(() => setDraft(String(props.value)), [props.value]);
  const commitDraft = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n)) return setDraft(String(props.value));
    const clamped = Math.max(0, Math.min(100, n));
    if (clamped !== props.value) props.onCommit(clamped);
    setDraft(String(clamped));
  };
  return (
    <span className="inline-flex items-center gap-1">
      {PCT_CHIPS.map((p) => (
        <button
          key={p}
          type="button"
          disabled={props.disabled}
          onClick={() => props.onCommit(p)}
          className="rounded-chip px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition-colors disabled:opacity-50"
          style={
            props.value === p
              ? { color: "#fff", background: ACCENT }
              : { color: ACCENT_DEEP, background: accentMix(8) }
          }
        >
          {p}
        </button>
      ))}
      <input
        type="number"
        min={0}
        max={100}
        inputMode="numeric"
        value={draft}
        disabled={props.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft();
          }
        }}
        aria-label="Exact percent done"
        className="w-[3.6rem] rounded-chip border px-1.5 py-0.5 text-center text-[12px] font-bold tabular-nums text-ink-strong outline-none focus:ring-2 disabled:opacity-50"
        style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
      />
    </span>
  );
}

/* ================================================================== */
/* SATURDAY COMMIT — "Close your week"                                  */
/* ================================================================== */

function patchCommitRow(
  data: CommitData,
  employeeId: string,
  bucket: "thisWeek" | "nextWeek",
  rowId: string,
  fields: Partial<CommitGoalRow>,
): CommitData {
  return {
    ...data,
    members: data.members.map((m) =>
      m.employeeId === employeeId
        ? { ...m, [bucket]: m[bucket].map((r) => (r.id === rowId ? { ...r, ...fields } : r)) }
        : m,
    ),
  };
}

function CommitRitual(props: { forced: boolean; onClose: () => void }): React.JSX.Element | null {
  const shell = useCanvasShell();
  const [expanded, setExpanded] = React.useState(props.forced);
  const [dismissed, setDismissed] = React.useState(false);
  const [state, setState] = React.useState<
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; data: CommitData }
  >({ phase: "loading" });

  const load = React.useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await loadCommitRitual();
      if (!res.ok) setState({ phase: "error", message: res.error });
      else setState({ phase: "ready", data: res.data });
    } catch {
      setState({ phase: "error", message: "Couldn't load the commit state — try again." });
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  // A deep-link arriving after mount (?ritual=commit) opens the state inline.
  React.useEffect(() => {
    if (props.forced) setExpanded(true);
  }, [props.forced]);

  /** Mirror a weekly write into the canvas's optimistic weekly overlay when
   *  the same row is on the canvas (viewed person's FY payload). The action
   *  already ran — this feeds its settled result through the overlay, so no
   *  second server call. */
  const syncCanvas = React.useCallback(
    (id: string, fields: Partial<WeeklyDTO>, res: WeeklyActionResult) => {
      if (!shell.weeklyMutation) return;
      const rows = shell.weeklyLive ?? shell.weekly;
      if (!rows.some((w) => w.id === id)) return;
      void shell.weeklyMutation.mutate({ type: "update", id, fields }, async () => res);
    },
    [shell.weeklyMutation, shell.weeklyLive, shell.weekly],
  );

  if (dismissed) return null;
  const data = state.phase === "ready" ? state.data : null;

  const doneCount = data ? data.members.filter(memberDone).length : 0;
  const summary =
    data &&
    (data.members.length > 1 ? (
      <StatusChip
        done={doneCount === data.members.length}
        doneLabel="Everyone committed"
        pendingLabel={`${doneCount}/${data.members.length} people done`}
      />
    ) : data.members[0] ? (
      <StatusChip
        done={memberDone(data.members[0])}
        doneLabel="Week closed"
        pendingLabel={memberProgressFilled(data.members[0]) ? "Freeze next week" : "Fill progress"}
      />
    ) : null);

  return (
    <BannerShell
      icon={<CalendarCheck size={17} strokeWidth={2.4} />}
      title="Close your week"
      subtitle={
        data
          ? `Saturday commit · fill ${data.thisWeekLabel}, freeze ${data.nextWeekLabel}`
          : "Saturday commit · fill this week's progress, then freeze next week"
      }
      summary={summary ?? null}
      expanded={expanded}
      onToggle={() => {
        if (expanded && props.forced) props.onClose();
        setExpanded((v) => !v);
      }}
      onDismiss={
        props.forced
          ? props.onClose
          : () => {
              setDismissed(true);
            }
      }
    >
      {state.phase === "loading" && <LoadingRow label="Loading your week…" />}
      {state.phase === "error" && <ErrorRow message={state.message} onRetry={() => void load()} />}
      {data && (
        <div className="flex flex-col gap-3">
          {data.members.map((m) => (
            <CommitMemberSection
              key={m.employeeId}
              member={m}
              weekStart={data.weekStart}
              nextWeekLabel={data.nextWeekLabel}
              thisWeekLabel={data.thisWeekLabel}
              onRow={(bucket, rowId, fields) =>
                setState((s) =>
                  s.phase === "ready"
                    ? { phase: "ready", data: patchCommitRow(s.data, m.employeeId, bucket, rowId, fields) }
                    : s,
                )
              }
              refetch={() => void load()}
              syncCanvas={syncCanvas}
            />
          ))}
        </div>
      )}
    </BannerShell>
  );
}

function CommitMemberSection(props: {
  member: CommitMember;
  weekStart: string;
  thisWeekLabel: string;
  nextWeekLabel: string;
  onRow: (bucket: "thisWeek" | "nextWeek", rowId: string, fields: Partial<CommitGoalRow>) => void;
  refetch: () => void;
  syncCanvas: (id: string, fields: Partial<WeeklyDTO>, res: WeeklyActionResult) => void;
}): React.JSX.Element {
  const { member: m } = props;
  const [busy, setBusy] = React.useState(false);
  const [extra, setExtra] = React.useState("");
  const filled = memberProgressFilled(m);
  const frozen = memberNextCommitted(m);
  const adoptedNext = m.nextWeek.filter((r) => r.adopted);

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const fillProgress = (row: CommitGoalRow, pct: number) =>
    run(async () => {
      const prev = { pctDone: row.pctDone, filled: row.filled };
      props.onRow("thisWeek", row.id, { pctDone: pct, filled: true });
      const res = await setCommitProgress({ id: row.id, pctDone: pct });
      if (!res.ok) {
        props.onRow("thisWeek", row.id, prev);
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      props.syncCanvas(row.id, { pctDone: pct }, res);
      return true;
    });

  const toggleAdopt = (row: CommitGoalRow) =>
    run(async () => {
      const next = !row.adopted;
      props.onRow("nextWeek", row.id, { adopted: next });
      const res = await toggleNextWeekAdopt({ id: row.id, adopted: next });
      if (!res.ok) {
        props.onRow("nextWeek", row.id, { adopted: row.adopted });
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      props.syncCanvas(row.id, { adopted: next }, res);
      return true;
    });

  const addExtra = () =>
    run(async () => {
      const title = extra.trim();
      if (!title) return false;
      const res = await addNextWeekGoal({ employeeId: m.employeeId, title });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      setExtra("");
      props.refetch(); // weights rebalanced across the whole week — re-read truth
      return true;
    });

  const freeze = () =>
    run(async () => {
      const res = await freezeWeekCommit({ employeeId: m.employeeId, weekStart: props.weekStart });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      fireToast({ message: `Next week frozen for ${m.isSelf ? "you" : m.name}.` });
      props.refetch();
      return true;
    });

  const unfreeze = () =>
    run(async () => {
      const res = await unfreezeWeekCommit({ employeeId: m.employeeId, weekStart: props.weekStart });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      props.refetch();
      return true;
    });

  return (
    <article
      className="rounded-[14px] border"
      style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3.5 py-2.5" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[13.5px] font-bold text-ink-strong">
          {m.name}
          {m.isSelf && (
            <span className="ml-1.5 rounded-chip px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: ACCENT_DEEP, background: accentMix(10) }}>
              you
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <StatusChip
            done={filled}
            doneLabel="Progress filled"
            pendingLabel={`${m.thisWeek.filter((r) => r.adopted && r.filled).length}/${m.thisWeek.filter((r) => r.adopted).length} filled`}
          />
          <StatusChip
            done={frozen}
            doneLabel="Next week frozen"
            pendingLabel={adoptedNext.length === 0 ? "No goals yet" : "Not frozen"}
          />
        </span>
      </header>

      <div className="grid gap-0 md:grid-cols-2">
        {/* — (1) THIS week: fill progress — the pct_updated_at stamp — */}
        <section className="px-3.5 py-3 md:border-r" style={{ borderColor: "var(--color-hairline)" }}>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            This week · {props.thisWeekLabel}
          </h4>
          <ul className="mt-2 flex flex-col gap-2">
            {m.thisWeek.filter((r) => r.adopted).length === 0 && (
              <li className="text-[12.5px] font-semibold text-ink-subtle">
                No adopted goals this week — nothing to fill.
              </li>
            )}
            {m.thisWeek
              .filter((r) => r.adopted)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span
                    aria-label={r.filled ? "Progress filled" : "Progress not filled yet"}
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: r.filled ? GREEN : accentMix(45) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-strong" title={r.title}>
                    {r.title}
                  </span>
                  <PctEditor value={r.pctDone} disabled={busy} onCommit={(p) => void fillProgress(r, p)} />
                </li>
              ))}
          </ul>
        </section>

        {/* — (2) NEXT week: adopt / add extra / freeze — the committed_at stamp — */}
        <section className="border-t px-3.5 py-3 md:border-t-0" style={{ borderColor: "var(--color-hairline)" }}>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
            Next week · {props.nextWeekLabel}
          </h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {m.nextWeek.length === 0 && (
              <li className="text-[12.5px] font-semibold text-ink-subtle">
                Nothing planned yet — add at least one goal, then freeze.
              </li>
            )}
            {m.nextWeek.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={r.adopted}
                  disabled={busy || r.committed}
                  onChange={() => void toggleAdopt(r)}
                  aria-label={`Adopt “${r.title}” for next week`}
                  className="size-4 accent-[var(--module-accent,#E10600)]"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-[13px] font-bold ${r.adopted ? "text-ink-strong" : "text-ink-faint line-through"}`}
                  title={r.title}
                >
                  {r.title}
                </span>
                {r.committed && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: GREEN }}>
                    <Lock size={11} strokeWidth={2.8} /> frozen
                  </span>
                )}
              </li>
            ))}
          </ul>

          <form
            className="mt-2.5 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void addExtra();
            }}
          >
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              disabled={busy}
              placeholder="Add an extra goal for next week…"
              aria-label="Add an extra goal for next week"
              className="min-w-0 flex-1 rounded-chip border px-2.5 py-1.5 text-[13px] font-semibold text-ink-strong outline-none focus:ring-2"
              style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
            />
            <button
              type="submit"
              disabled={busy || extra.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-chip px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50"
              style={{ color: ACCENT_DEEP, background: accentMix(10) }}
            >
              <Plus size={12} strokeWidth={3} /> Add
            </button>
          </form>

          <div className="mt-3 flex items-center gap-2">
            {frozen ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: GREEN }}>
                  <Snowflake size={13} strokeWidth={2.6} /> Frozen — committed_at stamped
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void unfreeze()}
                  className="ml-auto inline-flex items-center gap-1 rounded-chip px-2 py-1 text-[11.5px] font-bold text-ink-subtle transition-colors hover:text-ink-strong disabled:opacity-50"
                >
                  <Undo2 size={11} strokeWidth={2.8} /> Unfreeze
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || adoptedNext.length === 0}
                onClick={() => void freeze()}
                title={adoptedNext.length === 0 ? "Add at least one adopted goal first" : "Stamp committed_at on every adopted next-week goal"}
                className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Snowflake size={13} strokeWidth={2.6} />}
                Freeze Next Week
              </button>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

/* ================================================================== */
/* MONDAY APPROVE — "Approve your team's week"                          */
/* ================================================================== */

function patchApproveGoal(
  data: ApproveRitualData,
  memberId: string,
  bucket: "lastWeek" | "thisWeek",
  rowId: string,
  fields: Partial<ApproveGoal>,
): ApproveRitualData {
  return {
    ...data,
    members: data.members.map((m) =>
      m.id === memberId
        ? { ...m, [bucket]: m[bucket].map((r) => (r.id === rowId ? { ...r, ...fields } : r)) }
        : m,
    ),
  };
}

function patchApproveWeek(
  data: ApproveRitualData,
  memberId: string,
  bucket: "lastWeek" | "thisWeek",
  approved: boolean,
): ApproveRitualData {
  return {
    ...data,
    members: data.members.map((m) =>
      m.id === memberId ? { ...m, [bucket]: m[bucket].map((r) => ({ ...r, approved })) } : m,
    ),
  };
}

function ApproveRitual(props: { forced: boolean; onClose: () => void }): React.JSX.Element | null {
  const [expanded, setExpanded] = React.useState(props.forced);
  const [dismissed, setDismissed] = React.useState(false);
  const [state, setState] = React.useState<
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; data: ApproveRitualData }
  >({ phase: "loading" });

  const load = React.useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await loadApproveRitual();
      if (!res.ok) setState({ phase: "error", message: res.error });
      else setState({ phase: "ready", data: res.data });
    } catch {
      setState({ phase: "error", message: "Couldn't load the approval state — try again." });
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    if (props.forced) setExpanded(true);
  }, [props.forced]);

  if (dismissed) return null;
  const data = state.phase === "ready" ? state.data : null;

  // Auto-mode with no downline: this person isn't a manager — the gate can't
  // block them (managerApproveSatisfied is vacuously true). Show nothing.
  if (!props.forced && data && data.members.length === 0) return null;

  const memberOk = (m: ApproveMember) =>
    (m.lastWeek.length === 0 || allApproved(m.lastWeek)) &&
    (m.thisWeek.length === 0 || allApproved(m.thisWeek));
  const okCount = data ? data.members.filter(memberOk).length : 0;

  return (
    <BannerShell
      icon={<ShieldCheck size={17} strokeWidth={2.4} />}
      title="Approve your team's week"
      subtitle={
        data
          ? `Monday approval · sign off ${data.lastWeekLabel} progress + ${data.weekLabel} commitments`
          : "Monday approval · last week's progress + this week's committed goals"
      }
      summary={
        data && data.members.length > 0 ? (
          <StatusChip
            done={okCount === data.members.length}
            doneLabel="Team approved"
            pendingLabel={`${okCount}/${data.members.length} approved`}
          />
        ) : null
      }
      expanded={expanded}
      onToggle={() => {
        if (expanded && props.forced) props.onClose();
        setExpanded((v) => !v);
      }}
      onDismiss={props.forced ? props.onClose : () => setDismissed(true)}
    >
      {state.phase === "loading" && <LoadingRow label="Loading your team…" />}
      {state.phase === "error" && <ErrorRow message={state.message} onRetry={() => void load()} />}
      {data && data.members.length === 0 && (
        <p className="py-1 text-[13px] font-semibold text-ink-subtle">
          You don&apos;t have any reports — there&apos;s nothing to approve.
        </p>
      )}
      {data && data.members.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.members.map((m) => (
            <ApproveMemberSection
              key={m.id}
              member={m}
              lastWeekStart={data.lastWeekStart}
              weekStart={data.weekStart}
              lastWeekLabel={data.lastWeekLabel}
              weekLabel={data.weekLabel}
              onGoal={(bucket, rowId, fields) =>
                setState((s) =>
                  s.phase === "ready"
                    ? { phase: "ready", data: patchApproveGoal(s.data, m.id, bucket, rowId, fields) }
                    : s,
                )
              }
              onWeek={(bucket, approved) =>
                setState((s) =>
                  s.phase === "ready"
                    ? { phase: "ready", data: patchApproveWeek(s.data, m.id, bucket, approved) }
                    : s,
                )
              }
            />
          ))}
        </div>
      )}
    </BannerShell>
  );
}

function ApproveMemberSection(props: {
  member: ApproveMember;
  lastWeekStart: string;
  weekStart: string;
  lastWeekLabel: string;
  weekLabel: string;
  onGoal: (bucket: "lastWeek" | "thisWeek", rowId: string, fields: Partial<ApproveGoal>) => void;
  onWeek: (bucket: "lastWeek" | "thisWeek", approved: boolean) => void;
}): React.JSX.Element {
  const { member: m } = props;
  const [busy, setBusy] = React.useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const accept = (bucket: "lastWeek" | "thisWeek", row: ApproveGoal, pct: number) =>
    run(async () => {
      const prev = row.acceptPct;
      props.onGoal(bucket, row.id, { acceptPct: pct });
      const res = await setMemberAccept({ weeklyGoalId: row.id, acceptPct: pct });
      if (!res.ok) {
        props.onGoal(bucket, row.id, { acceptPct: prev });
        fireToast({ message: res.error, type: "error" });
      }
    });

  const approveAll = (bucket: "lastWeek" | "thisWeek", approved: boolean) =>
    run(async () => {
      const weekStart = bucket === "lastWeek" ? props.lastWeekStart : props.weekStart;
      props.onWeek(bucket, approved);
      const res = await approveMemberWeek({ employeeId: m.id, weekStart, approved });
      if (!res.ok) {
        props.onWeek(bucket, !approved);
        fireToast({ message: res.error, type: "error" });
        return;
      }
      if (approved) fireToast({ message: `${m.name}'s ${bucket === "lastWeek" ? "last week" : "week"} approved.` });
    });

  const sendBack = (row: ApproveGoal, note: string) =>
    run(async () => {
      const res = await requireGoalChange({ weeklyGoalId: row.id, reviewNotes: note || null });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      props.onGoal("thisWeek", row.id, { committed: false, approved: false, reviewNotes: note || null });
      fireToast({ message: `Sent back to ${m.name} — they must re-commit before approval.` });
    });

  return (
    <article
      className="rounded-[14px] border"
      style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
    >
      <header className="flex items-center gap-2 border-b px-3.5 py-2.5" style={{ borderColor: "var(--color-hairline)" }}>
        <span className="text-[13.5px] font-bold text-ink-strong">{m.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <StatusChip done={m.lastWeek.length === 0 || allApproved(m.lastWeek)} doneLabel="Last wk ✓" pendingLabel="Last wk" />
          <StatusChip done={m.thisWeek.length === 0 || allApproved(m.thisWeek)} doneLabel="This wk ✓" pendingLabel="This wk" />
        </span>
      </header>
      <div className="grid gap-0 md:grid-cols-2">
        <ApproveWeekGroup
          title={`Last week · ${props.lastWeekLabel}`}
          bucket="lastWeek"
          rows={m.lastWeek}
          busy={busy}
          onAccept={accept}
          onApproveAll={approveAll}
          className="md:border-r"
        />
        <ApproveWeekGroup
          title={`This week · ${props.weekLabel}`}
          bucket="thisWeek"
          rows={m.thisWeek}
          busy={busy}
          onAccept={accept}
          onApproveAll={approveAll}
          onSendBack={sendBack}
          className="border-t md:border-t-0"
        />
      </div>
    </article>
  );
}

function ApproveWeekGroup(props: {
  title: string;
  bucket: "lastWeek" | "thisWeek";
  rows: ApproveGoal[];
  busy: boolean;
  onAccept: (bucket: "lastWeek" | "thisWeek", row: ApproveGoal, pct: number) => void;
  onApproveAll: (bucket: "lastWeek" | "thisWeek", approved: boolean) => void;
  onSendBack?: (row: ApproveGoal, note: string) => void;
  className?: string;
}): React.JSX.Element {
  const approvedAll = allApproved(props.rows);
  return (
    <section className={`px-3.5 py-3 ${props.className ?? ""}`} style={{ borderColor: "var(--color-hairline)" }}>
      <div className="flex items-center gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">{props.title}</h4>
        {props.rows.length > 0 && (
          <span className="ml-auto">
            {approvedAll ? (
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onApproveAll(props.bucket, false)}
                className="inline-flex items-center gap-1 rounded-chip px-2 py-1 text-[11.5px] font-bold transition-colors disabled:opacity-50"
                style={{ color: GREEN, background: "color-mix(in srgb, #15803d 10%, transparent)" }}
                title="Approved — click to undo"
              >
                <Check size={11} strokeWidth={3} /> Approved · undo
              </button>
            ) : (
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onApproveAll(props.bucket, true)}
                className="wg-btn inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                <ShieldCheck size={11} strokeWidth={2.8} /> Approve all
              </button>
            )}
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {props.rows.length === 0 && (
          <li className="text-[12.5px] font-semibold text-ink-subtle">No adopted goals — nothing blocks here.</li>
        )}
        {props.rows.map((r) => (
          <ApproveGoalRow
            key={r.id}
            row={r}
            busy={props.busy}
            onAccept={(pct) => props.onAccept(props.bucket, r, pct)}
            onSendBack={props.onSendBack ? (note) => props.onSendBack?.(r, note) : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

function ApproveGoalRow(props: {
  row: ApproveGoal;
  busy: boolean;
  onAccept: (pct: number) => void;
  onSendBack?: (note: string) => void;
}): React.JSX.Element {
  const { row: r } = props;
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const title = r.targetDone?.trim() || r.subject?.trim() || "Weekly goal";
  const [draft, setDraft] = React.useState<string>(r.acceptPct == null ? "" : String(r.acceptPct));
  React.useEffect(() => setDraft(r.acceptPct == null ? "" : String(r.acceptPct)), [r.acceptPct]);

  const commitAccept = () => {
    if (draft.trim() === "") return;
    const n = Math.max(0, Math.min(100, Math.round(Number(draft))));
    if (!Number.isFinite(n)) return setDraft(r.acceptPct == null ? "" : String(r.acceptPct));
    if (n !== r.acceptPct) props.onAccept(n);
  };

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-label={r.approved ? "Approved" : "Awaiting approval"}
          className="size-2 shrink-0 rounded-full"
          style={{ background: r.approved ? GREEN : accentMix(45) }}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink-strong" title={title}>
          {title}
        </span>
        {!r.committed && (
          <span className="rounded-chip px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#b91c1c", background: "color-mix(in srgb, #b91c1c 10%, transparent)" }}>
            not committed
          </span>
        )}
        <span className="text-[12px] font-bold tabular-nums text-ink-subtle" title="Doer self-rating">
          self {r.pctDone}%
        </span>
        <label className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ink-subtle">
          accept
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={draft}
            disabled={props.busy}
            placeholder="—"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitAccept}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAccept();
              }
            }}
            aria-label={`Accepted percent for “${title}”`}
            className="w-[3.4rem] rounded-chip border px-1.5 py-0.5 text-center text-[12px] font-bold tabular-nums text-ink-strong outline-none focus:ring-2 disabled:opacity-50"
            style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
          />
        </label>
        {props.onSendBack && (
          <button
            type="button"
            disabled={props.busy}
            onClick={() => setNoteOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-chip px-2 py-1 text-[11.5px] font-bold text-ink-subtle transition-colors hover:text-ink-strong disabled:opacity-50"
            title="Require a change — un-freezes the goal so they re-commit"
          >
            <CornerUpLeft size={11} strokeWidth={2.8} /> Send back
          </button>
        )}
      </div>
      {noteOpen && props.onSendBack && (
        <form
          className="ml-4 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSendBack?.(note.trim());
            setNoteOpen(false);
            setNote("");
          }}
        >
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setNoteOpen(false);
              }
            }}
            placeholder="What should change? (optional note)"
            aria-label="Change-request note"
            className="min-w-0 flex-1 rounded-chip border px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong outline-none focus:ring-2"
            style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
          />
          <button
            type="submit"
            disabled={props.busy}
            className="rounded-chip px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50"
            style={{ color: ACCENT_DEEP, background: accentMix(10) }}
          >
            Send
          </button>
        </form>
      )}
    </li>
  );
}

/* ================================================================== */
/* RitualBanner — the mount point                                       */
/* ================================================================== */

export function RitualBanner(): React.JSX.Element | null {
  const shell = useCanvasShell();
  const gates = shell.ritualGates;
  const [ritual, setRitual] = useQueryState("ritual", ritualParser);
  // Stamped once — the banner's day never flips mid-session.
  const [now] = React.useState(() => new Date());
  const saturday = isSaturdayIST(now);
  const monday = istDow(now) === 1;

  // Auto = the gate that will actually block the punch today (flag AND day).
  // Forced = the ?ritual= deep-link (any day — prep/testing, same semantics as
  // the old /goals/commit + /goals/approve pages).
  const commitVisible = ritual === "commit" || (Boolean(gates?.satCommit) && saturday);
  const approveVisible = ritual === "approve" || (Boolean(gates?.monApprove) && monday);

  if (!commitVisible && !approveVisible) return null;

  const clear = () => void setRitual(null);

  return (
    <div className="flex flex-col gap-3">
      {commitVisible && <CommitRitual forced={ritual === "commit"} onClose={clear} />}
      {approveVisible && <ApproveRitual forced={ritual === "approve"} onClose={clear} />}
    </div>
  );
}
