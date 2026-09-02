"use client";

/**
 * The calendar hero (design §2/§3). Orchestrates the three views, the dnd-kit
 * drag/move layer with a custom 2-axis snap modifier, spreadsheet-style
 * copy/cut/paste + delete via a keydown handler and the clipboard store, the
 * legend filter, the event editor and the right-click context menu. View +
 * focus date live in the URL (nuqs); data comes from TanStack Query hitting the
 * co-located server actions.
 */
import * as React from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { useQueryState } from "nuqs";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import type { CalendarEvent } from "@/lib/monthly-events/types";
import type { CalendarBundle } from "@/lib/queries/monthly-events-calendar";
import {
  createEvent,
  updateEvent,
  moveEvent,
  resizeEvent,
  renameEvent,
  deleteEvent,
  deleteEvents,
  duplicateEvent,
  pasteEvents,
  setColour,
  setCategory,
  setStatus,
  unlockEvent,
} from "@/app/(app)/events/calendar/actions";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MIN,
} from "./geometry";
import {
  isCalendarView,
  toCategoryMap,
  SLOT_HEIGHT,
  type CalendarView,
  type EditorTarget,
  type ContextTarget,
} from "./model";
import { useCalendar } from "./use-calendar";
import { ClipboardProvider, useClipboard } from "./clipboard-store";
import { ViewSwitcher } from "./view-switcher";
import { LegendDrawer, UNCATEGORISED } from "./legend-panel";
import { FilterBar, emptyFilters, type CalendarFilters } from "./filter-bar";
import type { EventStatus, EventSource } from "@/db/enums";
import { TimeGridBand } from "./time-grid-band";
import { MonthOverview } from "./month-overview";
import { EventEditor, type EditorValues } from "./event-editor";
import { ContextMenu } from "./context-menu";

interface CalendarWorkspaceProps {
  initial: CalendarBundle;
  initialRange: { from: string; to: string };
  todayIso: string;
}

export function CalendarWorkspace(props: CalendarWorkspaceProps) {
  return (
    <ClipboardProvider>
      <InnerWorkspace {...props} />
    </ClipboardProvider>
  );
}

function InnerWorkspace({ initial, todayIso }: CalendarWorkspaceProps) {
  const [viewRaw, setView] = useQueryState("view", { defaultValue: "month" });
  const [dateRaw, setDate] = useQueryState("date", { defaultValue: todayIso });
  const view: CalendarView = isCalendarView(viewRaw) ? viewRaw : "month";
  const focus = React.useMemo(() => {
    const d = parseISO(dateRaw);
    return isNaN(d.getTime()) ? parseISO(todayIso) : d;
  }, [dateRaw, todayIso]);

  // ── Visible date range → weeks ─────────────────────────────────────────────
  const { weeks, range, monthDate } = React.useMemo(() => {
    if (view === "week") {
      const ws = startOfWeek(focus, { weekStartsOn: 1 });
      return {
        weeks: [ws],
        monthDate: focus,
        range: { from: format(ws, "yyyy-MM-dd"), to: format(addDays(ws, 6), "yyyy-MM-dd") },
      };
    }
    // month + overview both span whole weeks of the focus month
    const first = startOfWeek(startOfMonth(focus), { weekStartsOn: 1 });
    const lastDay = endOfMonth(focus);
    const list: Date[] = [];
    let ws = first;
    while (ws <= lastDay) {
      list.push(ws);
      ws = addWeeks(ws, 1);
    }
    const to = addDays(list[list.length - 1]!, 6);
    return {
      weeks: list,
      monthDate: focus,
      range: { from: format(first, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") },
    };
  }, [view, focus]);

  const { events, categories, obligations, isFetching, run } = useCalendar(range, initial);
  const catMap = React.useMemo(() => toCategoryMap(categories), [categories]);
  const clipboard = useClipboard();

  // ── Legend (category) filter + the filter-bar (status/source/flags) ──────────
  const [filter, setFilter] = React.useState<Set<string>>(new Set());
  const [filters, setFilters] = React.useState<CalendarFilters>(emptyFilters);
  const visibleEvents = React.useMemo(() => {
    return events.filter((e) => {
      if (filter.size > 0 && !filter.has(e.categoryId ?? UNCATEGORISED)) return false;
      if (filters.status.size > 0 && !filters.status.has(e.status)) return false;
      if (filters.source.size > 0 && !filters.source.has(e.source)) return false;
      if (filters.obligationOnly && !e.obligationId) return false;
      if (filters.lockedOnly && !e.isLocked) return false;
      return true;
    });
  }, [events, filter, filters]);
  const toggleFilter = (id: string) =>
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleStatusFilter = (s: EventStatus) =>
    setFilters((prev) => {
      const status = new Set(prev.status);
      if (status.has(s)) status.delete(s);
      else status.add(s);
      return { ...prev, status };
    });
  const toggleSourceFilter = (s: EventSource) =>
    setFilters((prev) => {
      const source = new Set(prev.source);
      if (source.has(s)) source.delete(s);
      else source.add(s);
      return { ...prev, source };
    });
  const toggleFlagFilter = (flag: "obligationOnly" | "lockedOnly") =>
    setFilters((prev) => ({ ...prev, [flag]: !prev[flag] }));

  // ── Selection ──────────────────────────────────────────────────────────────
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const anchorRef = React.useRef<{ eventDate: string; startMin: number }>({
    eventDate: todayIso,
    startMin: DAY_START_MIN + 120,
  });
  const select = (id: string, additive: boolean) => {
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (additive && next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const ev = events.find((e) => e.id === id);
    if (ev) anchorRef.current = { eventDate: ev.eventDate, startMin: ev.startMin ?? DAY_START_MIN };
  };

  // ── Editor + context menu ──────────────────────────────────────────────────
  const [editor, setEditor] = React.useState<EditorTarget | null>(null);
  const [menu, setMenu] = React.useState<ContextTarget | null>(null);
  const menuEvent = menu ? events.find((e) => e.id === menu.eventId) ?? null : null;

  const openEdit = (ev: CalendarEvent) => setEditor({ mode: "edit", event: ev });
  const openCreate = (eventDate: string, startMin: number | null, endMin: number | null, allDay = false) =>
    setEditor({ mode: "create", draft: { eventDate, startMin, endMin, allDay } });

  const onLockedInteract = (ev: CalendarEvent) => {
    if (window.confirm("This event is locked (batch schedule). Unlock it to override?")) {
      void run(unlockEvent(ev.id), { success: "Unlocked — you can now edit it." });
    }
  };

  const saveFromEditor = async (values: EditorValues): Promise<boolean> => {
    const base = {
      title: values.title,
      categoryId: values.categoryId,
      colorOverride: values.colorOverride,
      eventDate: values.eventDate,
      startMin: values.startMin,
      endMin: values.endMin,
      allDay: values.allDay,
      status: values.status,
      location: values.location,
      notes: values.notes,
      obligationId: values.obligationId,
    };
    const res =
      editor?.mode === "edit"
        ? await run(updateEvent({ id: editor.event.id, ...base }))
        : await run(createEvent(base));
    return res.ok;
  };

  // ── Drag-to-move (custom 2-axis snap) ──────────────────────────────────────
  const slotH = view === "week" ? SLOT_HEIGHT.week : SLOT_HEIGHT.month;
  const metricsRef = React.useRef({ colW: 120, slotH });
  metricsRef.current.slotH = slotH;
  const measureCol = React.useCallback((w: number) => {
    if (w > 0) metricsRef.current.colW = w;
  }, []);

  const snapModifier = React.useCallback<Modifier>(({ transform }) => {
    const { colW, slotH: sh } = metricsRef.current;
    return {
      ...transform,
      x: colW > 0 ? Math.round(transform.x / colW) * colW : transform.x,
      y: sh > 0 ? Math.round(transform.y / sh) * sh : transform.y,
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const ev = e.active.data.current?.event as CalendarEvent | undefined;
    if (!ev) return;
    const { colW, slotH: sh } = metricsRef.current;
    const dayShift = colW > 0 ? Math.round(e.delta.x / colW) : 0;
    const slotShift = sh > 0 ? Math.round(e.delta.y / sh) : 0;
    if (dayShift === 0 && slotShift === 0) return;

    const newDate = format(addDays(parseISO(ev.eventDate), dayShift), "yyyy-MM-dd");
    if (ev.allDay || ev.startMin == null || ev.endMin == null) {
      if (dayShift === 0) return;
      void run(moveEvent({ id: ev.id, eventDate: newDate, startMin: null, endMin: null }));
      return;
    }
    const dur = ev.endMin - ev.startMin;
    let newStart = ev.startMin + slotShift * SLOT_MIN;
    newStart = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - dur, newStart));
    const newEnd = newStart + dur;
    void run(moveEvent({ id: ev.id, eventDate: newDate, startMin: newStart, endMin: newEnd }));
  };

  // ── Clipboard actions ──────────────────────────────────────────────────────
  const copySelection = (mode: "copy" | "cut", ids?: string[]) => {
    const idSet = new Set(ids ?? [...selected]);
    const items = events.filter((e) => idSet.has(e.id));
    if (items.length === 0) return;
    clipboard.set(items, mode);
    fireToast({ message: `${mode === "cut" ? "Cut" : "Copied"} ${items.length} event${items.length > 1 ? "s" : ""}.`, type: "info" });
  };

  const doPaste = async (anchor?: { eventDate: string; startMin: number }) => {
    if (!clipboard.has) return;
    const a = anchor ?? anchorRef.current;
    const items = clipboard.items.map((e) => ({
      title: e.title,
      categoryId: e.categoryId,
      colorOverride: e.colorOverride,
      status: e.status,
      location: e.location,
      notes: e.notes,
      allDay: e.allDay,
      startMin: e.startMin,
      endMin: e.endMin,
      obligationId: e.obligationId,
    }));
    const res = await run(pasteEvents({ items, eventDate: a.eventDate, anchorMin: a.startMin }), {
      success: `Pasted ${items.length} event${items.length > 1 ? "s" : ""}.`,
    });
    if (res.ok && clipboard.mode === "cut") {
      await run(deleteEvents(clipboard.items.map((e) => e.id)));
      clipboard.clear();
    }
  };

  const deleteSelection = async (ids?: string[]) => {
    const list = ids ?? [...selected];
    if (list.length === 0) return;
    const res = await run(list.length === 1 ? deleteEvent(list[0]!) : deleteEvents(list));
    if (res.ok) setSelected(new Set());
  };

  // ── Keyboard: ⌘C / ⌘X / ⌘V / Del ───────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelection("copy");
    } else if (mod && e.key.toLowerCase() === "x") {
      e.preventDefault();
      copySelection("cut");
    } else if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault();
      void doPaste();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (selected.size === 0) return;
      e.preventDefault();
      void deleteSelection();
    } else if (e.key === "Escape") {
      setSelected(new Set());
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) return setDate(todayIso);
    const next = view === "week" ? addWeeks(focus, dir) : addMonths(focus, dir);
    return setDate(format(next, "yyyy-MM-dd"));
  };
  const title =
    view === "week"
      ? `${formatDate(weeks[0]!)} – ${formatDate(addDays(weeks[0]!, 6))}`
      : format(focus, "MMMM yyyy");

  const inMonth = React.useCallback(
    (iso: string) => isSameMonth(parseISO(iso), monthDate),
    [monthDate],
  );

  const bandCallbacks = {
    catMap,
    todayIso,
    selectedIds: selected,
    onMeasureCol: measureCol,
    onSelect: select,
    onOpenEditor: openEdit,
    onContextMenu: (id: string, x: number, y: number) => setMenu({ eventId: id, x, y }),
    onRename: (id: string, title: string) => void run(renameEvent({ id, title })),
    onResize: (id: string, startMin: number, endMin: number) => void run(resizeEvent({ id, startMin, endMin })),
    onLockedInteract,
    onCreateRange: (date: string, startMin: number, endMin: number) => openCreate(date, startMin, endMin),
    onCreateAllDay: (date: string) => openCreate(date, null, null, true),
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="outline-none"
      style={{ "--hour-line": "rgba(15,23,42,0.12)", "--half-line": "rgba(15,23,42,0.06)" } as React.CSSProperties}
    >
      <ViewSwitcher
        view={view}
        onView={(v) => void setView(v)}
        title={title}
        monthValue={format(focus, "yyyy-MM")}
        onMonth={(val) => void setDate(`${val}-01`)}
        onPrev={() => void navigate(-1)}
        onToday={() => void navigate(0)}
        onNext={() => void navigate(1)}
        onNew={() => openCreate(format(focus, "yyyy-MM-dd"), DAY_START_MIN + 120, DAY_START_MIN + 180)}
        isFetching={isFetching}
      />

      {/* Filter bar — narrows the grid by status / source / flags, on top of the
          category legend. Overview view has no time-grid, but the same filter set
          still applies to its event chips. */}
      <FilterBar
        filters={filters}
        onToggleStatus={toggleStatusFilter}
        onToggleSource={toggleSourceFilter}
        onToggleFlag={toggleFlagFilter}
        onClear={() => setFilters(emptyFilters())}
      />

      <LegendDrawer
        categories={categories}
        events={events}
        active={filter}
        onToggle={toggleFilter}
        onClear={() => setFilter(new Set())}
      />

      <div className="mt-4">
        <div className="min-w-0">
          {view === "overview" ? (
            <MonthOverview
              monthDate={monthDate}
              events={visibleEvents}
              catMap={catMap}
              todayIso={todayIso}
              onOpenEditor={openEdit}
              onContextMenu={(id, x, y) => setMenu({ eventId: id, x, y })}
              onQuickCreate={(date) => openCreate(date, DAY_START_MIN + 120, DAY_START_MIN + 180)}
            />
          ) : (
            <DndContext sensors={sensors} modifiers={[snapModifier]} onDragEnd={onDragEnd}>
              <div className={view === "month" ? "space-y-3" : ""}>
                {weeks.map((ws) => (
                  <TimeGridBand
                    key={format(ws, "yyyy-MM-dd")}
                    weekStart={ws}
                    events={visibleEvents}
                    slotH={slotH}
                    view={view === "week" ? "week" : "month"}
                    inMonth={view === "month" ? inMonth : undefined}
                    {...bandCallbacks}
                  />
                ))}
              </div>
            </DndContext>
          )}
        </div>
      </div>

      {editor && (
        <EventEditor
          target={editor}
          categories={categories}
          obligations={obligations}
          onClose={() => setEditor(null)}
          onSave={saveFromEditor}
        />
      )}

      {menu && menuEvent && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          event={menuEvent}
          categories={categories}
          canPaste={clipboard.has}
          onClose={() => setMenu(null)}
          onEdit={() => {
            openEdit(menuEvent);
            setMenu(null);
          }}
          onCopy={() => {
            copySelection("copy", [menuEvent.id]);
            setMenu(null);
          }}
          onCut={() => {
            copySelection("cut", [menuEvent.id]);
            setMenu(null);
          }}
          onPaste={() => {
            void doPaste({ eventDate: menuEvent.eventDate, startMin: menuEvent.startMin ?? DAY_START_MIN });
            setMenu(null);
          }}
          onDuplicate={() => {
            void run(duplicateEvent(menuEvent.id), { success: "Duplicated." });
            setMenu(null);
          }}
          onSetColour={(hex) => {
            void run(setColour({ id: menuEvent.id, colorOverride: hex }));
            setMenu(null);
          }}
          onSetCategory={(id) => {
            void run(setCategory({ id: menuEvent.id, categoryId: id }));
            setMenu(null);
          }}
          onToggleStatus={() => {
            void run(setStatus({ id: menuEvent.id, status: menuEvent.status === "confirmed" ? "tentative" : "confirmed" }));
            setMenu(null);
          }}
          onToggleLock={() => {
            void run(unlockEvent(menuEvent.id));
            setMenu(null);
          }}
          onDelete={() => {
            void deleteSelection([menuEvent.id]);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
