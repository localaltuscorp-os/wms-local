"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
  Upload, Download, X, Check, Loader2, AlertTriangle, CheckCircle2, Copy,
  Trash2, FileSpreadsheet, CornerDownRight,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  KIND_LABEL, PLAN_KINDS, hasSchedule, hasTask, type PlanKind,
} from "@/lib/project-plan/levels";
import {
  MAX_BULK_ROWS, columnsFor, evaluateRows, importable, parseMatrix, parseText,
  toPayload, type BulkPerson, type BulkRow,
} from "@/lib/project-plan/bulk";
import {
  ancestorLevels, planPathTo, seedAncestors, writeRecentChain,
} from "@/lib/project-plan/recent";
import { bulkCreatePlanNodes } from "@/app/(app)/project-plan/actions";
import {
  ParentPickers, findPlanNode, parentIdFor, parentMissing, type PickedAncestors,
} from "./parent-pickers";
import { useRecentPlan } from "./use-recent-plan";
import type { PlanRow, EmployeeOption } from "./plan-board";

/**
 * Project Plan — BULK UPLOAD.
 *
 * Fifty actions under one result, in one gesture: paste a column out of a
 * document, paste a block out of Excel, or hand it the .xlsx. The reading and
 * the checking are in `lib/project-plan/bulk.ts` — this file is the screen.
 *
 * IT OPENS ALREADY POINTING SOMEWHERE. The destination pickers are pre-filled
 * from the branch you were last working in (lib/project-plan/recent.ts), so
 * bulk-uploading actions while you have a result open needs no destination
 * chosen at all — which is the whole request. They stay editable: it is a
 * default, not a lock, and the "last opened" chip says where it came from so a
 * pre-filled select is never a surprise.
 *
 * EVERY ROW IS SHOWN BEFORE ANYTHING IS WRITTEN. A bulk import is the one
 * gesture in the module that can put fifty wrong rows into the plan at once, so
 * nothing goes to the server until the table has been on screen: names editable
 * in place, owners and target dates pickable per row, duplicates flagged
 * against what is already under the parent, and anything unreadable unticked
 * and saying why.
 *
 * WHAT BECOMES A TASK. Every Result / Action / Sub-Action / Sub-Sub-Action,
 * without
 * exception. `tasks.doer_id` and `tasks.due_at` are NOT NULL, so a task needs
 * both before it can exist — and rather than leave a name-only sheet sitting in
 * the plan and invisible in WMS, `bulkCreatePlanNodes` fills a blank Owner with
 * the importer and a blank Target Date with today, then runs every row through
 * the same `syncNodeTask` every other write in the module uses. There is no
 * second way to make a task, and no row that quietly fails to become one.
 * Project and Milestone import as plan rows and get no task, as they always
 * have.
 */

/** The levels worth importing in bulk, outermost first. */
const BULK_KINDS: PlanKind[] = PLAN_KINDS.filter((k) => k !== "sub_sub_action");

const ACCENT = "#E10600";
const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-[#E10600] disabled:bg-surface-soft disabled:opacity-60";

export function PlanBulkUpload({
  tree,
  employees,
  initialKind = "action",
  open,
  onOpenChange,
  onDone,
}: {
  tree: PlanRow[];
  employees: EmployeeOption[];
  initialKind?: PlanKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fired after a successful import, so the surface behind can refresh. */
  onDone: () => void;
}) {
  const [kind, setKind] = React.useState<PlanKind>(initialKind);
  /** null = nobody has picked, so the chain IS the remembered branch below. */
  const [dest, setDest] = React.useState<PickedAncestors | null>(null);
  const [rows, setRows] = React.useState<BulkRow[] | null>(null);
  const [paste, setPaste] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const recent = useRecentPlan(tree);
  /** What the pickers are pre-filled with — also what marks them on screen. */
  const seed = React.useMemo(() => seedAncestors(kind, recent), [kind, recent]);

  /**
   * The destination: the remembered branch until somebody says otherwise.
   *
   * DERIVED, NOT COPIED INTO STATE — the memory is read from localStorage in an
   * effect (the server has none), so an effect writing it into state would be a
   * second render either way, and a late arrival could overwrite a deliberate
   * pick. `takeResult` PINS it the moment a preview exists, because the parent
   * must not move underneath fifty rows between the preview and Import.
   */
  const picked = dest ?? seed;

  const parentId = parentIdFor(kind, picked);
  const missing = parentMissing(kind, picked);
  const parent = parentId ? findPlanNode(tree, parentId) : null;

  /** The roster the owner column matches against — one shape for both uses. */
  const roster: BulkPerson[] = React.useMemo(
    () => employees.map((e) => ({ id: e.id, name: e.name })),
    [employees],
  );

  /** Names already sitting at this level under this parent — the dup check. */
  const existingNames = React.useMemo(() => {
    const siblings = parent ? parent.children : tree.filter((n) => n.kind === "project");
    return siblings.filter((n) => n.kind === kind).map((n) => n.name);
  }, [parent, tree, kind]);

  const cols = columnsFor(kind);
  const scheduled = hasSchedule(kind);
  const taskLevel = hasTask(kind);

  const valid = rows ? rows.filter((r) => r.errors.length === 0).length : 0;
  const broken = rows ? rows.length - valid : 0;
  const dups = rows ? rows.filter((r) => r.duplicate).length : 0;
  const chosen = rows ? importable(rows).length : 0;
  // EVERY executable row becomes a task now — `bulkCreatePlanNodes` defaults a
  // blank Owner to the importer and a blank Target Date to today rather than
  // leaving the row out of WMS. This used to count only the rows carrying both,
  // which would now under-report every import done from a name-only list.
  const willTask = rows && taskLevel ? importable(rows).length : 0;

  const reset = React.useCallback(() => {
    setRows(null);
    setPaste("");
    setFileName("");
    setError(null);
  }, []);

  const close = React.useCallback(() => {
    if (pending) return;
    onOpenChange(false);
    reset();
  }, [pending, onOpenChange, reset]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /** Changing the level re-reads nothing — the columns and the rules moved. */
  function changeKind(next: PlanKind) {
    setKind(next);
    setDest(null);
    reset();
  }

  function takeResult(res: ReturnType<typeof parseText>) {
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.rows.length > MAX_BULK_ROWS) {
      setError(`That is ${res.rows.length} rows — import at most ${MAX_BULK_ROWS} at a time.`);
      return;
    }
    setError(null);
    // Pin the destination to whatever it is right now — see `picked` above.
    setDest(picked);
    setRows(res.rows);
  }

  function readPaste() {
    setFileName("");
    takeResult(parseText(paste, kind, roster, existingNames));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setRows(null);
    setFileName(file.name);
    void (async () => {
      try {
        const buf = await file.arrayBuffer();
        // `cellDates` is what keeps 12-Jun-2026 a date rather than the serial
        // 46185, which the parser would then have to guess the epoch for.
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          setError("That file has no sheets in it.");
          return;
        }
        const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, {
          header: 1,
          blankrows: false,
          defval: "",
        }) as unknown[][];
        takeResult(parseMatrix(matrix, kind, roster, existingNames));
      } catch (err) {
        setError(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }

  /** The empty sheet, built here rather than served — it is six header cells. */
  function downloadTemplate() {
    const sample = cols.map((c) =>
      c.field === "name"
        ? `Example ${KIND_LABEL[kind].toLowerCase()}`
        : c.field === "owner"
          ? employees[0]?.name ?? "Person's name"
          : c.field === "description"
            ? "What this covers (optional)"
            : "2026-06-12",
    );
    const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.header), sample]);
    ws["!cols"] = cols.map((c) => ({ wch: c.field === "description" ? 42 : c.field === "name" ? 38 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${KIND_LABEL[kind]}s`.slice(0, 31));
    XLSX.writeFile(wb, `project-plan-${kind}-template.xlsx`);
  }

  /**
   * Any inline edit re-runs the whole check — see `evaluateRows` on why it is
   * the whole set and not the one row.
   *
   * A PARSE error does not survive the edit, and should not: "Target Date isn't
   * a date" describes a cell that no longer exists once the row is being edited
   * through a real date input. The row stays unticked either way, so nothing
   * imports on the strength of an error quietly going away.
   */
  function editRow(key: number, patch: Partial<BulkRow>) {
    setRows((prev) =>
      prev ? evaluateRows(prev.map((r) => (r.key === key ? { ...r, ...patch } : r)), kind, existingNames) : prev,
    );
  }

  function toggleRow(key: number) {
    setRows((prev) =>
      prev
        ? prev.map((r) => (r.key === key && r.errors.length === 0 ? { ...r, include: !r.include } : r))
        : prev,
    );
  }

  function dropRow(key: number) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = prev.filter((r) => r.key !== key);
      return next.length ? evaluateRows(next, kind, existingNames) : null;
    });
  }

  function doImport() {
    if (!rows) return;
    const payload = importable(rows).map((r) => toPayload(r, kind));
    if (payload.length === 0) {
      setError("Tick at least one row to import.");
      return;
    }
    if (missing) {
      setError(`Choose the ${KIND_LABEL[ancestorLabel(kind)].toLowerCase()} these go under first.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await bulkCreatePlanNodes({ kind, parentId, rows: payload });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Fifty rows just went in here, so this is now unambiguously where
        // the user is working — the next create opens pointing at it.
        if (parentId) {
          const path = planPathTo(tree, parentId);
          if (path.length) writeRecentChain(path);
        }
        const where = parent ? ` into ${parent.name}` : "";
        fireToast({
          message:
            res.tasks > 0
              ? `Added ${res.created} ${label(kind, res.created)}${where} — ${res.tasks} became WMS tasks.`
              : `Added ${res.created} ${label(kind, res.created)}${where}.`,
          type: "success",
        });
        onOpenChange(false);
        reset();
        onDone();
      } catch {
        // The idle timeout logs you out mid-action; the POST comes back as the
        // login page and the call rejects rather than returning {ok:false}.
        setError("That didn't reach the server — you may have been signed out. Reload and try again.");
      }
    });
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        // The create shortcuts (P · M · R · T · S) stand down while any
        // `[role=dialog][data-state=open]` is up — see usePlanCreateShortcuts.
        data-state="open"
        aria-label={`Bulk upload ${KIND_LABEL[kind].toLowerCase()}s`}
        className="flex max-h-[90vh] w-[min(1180px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ borderBottom: `3px solid ${ACCENT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Head ──────────────────────────────────────────────────────── */}
        <div className="relative shrink-0 border-b border-hairline px-8 py-5 max-md:px-5">
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(22px, 2.2vw, 30px)",
              letterSpacing: "-0.022em",
              lineHeight: 1.02,
            }}
          >
            Bulk upload {KIND_LABEL[kind].toLowerCase()}s
          </h2>
          <p className="mt-1 max-w-[62ch] text-[15px] font-semibold text-ink-muted">
            Paste a list, or drop in the sheet. Every row is shown and checked before
            anything is written{taskLevel ? ", and every row becomes a real WMS task" : ""}.
          </p>
          <div className="absolute right-5 top-4">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-colors hover:bg-surface-soft"
            >
              <X size={20} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5 max-md:px-5">
          {/* Destination — level, then exactly the ancestors it needs. */}
          <div className="rounded-xl border border-hairline bg-surface-soft p-4">
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <div className="min-w-0">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Level</p>
                <select
                  value={kind}
                  aria-label="Level to import"
                  onChange={(e) => changeKind(e.target.value as PlanKind)}
                  className={INPUT}
                >
                  {BULK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}s
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ParentPickers
              tree={tree}
              kind={kind}
              picked={picked}
              seededFrom={seed}
              onChange={setDest}
              className="mt-4"
            />

            <p className="mt-3 flex items-start gap-1.5 text-[13px] font-semibold text-ink-muted">
              <CornerDownRight size={15} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
              {missing ? (
                <span>
                  Choose the {KIND_LABEL[ancestorLabel(kind)].toLowerCase()} these {KIND_LABEL[kind].toLowerCase()}s go
                  under — nothing is remembered for it yet.
                </span>
              ) : parent ? (
                <span>
                  Going into <strong className="text-ink-strong">{parent.name || "(unnamed)"}</strong>
                  {existingNames.length > 0 && (
                    <> · appended after the {existingNames.length} {label(kind, existingNames.length)} already there</>
                  )}
                </span>
              ) : (
                <span>
                  Going in at the top of the plan
                  {existingNames.length > 0 && <> · appended after {existingNames.length} existing</>}
                </span>
              )}
            </p>
          </div>

          {/* Entry — paste, or a file. Hidden once there is a preview to read. */}
          {!rows && (
            <>
              <div className="mt-5">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  Paste your rows
                </p>
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={7}
                  spellCheck={false}
                  aria-label="Paste rows"
                  placeholder={placeholderFor(kind)}
                  className="w-full resize-y rounded-lg border border-hairline-strong bg-white px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink-strong outline-none transition-colors focus:border-[#E10600]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={readPaste}
                    disabled={!paste.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-40"
                    style={{ background: ACCENT }}
                  >
                    <Check size={15} strokeWidth={2.8} />{" "}
                    {/* LINES, not rows: a pasted block may carry a header, and
                        promising "42 rows" before parsing would be one out. */}
                    {paste.trim() ? `Check ${countLines(paste)} lines` : "Check rows"}
                  </button>
                  <p className="text-[12.5px] font-medium text-ink-muted">
                    One {KIND_LABEL[kind].toLowerCase()} per line. Columns are optional — separate them with a tab
                    (a paste straight out of Excel already is) or a comma.
                  </p>
                </div>
              </div>

              <div className="my-5 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
                <span className="h-px flex-1 bg-hairline" />
                or use a file
                <span className="h-px flex-1 bg-hairline" />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-hairline bg-surface-soft p-3.5">
                <FileSpreadsheet size={18} strokeWidth={2.2} className="shrink-0 text-ink-muted" aria-hidden />
                <span className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-ink-subtle">
                  {KIND_LABEL[kind]} template
                </span>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                >
                  <Download size={14} strokeWidth={2.4} /> Download .xlsx
                </button>
                <div className="ml-auto flex items-center gap-2">
                  {fileName && (
                    <span className="max-w-[180px] truncate text-[12.5px] font-semibold text-ink-muted">{fileName}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold text-white"
                    style={{ background: ACCENT }}
                  >
                    <Upload size={14} strokeWidth={2.6} /> Choose file
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={onFile}
                />
              </div>

              <p className="mt-3 text-[13px] font-medium leading-relaxed text-ink-muted">
                Columns: <strong className="text-ink-soft">{cols.map((c) => c.header).join(" · ")}</strong>. Only{" "}
                <strong className="text-ink-soft">Name</strong> is required
                {taskLevel && (
                  <>
                    {" "}
                    — every {KIND_LABEL[kind].toLowerCase()} becomes a WMS task on import, so a blank Owner falls back
                    to you and a blank Target Date to today. Both are editable on the row afterwards
                  </>
                )}
                .
              </p>
            </>
          )}

          {error && (
            <p
              className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red"
              style={{ background: "color-mix(in srgb, #E10600 8%, transparent)" }}
            >
              <AlertTriangle size={15} className="mt-px shrink-0" /> {error}
            </p>
          )}

          {/* ── Preview ─────────────────────────────────────────────────── */}
          {rows && (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Chip tone="green" icon={<CheckCircle2 size={14} />}>{valid} readable</Chip>
                {dups > 0 && (
                  <Chip tone="amber" icon={<Copy size={13} />}>
                    {dups} already {dups === 1 ? "exists" : "exist"}
                  </Chip>
                )}
                {broken > 0 && (
                  <Chip tone="red" icon={<AlertTriangle size={14} />}>{broken} need fixing</Chip>
                )}
                <span className="text-[12.5px] font-semibold tabular-nums text-ink-subtle">
                  {chosen} ticked to import{taskLevel && willTask > 0 ? ` · ${willTask} will become tasks` : ""}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto rounded-lg border border-hairline-strong px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:bg-surface-soft"
                >
                  Start over
                </button>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-hairline">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-surface-soft">
                      <Th className="w-[40px]" />
                      <Th>{KIND_LABEL[kind]} name</Th>
                      <Th className="w-[170px]">Owner</Th>
                      <Th className="w-[150px]">Target date</Th>
                      {scheduled && <Th className="w-[110px]">Start</Th>}
                      {scheduled && <Th className="w-[110px]">End</Th>}
                      <Th className="w-[120px]">Status</Th>
                      <Th className="w-[44px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const bad = r.errors.length > 0;
                      return (
                        <tr
                          key={r.key}
                          className="border-b border-hairline last:border-0"
                          style={{
                            background: bad
                              ? "color-mix(in srgb, #E10600 5%, transparent)"
                              : r.duplicate
                                ? "color-mix(in srgb, #b45309 6%, transparent)"
                                : r.include
                                  ? "transparent"
                                  : "var(--color-surface-soft)",
                          }}
                        >
                          <Td>
                            <input
                              type="checkbox"
                              checked={r.include && !bad}
                              disabled={bad}
                              onChange={() => toggleRow(r.key)}
                              aria-label={`Import row ${r.sourceRow}`}
                              className="size-4 cursor-pointer accent-[#E10600] disabled:cursor-not-allowed"
                            />
                          </Td>
                          <Td>
                            <textarea
                              value={r.name}
                              rows={1}
                              onChange={(e) => editRow(r.key, { name: e.target.value })}
                              onInput={(e) => {
                                const t = e.currentTarget;
                                t.style.height = "auto";
                                t.style.height = `${t.scrollHeight}px`;
                              }}
                              aria-label={`Name, row ${r.sourceRow}`}
                              className="w-full min-w-[220px] resize-none overflow-hidden rounded-md border bg-white px-2 py-1 text-[13px] font-semibold leading-snug text-ink-strong outline-none focus:border-[#E10600]"
                              style={{ borderColor: bad ? ACCENT : "var(--color-hairline-strong)" }}
                            />
                            {(r.errors.length > 0 || r.warnings.length > 0) && (
                              <div
                                className="mt-0.5 text-[11.5px] font-semibold"
                                style={{ color: bad ? "var(--color-altus-red-deep, #a30500)" : "var(--color-ink-muted)" }}
                              >
                                {[...r.errors, ...r.warnings].join(" · ")}
                              </div>
                            )}
                            {r.description && (
                              <div className="mt-0.5 line-clamp-2 text-[11.5px] font-medium text-ink-subtle" title={r.description}>
                                {r.description}
                              </div>
                            )}
                          </Td>
                          <Td>
                            <select
                              value={r.ownerId ?? ""}
                              onChange={(e) => {
                                const id = e.target.value;
                                editRow(r.key, {
                                  ownerId: id || null,
                                  ownerName: employees.find((x) => x.id === id)?.name ?? "",
                                });
                              }}
                              aria-label={`Owner, row ${r.sourceRow}`}
                              className="w-full rounded-md border border-hairline-strong bg-white px-1.5 py-1 text-[12.5px] font-semibold text-ink-strong outline-none focus:border-[#E10600]"
                            >
                              <option value="">— none —</option>
                              {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                          </Td>
                          <Td>
                            <input
                              type="date"
                              value={r.targetDate}
                              onChange={(e) => editRow(r.key, { targetDate: e.target.value })}
                              aria-label={`Target date, row ${r.sourceRow}`}
                              className="w-full rounded-md border border-hairline-strong bg-white px-1.5 py-1 text-[12.5px] font-semibold text-ink-strong outline-none focus:border-[#E10600]"
                            />
                          </Td>
                          {scheduled && <Td className="tabular-nums text-ink-soft">{r.startDate || "—"}</Td>}
                          {scheduled && <Td className="tabular-nums text-ink-soft">{r.endDate || "—"}</Td>}
                          <Td>
                            {bad ? (
                              <span className="text-[11.5px] font-bold text-altus-red">Fix to import</span>
                            ) : r.duplicate ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                                style={{ background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }}
                                title={
                                  r.duplicate === "existing"
                                    ? `A ${KIND_LABEL[kind].toLowerCase()} with this name is already there`
                                    : "This name is repeated earlier in the list"
                                }
                              >
                                <Copy size={11} /> {r.duplicate === "existing" ? "Exists" : "Repeat"}
                              </span>
                            ) : taskLevel && r.ownerId && r.targetDate ? (
                              <span className="text-[11.5px] font-bold" style={{ color: "var(--color-green-deep, #15803d)" }}>
                                Becomes a task
                              </span>
                            ) : (
                              <span className="text-[11.5px] font-bold text-ink-muted">Plan row</span>
                            )}
                          </Td>
                          <Td>
                            <button
                              type="button"
                              onClick={() => dropRow(r.key)}
                              aria-label={`Remove row ${r.sourceRow}`}
                              title="Remove this row"
                              className="grid size-6 place-items-center rounded-md text-altus-red transition-colors hover:bg-altus-red hover:text-white"
                            >
                              <Trash2 size={12} strokeWidth={2.4} />
                            </button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {dups > 0 && (
                <p className="mt-2 text-[12px] font-medium text-ink-muted">
                  Duplicates come in unticked. Rename one to make it unique, tick it to import anyway, or drop the row.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Foot ──────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-8 py-4 max-md:px-5">
          <span className="text-[12px] font-medium text-ink-subtle">
            Append-only · nothing already in the plan is changed
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="rounded-full border border-hairline-strong px-4 py-2 text-[13.5px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doImport}
              disabled={pending || chosen === 0 || missing}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13.5px] font-bold text-white transition-opacity disabled:opacity-40"
              style={{ background: ACCENT }}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
              {pending ? "Importing…" : chosen > 0 ? `Import ${chosen} ${label(kind, chosen)}` : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Small bits ──────────────────────────────────────────────────────────────

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-hairline px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-ink-subtle ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2 align-top ${className}`}>{children}</td>;
}

function Chip({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: "green" | "amber" | "red";
}) {
  const style =
    tone === "green"
      ? { background: "color-mix(in srgb, #16a34a 14%, transparent)", color: "#15803d" }
      : tone === "amber"
        ? { background: "color-mix(in srgb, #b45309 16%, transparent)", color: "#92400e" }
        : { background: "color-mix(in srgb, #E10600 12%, transparent)", color: "#a30500" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold" style={style}>
      {icon}
      {children}
    </span>
  );
}

/** "action" + 1 → "action"; + 3 → "actions". */
function label(kind: PlanKind, n: number): string {
  const l = KIND_LABEL[kind].toLowerCase();
  return n === 1 ? l : `${l}s`;
}

/** The level this one must sit under — only called when there IS one. */
function ancestorLabel(kind: PlanKind): PlanKind {
  const chain = ancestorLevels(kind);
  return chain[chain.length - 1] ?? "project";
}

function countLines(text: string): number {
  return text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
}

/** A worked example in the level's own vocabulary, tabs and all. */
function placeholderFor(kind: PlanKind): string {
  const head = columnsFor(kind).map((c) => c.header).join("\t");
  switch (kind) {
    case "project":
      return `${head}\nAICL Warehouse Rollout\tManan\t2026-12-31\tPhase two of the WMS build`;
    case "milestone":
      return `${head}\nSite survey complete\tManan\t2026-07-15\nRacking installed\tPriya\t2026-08-30`;
    case "result":
      return `${head}\nFloor plan signed off\tManan\t2026-07-10\t2026-07-01\t2026-07-10\t`;
    default:
      return `${head}\nMeasure the mezzanine\tManan\t2026-07-08\t2026-07-06\t2026-07-08\t\nDraft the layout\tPriya\t2026-07-12\t\t\t`;
  }
}
