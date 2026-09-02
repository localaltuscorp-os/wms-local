"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Inbox, PanelRightClose } from "lucide-react";
import { TaskInboxRow } from "./task-inbox-row";
import { BulkActionBar } from "./bulk-action-bar";
import { fireToast } from "@/lib/toast";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
} from "@/lib/format";
import { setTaskRead, setTaskStarred, bulkSetRead } from "@/app/(app)/tasks/inbox-actions";
import { bulkArchive, bulkDelete } from "@/app/(app)/tasks/actions";
import type { TaskListRow } from "@/lib/types";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

const MIN_PCT = 28;
const MAX_PCT = 62;
const DEFAULT_PCT = 38;
const WIDTH_KEY = "wms.inbox.listPct";

/**
 * Master–detail shell for /tasks.
 *
 * SELECTION LIVES IN THE URL (`?task=<uuid>`), not in component state. That is
 * what lets the detail pane stay a SERVER component: the parent page reads the
 * param, renders <TaskDetailLoader> inside <Suspense key={id}>, and Next streams
 * the new record in. It also makes an open task linkable, survivable across
 * reload, and correct with the browser Back button — none of which a useState
 * cursor would give us.
 *
 * `detail` is that server-rendered subtree, passed down as a prop.
 */
export function TaskInbox({
  rows,
  employees,
  me,
  statusLabels,
  statusTones,
  subjects,
  clients,
  starredIds,
  selectedId,
  detail,
}: {
  rows: TaskListRow[];
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
  subjects?: string[];
  clients?: string[];
  starredIds: string[];
  selectedId: string | null;
  detail: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [checked, setChecked] = React.useState<ReadonlySet<string>>(new Set());
  const [listPct, setListPct] = React.useState(DEFAULT_PCT);
  const [dragging, setDragging] = React.useState(false);
  const splitRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const lastCheckedIndex = React.useRef<number | null>(null);

  const starred = React.useMemo(() => new Set(starredIds), [starredIds]);

  // The inline cells require a COMPLETE status map, so resolve the optional
  // props against the same fallbacks the table used rather than threading
  // `undefined` down into them.
  const resolvedLabels = statusLabels ?? STATUS_LABELS_FALLBACK;
  const resolvedTones = statusTones ?? STATUS_TONES_FALLBACK;

  // Restore the user's divider position. localStorage read happens in an effect
  // (not initial state) so server and first client render agree — otherwise the
  // pane would hydrate at one width and jump to another.
  React.useEffect(() => {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_PCT && saved <= MAX_PCT) {
      setListPct(saved);
    }
  }, []);

  const selectedIndex = React.useMemo(
    () => rows.findIndex((r) => r.id === selectedId),
    [rows, selectedId],
  );

  /** Push `?task=<id>` (or drop it) while preserving every filter param. */
  const openTask = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id) next.set("task", id);
      else next.delete("task");
      const qs = next.toString();
      router.push((qs ? `${pathname}?${qs}` : pathname) as never, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  // ── Keyboard navigation ────────────────────────────────────────────────
  // ↑/↓ move through the feed and update the detail pane; Escape closes it.
  // Ignored while focus is in a field so typing in the filter search box
  // doesn't scroll the inbox out from under the user.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (rows.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const from = selectedIndex === -1 ? (delta === 1 ? -1 : 0) : selectedIndex;
        const next = Math.min(Math.max(from + delta, 0), rows.length - 1);
        const target = rows[next];
        if (!target) return;
        openTask(target.id);
        // Keep the cursor row inside the scroll viewport.
        listRef.current
          ?.querySelectorAll("[role=option]")
          [next]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        openTask(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selectedIndex, selectedId, openTask]);

  // ── Divider drag ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const box = splitRef.current?.getBoundingClientRect();
      if (!box) return;
      const pct = ((e.clientX - box.left) / box.width) * 100;
      setListPct(Math.min(Math.max(pct, MIN_PCT), MAX_PCT));
    }
    function onUp() {
      setDragging(false);
      setListPct((p) => {
        window.localStorage.setItem(WIDTH_KEY, String(Math.round(p)));
        return p;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Kill text selection while dragging, or the whole list highlights blue.
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // ── Row actions ────────────────────────────────────────────────────────
  function toggleCheck(id: string, index: number, shift: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      // Shift-click extends from the previous tick, like every mail client.
      if (shift && lastCheckedIndex.current !== null) {
        const a = Math.min(lastCheckedIndex.current, index);
        const b = Math.max(lastCheckedIndex.current, index);
        for (let i = a; i <= b; i++) {
          const r = rows[i];
          if (r) next.add(r.id);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastCheckedIndex.current = index;
  }

  function runRow(fn: () => Promise<{ ok: boolean; error?: string }>) {
    void (async () => {
      const res = await fn();
      if (!res.ok && res.error) fireToast({ message: res.error });
      router.refresh();
    })();
  }

  const allChecked = rows.length > 0 && checked.size === rows.length;

  return (
    <div className="flex flex-col">
      {/* Batch toolbar — appears the moment anything is ticked. */}
      {checked.size > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)))
              }
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
            >
              {allChecked ? "Deselect all" : `Select all ${rows.length}`}
            </button>
            <button
              type="button"
              onClick={() =>
                runRow(async () => {
                  const r = await bulkSetRead([...checked], true);
                  setChecked(new Set());
                  return r;
                })
              }
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
            >
              Mark as read
            </button>
            <button
              type="button"
              onClick={() =>
                runRow(async () => {
                  const r = await bulkSetRead([...checked], false);
                  setChecked(new Set());
                  return r;
                })
              }
              className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red"
            >
              Mark as unread
            </button>
          </div>
          <BulkActionBar
            selectedIds={[...checked]}
            employees={employees}
            subjects={subjects}
            clients={clients}
            isAdmin={me.isAdmin}
            statusLabels={resolvedLabels}
            onClear={() => setChecked(new Set())}
          />
        </div>
      )}

      <div
        ref={splitRef}
        className="flex min-h-[calc(100vh-230px)] overflow-hidden rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        {/* ── LEFT: the feed ── */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Task inbox"
          className={[
            // Sideways scroll is what the frozen actions cell pins against;
            // `overscroll-x-contain` stops a horizontal fling from triggering
            // the browser's back-navigation gesture.
            "min-w-0 overflow-y-auto overflow-x-auto overscroll-x-contain",
            // On a narrow screen the panes stack: the list hides entirely once
            // something is open, so the detail gets the full width.
            selectedId ? "max-md:hidden" : "max-md:w-full",
          ].join(" ")}
          style={{
            width: selectedId ? `${listPct}%` : "100%",
            maxHeight: "calc(100vh - 230px)",
          }}
        >
          {rows.map((r, i) => (
            <TaskInboxRow
              key={r.id}
              row={r}
              selected={r.id === selectedId}
              isCursor={i === selectedIndex}
              checked={checked.has(r.id)}
              starred={starred.has(r.id)}
              employees={employees}
              me={me}
              statusLabels={resolvedLabels}
              statusTones={resolvedTones}
              canManage={me.isAdmin}
              onOpen={() => openTask(r.id)}
              onToggleCheck={(shift) => toggleCheck(r.id, i, shift)}
              onToggleStar={() =>
                runRow(() => setTaskStarred(r.id, !starred.has(r.id)))
              }
              onToggleRead={() =>
                runRow(() => setTaskRead(r.id, r.firstReadAt == null))
              }
              onArchive={() =>
                runRow(async () => {
                  const res = await bulkArchive([r.id]);
                  return res.ok ? { ok: true } : { ok: false, error: res.error };
                })
              }
              onDelete={() => {
                if (!confirm(`Permanently delete "${r.title}"?`)) return;
                runRow(async () => {
                  const res = await bulkDelete([r.id]);
                  if (res.ok && r.id === selectedId) openTask(null);
                  return res.ok ? { ok: true } : { ok: false, error: res.error };
                });
              }}
            />
          ))}
        </div>

        {/* ── DIVIDER: drag to resize ── */}
        {selectedId && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            onMouseDown={() => setDragging(true)}
            className="relative w-px shrink-0 cursor-col-resize bg-hairline transition-colors hover:bg-altus-red max-md:hidden"
          >
            {/* Fat invisible hit area — a 1px target is unusable. */}
            <span className="absolute inset-y-0 -left-1.5 -right-1.5 block" />
          </div>
        )}

        {/* ── RIGHT: the record ── */}
        {selectedId && (
          <div
            className="min-w-0 flex-1 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 230px)" }}
          >
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface-card/95 px-4 py-2 backdrop-blur">
              <button
                type="button"
                onClick={() => openTask(null)}
                className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                <ArrowLeft size={14} strokeWidth={2.4} />
                Back to list
              </button>
              <span className="ml-auto text-[11.5px] font-semibold text-ink-subtle max-md:hidden">
                ↑ ↓ to move · Esc to close
              </span>
              <button
                type="button"
                onClick={() => openTask(null)}
                title="Collapse detail pane"
                aria-label="Collapse detail pane"
                className="rounded p-1 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong max-md:hidden"
              >
                <PanelRightClose size={15} strokeWidth={2.2} />
              </button>
            </div>
            {detail}
          </div>
        )}

        {/* Nothing open, wide screen — hold the space so the list doesn't
            stretch to full width and then snap back on first click. */}
        {!selectedId && rows.length > 0 && (
          <div className="hidden flex-1 items-center justify-center border-l border-hairline md:flex">
            <div className="text-center">
              <span
                aria-hidden
                className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-2xl"
                style={{
                  background:
                    "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                  color: "var(--color-altus-red)",
                }}
              >
                <Inbox size={22} strokeWidth={2.2} />
              </span>
              <p className="text-[15px] font-bold text-ink-strong">
                Select a task to read it
              </p>
              <p className="mt-1 text-[13px] font-medium text-ink-subtle">
                Use ↑ ↓ to move through the list.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
