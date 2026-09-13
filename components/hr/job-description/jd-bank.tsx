"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import {
  FUNCTION_LABELS,
  type BusinessFunction,
} from "@/lib/org/functions";
import {
  FREQUENCY_OPTIONS,
  describeRecurrence,
  type Recurrence,
} from "@/lib/jd/recurrence";
import type { JdEntryRow, JdPositionRow, JdRankRow } from "@/lib/queries/job-description";
import { DateField } from "@/components/ui/date-field";
import {
  createJdEntry,
  createJdPosition,
  setJdEntryActive,
} from "@/app/(app)/hr/job-description/actions";

const ACCENT = "#B91C1C";
const ACCENT_SOFT = "#FEE2E2";

export interface JdBankProps {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  ranks: JdRankRow[];
  people: { id: string; name: string }[];
}

/**
 * THE JD BANK — the global register, and the form that adds to it.
 *
 * A Job Description belongs to a POSITION, never to a person: people come and
 * go, and the work stays. So the Position picker is the required field and
 * Assigned Person(s) is optional — leaving it empty is a legitimate answer,
 * meaning the job belongs to the seat and escalates while that seat is vacant.
 */
export function JdBank({ entries, positions, ranks, people }: JdBankProps) {
  const [tab, setTab] = React.useState<BusinessFunction | "all">("all");
  const [showForm, setShowForm] = React.useState(false);

  const shown = tab === "all" ? entries : entries.filter((e) => e.functionKey === tab);

  const functionsPresent = React.useMemo(() => {
    const s = new Set(entries.map((e) => e.functionKey));
    return [...s] as BusinessFunction[];
  }, [entries]);

  return (
    <div className="flex flex-col gap-5">
      {positions.length === 0 && (
        <NoPositionsYet ranks={ranks} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterTab active={tab === "all"} onClick={() => setTab("all")}>
          All ({entries.length})
        </FilterTab>
        {functionsPresent.map((f) => (
          <FilterTab key={f} active={tab === f} onClick={() => setTab(f)}>
            {FUNCTION_LABELS[f]} ({entries.filter((e) => e.functionKey === f).length})
          </FilterTab>
        ))}
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          disabled={positions.length === 0}
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-45"
          style={{ background: ACCENT }}
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Close" : "New Job Description"}
        </button>
      </div>

      {showForm && positions.length > 0 && (
        <JdForm
          positions={positions}
          people={people}
          onDone={() => setShowForm(false)}
        />
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-slate-700">
            {entries.length === 0 ? "The JD Bank is empty" : "Nothing in this function"}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            {positions.length === 0
              ? "Create a position first — a job description belongs to a seat."
              : "Add the first job description above."}
          </p>
        </div>
      ) : (
        <div className="table-scroll overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-24 px-4 py-2.5">Serial</th>
                <th className="px-4 py-2.5">Task</th>
                <th className="w-52 px-4 py-2.5">Position</th>
                <th className="w-44 px-4 py-2.5">Frequency</th>
                <th className="w-20 px-4 py-2.5 text-right">Est.</th>
                <th className="w-36 px-4 py-2.5">Targets</th>
                <th className="w-40 px-4 py-2.5">Assigned</th>
                <th className="w-20 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: JdEntryRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <tr
      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${
        entry.isActive ? "" : "opacity-50"
      }`}
    >
      <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500">{entry.serialNo}</td>
      <td className="px-4 py-2.5 text-slate-800">{entry.task}</td>
      <td className="px-4 py-2.5 text-slate-600">{entry.positionTitle}</td>
      <td className="px-4 py-2.5 text-slate-600">{describeRecurrence(entry.recurrence)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
        {entry.estimatedMinutes}m
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {entry.pushDcc && <Chip>DCC</Chip>}
          {entry.pushWms && <Chip>WMS</Chip>}
          {entry.pushEvent && <Chip>Event</Chip>}
          {!entry.pushDcc && !entry.pushWms && !entry.pushEvent && (
            <span className="text-slate-300">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 text-slate-600">
        {entry.assignees.length > 0 ? (
          entry.assignees.join(", ")
        ) : (
          <span className="text-slate-400" title="Belongs to the seat; escalates while vacant">
            By position
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setJdEntryActive({ id: entry.id, isActive: !entry.isActive });
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
          className="rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
        >
          {busy ? "…" : entry.isActive ? "Retire" : "Restore"}
        </button>
      </td>
    </tr>
  );
}

/* ── The form ─────────────────────────────────────────────────────────────── */

function JdForm({
  positions,
  people,
  onDone,
}: {
  positions: JdPositionRow[];
  people: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [positionId, setPositionId] = React.useState("");
  const [task, setTask] = React.useState("");
  const [freqId, setFreqId] = React.useState("daily");
  const [anchor, setAnchor] = React.useState(new Date().toISOString().slice(0, 10));
  const [customLabel, setCustomLabel] = React.useState("");
  const [minutes, setMinutes] = React.useState("15");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [guidelinesUrl, setGuidelinesUrl] = React.useState("");
  const [templateUrl, setTemplateUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pushDcc, setPushDcc] = React.useState(false);
  const [pushWms, setPushWms] = React.useState(false);
  const [pushEvent, setPushEvent] = React.useState(false);
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chosen = positions.find((p) => p.id === positionId) ?? null;

  /** Rebuild the structured recurrence from the picker + its sub-fields. */
  const recurrence: Recurrence = React.useMemo(() => {
    const base = FREQUENCY_OPTIONS.find((o) => o.id === freqId)?.value ?? { kind: "daily" };
    if (base.kind === "interval") return { ...base, anchor };
    if (base.kind === "custom") return { ...base, label: customLabel };
    return base;
  }, [freqId, anchor, customLabel]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await createJdEntry({
        positionId,
        task,
        notesHtml: notes || null,
        recurrence,
        estimatedMinutes: Number(minutes),
        videoUrl: videoUrl || null,
        guidelinesUrl: guidelinesUrl || null,
        templateUrl: templateUrl || null,
        pushDcc,
        pushWms,
        pushEvent,
        assigneeIds: assignees,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">New Job Description</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Position" hint="A job description belongs to a seat, not a person.">
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
          >
            <option value="">Select a position…</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.holderCount})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Department / Function" hint="Comes from the position.">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
            {chosen
              ? (FUNCTION_LABELS[chosen.functionKey as BusinessFunction] ?? chosen.functionKey)
              : "—"}
          </div>
        </Field>
      </div>

      {chosen && chosen.holderCount === 0 && (
        <p className="mt-3 inline-flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
           style={{ background: "#FFFBEB", color: "#92400E" }}>
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This seat is vacant. Anything filed here escalates to the nearest filled
          position above it in the same function until somebody is placed.
        </p>
      )}

      <div className="mt-4">
        <Field label="Task / Job Description">
          <textarea
            rows={2}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Make tea/coffee for the office and guests"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Frequency">
          <select
            value={freqId}
            onChange={(e) => setFreqId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {recurrence.kind === "interval" && (
            <DateField
          
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              aria-label="Count from"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
            />
          )}
          {recurrence.kind === "custom" && (
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Describe the schedule"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
            />
          )}
          <p className="mt-1 text-[11px] text-slate-500">{describeRecurrence(recurrence)}</p>
        </Field>

        <Field label="Estimated Time (minutes)">
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            {Number(minutes) > 60
              ? `= ${Math.floor(Number(minutes) / 60)} h ${Number(minutes) % 60} m`
              : "1–960 minutes"}
          </p>
        </Field>
      </div>

      {/* SOP documents. Guidelines and Templates are DOCUMENTS, deliberately
          not rendered as anything tickable — a checklist implies completion
          state they must not carry. */}
      <fieldset className="mt-5 rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          SOP attachments &amp; documents
        </legend>
        <div className="grid gap-3">
          <UrlField label="Video — how to do this work" value={videoUrl} onChange={setVideoUrl} />
          <UrlField
            label="Guidelines — rules of execution"
            value={guidelinesUrl}
            onChange={setGuidelinesUrl}
          />
          <UrlField
            label="Templates — standard files"
            value={templateUrl}
            onChange={setTemplateUrl}
          />
        </div>
      </fieldset>

      <div className="mt-4">
        <Field label="Notes / Context">
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Target destinations">
          <div className="flex flex-col gap-2">
            <Check label="Add to DCC — Daily Compliance Checklist" checked={pushDcc} onChange={setPushDcc} />
            <Check label="Add to WMS — Work Management System" checked={pushWms} onChange={setPushWms} />
            <Check label="Add to Event Checklist" checked={pushEvent} onChange={setPushEvent} />
          </div>
        </Field>

        <Field label="Assigned Person(s)" hint="Leave empty to let the position decide.">
          <select
            multiple
            value={assignees}
            onChange={(e) =>
              setAssignees([...e.target.selectedOptions].map((o) => o.value))
            }
            size={5}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error && <p className="mt-4 text-[13px] text-red-700">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save to JD Bank
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-2 text-[13px] font-semibold text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── First-run: there are no seats yet ────────────────────────────────────── */

function NoPositionsYet({ ranks }: { ranks: JdRankRow[] }) {
  const router = useRouter();
  const [functionKey, setFunctionKey] = React.useState<BusinessFunction>("operations");
  const [rankId, setRankId] = React.useState(ranks[0]?.id ?? "");
  const [variant, setVariant] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const FUNCTIONS: BusinessFunction[] = [
    "sales",
    "marketing",
    "operations",
    "handholding",
    "hr",
    "admin",
    "accounts",
    "apps",
  ];

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}>
      <h2 className="flex items-center gap-2 text-[15px] font-bold" style={{ color: "#92400E" }}>
        <Briefcase className="h-4 w-4" />
        Create the first position
      </h2>
      <p className="mt-1 max-w-2xl text-[13px]" style={{ color: "#92400E" }}>
        A job description belongs to a seat — function plus rank — so at least one has to
        exist before the Bank can hold anything. The title is generated, so two people
        cannot create the same seat under two spellings.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Label>Function</Label>
          <select
            value={functionKey}
            onChange={(e) => setFunctionKey(e.target.value as BusinessFunction)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
          >
            {FUNCTIONS.map((f) => (
              <option key={f} value={f}>
                {FUNCTION_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Rank</Label>
          <select
            value={rankId}
            onChange={(e) => setRankId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
          >
            {ranks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Variant (optional)</Label>
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder="e.g. Back Office"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
          />
        </div>
        <button
          type="button"
          disabled={busy || !rankId}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await createJdPosition({
                functionKey,
                rankId,
                variant: variant || null,
              });
              if (!res.ok) setError(res.error);
              else router.refresh();
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: "#92400E" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create position
        </button>
      </div>
      {error && <p className="mt-3 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

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
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
      {children}
    </span>
  );
}

function UrlField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px] text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      {label}
    </label>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
      style={{ background: ACCENT_SOFT, color: ACCENT }}
    >
      {children}
    </span>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
      style={
        active
          ? { background: ACCENT, color: "#fff" }
          : { background: "#F1F5F9", color: "#475569" }
      }
    >
      {children}
    </button>
  );
}
