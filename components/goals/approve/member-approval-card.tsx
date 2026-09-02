"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  CheckCircle2,
  CircleDashed,
  Lock,
  Undo2,
  Loader2,
  MessageSquareWarning,
  ExternalLink,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import {
  setMemberAccept,
  setMemberProgress,
  approveMemberWeek,
  requireGoalChange,
} from "@/app/(app)/goals/approve/actions";
import { type ApproveGoal, type ApproveMember, effective, scoreColor, allApproved } from "./types";

// Goals identity — amber-gold. Focus rings + caution actions track the room accent,
// never brand red.
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#E10600]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

type Result = { ok: boolean; error?: string };

export function MemberApprovalCard({
  member,
  index = 0,
  weekStart,
  lastWeekStart,
  weekLabel,
  lastWeekLabel,
}: {
  member: ApproveMember;
  index?: number;
  weekStart: string;
  lastWeekStart: string;
  weekLabel: string;
  lastWeekLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const lastApproved = allApproved(member.lastWeek);
  const thisApproved = allApproved(member.thisWeek);

  function run(fn: () => Promise<Result>, success?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        fireToast({ message: res.error ?? "Something went wrong", type: "error" });
        return;
      }
      if (success) fireToast({ message: success, type: "success" });
      router.refresh();
    });
  }

  return (
    <section
      className="wg-rise rounded-section border border-hairline bg-surface-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      {/* Member header ------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <EmployeeAvatar name={member.name} size="md" />
        <div className="mr-auto min-w-0">
          <h3
            className="truncate text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18 }}
          >
            {member.name}
          </h3>
          <p className="text-[12.5px] font-semibold text-ink-muted">
            {member.lastWeek.length + member.thisWeek.length} goals to review
          </p>
        </div>
        <WeekChip label="Last week" done={lastApproved} empty={member.lastWeek.length === 0} />
        <WeekChip label="This week" done={thisApproved} empty={member.thisWeek.length === 0} />
        {pending && <Loader2 size={16} className="animate-spin text-ink-muted" />}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Last week — progress review -------------------------------- */}
        <Column
          title="Last week · progress"
          subtitle={lastWeekLabel}
          empty={member.lastWeek.length === 0}
          emptyLabel="No goals last week."
          approved={lastApproved}
          canApprove={member.lastWeek.length > 0}
          pending={pending}
          onApprove={(approved) =>
            run(
              () => approveMemberWeek({ employeeId: member.id, weekStart: lastWeekStart, approved }),
              approved ? "Last week approved." : "Approval withdrawn.",
            )
          }
        >
          {member.lastWeek.map((g) => (
            <ReviewRow key={g.id} goal={g} pending={pending} run={run} />
          ))}
        </Column>

        {/* This week — committed goals -------------------------------- */}
        <Column
          title="This week · committed"
          subtitle={weekLabel}
          empty={member.thisWeek.length === 0}
          emptyLabel="Nothing committed yet."
          approved={thisApproved}
          canApprove={member.thisWeek.length > 0}
          pending={pending}
          onApprove={(approved) =>
            run(
              () => approveMemberWeek({ employeeId: member.id, weekStart, approved }),
              approved ? "This week approved." : "Approval withdrawn.",
            )
          }
        >
          {member.thisWeek.map((g) => (
            <CommitRow key={g.id} goal={g} pending={pending} run={run} />
          ))}
        </Column>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- column */

function Column({
  title,
  subtitle,
  empty,
  emptyLabel,
  approved,
  canApprove,
  pending,
  onApprove,
  children,
}: {
  title: string;
  subtitle: string;
  empty: boolean;
  emptyLabel: string;
  approved: boolean;
  canApprove: boolean;
  pending: boolean;
  onApprove: (approved: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-section border border-hairline bg-surface-soft p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-[12px] font-black uppercase tracking-[0.06em] text-ink-soft">{title}</h4>
          <p className="text-[12px] font-semibold text-ink-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          disabled={pending || !canApprove}
          onClick={() => onApprove(!approved)}
          className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold hover:brightness-110 disabled:opacity-50 ${FOCUS_RING}`}
          style={{
            background: approved
              ? "linear-gradient(135deg, var(--color-slate), var(--color-slate-deep))"
              : "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
            color: "white",
          }}
        >
          {approved ? <Undo2 size={14} /> : <ShieldCheck size={14} />}
          {approved ? "Un-approve" : "Approve all"}
        </button>
      </div>
      {empty ? (
        <div className="rounded-md border border-hairline-strong bg-surface-soft/40 px-4 py-6 text-center text-[13px] font-semibold text-ink-soft">
          {emptyLabel}
        </div>
      ) : (
        <ul className="space-y-2.5">{children}</ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- last-week */

function ReviewRow({
  goal,
  pending,
  run,
}: {
  goal: ApproveGoal;
  pending: boolean;
  run: (fn: () => Promise<Result>, success?: string) => void;
}) {
  const eff = effective(goal);
  return (
    <li className="rounded-md border border-hairline bg-surface-card p-3">
      <div className="mb-2 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[14px] font-semibold text-ink-strong">
          {goal.subject || goal.targetDone || <span className="text-ink-muted">Untitled goal</span>}
        </p>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-black tabular-nums text-white"
          style={{ background: scoreColor(eff) }}
        >
          {eff}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Self %"
          value={goal.pctDone}
          placeholder="0"
          disabled={pending}
          onCommit={(n) => run(() => setMemberProgress({ weeklyGoalId: goal.id, pctDone: n ?? 0 }), "Progress saved.")}
        />
        <NumberField
          label="Accept %"
          value={goal.acceptPct}
          placeholder={`${goal.pctDone} (self)`}
          disabled={pending}
          nullable
          onCommit={(n) => run(() => setMemberAccept({ weeklyGoalId: goal.id, acceptPct: n }), "Accept % saved.")}
        />
      </div>
      <NotesField
        value={goal.reviewNotes ?? ""}
        disabled={pending}
        onCommit={(v) => run(() => setMemberAccept({ weeklyGoalId: goal.id, reviewNotes: v || null }), "Notes saved.")}
      />
      {goal.approved && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--color-green-deep)]">
          <Lock size={11} /> Approved
        </p>
      )}
    </li>
  );
}

/* --------------------------------------------------------------- this-week */

function CommitRow({
  goal,
  pending,
  run,
}: {
  goal: ApproveGoal;
  pending: boolean;
  run: (fn: () => Promise<Result>, success?: string) => void;
}) {
  const [changing, setChanging] = React.useState(false);
  const [note, setNote] = React.useState(goal.reviewNotes ?? "");
  return (
    <li className="rounded-md border border-hairline bg-surface-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink-strong">
            {goal.subject || goal.targetDone || <span className="text-ink-muted">Untitled goal</span>}
          </p>
          {goal.targetDone && goal.subject && (
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{goal.targetDone}</p>
          )}
          {goal.linkUrl && (
            <a
              href={goal.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-deep hover:underline break-all"
            >
              evidence <ExternalLink size={11} className="shrink-0" />
            </a>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {goal.committed ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--color-green-deep)]">
              <CheckCircle2 size={12} /> committed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ink-muted">
              <CircleDashed size={12} /> draft
            </span>
          )}
          {goal.approved && (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--color-green-deep)]">
              <Lock size={11} /> approved
            </span>
          )}
        </div>
      </div>

      {changing ? (
        <div className="mt-2.5 space-y-2">
          <textarea
            value={note}
            disabled={pending}
            placeholder="What should they change?"
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={`w-full resize-none rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13px] text-ink-strong ${FOCUS_RING}`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => requireGoalChange({ weeklyGoalId: goal.id, reviewNotes: note || null }), "Sent back for changes.")
              }
              className={`wg-btn inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white hover:brightness-110 disabled:opacity-50 ${FOCUS_RING}`}
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <MessageSquareWarning size={13} /> Require change
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setChanging(false)}
              className={`bg-surface-card wg-btn rounded-full border border-hairline px-3 py-1.5 text-[12.5px] font-bold text-ink-soft hover:text-ink-strong ${FOCUS_RING}`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setChanging(true)}
          className={`bg-surface-card mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted transition-colors hover:text-[#A80400] ${FOCUS_RING} rounded`}
        >
          <MessageSquareWarning size={13} /> Require change
        </button>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ small fields */

function NumberField({
  label,
  value,
  placeholder,
  disabled,
  nullable,
  onCommit,
}: {
  label: string;
  value: number | null;
  placeholder?: string;
  disabled?: boolean;
  nullable?: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [v, setV] = React.useState(value == null ? "" : String(value));
  React.useEffect(() => setV(value == null ? "" : String(value)), [value]);

  function commit() {
    const raw = v.trim();
    if (raw === "") {
      if (nullable) {
        if (value != null) onCommit(null);
      } else if (value !== 0) {
        onCommit(0);
      }
      return;
    }
    const n = Math.max(0, Math.min(100, Math.round(Number(raw))));
    if (!Number.isFinite(n)) return;
    if (n !== value) onCommit(n);
  }

  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={100}
        value={v}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        className={`w-full rounded-md border border-hairline bg-white px-2 py-1 text-[13px] font-bold tabular-nums text-ink-strong disabled:opacity-60 ${FOCUS_RING}`}
      />
    </label>
  );
}

function NotesField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <textarea
      value={v}
      disabled={disabled}
      rows={2}
      placeholder="Review notes…"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onCommit(v);
      }}
      className={`mt-2 w-full resize-none rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13px] text-ink-strong disabled:opacity-60 ${FOCUS_RING}`}
    />
  );
}

/* ------------------------------------------------------------------- chip */

function WeekChip({ label, done, empty }: { label: string; done: boolean; empty: boolean }) {
  const tone = empty
    ? { bg: "var(--color-surface-soft)", fg: "var(--color-ink-muted)", txt: "—" }
    : done
      ? { bg: "color-mix(in srgb, var(--color-green) 16%, transparent)", fg: "var(--color-green-deep)", txt: "done" }
      : { bg: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, fg: ACCENT_DEEP, txt: "pending" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.04em]"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {label}: {tone.txt}
    </span>
  );
}
