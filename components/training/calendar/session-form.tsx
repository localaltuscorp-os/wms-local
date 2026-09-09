"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, Star } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect } from "@/components/ui/lookup-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { StarRating } from "@/components/ui/star-rating";
import { createSession, updateSession } from "@/app/(app)/training/calendar/actions";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-3 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

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

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-1.5 flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
      {children}
      {hint && <span className="font-semibold normal-case tracking-normal text-ink-subtle/80">{hint}</span>}
    </label>
  );
}

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
      <div>
        <Label>Topic</Label>
        <input
          ref={topicRef}
          className={INPUT}
          value={v.topic}
          maxLength={200}
          placeholder="e.g. Closing techniques for inbound calls"
          onChange={(e) => set("topic", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label>Subject</Label>
          <LookupSelect
            label="subject"
            value={v.subjectId}
            onChange={(id) => set("subjectId", id)}
            options={subjectOptions}
            onAdd={onAddSubject}
            className={INPUT}
            placeholder="Pick a subject…"
          />
        </div>
        <div>
          <Label>Trainer (who)</Label>
          <LookupSelect
            label="trainer"
            value={v.trainerId}
            onChange={(id) => set("trainerId", id)}
            options={employeeOptions}
            className={INPUT}
            placeholder="Defaults to you…"
          />
        </div>
      </div>

      <div>
        <Label>LOS <span className="font-semibold normal-case tracking-normal text-ink-subtle/80">— learning-outcome statements</span></Label>
        <textarea
          className={INPUT + " resize-y"}
          rows={2}
          maxLength={2000}
          value={v.los ?? ""}
          placeholder="What attendees will be able to do after this session…"
          onChange={(e) => set("los", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <div>
          <Label>Criticality</Label>
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3.5 py-2.5">
            <StarRating value={v.criticality} onChange={(n) => set("criticality", n)} color={ACCENT} label="Criticality 1 to 5" />
          </div>
        </div>
        <div>
          <Label>Schedule</Label>
          <div className="relative">
            <Calendar size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              type="datetime-local"
              className={INPUT + " pl-9"}
              value={v.scheduledAt}
              onChange={(e) => set("scheduledAt", e.target.value)}
            />
          </div>
          <p className="mt-1 text-[12px] font-semibold text-ink-subtle">Prefer Fridays / Saturdays.</p>
        </div>
        <div>
          <Label>Duration <span className="font-semibold normal-case tracking-normal text-ink-subtle/80">min</span></Label>
          <input
            type="number"
            min={5}
            max={maxSessionMinutes}
            step={5}
            className={INPUT}
            style={durationOver ? { borderColor: "var(--color-altus-red)" } : undefined}
            value={v.durationMin}
            onChange={(e) => set("durationMin", Number(e.target.value))}
          />
          <p className="mt-1 text-[12px] font-semibold" style={{ color: durationOver ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}>
            {durationOver ? `Max ${maxSessionMinutes} min.` : `No session over ${maxSessionMinutes} min.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label>Mode</Label>
          <div className="flex gap-2">
            {(["in_person", "online"] as const).map((m) => {
              const active = v.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("mode", m)}
                  className="flex-1 rounded-xl border px-3 py-3 text-[14px] font-bold transition-colors"
                  style={{
                    borderColor: active ? ACCENT : "var(--color-hairline)",
                    background: active ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : "white",
                    color: active ? ACCENT_DEEP : "var(--color-ink-soft)",
                  }}
                >
                  {m === "in_person" ? "In Person" : "Online"}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          {v.mode === "online" ? (
            <>
              <Label>Meeting URL</Label>
              <input
                className={INPUT}
                value={v.meetingUrl ?? ""}
                maxLength={500}
                placeholder="https://meet.google.com/…"
                onChange={(e) => set("meetingUrl", e.target.value)}
              />
            </>
          ) : (
            <>
              <Label>Location</Label>
              <input
                className={INPUT}
                value={v.location ?? ""}
                maxLength={300}
                placeholder="e.g. Conference room / 3rd floor"
                onChange={(e) => set("location", e.target.value)}
              />
            </>
          )}
        </div>
      </div>

      <div>
        <Label>Attendees</Label>
        <div className="rounded-xl border border-hairline bg-white px-3 py-2.5">
          <MultiSelect
            options={empMulti}
            selected={v.attendeeIds}
            onChange={(ids) => set("attendeeIds", ids)}
            placeholder="Select attendees…"
            className="w-full"
          />
        </div>
        {v.attendeeIds.length > 0 && (
          <p className="mt-1 text-[12px] font-semibold text-ink-subtle">{v.attendeeIds.length} invited — they'll get an in-app alert.</p>
        )}
      </div>

      <div>
        <Label>Notes</Label>
        <textarea
          className={INPUT + " resize-y"}
          rows={2}
          maxLength={4000}
          value={v.notes ?? ""}
          placeholder="Anything attendees should bring or pre-read…"
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline bg-white px-3.5 py-3">
        <input
          type="checkbox"
          checked={v.inManual}
          onChange={(e) => set("inManual", e.target.checked)}
          className="size-[18px] accent-[var(--tc-accent)]"
        />
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink-strong">
          <Star size={15} fill={v.inManual ? ACCENT : "transparent"} style={{ color: ACCENT }} /> Add to the Training Manual
        </span>
        <span className="text-[12.5px] font-semibold text-ink-subtle">— curate this high-value session</span>
      </label>

      <div className="flex items-center justify-end gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-hairline-strong bg-white px-5 py-3 text-[14.5px] font-bold text-ink-soft hover:border-ink-subtle"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: `0 12px 30px -12px ${ACCENT}99` }}
        >
          {pending ? <Loader2 size={17} className="animate-spin" /> : <Calendar size={17} strokeWidth={2.6} />}
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
