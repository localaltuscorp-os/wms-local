"use client";

import * as React from "react";
import { Plus, Trash2, ArrowRight, Sparkles, Search, X, UserPlus, FileSpreadsheet } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateField } from "@/components/ui/date-field";
import { Select } from "@/components/ui/select";
import { TASK_PRIORITIES, PRIORITY_LABELS, type TaskPriority } from "@/db/enums";

/**
 * Tasks Bulk-entry GRID — an in-app spreadsheet (ports the Goals bulk grid to
 * Tasks). The user fills typed boxes + dropdowns, assigns
 * Doer(s) + an Initiator per row via a type-to-search picker, can paste straight
 * from Excel or drop a CSV/XLSX onto the grid, then "Proceed" hands clean rows
 * to the duplicate/anomaly review.
 * Keyboard-first: Tab across cells; the Priority/Doer/Initiator pickers and the
 * date field are all in-app components, so they render above the dialog and
 * follow the app’s own keyboard and visual language rather than the OS’s.
 */

export interface Person {
  id: string;
  name: string;
}

/** One clean row emitted to the review step. */
export interface TaskGridRow {
  title: string; // Client Name (required)
  subject: string | null;
  description: string | null;
  priority: TaskPriority;
  dueDate: string; // yyyy-mm-dd, "" when unset
  doers: Person[];
  initiator: Person | null;
}

interface Draft {
  id: number;
  title: string;
  subject: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  doers: Person[];
  initiator: Person | null;
}

const DEFAULT_PRIORITY: TaskPriority = "not_imp_not_urgent";

/** Priority enum → the {value,label} shape the house Select takes. */
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

const CELL =
  "w-full bg-transparent px-2 py-1.5 text-[13px] text-ink-strong outline-none focus:bg-[color-mix(in_oklab,var(--color-altus-red)_5%,transparent)]";

type TextKey = "title" | "subject" | "description";
/** The free-text columns (date, Priority, Doer and Initiator are all pickers).
 *  `suggest` names which prop feeds the cell's suggestion popover; a column
 *  without one is a plain input. This replaced a `list` datalist id — see
 *  SuggestInput for why the native control had to go. */
const TEXT_COLS: { key: TextKey; label: string; minW: number; suggest?: "clients" | "subjects"; placeholder: string }[] = [
  { key: "title", label: "Client Name", minW: 190, suggest: "clients", placeholder: "Client / task title" },
  { key: "subject", label: "Subject", minW: 150, suggest: "subjects", placeholder: "Subject" },
  { key: "description", label: "Description", minW: 240, placeholder: "What needs doing?" },
];

/** Best-effort name → roster member (exact, else startsWith, else includes). */
function findMember(roster: Person[], raw: string): Person | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  return (
    roster.find((m) => m.name.toLowerCase() === q) ??
    roster.find((m) => m.name.toLowerCase().startsWith(q)) ??
    roster.find((m) => m.name.toLowerCase().includes(q)) ??
    null
  );
}

/** Map a pasted priority label/value → a valid enum value (fallback = Normal). */
function coercePriority(raw: string): TaskPriority {
  const s = raw.trim().toLowerCase();
  if (!s) return DEFAULT_PRIORITY;
  const byValue = TASK_PRIORITIES.find((p) => p === s);
  if (byValue) return byValue;
  const byLabel = TASK_PRIORITIES.find((p) => PRIORITY_LABELS[p].toLowerCase() === s);
  return byLabel ?? DEFAULT_PRIORITY;
}

/** dd/mm/yyyy · dd-mm-yyyy · yyyy-mm-dd · yyyy/mm/dd → yyyy-mm-dd ("" if unparseable). */
function toISODate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split(/[/.\-]/).map((p) => p.trim());
  if (parts.length === 3) {
    let d: string, m: string, y: string;
    if (parts[0]!.length === 4) [y, m, d] = parts as [string, string, string];
    else [d, m, y] = parts as [string, string, string];
    if (y.length === 2) y = `20${y}`;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    if (/^\d{4}$/.test(y) && +mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${y}-${mm}-${dd}`;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Suggest input — the in-app replacement for <datalist>.              */
/* ------------------------------------------------------------------ */

/**
 * A free-text cell with a suggestion list.
 *
 * ── WHY NOT `<datalist>`, WHICH THIS REPLACES ────────────────────────────
 * A datalist popup is painted by the BROWSER, not by the page. Three
 * consequences, all of which were live bugs here:
 *
 *  1. It cannot be styled. Not "is hard to style" — `background`, `color` and
 *     `border-radius` on a datalist or its options do nothing in Chrome. So on
 *     Windows with the OS in dark mode the list rendered as dark chrome inside
 *     a white modal, and no class could change it. That is the black dropdown.
 *  2. It sits in the browser's own layer, above every z-index the page owns,
 *     and it swallows wheel and pointer events aimed at the dialog underneath.
 *  3. Its match rule is the browser's, not ours, and differs between engines.
 *
 * Rendering the list ourselves fixes all three at once and is what the rest of
 * this grid already does — the header comment's "in-app components, so they
 * render above the dialog and follow the app's own visual language rather than
 * the OS's" was true of every picker except these two cells.
 *
 * FREE TEXT IS PRESERVED. This is a suggestion list, not a select: Client Name
 * accepts values that are not in `options` (that is how a new client gets
 * added), so typing never constrains the input and the popover is only ever an
 * accelerator.
 */
function SuggestInput({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  /* Case-insensitive contains, minus an option the user has already typed in
     full — a lone suggestion identical to the input is noise. */
  const q = value.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      options.filter((o) => {
        const lo = o.toLowerCase();
        return lo !== q && (!q || lo.includes(q));
      }),
    [options, q],
  );

  // Keep the highlighted row in view as the arrows walk past the fold.
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const show = open && filtered.length > 0;

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <Popover open={show} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => { setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (!show) {
              /* ArrowDown on a closed cell opens the full list — the keyboard
                 equivalent of clicking in, and the only way to browse the
                 options without typing a character first. */
              if (e.key === "ArrowDown") setOpen(true);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              choose(filtered[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
            /* Tab is deliberately NOT intercepted: this grid is keyboard-first
               and Tab has to keep moving to the next cell. */
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={className}
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        /* Focus STAYS in the cell. Radix moves focus into the panel on open by
           default, which would end typing after the first character. */
        onOpenAutoFocus={(e) => e.preventDefault()}
        /* And is NOT dragged back on close — the same bug new-task-form.tsx
           documents: a focus restore re-fires the input's onFocus, which
           reopens the list, and Tab can then never leave the cell. */
        onCloseAutoFocus={(e) => e.preventDefault()}
        /* The anchor is the input, which lives OUTSIDE the panel, so every
           click and every focus back into the cell reads as "outside" and
           would dismiss the list mid-edit. */
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        /* `slim-scroll` rather than the native bar: a 17px grey Windows
           scrollbar inside a 240px popover is most of the popover.
           overscroll-contain keeps a flick at the end of the list out of the
           grid and the dialog behind it. */
        className="slim-scroll max-h-[min(240px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[200px] max-w-[340px] overscroll-contain p-0"
      >
        <div ref={listRef} className="py-1">
          {filtered.map((o, idx) => (
            <button
              key={o}
              type="button"
              data-idx={idx}
              /* mousedown, not click: the input holds focus, and a click
                 handler fires only after the blur that would already have
                 closed the panel out from under the pointer. */
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setActive(idx)}
              className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] font-semibold text-ink-strong ${idx === active ? "bg-surface-soft" : ""}`}
            >
              {o}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Member picker — type-to-search the roster; single or multi.         */
/* ------------------------------------------------------------------ */

function MemberPicker({
  roster,
  value,
  onChange,
  multi,
  placeholder,
}: {
  roster: Person[];
  value: Person[];
  onChange: (v: Person[]) => void;
  multi: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  /** Keyboard cursor into `filtered`, so the list is navigable without a mouse. */
  const [active, setActive] = React.useState(0);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const picked = new Set(value.map((v) => v.id));
  // The whole roster, unsliced — the list is scrollable, so capping it just
  // hid people who exist. Search narrows it; nothing else needs to.
  const filtered = roster.filter(
    (r) => !picked.has(r.id) && r.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  // Keep the highlighted row in view as the arrows walk past the fold.
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function add(m: Person) {
    onChange(multi ? [...value, m] : [m]);
    setQ("");
    setActive(0);
    if (multi) searchRef.current?.focus();
    else setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-1.5 py-1">
      {value.map((v) => (
        <span key={v.id} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-strong" style={{ borderColor: "var(--color-hairline-strong)" }}>
          {v.name.split(" ")[0]}
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== v.id))} aria-label={`Remove ${v.name}`} className="text-ink-subtle hover:text-altus-red">
            <X size={11} />
          </button>
        </span>
      ))}
      {(multi || value.length === 0) && (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) { setQ(""); setActive(0); }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-solid px-1.5 py-0.5 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              <UserPlus size={12} strokeWidth={2.4} /> {value.length ? "" : placeholder}
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={4}
            /* Radix focuses the first focusable in the panel, which is the
               search box, so typing starts immediately. That replaces a
               `setTimeout(() => searchRef.current?.focus(), 0)` which raced
               the dialog's own focus trap and lost about as often as it won. */
            onCloseAutoFocus={(e) => e.preventDefault()}
            className="flex max-h-[min(280px,var(--radix-popover-content-available-height))] w-[240px] flex-col overflow-y-hidden p-0"
          >
            <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2" style={{ borderColor: "var(--color-hairline)" }}>
              <Search size={13} className="text-ink-subtle" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter" && filtered[active]) {
                    e.preventDefault();
                    add(filtered[active]);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                placeholder="Search employee..."
                className="w-full bg-transparent text-[13px] text-ink-strong outline-none"
              />
            </div>
            {/* overscroll-contain stops a flick at the end of this list from
                chaining into the grid — and the dialog — behind it. */}
            <div ref={listRef} className="slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-[12.5px] font-semibold text-ink-subtle">No matches</p>
              ) : (
                filtered.map((m, idx) => (
                  <button
                    key={m.id}
                    type="button"
                    data-idx={idx}
                    onClick={() => add(m)}
                    onMouseEnter={() => setActive(idx)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-ink-strong ${idx === active ? "bg-surface-soft" : ""}`}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    {m.name}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

export function TasksBulkGrid(props: {
  roster: Person[];
  clients: string[];
  subjects: string[];
  /** Default initiator (current user) pre-filled on every new row; null when unknown. */
  me: Person | null;
  onProceed: (rows: TaskGridRow[]) => void;
}) {
  const seq = React.useRef(1);
  const blank = React.useCallback(
    (): Draft => ({
      id: seq.current++,
      title: "",
      subject: "",
      description: "",
      priority: DEFAULT_PRIORITY,
      dueDate: "",
      doers: [],
      initiator: props.me,
    }),
    [props.me],
  );

  const [rows, setRows] = React.useState<Draft[]>(() => Array.from({ length: 6 }, blank));

  function setCell(id: number, patch: Partial<Draft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  /** Spreadsheet-import UI state (drag highlight, parse in flight, parse error). */
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [fileErr, setFileErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function addRow() {
    setRows((prev) => [...prev, blank()]);
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? blank() : r))));
  }

  /**
   * One cell matrix → drafts, in the column order the grid shows:
   * Client · Subject · Description · Priority · Due · Doer(s) · Initiator.
   * Shared by the Excel paste handler and the file importer so a spreadsheet
   * lands identically whether it arrives via Ctrl+V or as a dropped file.
   */
  const draftsFromMatrix = React.useCallback(
    (matrix: string[][]): Draft[] =>
      matrix
        .filter((c) => c.some((cell) => cell.trim().length > 0))
        .map((c) => {
          const d = blank();
          d.title = (c[0] ?? "").trim();
          d.subject = (c[1] ?? "").trim();
          d.description = (c[2] ?? "").trim();
          d.priority = coercePriority(c[3] ?? "");
          d.dueDate = toISODate(c[4] ?? "");
          // Doer(s): comma/semicolon separated names → resolve against the roster.
          const doerCell = (c[5] ?? "").trim();
          if (doerCell) {
            d.doers = doerCell
              .split(/[;,]/)
              .map((n) => findMember(props.roster, n))
              .filter((m): m is Person => m !== null);
          }
          // Initiator: single name → roster member, else keep the default (me).
          const initCell = (c[6] ?? "").trim();
          if (initCell) d.initiator = findMember(props.roster, initCell) ?? props.me;
          return d;
        }),
    [props.roster, props.me, blank],
  );

  /** Append drafts after whatever the user has already filled in. */
  const appendDrafts = React.useCallback((parsed: Draft[]) => {
    if (parsed.length === 0) return;
    setRows((prev) => {
      const filled = prev.filter((r) => r.title.trim() || r.doers.length > 0);
      return [...filled, ...parsed];
    });
  }, []);

  /** Paste-from-Excel: tab/newline separated clipboard text → rows. */
  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;
    e.preventDefault();
    appendDrafts(
      draftsFromMatrix(
        text
          .replace(/\r/g, "")
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((line) => line.split("\t")),
      ),
    );
  }

  /**
   * CSV / XLSX dropped or chosen → rows, parsed in the browser. `xlsx` is
   * imported lazily so the spreadsheet reader isn't in the bundle for the many
   * people who only ever type into the grid.
   */
  const ingestFile = React.useCallback(
    async (file: File) => {
      setFileErr(null);
      setBusy(true);
      try {
        const XLSX = await import("xlsx");
        // `type: "array"` is required for an ArrayBuffer — without it xlsx
        // guesses at the encoding and a real .xlsx comes back as garbage.
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
          type: "array",
          cellDates: false,
        });
        const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
        if (!sheet) throw new Error("That file has no sheets.");
        const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          blankrows: false,
          defval: "",
          raw: false,
        });
        if (matrix.length === 0) throw new Error("That file is empty.");
        // Drop a header row if the first cell looks like a label, not a client.
        const first = (matrix[0]?.[0] ?? "").toString().trim().toLowerCase();
        const body = /^(client|client name|title|task)$/.test(first) ? matrix.slice(1) : matrix;
        const parsed = draftsFromMatrix(body.map((r) => r.map((c) => (c ?? "").toString())));
        if (parsed.length === 0) throw new Error("No rows found in that file.");
        appendDrafts(parsed);
      } catch (err) {
        setFileErr(err instanceof Error ? err.message : "Could not read that file.");
      } finally {
        setBusy(false);
      }
    },
    [draftsFromMatrix, appendDrafts],
  );

  function proceed() {
    const out: TaskGridRow[] = rows
      .filter((r) => r.title.trim().length > 0 || r.doers.length > 0)
      .map((r) => ({
        title: r.title.trim(),
        subject: r.subject.trim() || null,
        description: r.description.trim() || null,
        priority: r.priority,
        dueDate: r.dueDate,
        doers: r.doers,
        initiator: r.initiator,
      }));
    props.onProceed(out);
  }

  const filledCount = rows.filter((r) => r.title.trim() || r.doers.length > 0).length;

  return (
    <div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
        <span className="text-[13px] font-bold text-ink-strong">Fill your tasks below</span>
        <span className="text-[12px] font-semibold text-ink-subtle">— type, pick a Doer + Initiator, paste from Excel, or drop a file</span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-solid px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-50"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <FileSpreadsheet size={13} strokeWidth={2.4} /> {busy ? "Reading…" : "Import CSV / Excel"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ingestFile(f);
            e.target.value = ""; // let the same file be picked twice
          }}
        />
      </div>

      {fileErr && (
        <p className="mb-2 text-[12.5px] font-semibold text-altus-red">{fileErr}</p>
      )}

      <div
        className="relative overflow-x-auto rounded-xl border transition-colors"
        style={{ borderColor: dragging ? "var(--color-altus-red)" : "var(--color-hairline-strong)" }}
        onPaste={onPaste}
        onDragOver={(e) => {
          // Only claim the drag when it actually carries a file — otherwise
          // text selection inside the grid gets hijacked.
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Ignore the leave events fired while crossing child cells.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void ingestFile(f);
        }}
      >
        {dragging && (
          <div
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl text-[13px] font-bold text-altus-red"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card))" }}
          >
            Drop a CSV or Excel file to fill these rows
          </div>
        )}
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--color-surface-soft)" }}>
              <th className="w-10 border-b px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>#</th>
              {TEXT_COLS.map((c) => (
                <th key={c.key} className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: c.minW }}>
                  {c.label}
                </th>
              ))}
              <th className="border-b border-l px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 120 }}>Priority</th>
              <th className="border-b border-l px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 150 }}>Due Date</th>
              <th className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 190 }}>Doer(s)</th>
              <th className="border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft" style={{ borderColor: "var(--color-hairline)", minWidth: 160 }}>Initiator</th>
              <th className="w-8 border-b border-l px-1 py-2" style={{ borderColor: "var(--color-hairline)" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="group">
                <td className="border-b px-1 text-center align-middle text-[12px] font-bold tabular-nums text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>{i + 1}</td>
                {TEXT_COLS.map((c) => (
                  <td key={c.key} className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: c.minW }}>
                    {c.suggest ? (
                      <SuggestInput
                        value={r[c.key]}
                        onChange={(v) => setCell(r.id, { [c.key]: v } as Partial<Draft>)}
                        options={c.suggest === "clients" ? props.clients : props.subjects}
                        placeholder={c.placeholder}
                        className={`${CELL} ${c.key === "title" ? "font-semibold" : ""}`}
                      />
                    ) : (
                      <input
                        value={r[c.key]}
                        onChange={(e) => setCell(r.id, { [c.key]: e.target.value } as Partial<Draft>)}
                        placeholder={c.placeholder}
                        className={CELL}
                      />
                    )}
                  </td>
                ))}
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 120 }}>
                  {/* The house Select (portalled Popover + cmdk) rather than a
                      native <select>: it inherits the app's keyboard nav and
                      renders above the dialog instead of as an OS menu that
                      ignores every style in this grid. `unstyled` keeps the
                      compact cell box. */}
                  <Select
                    options={PRIORITY_OPTIONS}
                    value={r.priority}
                    onValueChange={(v) => setCell(r.id, { priority: v as TaskPriority })}
                    searchable={false}
                    ariaLabel="Priority"
                    unstyled
                    className={`${CELL} cursor-pointer`}
                  />
                </td>
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 150 }}>
                  {/* DateField, not `<input type="date">`: the native control
                      renders an unstyleable dd-mm-yyyy stub and its picker is
                      locale-bound. This takes typing in any common order and
                      opens a calendar from the icon. */}
                  <DateField
                    value={r.dueDate}
                    onChange={(e) => setCell(r.id, { dueDate: e.target.value })}
                    aria-label="Due date"
                    className={`${CELL} ${r.dueDate ? "text-ink-strong" : "text-ink-subtle"}`}
                  />
                </td>
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 190 }}>
                  <MemberPicker roster={props.roster} value={r.doers} onChange={(v) => setCell(r.id, { doers: v })} multi placeholder="Doer" />
                </td>
                <td className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: 160 }}>
                  <MemberPicker roster={props.roster} value={r.initiator ? [r.initiator] : []} onChange={(v) => setCell(r.id, { initiator: v[0] ?? null })} multi={false} placeholder="Initiator" />
                </td>
                <td className="border-b border-l px-1 text-center align-middle" style={{ borderColor: "var(--color-hairline)" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`Remove row ${i + 1}`}
                    className="grid size-6 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:text-altus-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-solid px-3 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
          style={{ borderColor: "var(--color-hairline-strong)" }}
        >
          <Plus size={14} strokeWidth={2.6} /> Add Row
        </button>
        <button
          type="button"
          onClick={proceed}
          disabled={filledCount === 0}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          Proceed to Review {filledCount > 0 ? `(${filledCount})` : ""} <ArrowRight size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
