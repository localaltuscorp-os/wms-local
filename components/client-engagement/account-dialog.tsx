"use client";

import * as React from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { CE_GROUPS, categoryNeedsBatch, groupOf, type CeGroup, type CeProductOption } from "@/lib/client-engagement/constants";
import { CE_HH_STATUSES, CE_LIFECYCLES } from "@/lib/client-engagement/status";
import { CE_MANAGER_NAMES } from "@/lib/client-engagement/access";
import { ceAddAccount, ceDeleteAccount, ceUpdateAccount } from "@/app/(app)/operations/client-engagement/actions";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import type { CeAccountRow } from "@/lib/queries/client-engagement";
import { BTN_NEUTRAL, BTN_PRIMARY, CeDialog, FIELD, FormError, LABEL, Segmented, Select } from "./ui";

const NAME_LABEL: Record<CeGroup, string> = { P: "Participant name", C: "Client name", A: "Ambassador name" };

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
  productOptions,
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
  productOptions: CeProductOption[];
  canManage: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const isNew = account === null;
  const readOnly = !isNew && !canEdit;

  const [fullName, setFullName] = React.useState(account?.fullName ?? "");
  const [organization, setOrganization] = React.useState(account?.organization ?? "");
  const [groupSel, setGroupSel] = React.useState<CeGroup>(groupOf(account?.category ?? defaultCategory));
  const [category, setCategory] = React.useState(account?.category ?? defaultCategory ?? "ps");
  const [batchCode, setBatchCode] = React.useState(account?.batchCode ?? "");
  const [startDate, setStartDate] = React.useState(account?.startDate ?? "");
  const [endDate, setEndDate] = React.useState(account?.endDate ?? "");
  const [lifecycleStatus, setLifecycle] = React.useState(account?.lifecycleStatus ?? "active");
  const [hhStatus, setHhStatus] = React.useState(account?.hhStatus ?? "standard");
  const [notes, setNotes] = React.useState(account?.notes ?? "");
  const [assignTo, setAssignTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const needsBatch = categoryNeedsBatch(category);
  // Which PRODUCT TYPEs the Type step offers — Participant → PS/BSS/OS,
  // Client → Retainer/Corporate, Ambassador → the one Ambassador row (asked
  // 2026-09-28: pick the type first, then a product type that fits it,
  // rather than one flat list mixing all three together).
  const categoryOptions = productOptions.filter((option) => option.group === groupSel);

  function pickGroup(g: CeGroup) {
    setGroupSel(g);
    const first = productOptions.find((option) => option.group === g);
    setCategory(first?.value ?? "");
    setBatchCode("");
  }

  async function save() {
    if (busy || readOnly) return;
    if (isNew && !productOptions.some((option) => option.value === category)) {
      setError("Choose an active product type.");
      return;
    }
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
      tags: account?.tags ?? [],
      notes: notes || null,
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
      width={760}
      portal
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
            <button type="button" onClick={save} disabled={busy || (isNew && !productOptions.some((option) => option.value === category))} className={BTN_PRIMARY}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
              {isNew ? "Add" : "Save"}
            </button>
          ) : null}
        </>
      }
    >
      <fieldset disabled={readOnly} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className={LABEL}>Type</span>
          <Segmented
            value={groupSel}
            options={CE_GROUPS.map((g) => ({ value: g.code, label: g.label }))}
            onChange={pickGroup}
            ariaLabel="Participant, client or ambassador"
          />
        </div>

        <label className="sm:col-span-2">
          <span className={LABEL}>{NAME_LABEL[groupSel]}</span>
          <input className={FIELD} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. ABC Shah" autoFocus={isNew} />
        </label>

        {categoryOptions.length > 0 ? (
          <label>
            <span className={LABEL}>Product type</span>
            <Select value={category} onChange={setCategory} ariaLabel="Product type" disabled={readOnly}>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        ) : <div><span className={LABEL}>Product type</span><p className="text-[12px] text-ink-muted">No active products available.</p></div>}

        {needsBatch ? (
          <label className={categoryOptions.length > 0 ? "" : "sm:col-span-2"}>
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
          <label className={categoryOptions.length > 0 ? "" : "sm:col-span-2"}>
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
          <div className="flex max-w-full flex-nowrap gap-1.5 overflow-x-auto pb-1">
            {CE_HH_STATUSES.map((s) => {
              const on = hhStatus === s.code;
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setHhStatus(s.code)}
                  aria-pressed={on}
                  className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-bold transition-all"
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

        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={`${LABEL} mb-0`}>Notes <span className="font-medium normal-case tracking-normal text-ink-muted">Optional</span></span>
            <VoiceNoteButton
              compact
              label="Dictate"
              onText={(text) => setNotes((current) => current.trim() ? `${current.trimEnd()} ${text}` : text)}
            />
          </div>
          <textarea
            className="min-h-20 w-full resize-y rounded-xl border border-hairline bg-surface-card px-3 py-2 text-[13px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle focus:border-altus-red"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add notes"
            rows={3}
          />
        </div>
      </fieldset>
      <FormError message={error} />
    </CeDialog>
  );
}
