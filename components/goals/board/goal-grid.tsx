"use client";

/**
 * goal-grid — a spreadsheet-grade grid engine layered OVER the Goals inline
 * table (goal-table-view.tsx). It does NOT own the cell editors; it adds:
 *
 *   • an active-cell {row,col} model over the editable columns (arrow-key nav),
 *   • rectangular multi-cell selection (click-drag OR Shift+Arrow) + highlight,
 *   • Copy (Ctrl/Cmd+C) → Excel-compatible TSV,
 *   • Paste (Ctrl/Cmd+V) ← TSV, per-field commit through the SAME actions,
 *   • Fill-down (Ctrl/Cmd+D),
 *   • Undo / Redo (Ctrl/Cmd+Z / Ctrl/Cmd+Y | Shift+Z) — a grouped edit-op stack.
 *
 * Every write is expressed as a `GridColumn` (read / editable / parse) so the
 * engine, the inline editors and the undo stack all commit the exact same way.
 * Read-only / derived cells (e.g. auto % Done) report `editable=false` and are
 * skipped by paste / fill / delete. Motion-free: selection is a static ring, so
 * nothing here needs reduced-motion gating.
 */

import * as React from "react";
import type { GoalDTO } from "@/components/goals/cascade/util";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GridActionRes = { ok: true } | { ok: false; error: string };

/** One editable column. `parse` turns a raw string (typed or pasted) into an
 *  optimistic patch + the server action that persists it, or null to reject. */
export interface GridColumn {
  key: string;
  label: string;
  /** Current cell value as a plain string (drives Copy + the undo "prev"). */
  read: (g: GoalDTO) => string;
  /** Whether THIS row/column can be edited (false = read-only / derived). */
  editable: (g: GoalDTO) => boolean;
  /** Parse a raw string → { optimistic patch, persisting action } or null. */
  parse: (raw: string, g: GoalDTO) => { partial: Partial<GoalDTO>; run: () => Promise<GridActionRes> } | null;
}

export type CellPos = { r: number; c: number };
type Sel = { anchor: CellPos; focus: CellPos };
type Rect = { r0: number; c0: number; r1: number; c1: number };
type Op = { id: string; colKey: string; prev: string; next: string };

interface EngineOpts {
  rows: GoalDTO[];
  columns: GridColumn[];
  enabled: boolean;
  applyEdit: (id: string, partial: Partial<GoalDTO>, run: () => Promise<GridActionRes>) => void;
}

export interface GridEngine {
  /** Spread on each participating `<td>`. */
  cellProps: (r: number, c: number, baseClass?: string) => React.HTMLAttributes<HTMLTableCellElement> & { ref: (el: HTMLTableCellElement | null) => void; tabIndex: number };
  /** Column index for a key (for `cellProps`). -1 if not a grid column. */
  ci: (key: string) => number;
  /** Single inline edit (records one undo step). Used by the existing editors. */
  commit: (colKey: string, g: GoalDTO, raw: string) => void;
  /** Attach to the scrolling table container. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Clear the active/selected cell (call on blur so the highlight never sticks). */
  blur: () => void;
  active: CellPos | null;
  /** True once more than one cell is selected. */
  hasRange: boolean;
}

/* ------------------------------------------------------------------ */
/* TSV helpers (Excel / Google Sheets compatible)                      */
/* ------------------------------------------------------------------ */

function toTSV(matrix: string[][]): string {
  return matrix.map((row) => row.join("\t")).join("\n");
}

function fromTSV(text: string): string[][] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Drop a single trailing newline (Excel appends one) but keep interior blanks.
  const body = clean.endsWith("\n") ? clean.slice(0, -1) : clean;
  return body.split("\n").map((line) => line.split("\t"));
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function readClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    /* permission denied / unsupported */
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                              */
/* ------------------------------------------------------------------ */

function rectOf(sel: Sel): Rect {
  return {
    r0: Math.min(sel.anchor.r, sel.focus.r),
    c0: Math.min(sel.anchor.c, sel.focus.c),
    r1: Math.max(sel.anchor.r, sel.focus.r),
    c1: Math.max(sel.anchor.c, sel.focus.c),
  };
}

function isTextEditEl(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return t === "text" || t === "number" || t === "date" || t === "search";
  }
  return false;
}

/** Push a value into a controlled React input so its onChange fires (type-to-edit). */
function typeIntoInput(input: HTMLInputElement | HTMLTextAreaElement, char: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  input.focus();
  if (setter) {
    setter.call(input, char);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

const MAX_UNDO = 100;

export function useGoalGridEngine(opts: EngineOpts): GridEngine {
  const { columns, enabled, applyEdit } = opts;

  const rowCount = opts.rows.length;
  const colCount = columns.length;

  // Latest rows / columns without re-binding every callback.
  const rowsRef = React.useRef(opts.rows);
  rowsRef.current = opts.rows;
  const colsRef = React.useRef(columns);
  colsRef.current = columns;

  const colIndex = React.useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, i) => m.set(c.key, i));
    return m;
  }, [columns]);

  const [sel, setSel] = React.useState<Sel | null>(null);
  const dragging = React.useRef(false);
  const navSource = React.useRef<"keyboard" | "mouse">("mouse");
  const cellEls = React.useRef(new Map<string, HTMLTableCellElement>());

  const undoStack = React.useRef<Op[][]>([]);
  const redoStack = React.useRef<Op[][]>([]);

  const key = (r: number, c: number) => `${r}:${c}`;
  const cellEl = (p: CellPos) => cellEls.current.get(key(p.r, p.c)) ?? null;

  const rowById = React.useCallback((id: string) => rowsRef.current.find((r) => r.id === id), []);
  const colByKey = React.useCallback((k: string) => colsRef.current.find((c) => c.key === k), []);

  /* ---- clamp to the current grid bounds (rows can shrink on delete) ---- */
  React.useEffect(() => {
    if (!sel) return;
    if (rowCount === 0 || colCount === 0) {
      setSel(null);
      return;
    }
    const clamp = (p: CellPos): CellPos => ({
      r: Math.min(p.r, rowCount - 1),
      c: Math.min(p.c, colCount - 1),
    });
    const a = clamp(sel.anchor);
    const f = clamp(sel.focus);
    if (a.r !== sel.anchor.r || a.c !== sel.anchor.c || f.r !== sel.focus.r || f.c !== sel.focus.c) {
      setSel({ anchor: a, focus: f });
    }
  }, [rowCount, colCount, sel]);

  /* ---- keyboard-driven focus (nav mode = the <td> holds focus) ---- */
  React.useEffect(() => {
    if (!enabled || !sel) return;
    if (navSource.current !== "keyboard") return;
    cellEl(sel.focus)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, enabled]);

  /* ---- end a drag anywhere on the page ---- */
  React.useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  /* ---------------- edit + undo plumbing ---------------- */

  /** Perform one column write; return the Op (for the undo stack) or null. */
  const applyCol = React.useCallback(
    (col: GridColumn, g: GoalDTO, raw: string): Op | null => {
      if (!col.editable(g)) return null;
      const prev = col.read(g);
      if (raw === prev) return null; // no-op
      const parsed = col.parse(raw, g);
      if (!parsed) return null; // invalid → skip
      applyEdit(g.id, parsed.partial, parsed.run);
      return { id: g.id, colKey: col.key, prev, next: raw };
    },
    [applyEdit],
  );

  const pushGroup = React.useCallback((ops: Op[]) => {
    if (ops.length === 0) return;
    undoStack.current.push(ops);
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  /** Inline single-cell edit from an existing editor — records one undo step. */
  const commit = React.useCallback(
    (colKey: string, g: GoalDTO, raw: string) => {
      const col = colByKey(colKey);
      if (!col) return;
      const op = applyCol(col, g, raw);
      if (op) pushGroup([op]);
    },
    [applyCol, colByKey, pushGroup],
  );

  const undo = React.useCallback(() => {
    const group = undoStack.current.pop();
    if (!group) return;
    let applied = 0;
    for (let i = group.length - 1; i >= 0; i--) {
      const op = group[i];
      if (!op) continue;
      const col = colByKey(op.colKey);
      const g = rowById(op.id);
      if (col && g && col.editable(g)) {
        const parsed = col.parse(op.prev, g);
        if (parsed) {
          applyEdit(g.id, parsed.partial, parsed.run);
          applied++;
        }
      }
    }
    redoStack.current.push(group);
    if (applied) fireToast({ message: applied === 1 ? "Edit undone" : `${applied} edits undone`, type: "success" });
  }, [applyEdit, colByKey, rowById]);

  const redo = React.useCallback(() => {
    const group = redoStack.current.pop();
    if (!group) return;
    let applied = 0;
    for (const op of group) {
      const col = colByKey(op.colKey);
      const g = rowById(op.id);
      if (col && g && col.editable(g)) {
        const parsed = col.parse(op.next, g);
        if (parsed) {
          applyEdit(g.id, parsed.partial, parsed.run);
          applied++;
        }
      }
    }
    undoStack.current.push(group);
    if (applied) fireToast({ message: applied === 1 ? "Edit redone" : `${applied} edits redone`, type: "success" });
  }, [applyEdit, colByKey, rowById]);

  /* ---------------- clipboard ops ---------------- */

  const doCopy = React.useCallback(async () => {
    if (!sel) return;
    const rect = rectOf(sel);
    const cols = colsRef.current;
    const matrix: string[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const g = rowsRef.current[r];
      if (!g) continue;
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) line.push(cols[c]?.read(g) ?? "");
      matrix.push(line);
    }
    const ok = await writeClipboard(toTSV(matrix));
    const cells = matrix.length * (matrix[0]?.length ?? 0);
    if (ok) fireToast({ message: cells === 1 ? "Cell copied" : `${cells} cells copied`, type: "success" });
    else fireToast({ message: "Couldn't access the clipboard", type: "error" });
  }, [sel]);

  const doPaste = React.useCallback(async () => {
    if (!sel) return;
    const text = await readClipboard();
    if (text == null) {
      fireToast({ message: "Allow clipboard access to paste", type: "error" });
      return;
    }
    const matrix = fromTSV(text);
    if (matrix.length === 0) return;
    const rect = rectOf(sel);
    const cols = colsRef.current;
    const rows = rowsRef.current;
    const ops: Op[] = [];

    const single = matrix.length === 1 && (matrix[0]?.length ?? 0) === 1;
    const rangeSpansMany = rect.r1 > rect.r0 || rect.c1 > rect.c0;

    if (single && rangeSpansMany) {
      // One value → fill the whole selection.
      const val = matrix[0]?.[0] ?? "";
      for (let r = rect.r0; r <= rect.r1; r++) {
        const g = rows[r];
        if (!g) continue;
        for (let c = rect.c0; c <= rect.c1; c++) {
          const col = cols[c];
          const op = col && applyCol(col, g, val);
          if (op) ops.push(op);
        }
      }
    } else {
      // Map the block starting at the top-left of the selection.
      for (let i = 0; i < matrix.length; i++) {
        const g = rows[rect.r0 + i];
        const rowVals = matrix[i];
        if (!g || !rowVals) continue;
        for (let j = 0; j < rowVals.length; j++) {
          const col = cols[rect.c0 + j];
          const cell = rowVals[j];
          if (!col || cell == null) continue;
          const op = applyCol(col, g, cell);
          if (op) ops.push(op);
        }
      }
    }

    if (ops.length === 0) {
      fireToast({ message: "Nothing pasted (read-only or unchanged cells)", type: "error" });
      return;
    }
    pushGroup(ops);
    fireToast({ message: ops.length === 1 ? "Pasted 1 cell" : `Pasted ${ops.length} cells`, type: "success" });
  }, [sel, applyCol, pushGroup]);

  const doFillDown = React.useCallback(() => {
    if (!sel) return;
    const rect = rectOf(sel);
    const cols = colsRef.current;
    const rows = rowsRef.current;
    const ops: Op[] = [];
    if (rect.r0 === rect.r1) {
      // Single row selected → pull from the row directly above (Excel Ctrl+D).
      const src = rows[rect.r0 - 1];
      const dst = rows[rect.r0];
      if (!src || !dst) return;
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = cols[c];
        if (!col) continue;
        const op = applyCol(col, dst, col.read(src));
        if (op) ops.push(op);
      }
    } else {
      const src = rows[rect.r0];
      if (!src) return;
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = cols[c];
        if (!col) continue;
        const value = col.read(src);
        for (let r = rect.r0 + 1; r <= rect.r1; r++) {
          const g = rows[r];
          if (!g) continue;
          const op = applyCol(col, g, value);
          if (op) ops.push(op);
        }
      }
    }
    if (ops.length === 0) return;
    pushGroup(ops);
    fireToast({ message: `Filled ${ops.length} cell${ops.length === 1 ? "" : "s"}`, type: "success" });
  }, [sel, applyCol, pushGroup]);

  const clearRange = React.useCallback(() => {
    if (!sel) return;
    const rect = rectOf(sel);
    const cols = colsRef.current;
    const rows = rowsRef.current;
    const ops: Op[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const g = rows[r];
      if (!g) continue;
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = cols[c];
        const op = col && applyCol(col, g, "");
        if (op) ops.push(op);
      }
    }
    if (ops.length === 0) return;
    pushGroup(ops);
  }, [sel, applyCol, pushGroup]);

  /* ---------------- navigation ---------------- */

  const moveTo = React.useCallback(
    (r: number, c: number, extend: boolean) => {
      const nr = Math.max(0, Math.min(rowCount - 1, r));
      const nc = Math.max(0, Math.min(colCount - 1, c));
      navSource.current = "keyboard";
      setSel((prev) =>
        extend && prev ? { anchor: prev.anchor, focus: { r: nr, c: nc } } : { anchor: { r: nr, c: nc }, focus: { r: nr, c: nc } },
      );
    },
    [rowCount, colCount],
  );

  const enterEdit = React.useCallback((pos: CellPos, char: string | null) => {
    const el = cellEls.current.get(`${pos.r}:${pos.c}`);
    if (!el) return;
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (input) {
      if (char != null) typeIntoInput(input, char);
      else {
        input.focus();
        input.select?.();
      }
    } else {
      // Dropdown / button cell — open it so the keyboard picker takes over. If a
      // char was typed to open it (type-to-edit), stamp it on the trigger button
      // as `data-grid-seed` BEFORE the click so the popover's open-effect can prime
      // its own search box with it (GoalLookupSelect / DelegatesCell read + clear
      // the attribute) — this makes type-to-open seed the first char just like a
      // text cell, instead of dropping it.
      const btn = el.querySelector<HTMLButtonElement>("button");
      if (btn) {
        if (char != null) btn.setAttribute("data-grid-seed", char);
        btn.focus();
        btn.click();
      }
    }
  }, []);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || rowCount === 0 || colCount === 0) return;
      const meta = e.ctrlKey || e.metaKey;
      // Detect edit-mode from the EVENT TARGET, not document.activeElement: the
      // inner inputs blur themselves on Enter/Escape (their own handler runs first
      // as the event bubbles), so by the time this container handler fires the
      // active element has already changed — but e.target is still the input.
      const editing = isTextEditEl(e.target as Element);

      // Editable elements OUTSIDE any grid cell own their keys completely — the
      // multi-line Notes textarea in the expandable detail row (Enter = newline,
      // arrows = caret, Esc handled by its own onKeyDown). Portaled popover inputs
      // never bubble here at all. Bail before any nav/bootstrap can hijack them.
      if (editing && !(e.target as HTMLElement).closest?.('[role="gridcell"]')) return;

      // Clipboard / history — nav mode only, so text inputs keep native copy/paste.
      if (meta) {
        if (editing) return;
        const k = e.key.toLowerCase();
        if (k === "c") { e.preventDefault(); void doCopy(); return; }
        if (k === "v") { e.preventDefault(); void doPaste(); return; }
        if (k === "d") { e.preventDefault(); doFillDown(); return; }
        if (k === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (k === "y") { e.preventDefault(); redo(); return; }
        return;
      }

      const cur = sel?.focus ?? null;
      if (!cur) {
        if (e.key.startsWith("Arrow")) {
          e.preventDefault();
          moveTo(0, 0, false);
        }
        return;
      }

      if (editing) {
        // Mid-edit in a cell input: only Enter / vertical arrows leave the cell.
        const inputEl = e.target as HTMLElement;
        if (e.key === "Enter") {
          e.preventDefault();
          moveTo(cur.r + 1, cur.c, false);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          inputEl.blur();
          moveTo(cur.r - 1, cur.c, false);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          inputEl.blur();
          moveTo(cur.r + 1, cur.c, false);
        } else if (e.key === "Escape") {
          inputEl.blur();
          cellEl(cur)?.focus();
        }
        // Left / Right / Home / End / Tab → native caret + Tab traversal.
        return;
      }

      // Nav mode (a <td> holds focus).
      // Shift+Enter opens an in-cell expander (e.g. the title cell's "Notes & Files"
      // detail row) WITHOUT leaving the grid — any cell can opt in by rendering a
      // button tagged `data-cell-expander`. Plain Enter still edits the cell's field.
      if (e.key === "Enter" && e.shiftKey) {
        const exp = cellEls.current.get(`${cur.r}:${cur.c}`)?.querySelector<HTMLButtonElement>("[data-cell-expander]");
        if (exp) {
          e.preventDefault();
          exp.click();
          return;
        }
      }
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); moveTo(cur.r - 1, cur.c, e.shiftKey); return;
        case "ArrowDown": e.preventDefault(); moveTo(cur.r + 1, cur.c, e.shiftKey); return;
        case "ArrowLeft": e.preventDefault(); moveTo(cur.r, cur.c - 1, e.shiftKey); return;
        case "ArrowRight": e.preventDefault(); moveTo(cur.r, cur.c + 1, e.shiftKey); return;
        case "Home": e.preventDefault(); moveTo(cur.r, 0, e.shiftKey); return;
        case "End": e.preventDefault(); moveTo(cur.r, colCount - 1, e.shiftKey); return;
        case "Enter":
        case "F2":
          e.preventDefault();
          enterEdit(cur, null);
          return;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          clearRange();
          return;
        case "Tab":
          return; // native traversal
        default:
          if (e.key.length === 1 && !e.altKey) {
            e.preventDefault();
            enterEdit(cur, e.key);
          }
      }
    },
    [enabled, rowCount, colCount, sel, doCopy, doPaste, doFillDown, undo, redo, moveTo, enterEdit, clearRange],
  );

  /* ---------------- per-cell props ---------------- */

  const rect = sel ? rectOf(sel) : null;
  const hasRange = !!rect && (rect.r0 !== rect.r1 || rect.c0 !== rect.c1);

  const cellProps = React.useCallback(
    (r: number, c: number, baseClass?: string) => {
      const active = !!sel && sel.focus.r === r && sel.focus.c === c;
      const inRect = !!rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
      const selected = inRect && hasRange;

      // Neutral (not red/pink) selection chrome — a subtle slate outline for the
      // active cell + a faint wash for a multi-cell range. No pink fill.
      const boxShadow = active
        ? "inset 0 0 0 1.5px color-mix(in srgb, var(--color-ink-strong) 32%, transparent)"
        : selected
          ? "inset 0 0 0 1px color-mix(in srgb, var(--color-ink-strong) 18%, transparent)"
          : undefined;
      const background = selected
        ? "color-mix(in srgb, var(--color-ink-strong) 4%, transparent)"
        : undefined;

      return {
        ref: (el: HTMLTableCellElement | null) => {
          if (el) cellEls.current.set(key(r, c), el);
          else cellEls.current.delete(key(r, c));
        },
        tabIndex: active ? 0 : -1,
        role: "gridcell",
        "aria-selected": inRect,
        className: cn("relative outline-none", baseClass),
        style: { boxShadow, background } as React.CSSProperties,
        onMouseDown: (e: React.MouseEvent) => {
          if (!enabled) return;
          if (e.shiftKey) {
            e.preventDefault();
            navSource.current = "mouse";
            setSel((prev) => (prev ? { anchor: prev.anchor, focus: { r, c } } : { anchor: { r, c }, focus: { r, c } }));
          } else {
            // Plain click: select this cell but let the inner editor focus / open.
            navSource.current = "mouse";
            dragging.current = true;
            setSel({ anchor: { r, c }, focus: { r, c } });
          }
        },
        onMouseEnter: () => {
          if (!enabled || !dragging.current) return;
          navSource.current = "mouse";
          setSel((prev) => (prev ? { anchor: prev.anchor, focus: { r, c } } : { anchor: { r, c }, focus: { r, c } }));
        },
      } satisfies React.HTMLAttributes<HTMLTableCellElement> & { ref: (el: HTMLTableCellElement | null) => void; tabIndex: number };
    },
    [sel, rect, hasRange, enabled],
  );

  const ci = React.useCallback((k: string) => colIndex.get(k) ?? -1, [colIndex]);

  return {
    cellProps,
    ci,
    commit,
    onKeyDown,
    /** Clear the active/selected cell — call when focus leaves the grid so the
     *  highlight never "sticks" after you click away (fixes the stuck box). */
    blur: () => setSel(null),
    active: sel?.focus ?? null,
    hasRange,
  };
}
