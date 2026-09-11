"use client";

/**
 * CommitDialog — the Saturday "freeze next week" ritual as a POPUP, opened from
 * the Weekly Goals board. It shows ONLY Step 2 (adopt / add / freeze next week);
 * this-week progress is now updated directly on the weekly table, so it's dropped
 * here. Self-only (the board owner). Reuses the commit server actions.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { X, Check, Plus, Lock, LockOpen, CircleSlash, Snowflake, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  toggleNextWeekAdopt,
  addNextWeekGoal,
  freezeWeekCommit,
  unfreezeWeekCommit,
} from "@/app/(app)/goals/commit/actions";
import { fireToast } from "@/lib/toast";
import type { CommitMember } from "./types";
import { memberNextCommitted } from "./types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

export function CommitDialog({
  open,
  onClose,
  member: initial,
  nextWeekLabel,
  weekStart,
}: {
  open: boolean;
  onClose: () => void;
  member: CommitMember;
  nextWeekLabel: string;
  weekStart: string;
}) {
  const router = useRouter();
  const [member, setMember] = React.useState(initial);
  const [draft, setDraft] = React.useState("");
  const [pending, start] = React.useTransition();

  React.useEffect(() => setMember(initial), [initial]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const adopted = member.nextWeek.filter((g) => g.adopted);
  const committed = memberNextCommitted(member);
  const frozen = adopted.length > 0 && adopted.every((g) => g.committed);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) fireToast({ message: res.error ?? "Something went wrong", type: "error" });
      else {
        if (ok) fireToast({ message: ok, type: "success" });
        router.refresh();
      }
    });

  const patch = (id: string, p: Partial<(typeof member.nextWeek)[number]>) =>
    setMember((m) => ({ ...m, nextWeek: m.nextWeek.map((g) => (g.id === id ? { ...g, ...p } : g)) }));

  const toggle = (id: string, adopt: boolean) => {
    patch(id, { adopted: adopt });
    run(() => toggleNextWeekAdopt({ id, adopted: adopt }));
  };
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    run(() => addNextWeekGoal({ employeeId: member.employeeId, title: t }), "Goal added for next week");
  };
  const freeze = () => {
    setMember((m) => ({ ...m, nextWeek: m.nextWeek.map((g) => (g.adopted ? { ...g, committed: true } : g)) }));
    run(() => freezeWeekCommit({ employeeId: member.employeeId, weekStart }), "Next week frozen");
  };
  const unfreeze = () => {
    setMember((m) => ({ ...m, nextWeek: m.nextWeek.map((g) => ({ ...g, committed: false })) }));
    run(() => unfreezeWeekCommit({ employeeId: member.employeeId, weekStart }));
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Freeze next week"
        className="wg-rise flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[22px]"
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-hairline-strong)",
          boxShadow: "0 30px 70px -18px rgba(15,23,42,0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 px-6 py-5"
          style={{
            borderBottom: "1px solid var(--color-hairline)",
            background: `linear-gradient(152deg, color-mix(in srgb, ${ACCENT} 8%, var(--color-surface-card)), var(--color-surface-card) 60%)`,
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              <Snowflake size={20} strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: ACCENT_DEEP }}>
                Freeze next week
              </p>
              <h2 className="text-ink-strong" style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 20, letterSpacing: "-0.01em" }}>
                {nextWeekLabel}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-3 text-[13px] font-medium text-ink-muted">
            Adopt the goals you&apos;re committing to next week (add any extras), then freeze.
          </p>

          <ul className="flex flex-col gap-2">
            {member.nextWeek.length === 0 && (
              <li className="rounded-xl border border-hairline-strong bg-surface-soft/40 px-4 py-6 text-center text-[13px] font-medium text-ink-soft">
                No goals cascaded yet - add what you&apos;ll commit to below.
              </li>
            )}
            {member.nextWeek.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-soft/60 p-3"
                style={{ opacity: g.adopted ? 1 : 0.55 }}
              >
                <button
                  type="button"
                  disabled={pending || frozen}
                  onClick={() => toggle(g.id, !g.adopted)}
                  aria-label={g.adopted ? "Drop this goal" : "Adopt this goal"}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-60"
                  style={{
                    borderColor: g.adopted ? ACCENT : "var(--color-hairline-strong)",
                    background: g.adopted ? ACCENT : "transparent",
                    color: g.adopted ? "#fff" : "var(--color-ink-soft)",
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
                    <p className="truncate text-[12px] text-ink-soft">{[g.client, g.subject].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                {g.committed && <Lock size={14} style={{ color: ACCENT_DEEP }} aria-label="Frozen" />}
              </li>
            ))}
          </ul>

          {!frozen && (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={draft}
                disabled={pending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="Add another goal for next week…"
                className="h-10 w-full rounded-xl border border-hairline bg-surface-soft px-3 text-[14px] text-ink-strong outline-none placeholder:text-ink-soft focus:border-altus-red"
              />
              <button
                type="button"
                onClick={add}
                disabled={pending || !draft.trim()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13.5px] font-bold text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
              >
                <Plus size={16} /> Add
              </button>
            </div>
          )}
        </div>

        {/* Footer — freeze / unfreeze */}
        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-hairline)" }}>
          <p className="text-[12.5px] font-medium text-ink-muted">
            {committed
              ? "Committed & frozen. Your manager reviews it Monday."
              : `${adopted.length} goal${adopted.length === 1 ? "" : "s"} ready to commit.`}
          </p>
          {frozen ? (
            <button
              type="button"
              onClick={unfreeze}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-pill border px-4 py-2 text-[13.5px] font-bold text-altus-red disabled:opacity-60"
              style={{ borderColor: ACCENT }}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <LockOpen size={15} />} Unfreeze
            </button>
          ) : (
            <button
              type="button"
              onClick={freeze}
              disabled={pending || adopted.length === 0}
              className="wg-sheen inline-flex items-center gap-1.5 rounded-pill px-5 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Snowflake size={15} />} Freeze next week
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
