"use client";

import * as React from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDuration } from "@/lib/client-engagement/schedule";
import type { MemberCapacity } from "@/lib/client-engagement/grids";
import { ceAssignAccount } from "@/app/(app)/operations/client-engagement/actions";
import { BTN_NEUTRAL, BTN_PRIMARY, CeDialog, FormError, TONE_VAR } from "./ui";

/**
 * ASSIGN or TRANSFER one account — Manan and Ruchita only (the action checks).
 *
 * Each option carries the person's load against their cap, so the choice is
 * made looking at who has room rather than from memory.
 */
export function TransferDialog({
  accountId,
  label,
  currentMemberId,
  capacity,
  hasCalls,
  onClose,
}: {
  accountId: string;
  label: string;
  currentMemberId: string | null;
  capacity: MemberCapacity[];
  hasCalls: boolean;
  onClose: () => void;
}) {
  const [target, setTarget] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isAssign = currentMemberId === null;
  const current = capacity.find((c) => c.memberId === currentMemberId);

  async function submit(to: string | null) {
    setBusy(true);
    setError(null);
    const res = await ceAssignAccount(accountId, to);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const name = capacity.find((c) => c.memberId === to)?.name ?? "Unassigned";
    fireToast({
      message: res.clashes
        ? `Moved to ${name}. ${res.clashes} call${res.clashes === 1 ? "" : "s"} now overlap their calendar. Re-time them there.`
        : `${isAssign ? "Assigned" : "Transferred"} to ${name}`,
      type: res.clashes ? "info" : "success",
      duration: res.clashes ? 9000 : undefined,
    });
    onClose();
  }

  return (
    <CeDialog
      title={isAssign ? `Assign ${label}` : `Transfer ${label}`}
      subtitle={isAssign ? "Pick who carries it." : `Currently with ${current?.name ?? "someone no longer on the team"}. Its calls move with it.`}
      onClose={onClose}
      width={520}
      footer={
        <>
          {!isAssign && !hasCalls ? (
            <button type="button" className={`${BTN_NEUTRAL} mr-auto`} disabled={busy} onClick={() => submit(null)}>
              Return to Unassigned
            </button>
          ) : null}
          <button type="button" className={BTN_NEUTRAL} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={busy || !target} onClick={() => target && submit(target)}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} strokeWidth={2.6} />}
            {isAssign ? "Assign" : "Transfer"}
          </button>
        </>
      }
    >
      <ul className="grid gap-1.5">
        {capacity.map((c) => {
          const isCurrent = c.memberId === currentMemberId;
          const selected = target === c.memberId;
          const tone = TONE_VAR[c.tone];
          const pct = c.limit > 0 ? Math.min(100, Math.round((c.active / c.limit) * 100)) : c.active > 0 ? 100 : 0;
          return (
            <li key={c.memberId}>
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => setTarget(c.memberId)}
                aria-pressed={selected}
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55"
                style={{
                  borderColor: selected ? "color-mix(in srgb, var(--color-altus-red) 45%, transparent)" : "var(--color-hairline)",
                  background: selected ? "color-mix(in srgb, var(--color-altus-red) 6%, var(--color-surface-card))" : "var(--color-surface-card)",
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink-strong">
                    {c.name}
                    {isCurrent ? <span className="ml-1.5 text-[11px] font-semibold text-ink-subtle">(current)</span> : null}
                  </span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone.ink }} />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold tabular-nums" style={{ color: tone.ink }}>
                    {c.active}
                    <span className="font-semibold text-ink-subtle"> / {c.limit || "∞"}</span>
                  </span>
                  <span className="block text-[11px] tabular-nums text-ink-subtle">{formatDuration(c.weeklyMinutes)} / wk</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <FormError message={error} />
    </CeDialog>
  );
}
