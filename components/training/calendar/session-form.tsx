"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, Star, Mic } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect } from "@/components/ui/lookup-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { StarRating } from "@/components/ui/star-rating";
import { useDictation } from "@/components/ui/use-dictation";
import { createSession, updateSession } from "@/app/(app)/training/calendar/actions";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/**
 * The compact field look, matching the Leave form's input geometry (`px-3 py-2`,
 * `rounded-lg`, 14px) so a form in this app is the same size wherever it is
 * filled in. It replaced a 15px / `py-3` / `rounded-xl` input that made every
 * row taller than it needed to be.
 */
const INPUT =
  "w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-[#E10600]";

export interface SessionFormValues {
  id?: string;
  topic: string;
  subjectId: string | null;
  los: string | null;
  criticality: number;
  trainerId: string | null;
  scheduledAt: string; // datetime-local value 'YYYY-MM-DDTHH:mm'
  durationMin: number;
  mode: "in_person" | "online";
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  inManual: boolean;
  attendeeIds: string[];
}

/** Compact field label — the Leave form's label weight and size. */
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
    <div>
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-soft">
        {label}
        {hint && <span className="ml-1.5 font-normal text-ink-subtle">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** Uppercase rule heading a group of fields. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
      {children}
    </p>
  );
}

/**
 * The dictation control, drawn where the app draws it everywhere else: inside
 * the field's top-right corner, pulsing red while capturing. Rendered ONLY when
 * the browser has the Web Speech API, so a browser without it sees exactly the
 * plain field it saw before.
 */
function MicButton({ dictation, label }: { dictation: ReturnType<typeof useDictation>; label: string }) {
  if (!dictation.supported) return null;
  return (
    <button
      type="button"
      onClick={dictation.toggle}
      aria-pressed={dictation.recording}
      aria-label={dictation.recording ? "Stop dictation" : `Dictate the ${label}`}
      title={dictation.recording ? "Stop dictation" : "Dictate"}
      className={`absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md transition-colors ${
        dictation.recording
          ? "animate-pulse text-white"
          : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
      }`}
      style={dictation.recording ? { background: "var(--color-altus-red)" } : undefined}
    >
      <Mic size={14} strokeWidth={2.3} aria-hidden />
    </button>
  );
}

/**
 * A dictatable single-line field. The mic sits in the field's top-right and the
 * input reserves `pr-10` for it, so a long value never runs underneath it.
 */
function DictatableInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  label,
  inputRef,
  leadingIcon,
  trailingHint,
  hintTone,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength: number;
  label: string;
  inputRef?: React.Ref<HTMLInputElement>;
  leadingIcon?: React.ReactNode;
  trailingHint?: string;
  hintTone?: string;
}) {
  const dictation = useDictation({ value, onChange: (v) => onChange(v.slice(0, maxLength)) });
  return (
    <>
      <div className="relative">
        {leadingIcon}
        <input
          id={id}
          ref={inputRef}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${leadingIcon ? "pl-9" : ""} ${dictation.supported ? "pr-10" : ""}`}
        />
        <MicButton dictation={dictation} label={label} />
      </div>
      {trailingHint && (
        <p className="mt-1 text-[11.5px] font-semibold" style={{ color: hintTone }}>
          {trailingHint}
        </p>
      )}
    </>
  );
}

/** A dictatable textarea, mic in the corner the browser's resize grip is not. */
function DictatableTextarea({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  rows,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength: number;
  rows: number;
  label: string;
}) {
  const dictation = useDictation({ value, onChange: (v) => onChange(v.slice(0, maxLength)) });
  return (
    <div className="relative">
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} resize-y ${dictation.supported ? "pr-10" : ""}`}
      />
      <MicButton dictation={dictation} label={label} />
    </div>
  );
}

/**
 * SCHEDULE A TRAINING SESSION — the form.
 *
 * ── THE 2026-09-24 REGROUPING ──────────────────────────────────────────────
 * This was a single full-width column of eight stacked rows: every field spanned
 * the whole panel whatever it held, so a Duration number input was as wide as
 * the Learning Outcomes statement, and the form read as a dashboard rather than
 * as something to fill in. It is now four named groups over two columns, at the
 * Leave form's geometry:
 *
 *   TRAINING DETAILS   Topic (full) · Subject | Trainer
 *   SESSION DETAILS    Learning Outcomes (full) · Schedule | Duration · Criticality
 *   SESSION SETUP      Mode | Location · Attendees (full)
 *   PREPARATION        Notes (full) · Add to Training Manual
 *
 * Nothing about the session changed: the same fields, the same state, the same
 * validation (topic length, duration ceiling) and the same payload to
 * `createSession` / `updateSession`. Only the arrangement, the group headings and
 * the input size moved.
 *
 * ── DICTATION ON THE FOUR FREE-TEXT FIELDS ─────────────────────────────────
 * Topic, Learning Outcomes, Location and Notes carry a mic, because those are
 * the fields someone writes prose into. The selects, the datetime picker, the
 * duration, the criticality stars and the attendee picker carry none — there is
 * nothing to dictate into them. The mic renders only where the browser has the
 * Web Speech API (see `useDictation`).
 */
export function SessionForm({
  mode,
  initial,
  subjectOptions,
  employeeOptions,
  maxSessionMinutes,
  onAddSubject,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: Partial<SessionFormValues>;
  subjectOptions: { id: string; name: string }[];
  employeeOptions: { id: string; name: string }[];
  maxSessionMinutes: number;
  onAddSubject?: (name: string) => Promise<{ ok: true; option: { id: string; name: string } } | { ok: false; error: string }>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const topicRef = React.useRef<HTMLInputElement>(null);

  const [v, setV] = React.useState<SessionFormValues>({
    topic: initial?.topic ?? "",
    subjectId: initial?.subjectId ?? null,
    los: initial?.los ?? "",
    criticality: initial?.criticality ?? 3,
    trainerId: initial?.trainerId ?? null,
    scheduledAt: initial?.scheduledAt ?? defaultSlot(),
    durationMin: initial?.durationMin ?? 60,
    mode: initial?.mode ?? "in_person",
    location: initial?.location ?? "",
    meetingUrl: initial?.meetingUrl ?? "",
    notes: initial?.notes ?? "",
    inManual: initial?.inManual ?? false,
    attendeeIds: initial?.attendeeIds ?? [],
    id: initial?.id,
  });

  React.useEffect(() => {
    topicRef.current?.focus();
  }, []);

  const durationOver = v.durationMin > maxSessionMinutes;
  const empMulti = employeeOptions.map((e) => ({ value: e.id, label: e.name }));

  function set<K extends keyof SessionFormValues>(k: K, val: SessionFormValues[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (v.topic.trim().length < 2) {
      fireToast({ message: "Add a topic for the session.", type: "error" });
      topicRef.current?.focus();
      return;
    }
    if (durationOver) {
      fireToast({ message: `No session may exceed ${maxSessionMinutes} minutes.`, type: "error" });
      return;
    }
    setPending(true);
    const payload = {
      ...(v.id ? { id: v.id } : {}),
      topic: v.topic.trim(),
      subjectId: v.subjectId,
      los: v.los?.trim() || null,
      criticality: v.criticality,
      trainerId: v.trainerId,
      scheduledAt: new Date(v.scheduledAt).toISOString(),
      durationMin: v.durationMin,
      mode: v.mode,
      location: v.location?.trim() || null,
      meetingUrl: v.meetingUrl?.trim() || null,
      notes: v.notes?.trim() || null,
      inManual: v.inManual,
      attendeeIds: v.attendeeIds,
    };
    const res = mode === "create" ? await createSession(payload) : await updateSession(payload);
    setPending(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: mode === "create" ? "Training scheduled." : "Session updated.", type: "success" });
    router.refresh();
    if (mode === "create") onCancel?.();
  }

  return (
    <form
      onSubmit={submit}
      style={{ ["--tc-accent" as string]: ACCENT }}
      className="grid gap-5"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel?.();
      }}
    >
      {/* ── TRAINING DETAILS ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Training Details</SectionHeading>

        <Field label="Topic">
          <DictatableInput
            id="tc-topic"
            inputRef={topicRef}
            label="topic"
            value={v.topic}
            onChange={(t) => set("topic", t)}
            maxLength={200}
            placeholder="e.g. Closing techniques for inbound calls"
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1">
          <Field label="Subject">
            <LookupSelect
              label="subject"
              value={v.subjectId}
              onChange={(id) => set("subjectId", id)}
              options={subjectOptions}
              onAdd={onAddSubject}
              className={INPUT}
              placeholder="Pick a subject…"
            />
          </Field>
          <Field label="Trainer" hint="defaults to you">
            <LookupSelect
              label="trainer"
              value={v.trainerId}
              onChange={(id) => set("trainerId", id)}
              options={employeeOptions}
              className={INPUT}
              placeholder="Pick a trainer…"
            />
          </Field>
        </div>
      </section>

      {/* ── SESSION DETAILS ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Session Details</SectionHeading>

        <Field label="Learning Outcomes" hint="required">
          <DictatableTextarea
            id="tc-los"
            label="learning outcomes"
            value={v.los ?? ""}
            onChange={(t) => set("los", t)}
            maxLength={2000}
            rows={2}
            placeholder="What attendees will be able to do after this session…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1">
          <Field label="Schedule" hint="prefer Fri / Sat">
            <div className="relative">
              <Calendar size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                type="datetime-local"
                className={INPUT + " pl-9 tabular-nums"}
                value={v.scheduledAt}
                onChange={(e) => set("scheduledAt", e.target.value)}
              />
            </div>
          </Field>
          <Field label="Duration" hint="min">
            <input
              type="number"
              min={5}
              max={maxSessionMinutes}
              step={5}
              className={INPUT + " tabular-nums"}
              style={durationOver ? { borderColor: "var(--color-altus-red)" } : undefined}
              value={v.durationMin}
              onChange={(e) => set("durationMin", Number(e.target.value))}
            />
            <p
              className="mt-1 text-[11.5px] font-semibold"
              style={{ color: durationOver ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}
            >
              {durationOver ? `Max ${maxSessionMinutes} min.` : `No session over ${maxSessionMinutes} min.`}
            </p>
          </Field>
        </div>

        <Field label="Criticality">
          <div className="flex items-center rounded-lg border border-hairline bg-surface-card px-3 py-2">
            <StarRating
              value={v.criticality}
              onChange={(n) => set("criticality", n)}
              color={ACCENT}
              label="Criticality 1 to 5"
            />
          </div>
        </Field>
      </section>

      {/* ── SESSION SETUP ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Session Setup</SectionHeading>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1">
          <Field label="Mode">
            <div
              role="radiogroup"
              aria-label="Mode"
              className="grid grid-cols-2 gap-1 rounded-lg p-1"
              style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
            >
              {(["in_person", "online"] as const).map((m) => {
                const active = v.mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set("mode", m)}
                    className="rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors"
                    style={
                      active
                        ? {
                            background: "var(--color-surface-card)",
                            color: "var(--color-ink-strong)",
                            boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
                          }
                        : { background: "transparent", color: "var(--color-ink-subtle)" }
                    }
                  >
                    {m === "in_person" ? "In Person" : "Online"}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Location when the session is in person; the meeting link when it is
              online. Same slot, same row — only the field and its label swap. */}
          {v.mode === "online" ? (
            <Field label="Meeting URL">
              <input
                className={INPUT}
                value={v.meetingUrl ?? ""}
                maxLength={500}
                placeholder="https://meet.google.com/…"
                onChange={(e) => set("meetingUrl", e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Location">
              <DictatableInput
                id="tc-location"
                label="location"
                value={v.location ?? ""}
                onChange={(t) => set("location", t)}
                maxLength={300}
                placeholder="e.g. Conference room / 3rd floor"
              />
            </Field>
          )}
        </div>

        <Field label="Attendees">
          <div className="rounded-lg border border-hairline bg-surface-card px-3 py-2">
            <MultiSelect
              options={empMulti}
              selected={v.attendeeIds}
              onChange={(ids) => set("attendeeIds", ids)}
              placeholder="Select attendees…"
              className="w-full"
            />
          </div>
          {v.attendeeIds.length > 0 && (
            <p className="mt-1 text-[11.5px] font-semibold text-ink-subtle">
              {v.attendeeIds.length} invited — they&rsquo;ll get an in-app alert.
            </p>
          )}
        </Field>
      </section>

      {/* ── PREPARATION ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading>Preparation</SectionHeading>

        <Field label="Notes" hint="optional">
          <DictatableTextarea
            id="tc-notes"
            label="notes"
            value={v.notes ?? ""}
            onChange={(t) => set("notes", t)}
            maxLength={4000}
            rows={2}
            placeholder="Anything attendees should bring or pre-read…"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-hairline bg-surface-card px-3 py-2">
          <input
            type="checkbox"
            checked={v.inManual}
            onChange={(e) => set("inManual", e.target.checked)}
            className="size-[17px] accent-[var(--tc-accent)]"
          />
          <span className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink-strong">
            <Star size={14} fill={v.inManual ? ACCENT : "transparent"} style={{ color: ACCENT }} />
            Add to Training Manual
          </span>
          <span className="text-[12px] font-medium text-ink-subtle">— curate this high-value session</span>
        </label>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-end gap-2 border-t pt-3.5"
        style={{ borderColor: "var(--color-hairline)" }}
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-hairline px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} strokeWidth={2.6} />}
          {mode === "create" ? "Schedule Training" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

/** Next Friday 16:00 IST, expressed in the user's local datetime-local value. */
function defaultSlot(): string {
  const now = new Date();
  const day = now.getDay(); // 0 Sun..6 Sat
  const toFri = (5 - day + 7) % 7 || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + toFri);
  d.setHours(16, 0, 0, 0);
  return toLocalInput(d);
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
