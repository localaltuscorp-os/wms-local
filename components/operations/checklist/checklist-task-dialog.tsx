"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Plus, Repeat, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  OFFSET_MAX,
  OFFSET_MIN,
  addDays,
  daysBetween,
  formatDMY,
  formatOffset,
  parseOffset,
} from "@/lib/operations/checklist-dates";
import { frequencyText, reanchorRule } from "@/lib/operations/checklist-frequency";
import {
  dateFromYmd,
  detectPreset,
  humanSummary,
  presetOptions,
  ruleForPreset,
  type PresetKey,
} from "@/lib/recurrence/google-recurrence";
import { ClientSelect } from "@/components/tasks/client-select";
import { SubjectSelect } from "@/components/tasks/subject-select";
import { CustomRecurrenceDialog } from "@/components/recurrence/custom-recurrence-dialog";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";

/**
 * ADD A TASK — a pop-up, like WMS New Task (account holder, 2026-09-18: "the
 * + Add on the task line, a pop-up to fill all the details, then Enter").
 *
 * One form for both tables, showing the fields each one has:
 *   · a CHECKLIST — Client, Subject, Task, Doer, Initiator, Target Date and
 *     how it repeats (the Frequency is read from that, as in the grid);
 *   · a MASTER — Task, Subject, Day from the event, Doer, Backup, Instructions,
 *     File link. A master has no dates, only days.
 *
 * Enter adds the task (Shift+Enter is a new line in the Task box). "Add &
 * next" keeps the pop-up open with the Task cleared and everything else kept —
 * tasks are usually entered in runs that share a doer and a date.
 */

export interface ChecklistTaskValues {
  title: string;
  client: string | null;
  category: string | null;
  doerId: string | null;
  initiatorId: string | null;
  backupId: string | null;
  offsetDays: number | null;
  targetDate: string | null;
  recurrenceRule: string | null;
  instructions: string | null;
  fileLink: string | null;
}

type Result = { ok: true } | { ok: false; error: string };

export interface ChecklistTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: "run" | "master";
  isEvent: boolean;
  /** An event checklist's event date — the Target Date is stored as days from it. */
  eventDate?: string | null;
  /** The Day the group it was opened from stands for (-1 Before, 0 During, +1 After). */
  defaultOffset?: number | null;
  /** "Before Event" — the group it was opened from, for the heading. */
  groupLabel?: string | null;
  /** The checklist's or master's name. */
  containerName: string;
  people: ReadonlyArray<{ id: string; name: string }>;
  clients?: string[];
  subjects: string[];
  canAddRoster: boolean;
  /** The Initiator it starts with — whoever is adding it. */
  meId?: string;
  onAdd: (v: ChecklistTaskValues) => Promise<Result>;
}

export function ChecklistTaskDialog(props: ChecklistTaskDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-section bg-surface-card shadow-xl"
          style={{ maxHeight: "calc(100vh - 32px)" }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => document.getElementById("ctd-title")?.focus());
          }}
        >
          {/* Mounted only while open, so every opening starts from a clean form. */}
          {open && <TaskForm {...props} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A labelled field, in the New Task form's type and spacing. */
function Field({
  id,
  label,
  required,
  hint,
  aside,
  className,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  /** Something at the right end of the label line — the Dictate button. */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <div className="flex min-h-[24px] items-center justify-between gap-2">
        <label htmlFor={id} className="text-[14px] font-bold tracking-[-0.005em] text-ink-strong">
          {label}
          {required && <span style={{ color: "rgb(168, 4, 0)" }}> *</span>}
        </label>
        {aside}
      </div>
      {children}
      {hint && <span className="text-[12px] font-medium text-ink-subtle">{hint}</span>}
    </div>
  );
}

function relative(offset: number | null): string {
  if (offset === null) return "No day set — it goes under Undated.";
  if (offset === 0) return "The event day.";
  const n = Math.abs(offset);
  return `${n} day${n === 1 ? "" : "s"} ${offset < 0 ? "before" : "after"} the event.`;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function TaskForm({
  onOpenChange,
  target,
  isEvent,
  eventDate = null,
  defaultOffset = null,
  groupLabel = null,
  containerName,
  people,
  clients = [],
  subjects,
  canAddRoster,
  meId,
  onAdd,
}: ChecklistTaskDialogProps) {
  const isRun = target === "run";
  const firstDate = isRun
    ? isEvent
      ? eventDate && defaultOffset !== null
        ? addDays(eventDate, defaultOffset)
        : ""
      : todayYmd()
    : "";

  const [title, setTitle] = React.useState("");
  const [client, setClient] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [doerId, setDoerId] = React.useState("");
  const [initiatorId, setInitiatorId] = React.useState(meId && people.some((p) => p.id === meId) ? meId : "");
  const [backupId, setBackupId] = React.useState("");
  const [date, setDate] = React.useState(firstDate);
  const [rule, setRule] = React.useState<string | null>(null);
  const [day, setDay] = React.useState(defaultOffset === null ? "" : formatOffset(defaultOffset));
  const [instructions, setInstructions] = React.useState("");
  const [fileLink, setFileLink] = React.useState("");
  const [customOpen, setCustomOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState(0);
  const titleRef = React.useRef<HTMLTextAreaElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const nextRef = React.useRef(false);

  const validDate = /^(19|20)\d{2}-\d{2}-\d{2}$/.test(date) ? date : null;
  const anchorDate = validDate ? dateFromYmd(validDate) : null;
  const preset: PresetKey = anchorDate && rule ? detectPreset(rule, anchorDate) : "none";
  const eventOffset = isRun && isEvent && validDate && eventDate ? daysBetween(eventDate, validDate) : null;

  function changeDate(next: string) {
    // A preset repeat moves with its day — "Weekly on Friday" follows the date.
    if (rule && validDate && /^(19|20)\d{2}-\d{2}-\d{2}$/.test(next)) setRule(reanchorRule(rule, validDate, next));
    if (!next) setRule(null);
    setDate(next);
  }

  function values(): ChecklistTaskValues | string {
    const t = title.trim();
    if (!t) return "Write the task.";
    let offsetDays: number | null = null;
    let targetDate: string | null = null;
    if (isRun) {
      if (date && !validDate) return "That Target Date is not complete.";
      if (isEvent) {
        if (validDate) {
          if (eventOffset === null) return "This checklist has no event date to count from.";
          if (eventOffset < OFFSET_MIN || eventOffset > OFFSET_MAX) return "Pick a date within a year either side of the event.";
          offsetDays = eventOffset;
        }
      } else {
        targetDate = validDate;
      }
    } else if (isEvent && day.trim()) {
      offsetDays = parseOffset(day);
      if (offsetDays === null) return `Day must be a whole number from ${OFFSET_MIN} to ${OFFSET_MAX} (e.g. -3, 0, +1).`;
    }
    const link = fileLink.trim();
    if (link && !/^https?:\/\//i.test(link)) return "The file link must start with http:// or https://";
    return {
      title: t,
      client: isRun ? client.trim() || null : null,
      category: category.trim() || null,
      doerId: doerId || null,
      initiatorId: isRun ? initiatorId || null : null,
      backupId: isRun ? null : backupId || null,
      offsetDays,
      targetDate,
      recurrenceRule: isRun && validDate ? rule : null,
      instructions: isRun ? null : instructions.trim() || null,
      fileLink: isRun ? null : link || null,
    };
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const again = nextRef.current;
    nextRef.current = false;
    if (saving) return;
    const v = values();
    if (typeof v === "string") {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await onAdd(v);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `Added to ${containerName}.`, type: "success" });
      if (again) {
        setTitle("");
        setAdded((n) => n + 1);
        requestAnimationFrame(() => titleRef.current?.focus());
      } else {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  const doerName = people.find((p) => p.id === doerId)?.name;

  return (
    <form ref={formRef} onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-col">
      {/* Header — the New Task dialog's red bar, title and close. */}
      <div
        className="relative px-8 py-5 max-md:px-5 max-md:py-4"
        style={{ borderBottom: "1px solid var(--color-hairline)", background: "linear-gradient(135deg, #ffffff 0%, #FFF6F5 100%)" }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 4, background: "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))" }} />
        <Dialog.Title
          className="pr-14 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px, 2.4vw, 30px)", letterSpacing: "-0.022em", lineHeight: 1.05 }}
        >
          New Task
        </Dialog.Title>
        <Dialog.Description className="mt-1 text-[14.5px] font-semibold text-ink-muted">
          {isRun ? "On the checklist" : "On the master"} “{containerName}”{groupLabel ? ` · ${groupLabel}` : ""}
          {added > 0 && <span className="ml-2 text-emerald-700">· {added} added</span>}
        </Dialog.Description>
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="Close"
            className="absolute right-5 top-4 inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-all hover:bg-surface-soft"
          >
            <X size={20} strokeWidth={2.4} />
          </button>
        </Dialog.Close>
      </div>

      {/* Body — two equal columns; the Task takes the full width. */}
      <div className="grid min-h-0 grid-cols-2 gap-x-4 gap-y-4 overflow-y-auto px-8 py-5 max-md:grid-cols-1 max-md:px-5">
        {isRun && (
          <>
            <Field id="ctd-client" label="Client">
              <ClientSelect
                id="ctd-client"
                value={client}
                onChange={setClient}
                clients={clients}
                canAdd={canAddRoster}
                placeholder="Select a client…"
                className="nt-input"
              />
            </Field>
            <Field id="ctd-subject" label="Subject">
              <SubjectSelect
                id="ctd-subject"
                value={category}
                onChange={setCategory}
                subjects={subjects}
                canAdd={canAddRoster}
                className="nt-input"
              />
            </Field>
          </>
        )}

        <Field
          id="ctd-title"
          label="Task"
          required
          className="col-span-2 max-md:col-span-1"
          hint="Enter adds it · Shift+Enter for a new line"
          aside={
            <VoiceNoteButton
              compact
              label="Dictate"
              onText={(t) => setTitle((cur) => (cur.trim() ? `${cur.trimEnd()} ${t}` : t))}
            />
          }
        >
          <textarea
            id="ctd-title"
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            placeholder="What must be done"
            rows={2}
            maxLength={500}
            className="nt-input min-h-[64px] resize-y"
          />
        </Field>

        {!isRun && (
          <>
            <Field id="ctd-subject" label="Subject" className={isEvent ? "" : "col-span-2 max-md:col-span-1"}>
              <SubjectSelect
                id="ctd-subject"
                value={category}
                onChange={setCategory}
                subjects={subjects}
                canAdd={canAddRoster}
                className="nt-input"
              />
            </Field>
            {isEvent && (
              <Field id="ctd-day" label="Day" hint={relative(parseOffset(day))}>
                <input
                  id="ctd-day"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  placeholder="e.g. -3, 0, +1"
                  inputMode="numeric"
                  className="nt-input tabular-nums"
                />
              </Field>
            )}
          </>
        )}

        <Field id="ctd-doer" label="Doer">
          <select id="ctd-doer" value={doerId} onChange={(e) => setDoerId(e.target.value)} className="nt-input">
            <option value="">— Nobody yet —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        {isRun ? (
          <Field id="ctd-initiator" label="Initiator" hint={initiatorId === meId ? "You — the one adding it." : undefined}>
            <select id="ctd-initiator" value={initiatorId} onChange={(e) => setInitiatorId(e.target.value)} className="nt-input">
              <option value="">— You —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field id="ctd-backup" label="Backup" hint={doerName ? `Covers for ${doerName}.` : "Someone other than the doer."}>
            <select id="ctd-backup" value={backupId} onChange={(e) => setBackupId(e.target.value)} className="nt-input">
              <option value="">— None —</option>
              {people
                .filter((p) => p.id !== doerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        )}

        {isRun && (
          <>
            <Field
              id="ctd-date"
              label="Target Date"
              hint={
                isEvent
                  ? eventDate
                    ? `${validDate ? relative(eventOffset) : "Blank — it goes under Undated."} Event on ${formatDMY(eventDate)}.`
                    : "This checklist has no event date yet."
                  : validDate
                    ? formatDMY(validDate)
                    : "Blank — no date yet."
              }
            >
              <input
                id="ctd-date"
                type="date"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
                className="nt-input tabular-nums"
              />
            </Field>
            <Field
              id="ctd-repeat"
              label="Repeat"
              hint={
                <span className="inline-flex items-center gap-1">
                  <Repeat className="h-3 w-3" aria-hidden />
                  Frequency: <b className="font-bold text-ink-soft">{frequencyText(rule, validDate)}</b>
                  {preset === "custom" && anchorDate && (
                    <>
                      {" "}· {humanSummary(rule, anchorDate)} ·{" "}
                      <button type="button" className="underline underline-offset-2" onClick={() => setCustomOpen(true)}>
                        Edit
                      </button>
                    </>
                  )}
                </span>
              }
            >
              <select
                id="ctd-repeat"
                value={preset}
                disabled={!anchorDate}
                title={anchorDate ? undefined : "Pick the Target Date first — the repeat is spoken about it."}
                onChange={(e) => {
                  const key = e.target.value as PresetKey;
                  if (!anchorDate) return;
                  if (key === "custom") setCustomOpen(true);
                  else setRule(key === "none" ? null : ruleForPreset(key, anchorDate));
                }}
                className="nt-input disabled:opacity-60"
              >
                {presetOptions(anchorDate ?? new Date()).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {anchorDate && (
              <CustomRecurrenceDialog
                open={customOpen}
                onOpenChange={setCustomOpen}
                anchor={anchorDate}
                rule={rule}
                onDone={({ rule: next }) => setRule(next)}
              />
            )}
          </>
        )}

        {!isRun && (
          <>
            <Field id="ctd-instructions" label="Instructions" className="col-span-2 max-md:col-span-1">
              <textarea
                id="ctd-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="How to do it, where things are"
                rows={2}
                maxLength={4000}
                className="nt-input min-h-[56px] resize-y"
              />
            </Field>
            <Field id="ctd-link" label="File link" className="col-span-2 max-md:col-span-1">
              <input
                id="ctd-link"
                value={fileLink}
                onChange={(e) => setFileLink(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                className="nt-input"
              />
            </Field>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-8 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800 max-md:mx-5">
          {error}
        </p>
      )}

      {/* Footer — the actions stay put while the body scrolls. */}
      <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface-soft px-8 py-4 max-md:px-5">
        <Dialog.Close asChild>
          <button type="button" className="h-10 rounded-lg border border-hairline-strong bg-white px-5 text-[14px] font-bold text-ink-muted hover:bg-surface-soft">
            Cancel
          </button>
        </Dialog.Close>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          onClick={() => {
            nextRef.current = true;
          }}
          title="Add this task and start the next one"
          className="h-10 rounded-lg border border-hairline-strong bg-white px-4 text-[14px] font-bold text-ink-strong hover:bg-surface-soft disabled:opacity-50"
        >
          Add &amp; next
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} strokeWidth={2.6} />}
          Add task
        </button>
      </div>
    </form>
  );
}
