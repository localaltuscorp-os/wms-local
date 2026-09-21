"use client";

import * as React from "react";
import { CalendarPlus, Check, Loader2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  accountLabel,
  CE_CALL_TYPES,
  CE_CATEGORIES,
  CE_DAY_END_MIN,
  CE_DAY_START_MIN,
  CE_DAYS,
  CE_DURATIONS,
  categoryNeedsBatch,
} from "@/lib/client-engagement/constants";
import { CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import { addDays, dayCodeOf, formatDuration, parseHm, toClock, toHm, validateEngagement } from "@/lib/client-engagement/schedule";
import { isInactiveAccount } from "@/lib/client-engagement/status";
import type { CeAccountRow, CeEngagementRow, CeMemberRow } from "@/lib/queries/client-engagement";
import { ceDeleteEngagement, ceSaveEngagement } from "@/app/(app)/operations/client-engagement/actions";
import { BTN_NEUTRAL, BTN_PRIMARY, CeDialog, FIELD, FormError, LABEL, Select } from "./ui";

/** Every 5 minutes from 10:00 to 20:00. */
const TIMES: number[] = Array.from({ length: (CE_DAY_END_MIN - CE_DAY_START_MIN) / 5 + 1 }, (_, i) => CE_DAY_START_MIN + i * 5);

const NEW = "__new__";

/** The first date on or after `start` that falls on `day` (mon..sun). */
function firstOccurrence(start: string, day: string): string {
  let d = start;
  for (let i = 0; i < 7 && dayCodeOf(d) !== day; i++) d = addDays(d, 1);
  return d;
}

const fmtDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * SCHEDULE (or edit) one weekly call, in the order the brief lists the fields:
 * Employee · Product type · Batch (PS / BSS only) · who · Start / End date ·
 * Call type · Day · Duration · From / To.
 *
 * From + Duration gives To; changing To changes the Duration — the length is
 * never typed twice, so the two cannot disagree. The server re-checks the
 * window, the clash and the permission (ceSaveEngagement).
 */
export function EngagementDialog({
  engagement,
  preset,
  members,
  accounts,
  lockedMemberId,
  canManage,
  today,
  weekStart,
  onClose,
}: {
  engagement: CeEngagementRow | null;
  /** Prefill for a click on a free slot. */
  preset?: { memberId?: string; dayOfWeek?: string; startMin?: number; endMin?: number };
  members: CeMemberRow[];
  accounts: CeAccountRow[];
  /** A non-manager schedules only their own calls: the employee field is fixed. */
  lockedMemberId: string | null;
  canManage: boolean;
  today: string;
  /** Monday of the week the calendar is showing. New calls start there by
   *  default, so a call scheduled from this week appears in this week. */
  weekStart: string;
  onClose: () => void;
}) {
  const existing = engagement ? accounts.find((a) => a.id === engagement.accountId) ?? null : null;

  const [memberId, setMemberId] = React.useState(engagement?.teamMemberId ?? lockedMemberId ?? preset?.memberId ?? members[0]?.id ?? "");
  const [category, setCategory] = React.useState(existing?.category ?? "ps");
  const [batch, setBatch] = React.useState(existing?.batchCode ?? "");
  const [accountId, setAccountId] = React.useState(engagement?.accountId ?? "");
  const [newName, setNewName] = React.useState("");
  const [startDate, setStartDate] = React.useState(engagement?.startDate ?? weekStart);
  const [endDate, setEndDate] = React.useState(engagement?.endDate ?? "");
  const [callType, setCallType] = React.useState(engagement?.callType ?? "hh");
  const [day, setDay] = React.useState(engagement?.dayOfWeek ?? preset?.dayOfWeek ?? "mon");
  const initialStart = engagement ? parseHm(engagement.startTime)! : (preset?.startMin ?? CE_DAY_START_MIN);
  const initialEnd = engagement ? parseHm(engagement.endTime)! : Math.min(CE_DAY_END_MIN, preset?.endMin ?? initialStart + 30);
  const [startMin, setStartMin] = React.useState(initialStart);
  const [duration, setDuration] = React.useState(Math.max(5, initialEnd - initialStart));
  const [notes, setNotes] = React.useState(engagement?.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const endMin = startMin + duration;
  const needsBatch = categoryNeedsBatch(category);

  // Who the call can be with: that employee's own accounts in this product
  // (and batch). Scheduling is not a back door to assigning.
  const candidates = accounts
    .filter((a) => a.assignedTo === memberId && a.category === category && (!needsBatch || !batch || a.batchCode === batch))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const batchesHere = [...new Set(accounts.filter((a) => a.assignedTo === memberId && a.category === category && a.batchCode).map((a) => a.batchCode!))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );

  // Picking an account fills in its dates when the call has none of its own yet.
  function pickAccount(id: string) {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a && !engagement) {
      if (a.startDate) setStartDate(a.startDate > weekStart ? a.startDate : weekStart);
      if (a.endDate) setEndDate(a.endDate);
      if (a.batchCode) setBatch(a.batchCode);
    }
  }

  const durationOptions = [...new Set([...CE_DURATIONS, duration])].sort((a, b) => a - b);
  const clientError = validateEngagement({
    callType,
    dayOfWeek: day,
    startTime: toHm(startMin),
    endTime: toHm(endMin),
    startDate,
    endDate: endDate || null,
  });

  async function save() {
    setBusy(true);
    setError(null);
    const isNew = accountId === NEW;
    const res = await ceSaveEngagement({
      id: engagement?.id ?? null,
      accountId: isNew ? null : accountId || null,
      newAccount: isNew
        ? { fullName: newName, category, batchCode: needsBatch ? batch : null, startDate, endDate: endDate || null }
        : null,
      teamMemberId: memberId,
      callType,
      dayOfWeek: day,
      startTime: toHm(startMin),
      endTime: toHm(endMin),
      startDate,
      endDate: endDate || null,
      notes,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Say so when the first call is not in the week on screen — otherwise a call
    // that starts later looks as if it vanished (found in testing, 2026-09-19).
    const first = firstOccurrence(startDate, day);
    const later = first > addDays(weekStart, 6);
    fireToast({
      message: `${engagement ? "Call updated" : "Call scheduled"}${later ? ` — first call on ${fmtDay(first)}, after this week` : ""}`,
      type: later ? "info" : "success",
      duration: later ? 8000 : undefined,
    });
    onClose();
  }

  async function remove() {
    if (!engagement) return;
    setBusy(true);
    const res = await ceDeleteEngagement(engagement.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Call removed", type: "success" });
    onClose();
  }

  const selected = accounts.find((a) => a.id === accountId);

  return (
    <CeDialog
      title={engagement ? "Edit call" : "Schedule a call"}
      subtitle={`A weekly slot between 10 AM and 8 PM. ${toClock(startMin)} – ${toClock(endMin)} · ${formatDuration(duration)}`}
      onClose={onClose}
      width={640}
      footer={
        <>
          {engagement ? (
            <button type="button" onClick={remove} disabled={busy} className={`${BTN_NEUTRAL} mr-auto`}>
              <Trash2 size={14} strokeWidth={2.4} /> Remove call
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={BTN_NEUTRAL}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || Boolean(clientError) || !accountId || (accountId === NEW && !newName.trim())}
            className={BTN_PRIMARY}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : engagement ? <Check size={14} strokeWidth={2.8} /> : <CalendarPlus size={14} strokeWidth={2.6} />}
            {engagement ? "Save" : "Schedule"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className={LABEL}>Employee</span>
          <Select
            value={memberId}
            onChange={(v) => {
              setMemberId(v);
              setAccountId("");
            }}
            ariaLabel="Employee"
            disabled={Boolean(lockedMemberId) || Boolean(engagement)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className={LABEL}>Product type</span>
          <Select
            value={category}
            onChange={(v) => {
              setCategory(v);
              setBatch("");
              setAccountId("");
            }}
            ariaLabel="Product type"
            disabled={Boolean(engagement)}
          >
            {CE_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>

        {needsBatch ? (
          <label>
            <span className={LABEL}>Batch number</span>
            <input
              className={FIELD}
              value={batch}
              onChange={(e) => {
                setBatch(e.target.value);
                if (accountId !== NEW) setAccountId("");
              }}
              placeholder="e.g. 79"
              list="ce-cal-batches"
              disabled={Boolean(engagement)}
            />
            <datalist id="ce-cal-batches">
              {batchesHere.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
        ) : null}

        <label className={needsBatch ? "" : "sm:col-span-2"}>
          <span className={LABEL}>Client / participant</span>
          <Select value={accountId} onChange={pickAccount} ariaLabel="Client or participant" disabled={Boolean(engagement)}>
            <option value="">{candidates.length ? "Pick one…" : "None assigned here yet"}</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a.fullName, a.batchCode)}
                {isInactiveAccount(a) ? " — inactive" : ""}
              </option>
            ))}
            {canManage ? <option value={NEW}>+ New person…</option> : null}
          </Select>
        </label>

        {accountId === NEW ? (
          <label className="sm:col-span-2">
            <span className={LABEL}>New person&apos;s name</span>
            <input className={FIELD} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Added and assigned to this employee" autoFocus />
          </label>
        ) : null}
        {!canManage && !candidates.length ? (
          <p className="text-[12px] text-ink-muted sm:col-span-2">
            Only people already assigned to you can be scheduled. {CE_MANAGER_NAMES} assign new ones.
          </p>
        ) : null}
        {selected && isInactiveAccount(selected) ? (
          <p className="text-[12px] font-semibold sm:col-span-2" style={{ color: "var(--color-amber-deep)" }}>
            This account is inactive or on hold. The call is kept but not counted as load.
          </p>
        ) : null}

        <label>
          <span className={LABEL}>Start date</span>
          <input type="date" className={FIELD} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          <span className={LABEL}>End date</span>
          <input type="date" className={FIELD} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>

        <label>
          <span className={LABEL}>Call type</span>
          <Select value={callType} onChange={setCallType} ariaLabel="Call type">
            {CE_CALL_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Day</span>
          <Select value={day} onChange={setDay} ariaLabel="Day of the week">
            {CE_DAYS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className={LABEL}>Call duration</span>
          <Select value={String(duration)} onChange={(v) => setDuration(Number(v))} ariaLabel="Call duration">
            {durationOptions.map((d) => (
              <option key={d} value={d} disabled={startMin + d > CE_DAY_END_MIN}>
                {d < 60 ? `${d} mins` : formatDuration(d)}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={LABEL}>From</span>
            <Select value={String(startMin)} onChange={(v) => setStartMin(Number(v))} ariaLabel="From">
              {TIMES.slice(0, -1).map((t) => (
                <option key={t} value={t}>
                  {toClock(t)}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className={LABEL}>To</span>
            <Select value={String(endMin)} onChange={(v) => setDuration(Math.max(5, Number(v) - startMin))} ariaLabel="To">
              {TIMES.filter((t) => t > startMin).map((t) => (
                <option key={t} value={t}>
                  {toClock(t)}
                </option>
              ))}
              {endMin > CE_DAY_END_MIN ? <option value={endMin}>{toClock(endMin)} (past 8 PM)</option> : null}
            </Select>
          </label>
        </div>

        <label className="sm:col-span-2">
          <span className={LABEL}>Notes</span>
          <input className={FIELD} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <FormError message={error ?? (accountId ? clientError : null)} />
    </CeDialog>
  );
}
