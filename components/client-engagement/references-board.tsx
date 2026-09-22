"use client";

import * as React from "react";
import { Check, Loader2, Minus, Plus, Repeat, Target, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  accountLabel,
  CE_FREQUENCIES,
  CE_REFERENCE_PROGRAMS,
  frequencyLabel,
  referenceProgramLabel,
} from "@/lib/client-engagement/constants";
import { REFERENCE_STATUS_META, referenceProgress, referenceStatus } from "@/lib/client-engagement/references";
import type { CeAccountRow, CeMemberRow, CeReferenceRow } from "@/lib/queries/client-engagement";
import { ceBumpReference, ceDeleteReference, ceSaveReference } from "@/app/(app)/operations/client-engagement/actions";
import { BTN_NEUTRAL, BTN_PRIMARY, CARD, CARD_SHADOW, CeDialog, DISPLAY, FIELD, FormError, LABEL, Select, TD, TH, Toolbar } from "./ui";

/**
 * REFERENCE PIPELINE — the quota of referrals to collect from each account.
 *
 * Filter by collector ("everything Devraj is chasing"), see the cadence at a
 * glance (One Time vs Every Week), and +1 a reference the moment it comes in.
 * Every-week quotas that are not yet met are reminded weekly by the
 * /api/cron/ce-reference-reminders job.
 */
export function ReferencesBoard({
  references,
  accounts,
  members,
  today,
  canManage,
  myMemberId,
}: {
  references: CeReferenceRow[];
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  today: string;
  canManage: boolean;
  myMemberId: string | null;
}) {
  const [collector, setCollector] = React.useState("");
  const [cadence, setCadence] = React.useState("");
  const [editing, setEditing] = React.useState<CeReferenceRow | "new" | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  // +1 / −1 show at once (seen 2026-09-19: on a slow connection the count took
  // seconds to move, so people would click again). The server's number replaces
  // this as soon as the page refreshes; a failed save puts the old one back.
  // Tagged with the `references` array it was made against: when fresh server
  // data arrives (a new array), the stale overrides are simply ignored.
  const [opt, setOpt] = React.useState<{ base: CeReferenceRow[]; counts: Record<string, number> }>({ base: references, counts: {} });
  const setOptimistic = (update: (o: Record<string, number>) => Record<string, number>) =>
    setOpt((prev) => ({ base: references, counts: update(prev.base === references ? prev.counts : {}) }));
  const referencesShown = React.useMemo(() => {
    const counts = opt.base === references ? opt.counts : {};
    return references.map((r) => (r.id in counts ? { ...r, actualCollected: counts[r.id]! } : r));
  }, [references, opt]);

  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts]);
  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name] as const)), [members]);

  const canWork = (r: CeReferenceRow) => {
    if (canManage) return true;
    if (!myMemberId) return false;
    return r.collectorId === myMemberId || accountById.get(r.accountId)?.assignedTo === myMemberId;
  };

  const rows = referencesShown
    .filter((r) => (!collector || (collector === "none" ? !r.collectorId : r.collectorId === collector)) && (!cadence || r.frequency === cadence))
    .map((r) => ({ r, status: referenceStatus(r, today), account: accountById.get(r.accountId) }))
    .sort((a, b) => {
      const order = { overdue: 0, in_progress: 1, pending: 2, completed: 3 } as const;
      return order[a.status] - order[b.status] || (a.account?.fullName ?? "").localeCompare(b.account?.fullName ?? "");
    });

  const totals = rows.reduce(
    (t, x) => ({ target: t.target + x.r.targetCount, actual: t.actual + Math.min(x.r.actualCollected, x.r.targetCount) }),
    { target: 0, actual: 0 },
  );

  async function bump(id: string, delta: 1 | -1) {
    const current = referencesShown.find((r) => r.id === id);
    if (!current) return;
    const before = current.actualCollected;
    setOptimistic((o) => ({ ...o, [id]: Math.max(0, before + delta) }));
    setPending(id);
    const res = await ceBumpReference(id, delta);
    setPending(null);
    if (!res.ok) {
      setOptimistic((o) => ({ ...o, [id]: before }));
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setOptimistic((o) => ({ ...o, [id]: res.actual }));
  }

  return (
    <>
      <Toolbar>
        <Select value={collector} onChange={setCollector} ariaLabel="Collector" className="w-[190px] shrink-0">
          <option value="">Every collector</option>
          <option value="none">No collector</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select value={cadence} onChange={setCadence} ariaLabel="Cadence" className="w-[160px] shrink-0">
          <option value="">Any cadence</option>
          {CE_FREQUENCIES.map((f) => (
            <option key={f.code} value={f.code}>
              {f.label}
            </option>
          ))}
        </Select>
        <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink-muted">
          <b className="tabular-nums text-ink-strong">{totals.actual}</b> of <b className="tabular-nums text-ink-strong">{totals.target}</b> collected across{" "}
          {rows.length} quota{rows.length === 1 ? "" : "s"}
        </span>
        <button type="button" className={BTN_PRIMARY} onClick={() => setEditing("new")} disabled={!accounts.length}>
          <Plus size={14} strokeWidth={2.8} /> New quota
        </button>
      </Toolbar>

      {rows.length === 0 ? (
        <div className={`${CARD} px-8 py-12 text-center`} style={CARD_SHADOW}>
          <span
            className="mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
          >
            <Target size={26} strokeWidth={2.2} />
          </span>
          <h3 className="text-[18px] font-bold text-ink-strong">No reference quotas{collector || cadence ? " match these filters" : " yet"}</h3>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] font-medium text-ink-muted">
            Set how many references to collect from a client, who collects them, and whether it is one time or every week.
          </p>
        </div>
      ) : (
        <div className={`${CARD} scroll-x-only`} style={CARD_SHADOW}>
          {/* Status sits UNDER the progress bar rather than in a column of its
              own (2026-09-19): one column fewer is what lets the whole table,
              +1 button included, fit with the sidebar open. */}
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <th className={`${TH} min-w-[170px]`}>From</th>
                <th className={TH}>Collector</th>
                <th className={TH}>Program</th>
                <th className={TH}>Cadence</th>
                <th className={`${TH} w-[190px]`}>Progress</th>
                <th className={`${TH} text-right`}>Collected</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, status, account }) => {
                const meta = REFERENCE_STATUS_META[status];
                const pct = Math.round(referenceProgress(r) * 100);
                const work = canWork(r);
                return (
                  <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-surface-soft">
                    <td className={TD}>
                      <button type="button" onClick={() => setEditing(r)} className="text-left">
                        <span className="block text-[13.5px] font-bold text-ink-strong hover:underline">
                          {account ? accountLabel(account.fullName, account.batchCode) : "Removed account"}
                        </span>
                        {r.dueDate ? <span className="text-[11px] text-ink-subtle">Due {r.dueDate}</span> : null}
                      </button>
                    </td>
                    <td className={TD}>{r.collectorId ? (memberName.get(r.collectorId) ?? "—") : <span className="text-ink-subtle">—</span>}</td>
                    <td className={TD}>
                      <span className="font-bold text-ink-soft">{referenceProgramLabel(r.targetProgram)}</span>
                    </td>
                    <td className={TD}>
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={
                          r.frequency === "every_week"
                            ? { color: "var(--color-indigo-deep)", background: "color-mix(in srgb, var(--color-indigo) 40%, transparent)" }
                            : { color: "var(--color-ink-muted)", background: "var(--color-surface-soft)" }
                        }
                      >
                        {r.frequency === "every_week" ? <Repeat size={11} strokeWidth={2.6} /> : null}
                        {frequencyLabel(r.frequency)}
                      </span>
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `var(--color-${meta.tone}-deep)` }} />
                        </div>
                        <span className="w-9 text-right text-[11.5px] font-bold tabular-nums text-ink-muted">{pct}%</span>
                      </div>
                      <span
                        className="mt-1 inline-flex whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-bold"
                        style={{ color: `var(--color-${meta.tone}-deep)`, background: `color-mix(in srgb, var(--color-${meta.tone}) 30%, transparent)` }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="inline-flex items-center gap-1.5">
                        {work ? (
                          <button
                            type="button"
                            onClick={() => bump(r.id, -1)}
                            disabled={pending === r.id || r.actualCollected === 0}
                            aria-label="Undo one"
                            title="Undo one"
                            className="inline-flex size-7 items-center justify-center rounded-lg border border-hairline text-ink-subtle hover:text-ink-strong disabled:opacity-40"
                          >
                            <Minus size={13} strokeWidth={2.6} />
                          </button>
                        ) : null}
                        <span className="min-w-[52px] text-[14px] font-extrabold tabular-nums text-ink-strong" style={DISPLAY}>
                          {r.actualCollected}
                          <span className="text-[12px] font-semibold text-ink-subtle"> / {r.targetCount}</span>
                        </span>
                        {work ? (
                          <button
                            type="button"
                            onClick={() => bump(r.id, 1)}
                            disabled={pending === r.id}
                            aria-label="One more collected"
                            title="One more collected"
                            className="pastel-cta inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-bold"
                          >
                            {pending === r.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={3} />}1
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <ReferenceDialog
          reference={editing === "new" ? null : editing}
          accounts={accounts}
          members={members}
          canManage={canManage}
          canEdit={editing === "new" ? true : canWork(editing)}
          defaultCollector={myMemberId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ReferenceDialog({
  reference,
  accounts,
  members,
  canManage,
  canEdit,
  defaultCollector,
  onClose,
}: {
  reference: CeReferenceRow | null;
  accounts: CeAccountRow[];
  members: CeMemberRow[];
  canManage: boolean;
  canEdit: boolean;
  defaultCollector: string | null;
  onClose: () => void;
}) {
  const [accountId, setAccountId] = React.useState(reference?.accountId ?? "");
  const [collectorId, setCollectorId] = React.useState(reference?.collectorId ?? defaultCollector ?? "");
  const [targetProgram, setProgram] = React.useState(reference?.targetProgram ?? "bss");
  const [targetCount, setTarget] = React.useState(String(reference?.targetCount ?? 2));
  const [frequency, setFrequency] = React.useState(reference?.frequency ?? "one_time");
  const [dueDate, setDueDate] = React.useState(reference?.dueDate ?? "");
  const [notes, setNotes] = React.useState(reference?.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await ceSaveReference({
      id: reference?.id ?? null,
      accountId,
      collectorId: collectorId || null,
      targetProgram,
      targetCount: Number(targetCount),
      frequency,
      dueDate: dueDate || null,
      notes,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: reference ? "Saved" : "Quota set", type: "success" });
    onClose();
  }

  async function remove() {
    if (!reference) return;
    setBusy(true);
    const res = await ceDeleteReference(reference.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
  }

  const sorted = [...accounts].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <CeDialog
      title={reference ? "Reference quota" : "New reference quota"}
      subtitle="How many references to collect from this account, and who collects them."
      onClose={onClose}
      width={540}
      footer={
        <>
          {reference && canManage ? (
            <button type="button" onClick={remove} disabled={busy} className={`${BTN_NEUTRAL} mr-auto`}>
              <Trash2 size={14} strokeWidth={2.4} /> Delete
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={BTN_NEUTRAL}>
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit ? (
            <button type="button" onClick={save} disabled={busy || !accountId} className={BTN_PRIMARY}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
              Save
            </button>
          ) : null}
        </>
      }
    >
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={LABEL}>From (client / participant)</span>
          <Select value={accountId} onChange={setAccountId} ariaLabel="Account" disabled={!canEdit}>
            <option value="">Pick one…</option>
            {sorted.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a.fullName, a.batchCode)}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Collector</span>
          <Select value={collectorId} onChange={setCollectorId} ariaLabel="Collector" disabled={!canEdit}>
            <option value="">Nobody yet</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Target program</span>
          <Select value={targetProgram} onChange={setProgram} ariaLabel="Target program" disabled={!canEdit}>
            {CE_REFERENCE_PROGRAMS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Target count</span>
          <input type="number" min={1} max={1000} className={FIELD} value={targetCount} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label>
          <span className={LABEL}>Cadence</span>
          <Select value={frequency} onChange={setFrequency} ariaLabel="Cadence" disabled={!canEdit}>
            {CE_FREQUENCIES.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className={LABEL}>Due date</span>
          <input type="date" className={FIELD} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className={LABEL}>Notes</span>
          <input className={FIELD} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </label>
      </fieldset>
      {frequency === "every_week" ? (
        <p className="mt-2 text-[12px] text-ink-muted">The collector gets a reminder each week until the target is met.</p>
      ) : null}
      <FormError message={error} />
    </CeDialog>
  );
}
