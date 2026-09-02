"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { AlertTriangle, CalendarCheck2, Clock, Hourglass, type LucideIcon } from "lucide-react";
import { rescheduleTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { LateBadge } from "@/components/ui/late-badge";

/** Calendar-add days to a yyyy-mm-dd string (lexicographic == chronological). */
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export interface AgendaTask {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
  dueYmd: string; // IST calendar day, yyyy-mm-dd
  /** Done after its due date — drives the "Late" badge. */
  late?: boolean;
}

interface DayCol {
  ymd: string;
  label: string;
  sub: string;
}

interface Props {
  /** Today in IST (yyyy-mm-dd) — the overdue boundary. */
  todayYmd: string;
  /** Up to 6 upcoming day columns, today first (IST). */
  days: DayCol[];
  /** All agenda cards (any due date); the board buckets them internally. */
  tasks: AgendaTask[];
  /** Rescheduling (drag a card to another day) is admin-only. Doers get a
   *  read-only board: cards still open, but can't be dragged between days. */
  isAdmin: boolean;
}

const DAY_CHOICES = [3, 4, 5, 6] as const;

/**
 * "My Day" agenda board. Date-wise kanban with a selectable 3/4/5/6-day
 * window. Cards are draggable (#7) — drop a task onto a day column to
 * reschedule its due date there (optimistic, with rollback on failure).
 * Clicking a card still opens the focused task. The welcome banner + view
 * toggle live in the parent MyDayWorkspace.
 */
export function AgendaBoard({ todayYmd, days, tasks, isAdmin }: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [dayCount, setDayCount] = React.useState<number>(5);
  const [overCol, setOverCol] = React.useState<string | null>(null);

  // Edge auto-scroll while dragging — native HTML5 drag won't scroll the
  // horizontal board near its edges, so a card couldn't reach an off-screen
  // day column. A rAF loop scrolls the board when the pointer nears an edge.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const autoScroll = React.useRef({ dir: 0, speed: 0, raf: 0 });

  function updateEdgeFromPointer(clientX: number) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const zone = 110;
    const max = 26;
    if (clientX < rect.left + zone) {
      autoScroll.current.dir = -1;
      autoScroll.current.speed = Math.ceil(((rect.left + zone - clientX) / zone) * max);
    } else if (clientX > rect.right - zone) {
      autoScroll.current.dir = 1;
      autoScroll.current.speed = Math.ceil(((clientX - (rect.right - zone)) / zone) * max);
    } else {
      autoScroll.current.dir = 0;
    }
  }

  function beginAutoScroll() {
    if (autoScroll.current.raf) return;
    const tick = () => {
      const el = scrollRef.current;
      const { dir, speed } = autoScroll.current;
      if (el && dir !== 0) el.scrollLeft += dir * speed;
      autoScroll.current.raf = requestAnimationFrame(tick);
    };
    autoScroll.current.raf = requestAnimationFrame(tick);
  }

  function endAutoScroll() {
    if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf);
    autoScroll.current = { dir: 0, speed: 0, raf: 0 };
  }

  React.useEffect(
    () => () => {
      if (autoScroll.current.raf) cancelAnimationFrame(autoScroll.current.raf);
    },
    [],
  );

  // Single source of truth so optimistic drag-moves re-bucket instantly.
  const [items, setItems] = React.useState<AgendaTask[]>(() => [...tasks]);
  React.useEffect(() => {
    setItems([...tasks]);
  }, [tasks]);

  const shownDays = days.slice(0, dayCount);
  const lastYmd = shownDays.length ? shownDays[shownDays.length - 1]!.ymd : "";

  // Lists are small (a person's open tasks) — plain derivation each render
  // is cheap and sidesteps the manual-memo lint on the inline lastYmd dep.
  const overdueItems = items.filter((t) => t.dueYmd < todayYmd);
  const byDay = new Map<string, AgendaTask[]>();
  for (const t of items) {
    if (t.dueYmd < todayYmd) continue;
    const arr = byDay.get(t.dueYmd) ?? [];
    arr.push(t);
    byDay.set(t.dueYmd, arr);
  }
  const laterItems = items.filter(
    (t) => t.dueYmd >= todayYmd && lastYmd && t.dueYmd > lastYmd,
  );

  // The four lifecycle buckets. Window-independent so the labels are stable
  // regardless of the day-count selector: Overdue < today, Due Now = today,
  // Upcoming = next 7 days, Not Due = beyond.
  const horizon = addDaysYmd(todayYmd, 7);
  const buckets: { key: string; label: string; tone: string; icon: LucideIcon; n: number }[] = [
    { key: "due", label: "Due Now", tone: "blue", icon: CalendarCheck2, n: items.filter((t) => t.dueYmd === todayYmd).length },
    { key: "upcoming", label: "Upcoming", tone: "amber", icon: Clock, n: items.filter((t) => t.dueYmd > todayYmd && t.dueYmd <= horizon).length },
    { key: "overdue", label: "Overdue", tone: "red", icon: AlertTriangle, n: overdueItems.length },
    { key: "notdue", label: "Not Due", tone: "slate", icon: Hourglass, n: items.filter((t) => t.dueYmd > horizon).length },
  ];

  function moveTo(id: string, ymd: string) {
    setOverCol(null);
    const cur = items.find((t) => t.id === id);
    if (!cur || cur.dueYmd === ymd) return;
    const prevYmd = cur.dueYmd;
    // optimistic
    setItems((list) => list.map((t) => (t.id === id ? { ...t, dueYmd: ymd } : t)));
    startTransition(async () => {
      const res = await rescheduleTask(id, ymd);
      if (!res.ok) {
        setItems((list) =>
          list.map((t) => (t.id === id ? { ...t, dueYmd: prevYmd } : t)),
        );
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Task rescheduled." });
      router.refresh();
    });
  }

  return (
    <div>
      {/* Lifecycle buckets — Due Now · Upcoming · Overdue · Not Due. */}
      <div className="mb-7 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {buckets.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.key}
              className="relative bg-surface-card rounded-section overflow-hidden"
              style={{
                border: "1px solid var(--color-hairline)",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
                padding: "20px 22px",
              }}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0"
                style={{ height: 4, background: `linear-gradient(90deg, var(--color-${b.tone}), var(--color-${b.tone}-deep))` }}
              />
              <span
                aria-hidden
                className="absolute right-5 top-5 inline-flex size-9 items-center justify-center rounded-xl"
                style={{
                  background: `color-mix(in srgb, var(--color-${b.tone}) 14%, transparent)`,
                  color: `var(--color-${b.tone}-deep)`,
                }}
              >
                <Icon size={18} strokeWidth={2.3} />
              </span>
              <span
                className="uppercase font-black tracking-[0.06em] leading-none"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 13, color: `var(--color-${b.tone}-deep)` }}
              >
                {b.label}
              </span>
              <span
                className="block mt-2 leading-[0.85] tabular-nums text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 40 }}
              >
                {b.n}
              </span>
            </div>
          );
        })}
      </div>

      {/* Day-count selector */}
      <div className="mb-5 flex items-center gap-2">
        <span className="text-[15px] font-semibold text-ink-subtle mr-1">Show</span>
        {DAY_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setDayCount(n)}
            className="px-4 py-2 rounded-full text-[15px] font-semibold transition-colors"
            style={{
              background: dayCount === n ? "var(--color-ink-strong)" : "var(--color-surface-soft)",
              color: dayCount === n ? "#fff" : "var(--color-ink-soft)",
              border: "1px solid var(--color-hairline)",
            }}
          >
            {n} days
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto pb-4"
        onDragOver={(e) => {
          // Bubbles up from the day columns; track pointer + run the loop.
          updateEdgeFromPointer(e.clientX);
          beginAutoScroll();
        }}
        onDrop={endAutoScroll}
        onDragEnd={endAutoScroll}
      >
        {overdueItems.length > 0 && (
          <Column
            label="Overdue"
            sub={`${overdueItems.length} ${overdueItems.length === 1 ? "task" : "tasks"}`}
            tone="red"
            tasks={overdueItems}
            canReschedule={isAdmin}
          />
        )}
        {shownDays.map((d) => (
          <Column
            key={d.ymd}
            label={d.label}
            sub={d.sub}
            tone={d.label === "Today" ? "blue" : "slate"}
            tasks={byDay.get(d.ymd) ?? []}
            ymd={d.ymd}
            isOver={overCol === d.ymd}
            onOver={() => setOverCol(d.ymd)}
            onLeave={() => setOverCol((c) => (c === d.ymd ? null : c))}
            onDropTask={moveTo}
            canReschedule={isAdmin}
          />
        ))}
        {laterItems.length > 0 && (
          <Column label="Not Due" sub={`${laterItems.length}`} tone="slate" tasks={laterItems} canReschedule={isAdmin} />
        )}
      </div>
    </div>
  );
}

function Column({
  label,
  sub,
  tone,
  tasks,
  ymd,
  isOver,
  onOver,
  onLeave,
  onDropTask,
  canReschedule,
}: {
  label: string;
  sub: string;
  tone: string;
  tasks: AgendaTask[];
  ymd?: string;
  isOver?: boolean;
  onOver?: () => void;
  onLeave?: () => void;
  onDropTask?: (id: string, ymd: string) => void;
  /** Admin-only: when false, cards aren't draggable and columns reject drops. */
  canReschedule: boolean;
}) {
  const droppable = !!ymd && canReschedule;
  return (
    <div
      className="flex-shrink-0 w-[360px] max-md:w-[300px] rounded-section p-4 transition-colors"
      style={{
        background: isOver ? "var(--color-blue-bg)" : "var(--color-surface-soft)",
        border: `1px solid ${isOver ? "var(--color-blue)" : "var(--color-hairline)"}`,
      }}
      onDragOver={
        droppable
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              onOver?.();
            }
          : undefined
      }
      onDragLeave={droppable ? () => onLeave?.() : undefined}
      onDrop={
        droppable
          ? (e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id && ymd) onDropTask?.(id, ymd);
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <span
          className="inline-flex items-center gap-2 text-[17px] font-bold"
          style={{ color: `var(--color-${tone}-deep)` }}
        >
          {label === "Overdue" && <AlertTriangle size={17} strokeWidth={2.4} />}
          {label}
        </span>
        <span className="text-[14px] font-semibold text-ink-subtle tabular-nums">{sub}</span>
      </div>
      {/* Tall droppable area so each column fills the screen and there's a
          generous target to drop onto. */}
      <div className="flex flex-col gap-3 min-h-[calc(100vh_-_330px)]">
        {tasks.length === 0 ? (
          <p className="text-[14px] text-ink-subtle px-1 py-4">
            {droppable ? "Drop a task here." : "Nothing here."}
          </p>
        ) : (
          tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}` as Route}
              draggable={canReschedule}
              onDragStart={
                canReschedule
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }
                  : undefined
              }
              className={`rounded-chip bg-white border border-hairline p-4 transition-shadow hover:shadow-md block ${
                canReschedule ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              }`}
            >
              <span
                className="text-[16.5px] font-semibold text-ink-strong block"
                style={{
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description || t.title}
              </span>
              {t.subject && (
                <span className="mt-2 text-[13px] font-semibold text-ink-subtle block">
                  {t.subject}
                </span>
              )}
              {t.late && (
                <span className="mt-2 block">
                  <LateBadge />
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
