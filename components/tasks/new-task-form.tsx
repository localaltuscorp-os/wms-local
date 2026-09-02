"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Link2, Plus, X, FileImage, Check } from "lucide-react";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  type TaskPriority,
  type TaskRecurrence,
} from "@/db/enums";
import { createTask } from "@/app/(app)/tasks/actions";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ScheduleSection, type ScheduleValue } from "./schedule-section";
import { ClientSelect } from "./client-select";
import { SubjectSelect } from "./subject-select";
import { Select } from "@/components/ui/select";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type EmployeeOption = { id: string; name: string };

interface Props {
  employees: EmployeeOption[];
  /** Client roster for the "Client Name" picker, alphabetical. */
  clients: string[];
  /** Subject roster for the "Subject" picker, alphabetical. */
  subjects: string[];
  /** Project tree nodes (path-labelled) for the optional Project link. */
  projectNodes?: { id: string; label: string }[];
  /**
   * May this user add a NEW client / subject from the pickers? Admin only
   * (Sir). Defaults to false, so a caller that forgets it hides the affordance
   * rather than offering an action quickAddClient/quickAddSubject will refuse.
   */
  canAddRoster?: boolean;
  /** Called after a successful create. Default: navigate to /tasks/[id]. */
  onSuccess?: (taskId: string) => void;
  /** Optional defaults for the form (used by the canonical route + the
   *  Duplicate action, which prefills from an existing task). */
  defaults?: {
    doerId?: string;
    initiatorId?: string;
    priority?: TaskPriority;
    title?: string;
    subject?: string;
    description?: string;
    notes?: string;
    projectNodeId?: string;
  };
}

const DEFAULT_PRIORITY: TaskPriority = "not_imp_not_urgent";
const MEDIA_SLOT_COUNT = 4;

// react-hook-form + zod own the validated core fields. Complex/auxiliary
// widgets (tags, schedule, media, links) stay in local state and are folded
// into the payload at submit — same shape createTask has always received.
const NewTaskSchema = z.object({
  title: z.string().trim().min(1, "Client name is required"),
  initiatorId: z.string().min(1, "Initiator is required"),
  doerIds: z.array(z.string()).min(1, "Pick at least one Doer"),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.string().min(1, "Due date is required"),
  subject: z.string().trim().min(1, "Subject is required"),
  description: z.string().trim().min(1, "Task Description is required"),
  notes: z.string(),
  projectNodeId: z.string(),
});
type NewTaskFormValues = z.infer<typeof NewTaskSchema>;

// Media slots are UI-only for now — files live in component state and
// aren't uploaded anywhere. The Links section is wired: URLs get
// appended to the `notes` payload on submit ("Links:\n- ..."), so they
// survive into the task record without needing a new column.
interface PreviewFile {
  file: File;
  url: string;
}

export function NewTaskForm({ employees, clients, subjects, projectNodes = [], canAddRoster = false, onSuccess, defaults }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // Default due: 1 day after the entry date.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const {
    register,
    control,
    handleSubmit,
    // `watch` is deliberately NOT destructured: calling it in this component
    // re-subscribes the whole form to every keystroke. Use `useWatch` in a leaf
    // (see DoerCountLabel) if another field's value is needed for display.
    setValue,
    getValues,
    formState: { errors },
  } = useForm<NewTaskFormValues>({
    resolver: zodResolver(NewTaskSchema),
    defaultValues: {
      title: defaults?.title ?? "",
      initiatorId: defaults?.initiatorId ?? "",
      doerIds: defaults?.doerId ? [defaults.doerId] : [],
      priority: defaults?.priority ?? DEFAULT_PRIORITY,
      dueAt: tomorrow,
      subject: defaults?.subject ?? "",
      description: defaults?.description ?? "",
      notes: defaults?.notes ?? "",
      projectNodeId: defaults?.projectNodeId ?? "",
    },
  });

  // Auxiliary widgets — local state, folded into the payload at submit.
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [schedule, setSchedule] = React.useState<ScheduleValue>({
    startsAt: null,
    endsAt: null,
    allDay: false,
    recurrence: null,
    recurrenceRule: null,
  });
  const [media, setMedia] = React.useState<PreviewFile[]>([]);
  const [linkInput, setLinkInput] = React.useState("");
  const [links, setLinks] = React.useState<string[]>([]);
  // Server-side error from createTask (field validation is handled by RHF/zod).
  const [error, setError] = React.useState<string | null>(null);

  // `watch("doerIds")` USED TO LIVE HERE, and it was the typing lag.
  //
  // RHF's `watch()` subscribes the component it is called in to EVERY field
  // change, not just the named one. Description and Notes are `register()`ed
  // (uncontrolled, no re-render of their own), but this single call meant every
  // keystroke re-rendered the whole 1,300-line form — twenty-odd Controllers,
  // the employee multi-select, the schedule block and the media grid included.
  //
  // The count is now read by <DoerCountLabel>, a leaf that subscribes via
  // `useWatch`; only that label re-renders when the doer list changes.
  const tagsCount = tags.length;

  // Release object-URLs the moment the dialog tears down so we don't
  // leak blobs into the document for the rest of the session.
  React.useEffect(() => {
    return () => {
      media.forEach((m) => URL.revokeObjectURL(m.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MEDIA_SLOT_COUNT - media.length;
    if (remaining <= 0) return;
    const next: PreviewFile[] = [];
    for (let i = 0; i < files.length && next.length < remaining; i++) {
      const f = files[i]!;
      if (!f.type.startsWith("image/")) continue;
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setMedia((prev) => [...prev, ...next]);
  }

  function removeMedia(idx: number) {
    setMedia((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function addLink() {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    if (links.includes(trimmed)) {
      setLinkInput("");
      return;
    }
    setLinks((prev) => [...prev, trimmed]);
    setLinkInput("");
  }

  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  const submit = handleSubmit((values) => {
    setError(null);
    // The <input type="date"> gives YYYY-MM-DD; convert to ISO at noon UTC
    // so timezone wrap-arounds don't push the due into the wrong day.
    const dueIso = new Date(`${values.dueAt}T12:00:00.000Z`).toISOString();

    // Stamp link URLs onto the notes payload — they survive into the task
    // record so the team can click through later. Media files are UI-only.
    const linksBlock =
      links.length > 0
        ? `\n\nLinks:\n${links.map((l) => `- ${l}`).join("\n")}`
        : "";
    const composedNotes = (values.notes + linksBlock).trim() || null;

    // Commit any pending tag text the user hasn't pressed Enter on yet.
    const pendingTag = tagInput.trim();
    const finalTags =
      pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    startTransition(async () => {
      const result = await createTask({
        title: values.title,
        doerIds: values.doerIds,       // multi-doer fanout — N tasks if N doers
        initiatorId: values.initiatorId,
        priority: values.priority,
        dueAt: dueIso,
        description: values.description || null,
        subject: values.subject || null,
        notes: composedNotes,
        tags: finalTags.length > 0 ? finalTags : null,
        // Tier-4 — GCal-style scheduling. All fields nullable; only ship
        // values when the user actually filled in the Schedule section.
        startsAt: schedule.startsAt ? schedule.startsAt.toISOString() : null,
        endsAt: schedule.endsAt ? schedule.endsAt.toISOString() : null,
        allDay: schedule.allDay,
        recurrence: schedule.recurrence,
        recurrenceRule: schedule.recurrenceRule,
        projectNodeId: values.projectNodeId || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Single doer → land on the task's detail page. Multi-doer fanout →
      // land on the filtered task list (showing the freshly-minted batch).
      if (onSuccess) onSuccess(result.id);
      else if (result.ids.length === 1) {
        router.push(`/tasks/${result.id}` as Route);
      } else {
        router.push("/tasks" as Route);
      }
    });
  });

  function commitTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function removeTag(idx: number) {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  }

  // Keyboard-first: land the cursor on the first field (Client Name) the
  // moment the form mounts. The New Task dialog already does this via
  // Radix's onOpenAutoFocus; this covers the /tasks/new page route. Skipped
  // if the user has already focused something (never steal focus).
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      document.getElementById("nt-title")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        // ⌘/Ctrl + Enter submits from anywhere in the form.
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void submit();
        }
      }}
      // gap-3 (12px) between every top-level block. At gap-4 the five numbered
      // strata plus their fields ran past the modal's scroll height on a laptop;
      // the 38px fields need less air around them than the old 56px ones did.
      className="ntx-form flex flex-col gap-3"
      noValidate
    >
      {/* Scoped brand override — WMS is Altus RED: re-tint the shared
          .nt-input focus ring (cyan in globals.css, which other modules
          still use) to brand red within this form only. Style-only. */}
      <style>{`
        .ntx-form .nt-input:focus,
        .ntx-form .nt-input:focus-visible,
        .ntx-form .nt-input:focus-within {
          border-color: color-mix(in srgb, var(--color-altus-red) 55%, #ffffff);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.95),
            0 0 0 3px color-mix(in srgb, var(--color-altus-red) 13%, transparent),
            0 4px 10px -4px rgba(15, 23, 42, 0.12);
        }
      `}</style>

      <SectionHeading step="01" title="Basics" hint="Who this is for" />
      {/* Client + Subject — paired top row (was two stretched full-width fields).
          items-start so each field keeps its own resting height (the comboboxes
          don't stretch to match a taller row-mate). */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 items-start max-md:grid-cols-1 max-md:gap-3">
        <Field id="nt-title" label="Client Name" required>
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <ClientSelect
                id="nt-title"
                value={field.value}
                onChange={field.onChange}
                clients={clients}
                canAdd={canAddRoster}
                className="nt-input"
              />
            )}
          />
        </Field>
        <Field id="nt-subject" label="Subject" required>
          <Controller
            control={control}
            name="subject"
            render={({ field }) => (
              <SubjectSelect
                id="nt-subject"
                value={field.value}
                onChange={field.onChange}
                subjects={subjects}
                canAdd={canAddRoster}
                className="nt-input"
                placeholder="Select a subject…"
              />
            )}
          />
        </Field>
      </div>

      <SectionHeading step="02" title="Assignment" hint="Owners, priority & deadline" />
      {/* Metadata — two balanced rows (Initiator · Doer / Priority · Due
          Date). The old 4-across row squeezed each field to ~170px: the
          multi-doer chips grew an inner scrollbox and the date input
          clipped its own value. Two columns give every field real room;
          1-col under md. items-start so the Doer field growing downward with
          chips doesn't stretch its fixed-height row-mate (Initiator/Priority).
          Column gap stays 16px (the fields need side-by-side separation); only
          the ROW gap tightens to 12px, matching the form's own gap-3. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 items-start max-md:grid-cols-1 max-md:gap-3">
        <Field id="nt-initiator" label="Initiator" required>
          <Controller
            control={control}
            name="initiatorId"
            render={({ field }) => (
              <Select
                id="nt-initiator"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                placeholder="Select an employee…"
                searchPlaceholder="Search employees…"
                searchable
                // Match the .nt-input look (gradient + shadow border) so the
                // Initiator/Priority fields are visually identical to Client/Subject.
                unstyled
                className="nt-input"
                options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
              />
            )}
          />
        </Field>
        <Field
          id="nt-doer"
          label={<DoerCountLabel control={control} />}
          required
        >
          <Controller
            control={control}
            name="doerIds"
            render={({ field }) => (
              <DoerMultiSelect
                employees={employees}
                selected={field.value}
                onToggle={(id) =>
                  field.onChange(
                    field.value.includes(id)
                      ? field.value.filter((d) => d !== id)
                      : [...field.value, id],
                  )
                }
              />
            )}
          />
        </Field>
        <Field id="nt-priority" label="Priority">
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select
                id="nt-priority"
                value={field.value}
                onValueChange={field.onChange}
                unstyled
                className="nt-input"
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
              />
            )}
          />
        </Field>
        <Field id="nt-due" label="Due Date" required>
          <input id="nt-due" type="date" className="nt-input" {...register("dueAt")} />
        </Field>
      </div>

      <SectionHeading step="03" title="Details" hint="The work itself" />
      {/* Task Description · Initiator Notes — full-width textareas, each with a
          mic that records a voice note → Gemini transcript appended to the field. */}
      <Field
        id="nt-desc"
        label="Task Description"
        required
        action={
          <VoiceNoteButton
            label="Dictate"
            onText={(t) => {
              const cur = getValues("description");
              setValue("description", (cur ? cur.trimEnd() + " " : "") + t, { shouldValidate: true, shouldDirty: true });
            }}
          />
        }
      >
        <textarea
          id="nt-desc"
          rows={3}
          className="nt-input min-h-[80px] resize-y"
          style={{ fontWeight: 400 }}
          placeholder="What needs to happen, in detail…"
          {...register("description")}
        />
      </Field>

      <Field
        id="nt-notes"
        label="Initiator Notes"
        action={
          <VoiceNoteButton
            label="Dictate"
            onText={(t) => {
              const cur = getValues("notes");
              setValue("notes", (cur ? cur.trimEnd() + " " : "") + t, { shouldDirty: true });
            }}
          />
        }
      >
        <textarea
          id="nt-notes"
          rows={3}
          className="nt-input min-h-[80px] resize-y"
          style={{ fontWeight: 400 }}
          placeholder="Notes only the team sees…"
          {...register("notes")}
        />
      </Field>

      <SectionHeading step="04" title="Organize" hint="Optional — tags, project & schedule" />
      {/* Tags — free-form chips. Type a tag, hit Enter or comma to commit.
          Stored as text[] on the task; each chip is searchable later. */}
      <Field id="nt-tags" label={`Tags${tagsCount > 0 ? ` · ${tagsCount}` : ""}`}>
        <TagsInput
          id="nt-tags"
          tags={tags}
          input={tagInput}
          onInputChange={setTagInput}
          onCommit={commitTag}
          onRemove={removeTag}
        />
      </Field>

      {/* Project link — optional connection to a Project / Milestone / Result. */}
      {projectNodes.length > 0 && (
        <Field id="nt-project" label="Project">
          <Controller
            control={control}
            name="projectNodeId"
            render={({ field }) => (
              <Select
                id="nt-project"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                unstyled
                className="nt-input"
                options={[
                  { value: "", label: "Not linked to a project" },
                  ...projectNodes.map((n) => ({ value: n.id, label: n.label })),
                ]}
              />
            )}
          />
        </Field>
      )}

      {/* Schedule — GCal-style start/end + recurrence. Internal metadata
          only; not synced to any actual calendar API. */}
      <ScheduleSection value={schedule} onChange={setSchedule} />

      <SectionHeading step="05" title="Attachments" hint="Optional — media & reference links" />
      {/* Media + Links — side by side on desktop */}
      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <MediaSection
          media={media}
          onAdd={addFiles}
          onRemove={removeMedia}
        />
        <LinksSection
          links={links}
          input={linkInput}
          onInputChange={setLinkInput}
          onAdd={addLink}
          onRemove={removeLink}
        />
      </div>

      {(error || Object.values(errors)[0]?.message) && (
        <p
          className="font-semibold"
          style={{ fontSize: 14, color: "var(--color-red-deep)" }}
        >
          {error ?? (Object.values(errors)[0]?.message as string)}
        </p>
      )}

      <div
        className="flex items-center justify-between gap-4 pt-5 max-md:flex-col max-md:items-stretch"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <span className="text-[13.5px] text-ink-subtle max-md:text-center">
          <kbd
            className="mx-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11.5px] font-bold"
            style={{
              background: "rgba(15, 23, 42, 0.06)",
              color: "var(--color-ink-soft)",
              boxShadow: "inset 0 -1px 0 rgba(15, 23, 42, 0.12)",
            }}
          >
            Ctrl
          </kbd>
          +
          <kbd
            className="mx-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11.5px] font-bold"
            style={{
              background: "rgba(15, 23, 42, 0.06)",
              color: "var(--color-ink-soft)",
              boxShadow: "inset 0 -1px 0 rgba(15, 23, 42, 0.12)",
            }}
          >
            ↵
          </kbd>{" "}
          creates from anywhere in the form
        </span>
        <button
          type="submit"
          disabled={pending}
          className="wg-btn wg-sheen text-cta text-white px-9 py-4 rounded-chip disabled:opacity-50 max-md:w-full"
          style={{
            background:
              "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
            boxShadow:
              "0 8px 20px -6px rgba(225, 6, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
        >
          {pending ? "Creating…" : "Create Task"}
        </button>
      </div>
    </form>
  );
}

/**
 * Numbered section heading — pure presentation. Mono step chip in brand
 * red, display-weight title, right-aligned hint. Groups the long form into
 * scannable strata without nesting card-in-card chrome.
 */
function SectionHeading({
  step,
  title,
  hint,
}: {
  step: string;
  title: string;
  hint?: string;
}) {
  return (
    // pt-1.5/pb-2 ≈ py-3 across the divider — the numbered rule reads as a
    // separator with air on both sides without the 24px band it used to sit in.
    <div className="flex items-center gap-3 border-b border-hairline pt-1.5 pb-2">
      <span
        aria-hidden
        className="inline-flex size-6 items-center justify-center rounded-md font-mono text-[11px] font-bold tabular-nums"
        style={{
          background:
            "color-mix(in srgb, var(--color-altus-red) 8%, #ffffff)",
          color: "var(--color-altus-red-deep)",
          border:
            "1px solid color-mix(in srgb, var(--color-altus-red) 20%, transparent)",
        }}
      >
        {step}
      </span>
      <span
        className="text-ink-strong uppercase"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 15,
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </span>
      {hint && (
        <span className="ml-auto text-[13px] text-ink-subtle max-md:hidden">
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Multi-select dropdown for Doer. Each pick adds a chip; submitting the
 * form creates one task per selected doer (the action fans out server-side).
 *
 * Styled to read the same as the .nt-input single-line inputs above it so
 * the row stays visually balanced.
 */
function DoerMultiSelect({
  employees,
  selected,
  onToggle,
}: {
  employees: EmployeeOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0); // highlighted option index
  const ref = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const byId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, query]);

  // Keep the highlight in range, and scroll it into view as it moves.
  React.useEffect(() => {
    setHi((h) => Math.min(h, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  React.useEffect(() => {
    if (!open) return;
    (listRef.current?.children[hi] as HTMLElement | undefined)?.scrollIntoView({
      block: "nearest",
    });
  }, [hi, open]);

  // Toggle a doer, clear the query, and keep the input focused so you can
  // type the next name — fully keyboard-driven, no trackpad needed.
  function commit(id: string | undefined, refocus = true) {
    if (!id) return;
    onToggle(id);
    setQuery("");
    setHi(0);
    // On Tab we deliberately skip the refocus so the browser's default
    // Tab can carry focus on to the next field (Priority).
    if (refocus) inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // Enter picks the highlighted match (or the only match) and keeps the
      // field focused so you can add another doer. Never submits the form.
      e.preventDefault();
      if (filtered.length > 0) commit(filtered[hi]?.id ?? filtered[0]?.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      // Tab also confirms the highlighted match (so typing "Mis" + Tab picks
      // "Mishtie Kanani"), then lets focus move on to the next field. Only
      // when something is typed AND there's a match — an empty field just
      // tabs through.
      if (query.trim() !== "" && filtered.length > 0) {
        commit(filtered[hi]?.id ?? filtered[0]?.id, /* refocus */ false);
      }
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      onToggle(selected[selected.length - 1]!); // remove the last picked doer
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Combobox control: Tab lands in the input, type to filter, ↑/↓ + Enter
          to pick, Tab to move on. Chips + input share the field; the dropdown is
          a portalled Popover so it floats above the form, not over the fields. */}
      <PopoverAnchor asChild>
        <div
          ref={ref}
          // CAPPED at two rows of chips, then scrolls. It used to grow without
          // limit, which pushed the rest of the modal down the page as doers
          // were added — the thing this refactor is meant to stop.
          //
          // The cap is 88px, not the 40px (`max-h-10`) originally specified:
          // .nt-input rests at 56px to line up with Initiator / Priority / Due
          // Date beside it, so a 40px cap would make this field SHORTER than
          // its siblings and clip even one row of chips. 88px ≈ two rows, which
          // covers the common case with no scrollbar at all.
          className="nt-input flex flex-wrap items-center gap-1.5 overflow-y-auto cursor-text"
          // Tracks .nt-input's 38px so this field lines up with Initiator /
          // Priority / Due Date beside it. 62px ≈ two rows of h-6 chips,
          // then it scrolls rather than pushing the modal down the page.
          style={{ minHeight: 38, maxHeight: 62 }}
          onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("[data-chip-remove]") || t === inputRef.current) return;
          e.preventDefault();
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {selected.map((id) => {
          const name = byId.get(id) ?? "Unknown";
          return (
            <span
              key={id}
              className="inline-flex h-6 items-center gap-1 rounded-pill px-2 py-0.5 text-xs"
              style={{
                background: "color-mix(in srgb, var(--color-altus-red) 7%, #ffffff)",
                color: "var(--color-altus-red-deep)",
                fontWeight: 700,
              }}
            >
              <EmployeeAvatar name={name} size="xs" />
              {name}
              <button
                type="button"
                data-chip-remove
                tabIndex={-1}
                aria-label={`Remove ${name}`}
                onClick={() => onToggle(id)}
                className="inline-flex items-center justify-center"
                style={{ width: 14, height: 14, borderRadius: 999 }}
              >
                <X size={12} strokeWidth={2.6} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? "Type a name…" : ""}
          className="flex-1 min-w-[90px] bg-transparent outline-none"
          // 14px matches .nt-input's own type; at 15px this inner input set the
          // line box taller than the 38px shell and pushed the chips off-centre.
          style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink-strong)", padding: 0 }}
        />
        <span
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 160ms ease",
            color: "var(--color-ink-muted)",
          }}
        >
          ▾
        </span>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        // THE fix for the "Doer dropdown won't close / Tab won't advance" bug:
        // Radix restores focus to the anchored input on close, which re-fires
        // its onFocus → setOpen(true) (reopen loop) and blocks Tab. The Tab
        // handler already commits + setOpen(false); preventing the focus
        // restore lets the menu stay closed and focus move on to Priority.
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (ref.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[14rem] overflow-hidden"
      >
          <ul
            ref={listRef}
            role="listbox"
            aria-multiselectable
            className="max-h-[240px] overflow-y-auto overscroll-contain py-1"
          >
          {employees.length === 0 ? (
            <li
              className="px-3 py-2.5 font-semibold"
              style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
            >
              No employees available.
            </li>
          ) : filtered.length === 0 ? (
            <li
              className="px-3 py-2.5 font-semibold"
              style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
            >
              No match for “{query}”.
            </li>
          ) : (
            filtered.map((emp, i) => {
              const isSel = selected.includes(emp.id);
              const isHi = i === hi;
              return (
                <li
                  key={emp.id}
                  role="option"
                  aria-selected={isSel}
                  // preventDefault on mousedown keeps the input focused so a
                  // click doesn't blur-close the menu before the toggle lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  // A mouse pick selects the doer and CLOSES the menu (click the
                  // field again to add another). Keyboard Enter still keeps it
                  // open for rapid multi-add.
                  onClick={() => { commit(emp.id, false); setOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors"
                  style={{
                    background: isSel
                      ? "color-mix(in srgb, var(--color-altus-red) 7%, #ffffff)"
                      : isHi
                        ? "var(--color-surface-soft)"
                        : "transparent",
                  }}
                >
                  <EmployeeAvatar name={emp.name} size="xs" />
                  <span
                    className="flex-1 font-semibold"
                    style={{
                      fontSize: 14,
                      color: "var(--color-ink-strong)",
                    }}
                  >
                    {emp.name}
                  </span>
                  {isSel && (
                    <Check
                      size={16}
                      strokeWidth={2.6}
                      style={{ color: "var(--color-altus-red-deep)" }}
                    />
                  )}
                </li>
              );
            })
          )}
          </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Tag-chip input. Press Enter or comma to commit the pending text into a
 * chip. Backspace on an empty input removes the last chip. Chips stored
 * client-side in `tags: string[]` and shipped to the action.
 */
function TagsInput({
  id,
  tags,
  input,
  onInputChange,
  onCommit,
  onRemove,
}: {
  id: string;
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onCommit: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div
      className="nt-input flex flex-wrap items-center gap-1.5"
      // Tracks .nt-input (38px). It used to override the padding back to
      // 10px and pin minHeight at 56, which is what made this box taller
      // than the fields beside it.
      style={{ minHeight: 38 }}
      onClick={() => document.getElementById(id)?.focus()}
    >
      {tags.map((t, i) => (
        // Same chip box as the Doer field's: h-6 / px-2 / py-0.5 / 12px. A tag
        // and a doer sit in identically-sized shells so neither field's height
        // drifts from the other's.
        <span
          key={`${t}-${i}`}
          className="inline-flex h-6 items-center gap-1 rounded-pill px-2 py-0.5 text-xs"
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 7%, #ffffff)",
            color: "var(--color-altus-red-deep)",
            fontWeight: 700,
          }}
        >
          {t}
          <span
            role="button"
            aria-label={`Remove tag ${t}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
            className="inline-flex items-center justify-center"
            style={{ width: 14, height: 14, borderRadius: 999 }}
          >
            <X size={12} strokeWidth={2.6} />
          </span>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
            onRemove(tags.length - 1);
          }
        }}
        placeholder={
          tags.length === 0
            ? "Type a tag and press Enter or comma to add…"
            : "Add another tag…"
        }
        className="flex-1 min-w-[180px] bg-transparent outline-none"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-ink-strong)",
          border: "none",
          padding: 0,
        }}
      />
    </div>
  );
}

/**
 * The Doer field's label, isolated so its `useWatch` subscription re-renders
 * ONLY this span. Keeping the subscription out of the form body is what makes
 * typing in Description cost one text-node update instead of a full form pass.
 */
function DoerCountLabel({ control }: { control: Control<NewTaskFormValues> }) {
  const doerIds = useWatch({ control, name: "doerIds" }) ?? [];
  const n = doerIds.length;
  return <>{`Doer${n > 1 ? ` · ${n} selected` : ""}`}</>;
}

function Field({
  id,
  label,
  required,
  children,
  action,
}: {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  /** Optional control rendered on the right of the label row (e.g. a mic). */
  action?: React.ReactNode;
}) {
  return (
    // gap-1 (4px) label→input, the mb-1 the density pass calls for.
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="font-bold"
          style={{
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            // 14px = text-sm, matching the .nt-input type it labels.
            fontSize: 14,
            letterSpacing: "-0.005em",
            color: "var(--color-ink-strong)",
          }}
        >
          {label}
          {required && (
            <span style={{ color: "rgb(168, 4, 0)" }}> *</span>
          )}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}

function MediaSection({
  media,
  onAdd,
  onRemove,
}: {
  media: PreviewFile[];
  onAdd: (files: FileList | null) => void;
  onRemove: (idx: number) => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div
      className="rounded-section p-5"
      style={{
        border: "1px solid var(--color-hairline)",
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-2.5 uppercase font-black tracking-[0.10em]"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 17,
            color: "var(--color-altus-red-deep)",
          }}
        >
          <ImagePlus size={22} strokeWidth={2.2} />
          Attach media
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontSize: 14,
            color: "var(--color-ink-muted)",
          }}
        >
          {media.length} / {MEDIA_SLOT_COUNT}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdd(e.target.files);
          // Reset so re-selecting the same file still fires onChange.
          if (e.target) e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onAdd(e.dataTransfer.files);
        }}
        className="grid grid-cols-4 gap-2.5 max-sm:grid-cols-2"
        style={{
          padding: 4,
          borderRadius: 12,
          background: dragOver ? "color-mix(in srgb, var(--color-altus-red) 7%, #ffffff)" : "transparent",
          transition: "background 180ms ease",
        }}
      >
        {Array.from({ length: MEDIA_SLOT_COUNT }).map((_, i) => {
          const item = media[i];
          return item ? (
            <FilledSlot
              key={`f-${item.url}`}
              url={item.url}
              name={item.file.name}
              onRemove={() => onRemove(i)}
            />
          ) : (
            <EmptySlot
              key={`e-${i}`}
              onClick={() => fileInputRef.current?.click()}
            />
          );
        })}
      </div>

      <p
        className="mt-4 font-semibold"
        style={{
          fontSize: 14,
          color: "var(--color-ink-muted)",
          lineHeight: 1.5,
        }}
      >
        Drop images anywhere in the grid, or click a slot to pick. PNG / JPG up
        to {MEDIA_SLOT_COUNT} files.
      </p>
    </div>
  );
}

function EmptySlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add image"
      className="relative aspect-square flex flex-col items-center justify-center gap-1.5 rounded-chip transition-all"
      style={{
        background:
          "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
        border: "1.5px dashed #cbd5e1",
        color: "#94a3b8",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 7%, #ffffff) 0%, #fff1f0 100%)";
        e.currentTarget.style.borderColor =
          "color-mix(in srgb, var(--color-altus-red) 55%, #ffffff)";
        e.currentTarget.style.color = "var(--color-altus-red-deep)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)";
        e.currentTarget.style.borderColor = "#cbd5e1";
        e.currentTarget.style.color = "#94a3b8";
      }}
    >
      <FileImage size={34} strokeWidth={1.8} />
      <span
        className="uppercase font-extrabold tracking-[0.10em]"
        style={{ fontSize: 12 }}
      >
        Add image
      </span>
    </button>
  );
}

function FilledSlot({
  url,
  name,
  onRemove,
}: {
  url: string;
  name: string;
  onRemove: () => void;
}) {
  return (
    <div
      className="relative aspect-square rounded-chip overflow-hidden group"
      style={{
        border:
          "1.5px solid color-mix(in srgb, var(--color-altus-red) 55%, #ffffff)",
        background: "#ffffff",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center rounded-full transition-all"
        style={{
          width: 26,
          height: 26,
          background: "rgba(15, 23, 42, 0.78)",
          color: "#ffffff",
          backdropFilter: "blur(4px)",
        }}
      >
        <X size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}

function LinksSection({
  links,
  input,
  onInputChange,
  onAdd,
  onRemove,
}: {
  links: string[];
  input: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div
      className="rounded-section p-5 flex flex-col"
      style={{
        border: "1px solid var(--color-hairline)",
        background: "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="inline-flex items-center gap-2.5 uppercase font-black tracking-[0.10em]"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 17,
            color: "var(--color-altus-red-deep)",
          }}
        >
          <Link2 size={22} strokeWidth={2.2} />
          Add links
        </span>
        <span
          className="tabular-nums font-black"
          style={{
            fontSize: 14,
            color: "var(--color-ink-muted)",
          }}
        >
          {links.length} {links.length === 1 ? "link" : "links"}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <input
          type="url"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="https://docs.example.com/borrower/4471"
          className="nt-input flex-1"
        />
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add link"
          className="inline-flex items-center justify-center rounded-chip transition-all"
          style={{
            // Square against the 38px input beside it (items-stretch sets the
            // height); at 52px it read as a slab next to the compact field.
            width: 38,
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            color: "#ffffff",
            border: "none",
            boxShadow: "0 4px 12px rgba(225, 6, 0, 0.32)",
          }}
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </div>

      {/* Link chips — wraps as more are added */}
      <ul className="mt-3 flex flex-col gap-1.5 flex-1">
        {links.length === 0 ? (
          <li
            className="flex-1 flex items-center justify-center rounded-chip"
            style={{
              minHeight: 80,
              background:
                "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
              border: "1.5px dashed #cbd5e1",
              color: "#94a3b8",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Link2 size={18} strokeWidth={2} />
              No links yet — paste a URL above.
            </span>
          </li>
        ) : (
          links.map((url, i) => (
            <li
              key={`${url}-${i}`}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-chip"
              style={{
                background: "#ffffff",
                border: "1px solid var(--color-hairline)",
              }}
            >
              <Link2
                size={16}
                strokeWidth={2.2}
                style={{ color: "var(--color-altus-red-deep)" }}
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-ink-strong font-bold"
                style={{ fontSize: 16 }}
              >
                {url}
              </a>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove link"
                className="inline-flex items-center justify-center rounded-full text-ink-subtle hover:text-ink-strong"
                style={{ width: 28, height: 28 }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
