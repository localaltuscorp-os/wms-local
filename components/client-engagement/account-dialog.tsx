"use client";

import * as React from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { CE_CATEGORIES, categoryNeedsBatch } from "@/lib/client-engagement/constants";
import { CE_HH_STATUSES, CE_LIFECYCLES } from "@/lib/client-engagement/status";
import { CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import { ceAddAccount, ceDeleteAccount, ceUpdateAccount } from "@/app/(app)/operations/client-engagement/actions";
import type { CeAccountRow } from "@/lib/queries/client-engagement";
import { BTN_NEUTRAL, BTN_PRIMARY, CeDialog, FIELD, FormError, LABEL, Select } from "./ui";

export interface MemberOption {
  id: string;
  name: string;
}

/**
 * ADD or EDIT a participant / client / ambassador.
 *
 * The batch number appears only for PS and BSS — the database refuses one
 * anywhere else, so the form does not offer it. Anyone may add; a manager may
 * also assign in the same step. Editing is for managers and the assignee.
 */
export function AccountDialog({
  account,
  defaultCategory,
  members,
  batches,
  canManage,
  canEdit,
  onClose,
}: {
  /** Null to add a new one. */
  account: CeAccountRow | null;
  defaultCategory?: string;
  members: MemberOption[];
  /** Batch codes already in use, offered as suggestions. */
  batches: string[];
  canManage: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const isNew = account === null;
  const readOnly = !isNew && !canEdit;

  const [fullName, setFullName] = React.useState(account?.fullName ?? "");
  const [organization, setOrganization] = React.useState(account?.organization ?? "");
  const [category, setCategory] = React.useState(account?.category ?? defaultCategory ?? "ps");
  const [batchCode, setBatchCode] = React.useState(account?.batchCode ?? "");
  const [startDate, setStartDate] = React.useState(account?.startDate ?? "");
  const [endDate, setEndDate] = React.useState(account?.endDate ?? "");
  const [lifecycleStatus, setLifecycle] = React.useState(account?.lifecycleStatus ?? "active");
  const [hhStatus, setHhStatus] = React.useState(account?.hhStatus ?? "standard");
  const [tags, setTags] = React.useState((account?.tags ?? []).join(", "));
  const [notes, setNotes] = React.useState(account?.notes ?? "");
  const [assignTo, setAssignTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const needsBatch = categoryNeedsBatch(category);

  async function save() {
    if (busy || readOnly) return;
    setBusy(true);
    setError(null);
    const payload = {
      fullName,
      organization,
      category,
      batchCode: needsBatch ? batchCode : null,
      startDate: startDate || null,
      endDate: endDate || null,
      lifecycleStatus,
      hhStatus,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes,
    };
    const res = isNew ? await ceAddAccount({ ...payload, assignTo: assignTo || null }) : await ceUpdateAccount(account.id, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: isNew ? (assignTo ? "Added and assigned" : "Added to Unassigned") : "Saved", type: "success" });
    onClose();
  }

  async function remove() {
    if (!account || busy) return;
    setBusy(true);
    const res = await ceDeleteAccount(account.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    fireToast({ message: "Deleted", type: "success" });
    onClose();
  }

  return (
    <CeDialog
      title={isNew ? "Add participant, client or ambassador" : readOnly ? account.fullName : `Edit ${account.fullName}`}
      subtitle={
        isNew
          ? canManage
            ? "Assign it now, or leave it in Unassigned."
            : `It lands in Unassigned; ${CE_MANAGER_NAMES} assign it.`
          : readOnly
            ? `Read-only: only ${CE_MANAGER_NAMES}, or the person it is assigned to, can edit it.`
            : undefined
      }
      onClose={onClose}
      width={620}
      footer={
        <>
          {!isNew && canManage ? (
            confirmDelete ? (
              <button type="button" onClick={remove} disabled={busy} className={`${BTN_NEUTRAL} mr-auto`} style={{ color: "var(--color-red-deep)" }}>
                <Trash2 size={14} strokeWidth={2.4} /> Delete, with its calls and references
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${BTN_NEUTRAL} mr-auto`}>
                <Trash2 size={14} strokeWidth={2.4} /> Delete
              </button>
            )
          ) : null}
          <button type="button" onClick={onClose} className={BTN_NEUTRAL}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
              {isNew ? "Add" : "Save"}
            </button>
          ) : null}
        </>
      }
    >
      <fieldset disabled={readOnly} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={LABEL}>Full name</span>
          <input className={FIELD} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. ABC Shah" autoFocus={isNew} />
        </label>

        <label>
          <span className={LABEL}>Product type</span>
          <Select value={category} onChange={setCategory} ariaLabel="Product type" disabled={readOnly}>
            {CE_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label} — {c.section}
              </option>
            ))}
          </Select>
        </label>

        {needsBatch ? (
          <label>
            <span className={LABEL}>Batch number</span>
            <input
              className={FIELD}
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              placeholder="e.g. 79"
              list="ce-batch-codes"
            />
            <datalist id="ce-batch-codes">
              {batches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
        ) : (
          <label>
            <span className={LABEL}>Organization</span>
            <input className={FIELD} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Optional" />
          </label>
        )}

        <label>
          <span className={LABEL}>Start date</span>
          <input type="date" className={FIELD} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          <span className={LABEL}>End date</span>
          <input type="date" className={FIELD} value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </label>

        <div className="sm:col-span-2">
          <span className={LABEL}>Hand-holding status</span>
          <div className="flex flex-wrap gap-1.5">
            {CE_HH_STATUSES.map((s) => {
              const on = hhStatus === s.code;
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setHhStatus(s.code)}
                  aria-pressed={on}
                  className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-bold transition-all"
                  style={{
                    background: on ? (s.bg ?? "var(--color-surface-soft)") : "var(--color-surface-card)",
                    color: on ? (s.fg ?? "var(--color-ink-strong)") : "var(--color-ink-soft)",
                    borderColor: on ? (s.bg ?? "var(--color-hairline-strong)") : "var(--color-hairline)",
                  }}
                >
                  <span className="size-2.5 rounded-full border border-hairline-strong" style={{ background: s.bg ?? "#fff" }} />
                  {s.label}
                </button>
              );
            })}
          </div>
          {hhStatus === "on_hold" ? (
            <p className="mt-1.5 text-[12px] text-ink-muted">On hold moves it to the Inactive side. It stays with the same person.</p>
          ) : null}
        </div>

        <label>
          <span className={LABEL}>Lifecycle</span>
          <Select value={lifecycleStatus} onChange={setLifecycle} ariaLabel="Lifecycle" disabled={readOnly}>
            {CE_LIFECYCLES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </label>

        {isNew && canManage ? (
          <label>
            <span className={LABEL}>Assign to</span>
            <Select value={assignTo} onChange={setAssignTo} ariaLabel="Assign to">
              <option value="">Leave unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
        ) : needsBatch ? (
          <label>
            <span className={LABEL}>Organization</span>
            <input className={FIELD} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Optional" />
          </label>
        ) : (
          <span />
        )}

        <label className="sm:col-span-2">
          <span className={LABEL}>Tags</span>
          <input className={FIELD} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated, e.g. priority, referral" />
        </label>

        <label className="sm:col-span-2">
          <span className={LABEL}>Notes</span>
          <textarea
            className={`${FIELD} h-auto min-h-[72px] py-2`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </label>
      </fieldset>
      <FormError message={error} />
    </CeDialog>
  );
}
