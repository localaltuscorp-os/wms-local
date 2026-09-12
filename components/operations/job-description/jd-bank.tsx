"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  LayoutGrid,
  List,
  Loader2,
  Paperclip,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
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
import { ModuleAssignBoxes } from "@/components/operations/job-description/module-assign-boxes";
import type { TargetPeople } from "@/lib/jd/assignment-targets";
import { JD_FUNCTIONS } from "@/lib/jd/functions";
import {
  ariaSort,
  attachmentCount,
  describeJdSort,
  nextSort,
  notesText,
  sortJdRows,
  type JdSortKey,
  type JdSortState,
} from "@/lib/jd/bank-sort";
import {
  createJdEntry,
  createJdPosition,
  setJdEntryActive,
} from "@/app/(app)/operations/job-description/actions";
import {
  JdDetailDrawer,
  JdSummary,
  PositionBoard,
  whoDoesIt,
  type SeatHolder,
} from "@/components/operations/job-description/jd-detail";

const ACCENT = "#B91C1C";
const ACCENT_SOFT = "#FEE2E2";

export interface JdBankProps {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  ranks: JdRankRow[];
  people: { id: string; name: string }[];
  /**
   * Who sits in each seat. A JOIN, never a column on `employees` — Drizzle
   * bare-selects every declared column of that table in hundreds of places
   * including the sign-in lookup, so widening it breaks login until the
   * migration has been applied by hand.
   */
  holders?: SeatHolder[];
}

/**
 * THE JD BANK — the global register, and the form that adds to it.
 *
 * A Job Description belongs to a POSITION, never to a person: people come and
 * go, and the work stays. So the Position picker is the required field and
 * Assigned Person(s) is optional — leaving it empty is a legitimate answer,
 * meaning the job belongs to the seat and escalates while that seat is vacant.
 */
export function JdBank({
  entries,
  positions,
  ranks,
  people,
  holders = [],
}: JdBankProps) {
  const [tab, setTab] = React.useState<BusinessFunction | "all">("all");
  /* Null is the Bank's own order — by serial, the sequence they were written
     in. Not persisted: a sort is how you are reading the register for a minute,
     and finding it still sorted by Time Estimated next week would read as the
     Bank itself having been rearranged. */
  const [sort, setSort] = React.useState<JdSortState>(null);
  const toggleSort = React.useCallback(
    (k: JdSortKey) => setSort((cur) => nextSort(cur, k)),
    [],
  );
  const [showForm, setShowForm] = React.useState(false);
  const [view, setView] = React.useState<"list" | "seats">("list");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const filtered = tab === "all" ? entries : entries.filter((e) => e.functionKey === tab);
  /* Sorting is applied AFTER filtering and never touches `entries`, so the
     Seats board and the summary above keep reading the register's own order. */
  const shown = React.useMemo(
    () =>
      sortJdRows(filtered, sort, {
        labelOfFunction: (k) => FUNCTION_LABELS[k as BusinessFunction] ?? k,
        describeFrequency: (r) => describeRecurrence(r.recurrence),
      }),
    [filtered, sort],
  );
  const open = entries.find((e) => e.id === openId) ?? null;

  const functionsPresent = React.useMemo(() => {
    const s = new Set(entries.map((e) => e.functionKey));
    return [...s] as BusinessFunction[];
  }, [entries]);

  return (
    <div className="flex flex-col gap-5">
      {positions.length === 0 && (
        <NoPositionsYet ranks={ranks} />
      )}

      {positions.length > 0 && (
        <JdSummary entries={entries} positions={positions} holders={holders} />
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
        <div className="ml-auto inline-flex rounded-lg border border-slate-300 p-0.5">
          <ViewButton active={view === "list"} onClick={() => setView("list")}>
            <List className="h-3.5 w-3.5" /> All
          </ViewButton>
          <ViewButton active={view === "seats"} onClick={() => setView("seats")}>
            <LayoutGrid className="h-3.5 w-3.5" /> By position
          </ViewButton>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          disabled={positions.length === 0}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-45"
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
      ) : view === "seats" ? (
        <PositionBoard
          entries={shown}
          positions={
            tab === "all" ? positions : positions.filter((p) => p.functionKey === tab)
          }
          holders={holders}
          onOpen={(e) => setOpenId(e.id)}
        />
      ) : (
        <>
          {/* What the sort is doing, and how to undo it. The third click on a
              heading clears it, which nobody discovers unaided. */}
          {sort && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12.5px] text-slate-600">
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                Sorted by{" "}
                <b className="font-semibold text-slate-800">
                  {describeJdSort(sort, (k) => JD_COLUMN_LABELS[k])}
                </b>
              </span>
              <button
                type="button"
                onClick={() => setSort(null)}
                className="ml-auto rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to serial order
              </button>
            </div>
          )}

          <div className="table-scroll overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1360px] text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <SortTh k="sr" sort={sort} onSort={toggleSort} className="w-16" align="right" />
                  <SortTh k="position" sort={sort} onSort={toggleSort} className="w-52" />
                  <SortTh k="function" sort={sort} onSort={toggleSort} className="w-36" />
                  <SortTh k="task" sort={sort} onSort={toggleSort} className="min-w-[260px]" />
                  <SortTh k="frequency" sort={sort} onSort={toggleSort} className="w-44" />
                  <SortTh k="estimate" sort={sort} onSort={toggleSort} className="w-28" align="right" />
                  <SortTh k="attachment" sort={sort} onSort={toggleSort} className="w-36" />
                  <SortTh k="notes" sort={sort} onSort={toggleSort} className="w-52" />
                  <SortTh k="addto" sort={sort} onSort={toggleSort} className="w-36" />
                  <SortTh k="person" sort={sort} onSort={toggleSort} className="w-48" />
                  {/* The retire/restore control. An action, not a column of
                      data, so it has no heading and nothing to sort by. */}
                  <th className="w-20 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    srNo={i + 1}
                    positions={positions}
                    holders={holders}
                    onOpen={() => setOpenId(e.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <JdDetailDrawer
          entry={open}
          positions={positions}
          holders={holders}
          people={people}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function ViewButton({
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
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One row of the Bank.
 *
 * The "Who does it" column runs the real ladder rather than printing the
 * assignee list, because the two differ exactly where it matters: a JD with no
 * named assignee is not unowned, it belongs to the seat — and when that seat is
 * empty the work is already somebody else's. Printing "By position" there hid
 * the one fact a reader of this table needs.
 */
function EntryRow({
  entry,
  srNo,
  positions,
  holders,
  onOpen,
}: {
  entry: JdEntryRow;
  /** The row's place in what is on screen — renumbers when filtered or sorted. */
  srNo: number;
  positions: JdPositionRow[];
  holders: SeatHolder[];
  onOpen: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const doers = whoDoesIt(entry, positions, holders);

  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${
        entry.isActive ? "" : "opacity-50"
      }`}
    >
      {/* Sr. No. — the row's place on screen. The permanent identifier is the
          serial, which is on the number as a tooltip and stated in full in the
          drawer: it is what you quote in a message, and it must not move when
          somebody filters the Bank. */}
      <td
        className="px-4 py-2.5 text-right tabular-nums text-slate-400"
        title={`Serial ${entry.serialNo}`}
      >
        {srNo}
      </td>

      <td className="px-4 py-2.5 text-slate-600">
        {entry.positionTitle}
        {doers.via === "escalated" && (
          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">
            VACANT
          </span>
        )}
      </td>

      <td className="px-4 py-2.5 text-slate-600">
        {FUNCTION_LABELS[entry.functionKey as BusinessFunction] ?? entry.functionKey}
      </td>

      <td className="px-4 py-2.5 font-medium text-slate-800">{entry.task}</td>

      <td className="px-4 py-2.5 text-slate-600">{describeRecurrence(entry.recurrence)}</td>

      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
        {entry.estimatedMinutes}m
      </td>

      {/* Attachment — one chip per slot that is actually filled. An empty slot
          shows nothing rather than a placeholder, so a glance down the column
          says which jobs have an SOP. */}
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {entry.videoUrl && <LinkChip href={entry.videoUrl} label="Video" />}
          {entry.guidelinesUrl && <LinkChip href={entry.guidelinesUrl} label="Guide" />}
          {entry.templateUrl && <LinkChip href={entry.templateUrl} label="Template" />}
          {attachmentCount(entry) === 0 && <span className="text-slate-300">—</span>}
        </div>
      </td>

      {/* Notes — one line, markup stripped. The full text is in the drawer;
          a cell that grows to fit a paragraph makes every other row unreadable. */}
      <td className="px-4 py-2.5 text-slate-500">
        {notesText(entry) ? (
          <span className="line-clamp-1" title={notesText(entry)}>
            {notesText(entry)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
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

      {/* Add To Person — the people named on this JD. When nobody is named the
          work still has an owner, so the resolved holder is shown underneath in
          muted type: "unassigned" here would be false, and hiding it was the
          one fact a reader of this table needs. */}
      <td className="px-4 py-2.5">
        {entry.assignees.length > 0 ? (
          <span className="text-slate-700">{entry.assignees.join(", ")}</span>
        ) : doers.names.length > 0 ? (
          <>
            <span className="text-slate-500">{doers.names.join(", ")}</span>
            <span
              className={`block text-[10px] ${
                doers.via === "escalated" ? "text-amber-700" : "text-slate-400"
              }`}
            >
              {doers.via === "escalated" ? "covering the vacant seat" : "by position"}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-red-700">
            <TriangleAlert className="h-3 w-3" /> Unassigned
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          disabled={busy}
          onClick={async (ev) => {
            // The row opens the drawer; this button must not do both.
            ev.stopPropagation();
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

/**
 * The ten headings, spelled once. The grid, the sort banner and the drawer all
 * read them from here, so a column cannot be called one thing in the header and
 * another in the sentence describing the sort.
 */
const JD_COLUMN_LABELS: Record<JdSortKey, string> = {
  sr: "Sr. No.",
  position: "Position",
  function: "Function",
  task: "Job Description",
  frequency: "Frequency",
  estimate: "Time Estimated",
  attachment: "Attachment",
  notes: "Notes",
  addto: "Add To",
  person: "Add To Person",
};

/** A sortable column heading. */
function SortTh({
  k,
  sort,
  onSort,
  className,
  align = "left",
}: {
  k: JdSortKey;
  sort: JdSortState;
  onSort: (k: JdSortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const label = JD_COLUMN_LABELS[k];
  const active = sort?.key === k;
  const dir = active ? sort!.dir : null;

  return (
    <th scope="col" aria-sort={ariaSort(sort, k)} className={`px-0 py-0 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        title={
          dir === "asc"
            ? `Sorted by ${label}, ascending — click for descending`
            : dir === "desc"
              ? `Sorted by ${label}, descending — click to clear`
              : `Sort by ${label}`
        }
        className={`flex w-full items-center gap-1 whitespace-nowrap px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-slate-100 ${
          align === "right" ? "justify-end" : "justify-start"
        } ${active ? "text-slate-900" : "text-slate-500"}`}
      >
        <span>{label}</span>
        {dir === "asc" ? (
          <ArrowUp className="h-3 w-3 shrink-0" style={{ color: ACCENT }} />
        ) : dir === "desc" ? (
          <ArrowDown className="h-3 w-3 shrink-0" style={{ color: ACCENT }} />
        ) : (
          /* Always in the DOM, faint: the heading does not change width when it
             becomes the sorted one, and a reader can see which columns sort
             before clicking one. */
          <ArrowUpDown className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
        )}
      </button>
    </th>
  );
}

/** An attachment slot that has something in it. */
function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      // The row opens the drawer; a link inside it must not do both.
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
    >
      <Paperclip className="h-2.5 w-2.5" />
      {label}
    </a>
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
  /** The date behind "Does not repeat" and "Annually on". */
  const [onDate, setOnDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [minutes, setMinutes] = React.useState("15");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [guidelinesUrl, setGuidelinesUrl] = React.useState("");
  const [templateUrl, setTemplateUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pushDcc, setPushDcc] = React.useState(false);
  const [pushWms, setPushWms] = React.useState(false);
  const [pushEvent, setPushEvent] = React.useState(false);
  /* One roster per destination. Held even while a destination is switched off —
     see ModuleAssignBoxes — and filtered down to the switched-on ones by the
     server action, which is the single place that decides what gets stored. */
  const [targetPeople, setTargetPeople] = React.useState<TargetPeople>({
    dcc: [],
    wms: [],
    event: [],
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chosen = positions.find((p) => p.id === positionId) ?? null;

  /** Rebuild the structured recurrence from the picker + its sub-fields. */
  const recurrence: Recurrence = React.useMemo(() => {
    const base = FREQUENCY_OPTIONS.find((o) => o.id === freqId)?.value ?? { kind: "daily" };
    if (base.kind === "interval") return { ...base, anchor };
    if (base.kind === "custom") return { ...base, label: customLabel };
    // "Does not repeat" is the date itself; "Annually on" keeps only its day and
    // month, so the same picker feeds both and the year is simply discarded.
    if (base.kind === "once") return { ...base, date: onDate };
    if (base.kind === "yearly") {
      const [, m, d] = onDate.split("-");
      return { ...base, month: Number(m) || 1, day: Number(d) || 1 };
    }
    return base;
  }, [freqId, anchor, customLabel, onDate]);

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
        targetPeople,
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
          {(recurrence.kind === "once" || recurrence.kind === "yearly") && (
            <input
              type="date"
              value={onDate}
              onChange={(e) => setOnDate(e.target.value)}
              aria-label={
                recurrence.kind === "once" ? "The date it happens" : "The date it happens each year"
              }
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
            />
          )}
          {recurrence.kind === "interval" && (
            <input
              type="date"
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

      {/* ── WHERE IT GOES, AND WHO DOES IT THERE ───────────────────────────
          Three boxes, each owning its own roster. This replaced a pair of
          fields — tick the destinations here, pick "Assigned Person(s)" from
          one list there — which could not say "these people for the DCC, those
          for the WMS", the ordinary case. */}
      <div className="mt-5">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Add to
        </p>
        <p className="mb-3 text-[12.5px] text-slate-500">
          Pick where this job is pushed, and who does it in each place. Leave a
          roster empty to let the position decide.
        </p>
        <ModuleAssignBoxes
          people={people}
          enabled={{ dcc: pushDcc, wms: pushWms, event: pushEvent }}
          onToggleTarget={(t, on) => {
            if (t === "dcc") setPushDcc(on);
            if (t === "wms") setPushWms(on);
            if (t === "event") setPushEvent(on);
          }}
          selected={targetPeople}
          onChangeTarget={(t, ids) => setTargetPeople((prev) => ({ ...prev, [t]: ids }))}
        />
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

  /* The seven the JD Bank offers — NOT the firm's nine. Sales and Others stay
     in the master (employees and the org chart still use them); they are simply
     not seats a job description can be filed under. See lib/jd/functions.ts. */

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
            {JD_FUNCTIONS.map((f) => (
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
