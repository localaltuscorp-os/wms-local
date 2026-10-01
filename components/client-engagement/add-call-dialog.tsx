"use client";

import * as React from "react";
import { CalendarPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  accountLabel,
  categoryOf,
  CE_CALL_TYPES,
  CE_DAY_START_MIN,
  CE_DAYS,
} from "@/lib/client-engagement/constants";
import { CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import { toHm, validateEngagement } from "@/lib/client-engagement/schedule";
import { isInactiveAccount } from "@/lib/client-engagement/status";
import type { CeAccountRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { ceSaveEngagement } from "@/app/(app)/operations/client-engagement/actions";
import { BTN_NEUTRAL, BTN_PRIMARY, CeDialog, FIELD, FormError, LABEL, Select, TimeField } from "./ui";

interface CallRow {
  key: number;
  callType: string;
  day: string;
  startMin: number;
  duration: number;
}

function newRow(key: number): CallRow {
  return { key, callType: "hh", day: "mon", startMin: CE_DAY_START_MIN, duration: 30 };
}

/**
 * ADD CALL — one employee, one participant, and every one of their weekly
 * calls in a single pass (asked 2026-09-26: "just like Add Participant in
 * full module" — Weekly Call 1, Weekly Call 2, Add More Calls, like the
 * Hand-holding module's entry form). Replaces the toolbar's old "Schedule
 * call", which only ever set up one call at a time.
 *
 * Reuses `ceAddAccount` (once, for a brand-new person) and `ceSaveEngagement`
 * (once per weekly call row) rather than a new bulk server action — every
 * validation, clash check and audit-log line those already do stays exactly
 * as it is; this dialog is just a faster way to call them several times.
 */
export function AddCallDialog({
  members,
  accounts,
  lockedMemberId,
  weekStart,
  onClose,
}: {
  members: CeMemberRow[];
  accounts: CeAccountRow[];
  lockedMemberId: string | null;
  weekStart: string;
  onClose: () => void;
}) {
  const [memberId, setMemberId] = React.useState(lockedMemberId ?? members[0]?.id ?? "");
  const [accountId, setAccountId] = React.useState("");
  const [rows, setRows] = React.useState<CallRow[]>([newRow(0)]);
  const nextKey = React.useRef(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rowErrors, setRowErrors] = React.useState<Record<number, string>>({});

  const selected = accounts.find((a) => a.id === accountId);
  // Every account this employee already carries, any product type — picking
  // ONE is what tells the dialog which product type this call is under. Only
  // an existing PCA can be picked here (asked 2026-09-29): this dialog
  // schedules a call, it does not also create a new participant/client/
  // ambassador — that stays Overview's "+ Add People".
  const candidates = accounts.filter((a) => a.assignedTo === memberId).sort((a, b) => a.fullName.localeCompare(b.fullName));

  function updateRow(key: number, patch: Partial<CallRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow(nextKey.current++)]);
  }
  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  function rowInvalid(r: CallRow): string | null {
    return validateEngagement({
      callType: r.callType,
      dayOfWeek: r.day,
      startTime: toHm(r.startMin),
      endTime: toHm(r.startMin + r.duration),
      startDate: weekStart,
      endDate: null,
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setRowErrors({});

    if (!accountId) {
      setBusy(false);
      setError("Pick who the calls are with.");
      return;
    }

    let ok = 0;
    const failed: Record<number, string> = {};
    for (const r of rows) {
      const invalid = rowInvalid(r);
      if (invalid) {
        failed[r.key] = invalid;
        continue;
      }
      const res = await ceSaveEngagement({
        accountId,
        teamMemberId: memberId,
        callType: r.callType,
        dayOfWeek: r.day,
        startTime: toHm(r.startMin),
        endTime: toHm(r.startMin + r.duration),
        startDate: weekStart,
        endDate: null,
      });
      if (res.ok) ok += 1;
      else failed[r.key] = res.error;
    }

    setBusy(false);
    setRowErrors(failed);
    const failedCount = Object.keys(failed).length;
    if (failedCount === 0) {
      fireToast({ message: `${ok} call${ok === 1 ? "" : "s"} scheduled`, type: "success" });
      onClose();
      return;
    }
    if (ok > 0) {
      fireToast({
        message: `${ok} call${ok === 1 ? "" : "s"} scheduled, ${failedCount} need${failedCount === 1 ? "s" : ""} fixing below`,
        type: "info",
        duration: 8000,
      });
    } else {
      setError("None of the calls could be scheduled — see below.");
    }
  }

  return (
    <CeDialog
      title="Add call"
      subtitle="One employee and one participant, with every weekly call they need."
      onClose={onClose}
      width={860}
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_NEUTRAL}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} strokeWidth={2.6} />}
            Add call{rows.length === 1 ? "" : "s"}
          </button>
        </>
      }
    >
      {/* Employee, participant and product type in ONE row (asked 2026-09-28:
          "make this popup wider... make their boxes fit to a width that fits
          all their content"). Employee is auto-selected already (it's the
          employee adding the call) and stays first; product type is read off
          whichever participant is picked, not chosen a second time. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label>
          <span className={LABEL}>Employee</span>
          <Select
            value={memberId}
            onChange={(v) => {
              setMemberId(v);
              setAccountId("");
            }}
            ariaLabel="Employee name"
            disabled={Boolean(lockedMemberId)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className={LABEL}>Participant name / Client name / Ambassador name</span>
          <Select value={accountId} onChange={setAccountId} ariaLabel="Participant, client or ambassador">
            <option value="">{candidates.length ? "Pick one…" : "None assigned here yet"}</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a.fullName, a.batchCode)}
                {isInactiveAccount(a) ? " — inactive" : ""}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className={LABEL}>Product type</span>
          <div className={`${FIELD} flex items-center ${selected ? "text-ink-strong" : "text-ink-subtle"}`}>
            {selected ? categoryOf(selected.category)?.label : "Pick a person first"}
          </div>
        </label>
      </div>

      {!candidates.length ? (
        <p className="mt-3 text-[12px] text-ink-muted">
          Nobody is assigned to this employee yet — {CE_MANAGER_NAMES} add and assign people on Overview first.
        </p>
      ) : null}
      {selected && isInactiveAccount(selected) ? (
        <p className="mt-3 text-[12px] font-semibold" style={{ color: "var(--color-amber-deep)" }}>
          This account is inactive or on hold. The call is kept but not counted as load.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-xl border border-hairline">
            <div className="flex items-center justify-between rounded-t-xl bg-surface-soft px-3 py-2">
              <span className="text-[13px] font-extrabold text-ink-strong">Weekly Call {i + 1}</span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeRow(r.key)}
                  aria-label={`Remove Weekly Call ${i + 1}`}
                  className="inline-flex size-6 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-card hover:text-red-deep"
                >
                  <Trash2 size={13} strokeWidth={2.4} />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4">
              <label>
                <span className={LABEL}>Type</span>
                <Select value={r.callType} onChange={(v) => updateRow(r.key, { callType: v })} ariaLabel={`Call type ${i + 1}`}>
                  {CE_CALL_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                <span className={LABEL}>Day</span>
                <Select value={r.day} onChange={(v) => updateRow(r.key, { day: v })} ariaLabel={`Day ${i + 1}`}>
                  {CE_DAYS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                <span className={LABEL}>Start time</span>
                <TimeField value={r.startMin} onChange={(v) => updateRow(r.key, { startMin: v })} ariaLabel={`Start time ${i + 1}`} />
              </label>
              <label>
                <span className={LABEL}>End time</span>
                <TimeField
                  value={r.startMin + r.duration}
                  onChange={(v) => updateRow(r.key, { duration: Math.max(5, v - r.startMin) })}
                  ariaLabel={`End time ${i + 1}`}
                  min={r.startMin + 5}
                />
              </label>
            </div>
            {rowErrors[r.key] ? (
              <p className="border-t border-hairline px-3 py-2 text-[12px] font-semibold" style={{ color: "var(--color-red-deep)" }}>
                {rowErrors[r.key]}
              </p>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline-strong py-2.5 text-[13px] font-bold text-altus-red-deep hover:bg-surface-soft"
        >
          <Plus size={14} strokeWidth={2.8} /> Add More Weekly Calls
        </button>
      </div>

      <FormError message={error} />
    </CeDialog>
  );
}
