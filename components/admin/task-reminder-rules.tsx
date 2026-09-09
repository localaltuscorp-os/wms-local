"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, Check, X, Pause, Play, Clock, AlertTriangle } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  REMINDER_STATUS_TOKENS,
  DEFAULT_REMINDER_STATUSES,
  reminderStatusLabel,
  isValidSendTime,
} from "@/lib/task-reminders/rules";
import {
  createReminderRule,
  updateReminderRule,
  setReminderRuleEnabled,
  deleteReminderRule,
} from "@/app/(admin)/admin/task-reminders/actions";

export interface ReminderRuleView {
  id: string;
  name: string;
  isEnabled: boolean;
  recipientIds: string[];
  scope: "all" | "selected";
  employeeIds: string[];
  statuses: string[];
  sendTimeIst: string;
  lastSentOn: string | null;
  lastError: string | null;
}

interface Props {
  rules: ReminderRuleView[];
  employees: { value: string; label: string }[];
}

/** A blank rule, opened by "New reminder". */
function emptyDraft(): ReminderRuleView {
  return {
    id: "",
    name: "",
    isEnabled: true,
    recipientIds: [],
    scope: "all",
    employeeIds: [],
    statuses: [...DEFAULT_REMINDER_STATUSES],
    sendTimeIst: "09:30",
    lastSentOn: null,
    lastError: null,
  };
}

export function TaskReminderRules({ rules, employees }: Props) {
  const [draft, setDraft] = React.useState<ReminderRuleView | null>(null);

  return (
    <div className="space-y-3">
      {draft && (
        <RuleEditor
          key={draft.id || "new"}
          draft={draft}
          employees={employees}
          onClose={() => setDraft(null)}
        />
      )}

      {!draft && (
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white transition-all hover:brightness-110"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          <Plus size={15} strokeWidth={2.6} />
          New reminder
        </button>
      )}

      {rules.length === 0 && !draft ? (
        <div className="rounded-section border border-hairline bg-surface-card p-8 text-center">
          <p className="text-[16px] font-bold text-ink-strong">No reminders yet.</p>
          <p className="mt-1 text-[13.5px] font-semibold text-ink-muted">
            Create one to email a daily summary of everyone&apos;s open tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              employees={employees}
              onEdit={() => setDraft(r)}
              editing={draft?.id === r.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One rule, collapsed                                                 */
/* ------------------------------------------------------------------ */

function RuleRow({
  rule,
  employees,
  onEdit,
  editing,
}: {
  rule: ReminderRuleView;
  employees: { value: string; label: string }[];
  onEdit: () => void;
  editing: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const nameOf = React.useMemo(
    () => new Map(employees.map((e) => [e.value, e.label])),
    [employees],
  );

  const recipients = rule.recipientIds.map((id) => nameOf.get(id) ?? "—");
  const scopeLabel =
    rule.scope === "all"
      ? "All employees"
      : `${rule.employeeIds.length} employee${rule.employeeIds.length === 1 ? "" : "s"}`;

  function toggle() {
    start(async () => {
      await setReminderRuleEnabled({ id: rule.id, isEnabled: !rule.isEnabled });
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      await deleteReminderRule({ id: rule.id });
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div
      className="rounded-xl border border-hairline bg-surface-card px-4 py-3"
      style={{ opacity: rule.isEnabled ? 1 : 0.62 }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-ink-strong">
              {rule.name}
            </span>
            {!rule.isEnabled && (
              <span className="shrink-0 rounded-pill bg-gray-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Paused
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] font-semibold text-ink-muted">
            {scopeLabel} · {rule.statuses.length} status
            {rule.statuses.length === 1 ? "" : "es"} · to{" "}
            {recipients.length ? recipients.join(", ") : "nobody yet"}
          </p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-gray-100 px-2.5 py-1 text-[12.5px] font-black tabular-nums text-ink-strong">
          <Clock size={13} strokeWidth={2.6} className="text-ink-muted" />
          {rule.sendTimeIst}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            title={rule.isEnabled ? "Pause this reminder" : "Resume this reminder"}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-black/[0.06] hover:text-ink-strong"
          >
            {pending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : rule.isEnabled ? (
              <Pause size={15} />
            ) : (
              <Play size={15} />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={editing}
            title="Edit"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-black/[0.06] hover:text-ink-strong disabled:opacity-40"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            title="Delete"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-altus-red"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {rule.lastError && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold text-altus-red">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Last run failed: {rule.lastError}
        </p>
      )}

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
          <span className="text-[13px] font-bold text-ink-strong">
            Delete “{rule.name}”? This cannot be undone.
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-pill border border-hairline bg-white px-3 py-1 text-[12.5px] font-bold text-ink-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[12.5px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create / edit form                                                  */
/* ------------------------------------------------------------------ */

function RuleEditor({
  draft,
  employees,
  onClose,
}: {
  draft: ReminderRuleView;
  employees: { value: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(draft.name);
  const [recipientIds, setRecipientIds] = React.useState<string[]>(draft.recipientIds);
  const [scope, setScope] = React.useState<"all" | "selected">(draft.scope);
  const [employeeIds, setEmployeeIds] = React.useState<string[]>(draft.employeeIds);
  const [statuses, setStatuses] = React.useState<string[]>(draft.statuses);
  const [sendTimeIst, setSendTimeIst] = React.useState(draft.sendTimeIst);
  const [isEnabled, setIsEnabled] = React.useState(draft.isEnabled);

  function toggleStatus(token: string) {
    setStatuses((cur) =>
      cur.includes(token) ? cur.filter((s) => s !== token) : [...cur, token],
    );
  }

  function submit() {
    if (!name.trim()) return setError("Give the reminder a name.");
    if (recipientIds.length === 0) return setError("Choose at least one recipient.");
    if (statuses.length === 0) return setError("Choose at least one status.");
    if (!isValidSendTime(sendTimeIst)) return setError("Send time must be a 24-hour HH:MM.");
    if (scope === "selected" && employeeIds.length === 0) {
      return setError("Pick at least one employee, or switch the scope to All Employees.");
    }
    setError(null);

    const payload = {
      name: name.trim(),
      recipientIds,
      scope,
      employeeIds,
      statuses,
      sendTimeIst,
      isEnabled,
    };

    start(async () => {
      const res = draft.id
        ? await updateReminderRule({ id: draft.id, ...payload })
        : await createReminderRule(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="rounded-section border border-hairline bg-surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-black text-ink-strong">
          {draft.id ? "Edit reminder" : "New reminder"}
        </h3>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink-soft">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="size-4 accent-[#E10600]"
          />
          Enabled
        </label>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <Field label="Reminder name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Daily open-task chase"
            className={INPUT}
          />
        </Field>

        <Field label="Send time (IST)" hint="Fires within 15 minutes of this time.">
          <input
            type="time"
            value={sendTimeIst}
            onChange={(e) => setSendTimeIst(e.target.value)}
            className={INPUT}
          />
        </Field>

        <Field label="Recipients" hint="Each gets one consolidated email.">
          <MultiSelect
            options={employees}
            selected={recipientIds}
            onChange={setRecipientIds}
            placeholder="Choose recipients"
          />
        </Field>

        <Field label="Employee scope">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            {(["all", "selected"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  scope === s ? "bg-white shadow-sm text-ink-strong" : "text-gray-500"
                }`}
              >
                {s === "all" ? "All Employees" : "Selected"}
              </button>
            ))}
          </div>
        </Field>

        {scope === "selected" && (
          <Field label="Employees" hint="Type to search.">
            <MultiSelect
              options={employees}
              selected={employeeIds}
              onChange={setEmployeeIds}
              placeholder="Choose employees"
            />
          </Field>
        )}
      </div>

      <div className="mt-3.5">
        <FieldLabel
          label="Task statuses"
          hint="Done, Approved and Cancelled tasks are never reminded about."
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {REMINDER_STATUS_TOKENS.map((token) => {
            const on = statuses.includes(token);
            return (
              <button
                key={token}
                type="button"
                onClick={() => toggleStatus(token)}
                aria-pressed={on}
                className="inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-[12.5px] font-bold transition-colors"
                style={
                  on
                    ? { borderColor: "#E10600", background: "rgba(225,6,0,0.07)", color: "#A80400" }
                    : {
                        borderColor: "var(--color-hairline)",
                        background: "#fff",
                        color: "var(--color-ink-muted)",
                      }
                }
              >
                {on && <Check size={12} strokeWidth={3} />}
                {reminderStatusLabel(token)}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[13px] font-semibold text-altus-red">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-pill px-4 py-2 text-[13.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {draft.id ? "Save changes" : "Create reminder"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-white px-4 py-2 text-[13.5px] font-bold text-ink-strong"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const INPUT =
  "w-full rounded-md border border-hairline bg-white px-3 py-2 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red/50";

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
        {label}
      </span>
      {hint && (
        <span className="ml-1.5 text-[11.5px] font-semibold text-ink-muted">{hint}</span>
      )}
    </span>
  );
}

/**
 * A `div`, not a `label`. Two of these wrap a MultiSelect, whose trigger is a
 * button opening a portalled popover — nesting that inside a label makes the
 * label forward stray clicks into it and can reopen the popover on every click
 * inside the field.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <FieldLabel label={label} hint={hint} />
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
