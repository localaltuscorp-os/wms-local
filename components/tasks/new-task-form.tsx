"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useForm, Controller } from "react-hook-form";
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

export function NewTaskForm({ employees, clients, subjects, projectNodes = [], onSuccess, defaults }: Props) {
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
    watch,
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

  const doerCount = watch("doerIds").length;
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
      className="flex flex-col gap-6"
      noValidate
    >
      {/* Client Name — full width hero field (was: Title) */}
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
              className="nt-input"
            />
          )}
        />
      </Field>

      {/* Metadata — two balanced rows (Initiator · Doer / Priority · Due
          Date). The old 4-across row squeezed each field to ~170px: the
          multi-doer chips grew an inner scrollbox and the date input
          clipped its own value. Two columns give every field real room;
          1-col under md. */}
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
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
                options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
              />
            )}
          />
        </Field>
        <Field
          id="nt-doer"
          label={`Doer${doerCount > 1 ? ` · ${doerCount} selected` : ""}`}
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
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
              />
            )}
          />
        </Field>
        <Field id="nt-due" label="Due Date" required>
          <input id="nt-due" type="date" className="nt-input" {...register("dueAt")} />
        </Field>
      </div>

      {/* Subject · Task Description · Initiator Notes — each full-width
          single column, stacked top-to-bottom per spec. */}
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
              className="nt-input"
              placeholder="Select a subject…"
            />
          )}
        />
      </Field>

      <Field id="nt-desc" label="Task Description" required>
        <textarea
          id="nt-desc"
          rows={4}
          className="nt-input resize-y"
          style={{ fontWeight: 400 }}
          placeholder="What needs to happen, in detail…"
          {...register("description")}
        />
      </Field>

      <Field id="nt-notes" label="Initiator Notes">
        <textarea
          id="nt-notes"
          rows={3}
          className="nt-input resize-y"
          style={{ fontWeight: 400 }}
          placeholder="Notes only the team sees…"
          {...register("notes")}
        />
      </Field>

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
        className="flex items-center justify-end gap-3 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline)" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="text-cta text-white px-8 py-4 rounded-chip transition-transform disabled:opacity-50"
          style={{
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            boxShadow: "0 6px 16px rgba(225, 6, 0, 0.34)",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "0.005em",
          }}
          onMouseEnter={(e) => {
            if (pending) return;
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 10px 24px rgba(225, 6, 0, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 6px 16px rgba(225, 6, 0, 0.34)";
          }}
        >
          {pending ? "Creating…" : "Create Task"}
        </button>
      </div>
    </form>
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
          // Grows with its chips — a capped, scrolling field reads as broken
          // (stray scrollbars) and hides who's already selected.
          className="nt-input flex items-center flex-wrap gap-1.5 cursor-text"
          style={{ minHeight: 46, height: "auto" }}
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
              className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1"
              style={{
                background: "var(--vp-cyan-tint)",
                color: "rgb(var(--vp-cyan-deep))",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <EmployeeAvatar name={name} size="sm" />
              {name}
              <button
                type="button"
                data-chip-remove
                tabIndex={-1}
                aria-label={`Remove ${name}`}
                onClick={() => onToggle(id)}
                className="inline-flex items-center justify-center"
                style={{ width: 18, height: 18, borderRadius: 999 }}
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
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? "Type a name…" : ""}
          className="flex-1 min-w-[90px] bg-transparent outline-none"
          style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-strong)", padding: "2px 0" }}
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
        onInteractOutside={(e) => {
          if (ref.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[14rem] overflow-hidden"
      >
          <ul
            ref={listRef}
            role="listbox"
            aria-multiselectable
            className="max-h-[240px] overflow-y-auto py-1"
          >
          {employees.length === 0 ? (
            <li
              className="px-4 py-3 font-semibold"
              style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
            >
              No employees available.
            </li>
          ) : filtered.length === 0 ? (
            <li
              className="px-4 py-3 font-semibold"
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
                  onClick={() => commit(emp.id)}
                  className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors"
                  style={{
                    background: isSel
                      ? "var(--vp-cyan-tint)"
                      : isHi
                        ? "var(--color-surface-soft)"
                        : "transparent",
                  }}
                >
                  <EmployeeAvatar name={emp.name} size="sm" />
                  <span
                    className="flex-1 font-semibold"
                    style={{
                      fontSize: 15,
                      color: "var(--color-ink-strong)",
                    }}
                  >
                    {emp.name}
                  </span>
                  {isSel && (
                    <Check
                      size={18}
                      strokeWidth={2.6}
                      style={{ color: "rgb(var(--vp-cyan-deep))" }}
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
      style={{ padding: "10px 12px", minHeight: 56 }}
      onClick={() => document.getElementById(id)?.focus()}
    >
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1"
          style={{
            background: "var(--vp-cyan-tint)",
            color: "rgb(var(--vp-cyan-deep))",
            fontSize: 14,
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
            style={{ width: 18, height: 18, borderRadius: 999 }}
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
          fontSize: 15,
          fontWeight: 600,
          color: "var(--color-ink-strong)",
          border: "none",
          padding: 0,
        }}
      />
    </div>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor={id}
        className="font-bold"
        style={{
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          fontSize: 15,
          letterSpacing: "-0.005em",
          color: "var(--color-ink-strong)",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "rgb(168, 4, 0)" }}> *</span>
        )}
      </label>
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
            color: "rgb(var(--vp-cyan-deep))",
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
          background: dragOver ? "var(--vp-cyan-tint)" : "transparent",
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
          "linear-gradient(135deg, var(--vp-cyan-tint) 0%, #e0f2fe 100%)";
        e.currentTarget.style.borderColor = "rgb(var(--vp-cyan))";
        e.currentTarget.style.color = "rgb(var(--vp-cyan-deep))";
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
        border: "1.5px solid rgb(var(--vp-cyan))",
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
            color: "rgb(var(--vp-cyan-deep))",
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
            width: 52,
            background:
              "linear-gradient(135deg, rgb(225, 6, 0), rgb(168, 4, 0))",
            color: "#ffffff",
            border: "none",
            boxShadow: "0 4px 12px rgba(225, 6, 0, 0.32)",
          }}
        >
          <Plus size={22} strokeWidth={2.4} />
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
                style={{ color: "rgb(var(--vp-cyan-deep))" }}
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
