"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  Check as CheckIcon,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  Paperclip,
  Plus,
  TriangleAlert,
  X,
  FileSpreadsheet,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JdBulkUpload } from "@/components/operations/job-description/jd-bulk-upload";
import { JdPersonView } from "@/components/operations/job-description/jd-person-view";
import {
  FUNCTION_LABELS,
  type BusinessFunction,
} from "@/lib/org/functions";
import { describeRecurrence, type Recurrence } from "@/lib/jd/recurrence";
import { JdFrequencyField } from "@/components/operations/job-description/jd-frequency-field";
import {
  NewJdAttachments,
  type NewJdAttachmentsHandle,
} from "@/components/operations/job-description/jd-attachment-boxes";
import type { JdAttachmentKind } from "@/lib/jd/attachments";
import { JdPersonPicker, rememberPersonInUrl } from "@/components/operations/job-description/jd-person-picker";
import { buildPersonIndex } from "@/lib/jd/person-index";
import type { JdEntryRow, JdEventOption, JdPositionRow, JdRankRow } from "@/lib/queries/job-description";
import { ModuleAssignBoxes } from "@/components/operations/job-description/module-assign-boxes";
import { ClientSelect } from "@/components/tasks/client-select";
import { SubjectSelect } from "@/components/tasks/subject-select";
import {
  EMPTY_JD_ROSTERS,
  JdRostersProvider,
  useJdRosters,
  type JdRosters,
} from "@/components/operations/job-description/jd-rosters";
import { VoiceNoteButton } from "@/components/ui/voice-note-button";
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
  /** The live event checklists — what the Event Checklist box offers (2026-09-18). */
  events?: JdEventOption[];
  /** The WMS Tasks client and subject rosters, and who is looking (2026-09-18). */
  rosters?: JdRosters;
  /**
   * Which screen this is (2026-09-15, Operations → Masters):
   *   · "all"     — the full Bank (Operations → Job Description)
   *   · "general" — Master JD only: list and by-position views, no person view
   *   · "person"  — Person-specific JD only: the people list and one person's JD
   */
  mode?: "all" | "general" | "person";
  /** Person mode: open on this person. */
  initialPersonId?: string | null;
  /**
   * CONTROLLED PERSON, when somebody above hosts the picker.
   *
   * The Person-specific JD page puts the picker beside its heading, which is
   * above this component — so it owns the choice and this follows. Pass BOTH or
   * NEITHER: given neither, the Bank keeps its own state and renders the picker
   * itself, which is what the full Bank's "By person" view needs.
   */
  personId?: string;
  onPersonChange?: (id: string) => void;
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
  events = [],
  rosters = EMPTY_JD_ROSTERS,
  mode = "all",
  initialPersonId = null,
  personId: controlledPersonId,
  onPersonChange,
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
  const [view, setView] = React.useState<BankView>(mode === "person" ? "people" : "list");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  /* Whose JD the person view shows. Controlled when a host renders the picker
     (see JdBankProps.personId), otherwise ours. */
  const [ownPersonId, setOwnPersonId] = React.useState(() =>
    initialPersonId && people.some((p) => p.id === initialPersonId)
      ? initialPersonId
      : (people[0]?.id ?? ""),
  );
  const hosted = onPersonChange !== undefined;
  const personId = controlledPersonId ?? ownPersonId;
  const setPersonId = React.useCallback(
    (id: string) => {
      if (onPersonChange) onPersonChange(id);
      else {
        setOwnPersonId(id);
        rememberPersonInUrl(id);
      }
    },
    [onPersonChange],
  );
  const personIndex = React.useMemo(() => buildPersonIndex(entries, holders), [entries, holders]);
  const positionTitle = React.useMemo(
    () => new Map(positions.map((p) => [p.id, p.title])),
    [positions],
  );

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
    <JdRostersProvider value={rosters}>
    <div className="flex flex-col gap-5">
      {mode !== "person" && positions.length === 0 && (
        <NoPositionsYet ranks={ranks} />
      )}

      {mode !== "person" && positions.length > 0 && (
        <JdSummary entries={entries} positions={positions} holders={holders} />
      )}

      {/* The person screen has its own controls — function tabs, views and the
          New JD form belong to the register, not to one person's JD.

          ONE LINE (account holder, 2026-09-18: "everything in one line, it
          saves space"): the function tabs on the left, then the view as a
          dropdown, Bulk upload and New JD on the right — every control the
          same 36px height. The tabs never wrap under the buttons: on a screen
          too narrow for all of them they scroll sideways instead. */}
      <div className={mode === "person" ? "hidden" : "flex items-center gap-2"}>
        <div
          role="tablist"
          aria-label="Filter by function"
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:thin]"
        >
          <FilterTab active={tab === "all"} onClick={() => setTab("all")}>
            All ({entries.length})
          </FilterTab>
          {functionsPresent.map((f) => (
            <FilterTab key={f} active={tab === f} onClick={() => setTab(f)}>
              {FUNCTION_LABELS[f]} ({entries.filter((e) => e.functionKey === f).length})
            </FilterTab>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Hidden while the form is open: it switches how the Bank below is
              laid out, which does nothing for somebody writing a new JD. */}
          {!showForm && <ViewMenu view={view} onChange={setView} withPeople={mode === "all"} />}

          {/* All tasks in one go, from Excel — Master JDs and personal JDs alike. */}
          {!showForm && (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Bulk upload
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            disabled={positions.length === 0}
            title={showForm ? undefined : "New Job Description"}
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-45"
            style={{ background: ACCENT }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Close" : "New JD"}
          </button>
        </div>
      </div>

      {showForm && positions.length > 0 && (
        <JdForm
          positions={positions}
          people={people}
          events={events}
          onDone={() => setShowForm(false)}
        />
      )}

      {view === "people" ? (
        <div className="flex min-w-0 flex-col gap-4">
          {/* The full Bank has no page-level picker, so it carries its own. */}
          {!hosted && people.length > 0 && (
            <div className="flex justify-end">
              <JdPersonPicker
                people={people}
                personId={personId}
                onChange={setPersonId}
                index={personIndex}
                positionTitle={positionTitle}
              />
            </div>
          )}
        <JdPersonView
          entries={entries}
          positions={positions}
          holders={holders}
          people={people}
          onOpen={setOpenId}
          personId={personId}
          index={personIndex}
          renderForm={(person, done) => (
            <JdForm
              positions={positions}
              people={people}
              events={events}
              person={person}
              onDone={done}
            />
          )}
        />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-slate-700">
            {entries.length === 0 ? "The JD Bank is empty" : "Nothing in this function"}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            {positions.length === 0
              ? "Create a position for a Master JD, or open By person to write a personal JD."
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

          {/* ITS OWN SCROLL BOX, BOTH WAYS (account holder, 2026-09-18: "a table
              scroll on both vertical and horizontal"), as the Event Checklist
              grid does. The box is the height of the window, so the sideways
              scrollbar is always on screen rather than under the last row, and
              the headings stay pinned while the rows move under them. At its
              top or bottom edge the wheel carries on to the page, so reading
              down the Bank never gets stuck inside the box.

              FIXED COLUMN WIDTHS (`table-layout: fixed` + the colgroup), so a
              column is the same width whichever function tab is open and the
              Job Description never gets squeezed to a word a line. */}
          <div
            className="table-scroll table-scroll-bold overflow-auto rounded-2xl border border-slate-200 bg-white"
            style={{ maxHeight: "max(420px, calc(100vh - 170px))", overscrollBehaviorY: "auto" }}
          >
            <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed", width: JD_TABLE_WIDTH }}>
              <colgroup>
                {JD_COLUMNS.map((k) => (
                  <col key={k} style={{ width: JD_COL_WIDTH[k] }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <SortTh k="sr" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh k="position" sort={sort} onSort={toggleSort} />
                  <SortTh k="function" sort={sort} onSort={toggleSort} />
                  <SortTh k="client" sort={sort} onSort={toggleSort} />
                  <SortTh k="category" sort={sort} onSort={toggleSort} />
                  <SortTh k="task" sort={sort} onSort={toggleSort} />
                  <SortTh k="frequency" sort={sort} onSort={toggleSort} />
                  <SortTh k="estimate" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh k="attachment" sort={sort} onSort={toggleSort} />
                  <SortTh k="notes" sort={sort} onSort={toggleSort} />
                  <SortTh k="addto" sort={sort} onSort={toggleSort} />
                  <SortTh k="person" sort={sort} onSort={toggleSort} />
                  {/* The retire/restore control. An action, not a column of
                      data, so it has no heading and nothing to sort by. */}
                  <th className={STICKY_HEAD} />
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

      <JdBulkUpload open={bulkOpen} onClose={() => setBulkOpen(false)} positions={positions} people={people} />

      {open && (
        <JdDetailDrawer
          entry={open}
          positions={positions}
          holders={holders}
          people={people}
          events={events}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
    </JdRostersProvider>
  );
}

type BankView = "list" | "seats" | "people";

const VIEWS: { key: BankView; label: string; Icon: typeof List }[] = [
  { key: "list", label: "All", Icon: List },
  { key: "seats", label: "By position", Icon: LayoutGrid },
  { key: "people", label: "By person", Icon: UserRound },
];

/**
 * How the Bank is laid out — All, By position, By person — as one dropdown
 * rather than three buttons side by side, so the whole toolbar fits on a line.
 * The trigger always says which view is on.
 */
function ViewMenu({
  view,
  onChange,
  withPeople,
}: {
  view: BankView;
  onChange: (v: BankView) => void;
  /** Master JD only has no person view. */
  withPeople: boolean;
}) {
  const choices = VIEWS.filter((v) => withPeople || v.key !== "people");
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`View: ${current.label}`}
          title="Change the view"
          className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white pl-3 pr-2.5 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 data-[state=open]:bg-slate-50"
        >
          <current.Icon className="h-4 w-4 text-slate-600" />
          {current.label}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {choices.map(({ key, label, Icon }) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => onChange(key)}
            className={`text-[14px] ${key === view ? "font-semibold" : ""}`}
          >
            <Icon className="h-4 w-4 text-slate-500" />
            {label}
            {key === view && <CheckIcon className="ml-auto h-4 w-4" style={{ color: ACCENT }} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
        {entry.ownerEmployeeId ? (
          <span>
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold text-slate-600">PERSONAL</span>{" "}
            {entry.ownerName ?? "—"}
          </span>
        ) : (
          entry.positionTitle
        )}
        {doers.via === "escalated" && (
          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">
            VACANT
          </span>
        )}
      </td>

      <td className="px-4 py-2.5 text-slate-600">
        {FUNCTION_LABELS[entry.functionKey as BusinessFunction] ?? entry.functionKey}
      </td>

      <td className="px-4 py-2.5 text-slate-600">
        {entry.client ?? <span className="text-slate-300">—</span>}
      </td>

      <td className="px-4 py-2.5 text-slate-600">
        {entry.category ?? <span className="text-slate-300">—</span>}
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
          {/* Uploaded files: a count, not a chip each — a JD can carry thirty.
              The row click opens the drawer, which lists and opens them. */}
          {(entry.files?.length ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600"
              title={entry.files!.map((f) => f.fileName).join("\n")}
            >
              <Paperclip className="h-2.5 w-2.5" />
              {entry.files!.length} {entry.files!.length === 1 ? "file" : "files"}
            </span>
          )}
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
 * The twelve headings, spelled once. The grid, the sort banner and the drawer all
 * read them from here, so a column cannot be called one thing in the header and
 * another in the sentence describing the sort.
 */
const JD_COLUMN_LABELS: Record<JdSortKey, string> = {
  sr: "Sr. No.",
  position: "Position",
  function: "Function",
  client: "Client",
  category: "Subject",
  task: "Job Description",
  frequency: "Frequency",
  estimate: "Time Estimated",
  attachment: "Attachment",
  notes: "Notes",
  addto: "Add To",
  person: "Add To Person",
};

/**
 * The Bank's columns in order, and each one's width in px — enough for its
 * content at 13px, so the headings sit on one line and a position title or a
 * frequency wraps at most once. The table is exactly as wide as their sum.
 */
const JD_COLUMNS = [
  "sr",
  "position",
  "function",
  "client",
  "category",
  "task",
  "frequency",
  "estimate",
  "attachment",
  "notes",
  "addto",
  "person",
  "actions",
] as const;

const JD_COL_WIDTH: Record<(typeof JD_COLUMNS)[number], number> = {
  sr: 84,
  position: 210,
  function: 130,
  client: 140,
  category: 140,
  task: 320,
  frequency: 170,
  estimate: 150,
  attachment: 150,
  notes: 220,
  addto: 130,
  person: 200,
  actions: 90,
};

const JD_TABLE_WIDTH = JD_COLUMNS.reduce((sum, k) => sum + JD_COL_WIDTH[k], 0);

/**
 * A heading pinned to the top of the scroll box. The line under it is a shadow,
 * not a border: a collapsed table's borders belong to the table and scroll away
 * with the first row, leaving the pinned heading without its rule.
 */
const STICKY_HEAD = "sticky top-0 z-20 bg-slate-50 px-0 py-0 shadow-[inset_0_-1px_0_rgb(226,232,240)]";

/** A sortable column heading. */
function SortTh({
  k,
  sort,
  onSort,
  align = "left",
}: {
  k: JdSortKey;
  sort: JdSortState;
  onSort: (k: JdSortKey) => void;
  align?: "left" | "right";
}) {
  const label = JD_COLUMN_LABELS[k];
  const active = sort?.key === k;
  const dir = active ? sort!.dir : null;

  return (
    <th scope="col" aria-sort={ariaSort(sort, k)} className={STICKY_HEAD}>
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
        className={`flex w-full items-center gap-1 whitespace-nowrap px-4 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-slate-100 ${
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
  events,
  person = null,
  onDone,
}: {
  positions: JdPositionRow[];
  people: { id: string; name: string }[];
  events: JdEventOption[];
  /** Set → a PERSONAL task for this employee: no position, a function picked instead. */
  person?: { id: string; name: string } | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [positionId, setPositionId] = React.useState("");
  const [functionKey, setFunctionKey] = React.useState<BusinessFunction>("operations");
  const rosters = useJdRosters();
  const [task, setTask] = React.useState("");
  /* SUBJECT and CLIENT — the WMS Tasks rosters (Admin Panel → Subjects /
     Clients), not free text: a JD is filed in the words a task is. */
  const [category, setCategory] = React.useState("");
  const [client, setClient] = React.useState("");
  /* ONE start date, the way Google Calendar has one. It anchors the whole
     frequency menu: "Does not repeat" is that day, "Weekly on …" is its
     weekday, "Annually on …" is its date, and a custom rule counts from it. */
  const [startDate, setStartDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [recurrence, setRecurrence] = React.useState<Recurrence>({ kind: "daily" });
  const [minutes, setMinutes] = React.useState("15");
  /* One link per SOP box, beside the box's uploaded files. */
  const [links, setLinks] = React.useState<Record<JdAttachmentKind, string>>({
    video: "",
    guidelines: "",
    template: "",
  });
  const files = React.useRef<NewJdAttachmentsHandle>(null);
  const [uploading, setUploading] = React.useState(false);
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
  /* The Event Checklist box picks EVENTS, not people: each chosen one gets this
     job as a row in its checklist. */
  const [eventRunIds, setEventRunIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chosen = positions.find((p) => p.id === positionId) ?? null;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await createJdEntry({
        // No position picked → leave it out, so the server answers "Pick a
        // position…" rather than Zod's raw complaint about an empty id.
        ...(person ? { ownerEmployeeId: person.id, functionKey } : { positionId: positionId || undefined }),
        task,
        category: category || null,
        client: client || null,
        notesHtml: notes || null,
        recurrence,
        estimatedMinutes: Number(minutes),
        videoUrl: links.video || null,
        guidelinesUrl: links.guidelines || null,
        templateUrl: links.template || null,
        attachments: files.current?.refs() ?? [],
        pushDcc,
        pushWms,
        pushEvent,
        targetPeople: { ...targetPeople, event: [] },
        eventRunIds: pushEvent ? eventRunIds : [],
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

  function cancel() {
    // Nothing was saved, so nothing may be left behind in storage either.
    files.current?.discardAll();
    onDone();
  }

  /* ── LAYOUT: equal columns per line (account holder, 2026-09-18) ─────────
       1. Position · Function · Client · Subject
       2. Task — the full width
       3. Starts on · Frequency · Estimated time
       4. Video · Guidelines · Templates — a box each, several files per box
     then Notes and Add to. Equal columns from md up; one below, where they
     would be too narrow to type in. */
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">
        {person ? `New personal task — ${person.name}` : "New Job Description"}
      </h2>

      {/* 1 ─ who owns it, and how it is filed */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {person ? (
          <Field label="Person" hint="A personal task belongs to this person, not to a seat.">
            <div className="truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-700">
              {person.name}
            </div>
          </Field>
        ) : (
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
        )}

        {person ? (
          <Field label="Function">
            <select
              value={functionKey}
              onChange={(e) => setFunctionKey(e.target.value as BusinessFunction)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
            >
              {JD_FUNCTIONS.map((f) => (
                <option key={f} value={f}>
                  {FUNCTION_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Department / Function" hint="Comes from the position.">
            <div className="truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
              {chosen
                ? (FUNCTION_LABELS[chosen.functionKey as BusinessFunction] ?? chosen.functionKey)
                : "—"}
            </div>
          </Field>
        )}

        <Field label="Client" hint="From Admin Panel → Clients, as on a WMS task.">
          <ClientSelect
            value={client}
            onChange={setClient}
            clients={rosters.clients}
            canAdd={rosters.canAdd}
            placeholder="Select a client…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
          />
        </Field>

        <Field label="Subject" hint="From Admin Panel → Subjects, as on a WMS task.">
          <SubjectSelect
            value={category}
            onChange={setCategory}
            subjects={rosters.subjects}
            canAdd={rosters.canAdd}
            placeholder="Select a subject…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px]"
          />
        </Field>
      </div>

      {!person && chosen && chosen.holderCount === 0 && (
        <p className="mt-3 inline-flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
           style={{ background: "#FFFBEB", color: "#92400E" }}>
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This seat is vacant. Anything filed here escalates to the nearest filled
          position above it in the same function until somebody is placed.
        </p>
      )}

      {/* 2 ─ the work itself */}
      <div className="mt-4">
        <Field label="Task / Job Description">
          <DictateTextarea
            value={task}
            onChange={setTask}
            placeholder="e.g. Make tea/coffee for the office and guests"
          />
        </Field>
      </div>

      {/* 3 ─ when, and how long. JdFrequencyField fills the first two cells. */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <JdFrequencyField
          startDate={startDate}
          onStartDateChange={setStartDate}
          value={recurrence}
          onChange={setRecurrence}
        />
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

      {/* 4 ─ SOP documents. Guidelines and Templates are DOCUMENTS, deliberately
          not rendered as anything tickable — a checklist implies completion
          state they must not carry. */}
      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          SOP attachments &amp; documents
        </p>
        <NewJdAttachments
          ref={files}
          links={links}
          onLinkChange={(kind, v) => setLinks((prev) => ({ ...prev, [kind]: v }))}
          onBusyChange={setUploading}
        />
      </div>

      <div className="mt-4">
        <Field label="Notes / Context">
          <DictateTextarea value={notes} onChange={setNotes} />
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
          events={events}
          selectedEvents={eventRunIds}
          onChangeEvents={setEventRunIds}
        />
      </div>

      {error && <p className="mt-4 text-[13px] text-red-700">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy || uploading}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {busy || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {uploading
            ? "Uploading files…"
            : person
              ? `Save to ${person.name.split(" ")[0]}'s JD`
              : "Save to JD Bank"}
        </button>
        <button
          type="button"
          onClick={cancel}
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

/**
 * A textarea with a small Dictate pill in its top-right corner — inside the box,
 * not beside the label. Top rather than bottom, because the bottom-right corner
 * is the resize handle. Spoken words are appended to whatever is already typed.
 */
function DictateTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-24 text-[13px]"
      />
      <div className="absolute right-1.5 top-1.5">
        <VoiceNoteButton
          compact
          label="Dictate"
          onText={(t) => onChange(value.trim() ? `${value.trimEnd()} ${t}` : t)}
        />
      </div>
    </div>
  );
}

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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-[12px] font-semibold transition-colors"
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
