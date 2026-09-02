"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Plus, X } from "lucide-react";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  APPROVAL_STATUSES,
  type TaskPriority,
  type ApprovalStatus,
  type TaskRecurrence,
} from "@/db/enums";
import {
  editTaskFields,
  setTaskApprovalStatus,
  setTaskRevisedTargetDate,
} from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { ScheduleSection, type ScheduleValue } from "./schedule-section";
import { ClientSelect } from "./client-select";
import { SubjectSelect } from "./subject-select";
import { Select } from "@/components/ui/select";

interface Props {
  taskId: string;
  /** Client roster for the "Client Name" picker, alphabetical. */
  clients: string[];
  /** Subject roster for the "Subject" picker, alphabetical. */
  subjects: string[];
  /** Project tree nodes for the optional Project link. */
  projectNodes?: { id: string; label: string }[];
  initial: {
    title: string;
    description: string | null;
    subject: string | null;
    notes: string | null;
    priority: TaskPriority;
    dueAt: Date;
    // Tier-3 (2026-05-20) additions:
    tags: string[] | null;
    approvalStatus: ApprovalStatus | null;
    revisedTargetDate: Date | null;
    // Tier-4 (2026-05-20) — GCal-style scheduling.
    startsAt: Date | null;
    endsAt: Date | null;
    allDay: boolean;
    recurrence: TaskRecurrence | null;
    recurrenceRule: string | null;
    projectNodeId: string | null;
  };
  /** Used for the optimistic-lock — must be the row's current updated_at. */
  expectedUpdatedAt: string;
  /** Admin-only fields (approval status + revised target date) gated on this. */
  isAdmin: boolean;
  onCancel: () => void;
}

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  approved: "Approved",
  not_approved: "Not Approved",
  cancelled: "Cancelled",
  transferred: "Transferred",
};

/** Pretty field with on-focus underline + soft shadow (cyan brand voice). */
function FieldShell({
  label,
  htmlFor,
  required,
  children,
  focused,
  setFocused,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  focused: boolean;
  setFocused: (b: boolean) => void;
  children: (focusProps: {
    onFocus: () => void;
    onBlur: () => void;
  }) => React.ReactNode;
}) {
  return (
    <div className="relative">
      <label
        htmlFor={htmlFor}
        className="block text-[14px] font-bold text-ink-strong mb-1.5"
        style={{ letterSpacing: "-0.005em" }}
      >
        {label}
        {required && (
          <span className="ml-1" style={{ color: "rgb(168, 4, 0)" }}>
            *
          </span>
        )}
      </label>
      {children({
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
      })}
      <span
        aria-hidden
        className="block h-[1.5px] mt-px rounded-full"
        style={{
          background:
            "linear-gradient(90deg, rgb(225, 6, 0), rgb(168, 4, 0))",
          transform: focused ? "scaleX(1)" : "scaleX(0)",
          transformOrigin: "left center",
          transition: "transform 380ms cubic-bezier(0.2, 0.7, 0.3, 1)",
        }}
      />
    </div>
  );
}

export function TaskEditForm({
  taskId,
  clients,
  subjects,
  projectNodes = [],
  initial,
  expectedUpdatedAt,
  isAdmin,
  onCancel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(initial.title);
  const [description, setDesc] = useState(initial.description ?? "");
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [projectNodeId, setProjectNodeId] = useState(initial.projectNodeId ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [priority, setPriority] = useState<TaskPriority>(initial.priority);
  const [dueAt, setDueAt] = useState(
    initial.dueAt.toISOString().slice(0, 10),
  );
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [schedule, setSchedule] = useState<ScheduleValue>({
    startsAt: initial.startsAt,
    endsAt: initial.endsAt,
    allDay: initial.allDay,
    recurrence: initial.recurrence,
    recurrenceRule: initial.recurrenceRule,
  });

  // Admin-only state.
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | "">(
    initial.approvalStatus ?? "",
  );
  const [revisedTargetDate, setRevisedTargetDate] = useState(
    initial.revisedTargetDate
      ? initial.revisedTargetDate.toISOString().slice(0, 10)
      : "",
  );

  const [error, setError] = useState<string | null>(null);

  // Focus state per field — drives the underline animation.
  const [fTitle, setFTitle] = useState(false);
  const [fPrio, setFPrio] = useState(false);
  const [fDue, setFDue] = useState(false);
  const [fSubj, setFSubj] = useState(false);
  const [fDesc, setFDesc] = useState(false);
  const [fNotes, setFNotes] = useState(false);
  const [fTags, setFTags] = useState(false);
  const [fApproval, setFApproval] = useState(false);
  const [fRevised, setFRevised] = useState(false);

  function commitTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(idx: number) {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const dueIso = new Date(`${dueAt}T12:00:00.000Z`).toISOString();
    const pendingTag = tagInput.trim();
    const finalTags =
      pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    const initialApprovalStatus = initial.approvalStatus ?? "";
    const initialRevisedIso = initial.revisedTargetDate
      ? initial.revisedTargetDate.toISOString().slice(0, 10)
      : "";

    startTransition(async () => {
      // 1. Always run the editable-fields update (the most common path).
      const result = await editTaskFields(
        taskId,
        {
          title,
          description: description === "" ? null : description,
          subject: subject === "" ? null : subject,
          notes: notes === "" ? null : notes,
          priority,
          dueAt: dueIso,
          tags: finalTags.length > 0 ? finalTags : null,
          // Tier-4 — scheduling fields. Ship the ISO string or null.
          startsAt: schedule.startsAt ? schedule.startsAt.toISOString() : null,
          endsAt: schedule.endsAt ? schedule.endsAt.toISOString() : null,
          allDay: schedule.allDay,
          recurrence: schedule.recurrence,
          recurrenceRule: schedule.recurrenceRule,
          projectNodeId: projectNodeId || null,
        },
        expectedUpdatedAt,
      );
      if (!result.ok) {
        if (result.error === "stale") {
          setError(
            "This task was changed by someone else. Reload to see the latest version.",
          );
        } else if (result.error === "forbidden") {
          setError("You don't have permission to edit this task.");
        } else if (result.error === "not-found") {
          setError("Task no longer exists.");
        } else {
          setError(result.message ?? "Validation failed.");
        }
        return;
      }

      // 2. If admin, persist any approval-status / revised-target changes
      //    through their separate Server Actions. Each is a no-op when
      //    unchanged.
      if (isAdmin) {
        if (approvalStatus !== initialApprovalStatus) {
          const aRes = await setTaskApprovalStatus(taskId, {
            approvalStatus: approvalStatus === "" ? null : approvalStatus,
          });
          if (!aRes.ok) {
            setError(aRes.message ?? "Failed to set approval status.");
            return;
          }
        }
        if (revisedTargetDate !== initialRevisedIso) {
          const rRes = await setTaskRevisedTargetDate(taskId, {
            revisedTargetDate:
              revisedTargetDate === ""
                ? null
                : new Date(
                    `${revisedTargetDate}T12:00:00.000Z`,
                  ).toISOString(),
          });
          if (!rRes.ok) {
            setError(rRes.message ?? "Failed to set revised target date.");
            return;
          }
        }
      }

      fireToast({ message: "Task updated." });
      onCancel();
      router.refresh();
    });
  }

  const inputClass =
    "w-full rounded-lg border border-hairline px-3.5 py-3 text-[15px] bg-white outline-none transition-shadow focus:border-[rgba(225, 6, 0,0.55)] focus:shadow-[0_0_0_4px_rgba(225, 6, 0,0.10)]";

  return (
    <motion.form
      onSubmit={onSubmit}
      className="grid grid-cols-1 gap-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24 }}
    >
      <FieldShell
        label="Client Name"
        htmlFor="te-title"
        required
        focused={fTitle}
        setFocused={setFTitle}
      >
        {(p) => (
          <ClientSelect
            id="te-title"
            required
            value={title}
            onChange={setTitle}
            clients={clients}
            className={inputClass}
            {...p}
          />
        )}
      </FieldShell>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <FieldShell
          label="Priority"
          htmlFor="te-priority"
          focused={fPrio}
          setFocused={setFPrio}
        >
          {(p) => (
            <Select
              id="te-priority"
              value={priority}
              onValueChange={(v) => setPriority(v as TaskPriority)}
              onFocus={p.onFocus}
              onBlur={p.onBlur}
              options={TASK_PRIORITIES.map((pr) => ({ value: pr, label: PRIORITY_LABELS[pr] }))}
            />
          )}
        </FieldShell>
        <FieldShell
          label="Due Date"
          htmlFor="te-due"
          required
          focused={fDue}
          setFocused={setFDue}
        >
          {(p) => (
            <input
              id="te-due"
              type="date"
              required
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className={inputClass}
              {...p}
            />
          )}
        </FieldShell>
      </div>

      <FieldShell
        label="Subject"
        htmlFor="te-subject"
        focused={fSubj}
        setFocused={setFSubj}
      >
        {(p) => (
          <SubjectSelect
            id="te-subject"
            value={subject}
            onChange={setSubject}
            subjects={subjects}
            className={inputClass}
            placeholder="Select a subject…"
            {...p}
          />
        )}
      </FieldShell>

      <FieldShell
        label="Task Description"
        htmlFor="te-desc"
        focused={fDesc}
        setFocused={setFDesc}
      >
        {(p) => (
          <textarea
            id="te-desc"
            rows={3}
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            className={`${inputClass} resize-y`}
            {...p}
          />
        )}
      </FieldShell>

      <FieldShell
        label="Initiator Notes"
        htmlFor="te-notes"
        focused={fNotes}
        setFocused={setFNotes}
      >
        {(p) => (
          <textarea
            id="te-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} resize-y`}
            {...p}
          />
        )}
      </FieldShell>

      {/* Tags — comma/Enter to commit a chip; click X to remove. */}
      <FieldShell
        label={`Tags${tags.length > 0 ? ` · ${tags.length}` : ""}`}
        htmlFor="te-tags"
        focused={fTags}
        setFocused={setFTags}
      >
        {(p) => (
          <div
            className="flex flex-wrap items-center gap-1.5"
            onClick={() => document.getElementById("te-tags")?.focus()}
            style={{
              minHeight: 48,
              padding: "10px 12px",
              border: "1px solid var(--color-hairline)",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            {tags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1"
                style={{
                  background: "var(--vp-cyan-tint)",
                  color: "rgb(var(--vp-cyan-deep))",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {t}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(i);
                  }}
                  aria-label={`Remove tag ${t}`}
                  className="inline-flex items-center justify-center"
                  style={{ width: 16, height: 16 }}
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </span>
            ))}
            <input
              id="te-tags"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onFocus={p.onFocus}
              onBlur={p.onBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTag();
                } else if (
                  e.key === "Backspace" &&
                  tagInput === "" &&
                  tags.length > 0
                ) {
                  removeTag(tags.length - 1);
                }
              }}
              placeholder={
                tags.length === 0
                  ? "Type and press Enter or comma…"
                  : "Add another…"
              }
              className="flex-1 min-w-[140px] bg-transparent outline-none text-[14px]"
            />
          </div>
        )}
      </FieldShell>

      {/* Project link — connect this task to a Project / Milestone / Result. */}
      {projectNodes.length > 0 && (
        <FieldShell label="Project" htmlFor="te-project" focused={false} setFocused={() => {}}>
          {(p) => (
            <Select
              id="te-project"
              value={projectNodeId}
              onValueChange={setProjectNodeId}
              onFocus={p.onFocus}
              onBlur={p.onBlur}
              options={[
                { value: "", label: "Not linked to a project" },
                ...projectNodes.map((n) => ({ value: n.id, label: n.label })),
              ]}
            />
          )}
        </FieldShell>
      )}

      {/* Schedule — GCal-style start/end + recurrence. Internal only. */}
      <ScheduleSection value={schedule} onChange={setSchedule} />

      {isAdmin && (
        <div
          className="rounded-lg p-4 grid grid-cols-2 gap-3 max-md:grid-cols-1"
          style={{
            background: "var(--vp-cyan-tint)",
            border: "1px solid rgba(225, 6, 0, 0.32)",
          }}
        >
          <div className="col-span-2 -mb-1">
            <span
              className="inline-flex items-center gap-1.5 uppercase tracking-[0.10em] font-bold"
              style={{
                fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                fontSize: 11,
                color: "rgb(var(--vp-cyan-deep))",
              }}
            >
              <Plus size={12} strokeWidth={2.6} />
              Admin only
            </span>
          </div>
          <FieldShell
            label="Approval Status"
            htmlFor="te-approval"
            focused={fApproval}
            setFocused={setFApproval}
          >
            {(p) => (
              <Select
                id="te-approval"
                value={approvalStatus}
                onValueChange={(v) => setApprovalStatus(v as ApprovalStatus | "")}
                onFocus={p.onFocus}
                onBlur={p.onBlur}
                options={[
                  { value: "", label: "No verdict" },
                  ...APPROVAL_STATUSES.map((s) => ({ value: s, label: APPROVAL_LABEL[s] })),
                ]}
              />
            )}
          </FieldShell>
          <FieldShell
            label="Revised Target Date"
            htmlFor="te-revised"
            focused={fRevised}
            setFocused={setFRevised}
          >
            {(p) => (
              <input
                id="te-revised"
                type="date"
                value={revisedTargetDate}
                onChange={(e) => setRevisedTargetDate(e.target.value)}
                className={inputClass}
                {...p}
              />
            )}
          </FieldShell>
        </div>
      )}

      {error && (
        <p
          className="text-[14px] rounded-md px-3.5 py-2.5"
          style={{
            color: "var(--color-red-deep)",
            background: "var(--color-red-bg)",
            border:
              "1px solid color-mix(in srgb, var(--color-red) 25%, transparent)",
          }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-5 py-2.5 rounded-lg text-[14px] font-medium border border-hairline bg-white text-ink-strong hover:bg-surface-soft disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-[14px] font-semibold text-white disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgb(244, 85, 77), rgb(225, 6, 0) 45%, rgb(168, 4, 0))",
            boxShadow: "0 8px 20px -10px rgba(225, 6, 0, 0.55)",
          }}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </motion.form>
  );
}
