"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarRange,
  Clock,
  Flag,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { rescheduleTask } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { LateBadge } from "@/components/ui/late-badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { PRIORITY_LABELS, type TaskStatus, type TaskPriority, type StatusColorToken } from "@/db/enums";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/** Calendar-add days to a yyyy-mm-dd string (lexicographic == chronological). */
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// Priority → colour token for the card badge (same semantics as the Kanban).
const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

export interface AgendaTask {
  id: string;
  /** Friendly sequential number (#1042) when backfilled. */
  taskNo?: number | null;
  title: string;
  subject: string | null;
  client?: string | null;
  description: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  doerName?: string | null;
  dueYmd: string; // IST calendar day, yyyy-mm-dd
  /** Done after its due date — drives the "Late" badge. */
  late?: boolean;
}

interface DayCol {
  ymd: string;
  label: string;
  sub: string;
}

/** A keyboard-reschedule destination shown in the per-card menu. */
interface RescheduleTarget {
  ymd: string;
  label: string;
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
  /** Status display maps (label + colour token) for the card status pill. */
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
}

const DAY_CHOICES = [3, 4, 5, 6] as const;

/**
 * "My Day" agenda board. Date-wise kanban with a selectable 3/4/5/6-day
 * window. Cards are draggable (#7) — drop a task onto a day column to
 * reschedule its due date there (optimistic, with rollback on failure).
 * Clicking a card still opens the focused task. The welcome hero + view
 * toggle live in the parent MyDayWorkspace.
 */
export function AgendaBoard({ todayYmd, days, tasks, isAdmin, statusLabels, statusTones }: Props) {
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

  // Keyboard-accessible reschedule targets — the visible day columns. Threaded
  // to each admin card's reschedule menu so a keyboard-only admin can move a
  // task between days without HTML5 drag-and-drop.
  const rescheduleTargets: RescheduleTarget[] = shownDays.map((d) => ({
    ymd: d.ymd,
    label: d.label === "Today" ? `Today (${d.sub})` : `${d.label} (${d.sub})`,
  }));

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
        {buckets.map((b, i) => {
          const Icon = b.icon;
          return (
            <div
              key={b.key}
              className="wg-rise wg-sheen relative bg-surface-card rounded-section overflow-hidden"
              style={{
                animationDelay: `${60 + i * 70}ms`,
                border: "1px solid var(--color-hairline)",
                boxShadow:
                  "0 1px 3px rgba(15, 23, 42, 0.04), 0 16px 36px -30px rgba(15, 23, 42, 0.22)",
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
                className="absolute -right-10 -top-12 size-32 rounded-full"
                style={{
                  background: `radial-gradient(circle, color-mix(in srgb, var(--color-${b.tone}) 10%, transparent), transparent 70%)`,
                }}
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

      {/* Day-count selector — segmented pill, brand-red active. */}
      <div className="wg-rise mb-5 flex items-center gap-3" style={{ animationDelay: "160ms" }}>
        <span className="text-[15px] font-semibold text-ink-subtle">Show</span>
        <div
          className="inline-flex items-center rounded-pill border border-hairline bg-surface-card p-0.5"
          style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
          role="tablist"
          aria-label="Days shown on the agenda"
        >
          {DAY_CHOICES.map((n) => {
            const active = dayCount === n;
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDayCount(n)}
                className={`px-4 h-9 rounded-pill text-[14.5px] font-bold transition-all ${
                  active ? "text-white" : "text-ink-soft hover:text-ink-strong"
                }`}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                        boxShadow: "0 6px 16px -8px rgba(225,6,0,0.55)",
                      }
                    : undefined
                }
              >
                {n} days
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="kanban-scroll flex gap-5 overflow-x-auto pb-4"
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
            sub="past due"
            tone="red"
            tasks={overdueItems}
            onDropTask={moveTo}
            rescheduleTargets={rescheduleTargets}
            canReschedule={isAdmin}
            statusLabels={statusLabels}
            statusTones={statusTones}
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
            rescheduleTargets={rescheduleTargets}
            canReschedule={isAdmin}
            statusLabels={statusLabels}
            statusTones={statusTones}
          />
        ))}
        {laterItems.length > 0 && (
          <Column
            label="Not Due"
            sub="beyond this window"
            tone="slate"
            tasks={laterItems}
            onDropTask={moveTo}
            rescheduleTargets={rescheduleTargets}
            canReschedule={isAdmin}
            statusLabels={statusLabels}
            statusTones={statusTones}
          />
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
  rescheduleTargets,
  canReschedule,
  statusLabels,
  statusTones,
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
  /** Day columns offered in each admin card's keyboard-reschedule menu. */
  rescheduleTargets?: RescheduleTarget[];
  /** Admin-only: when false, cards aren't draggable and columns reject drops. */
  canReschedule: boolean;
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
}) {
  const droppable = !!ymd && canReschedule;
  const emphasised = label === "Today" || label === "Overdue";
  return (
    <div
      className="relative flex-shrink-0 w-[360px] max-md:w-[300px] rounded-section p-4 transition-colors"
      style={{
        background: isOver
          ? "var(--color-blue-bg)"
          : "var(--color-surface-soft)",
        border: `1px solid ${isOver ? "var(--color-blue)" : "var(--color-hairline)"}`,
        boxShadow: "0 1px 2px rgba(15,23,42,0.03), 0 12px 28px -26px rgba(15,23,42,0.20)",
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
      {/* Tone accent strip along the column top. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 3,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: emphasised
            ? `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`
            : `color-mix(in srgb, var(--color-${tone}) 35%, transparent)`,
        }}
      />
      <div className="flex items-center justify-between mb-4 px-1 pt-0.5">
        <span className="inline-flex items-center gap-2 min-w-0">
          {label === "Overdue" ? (
            <AlertTriangle
              size={16}
              strokeWidth={2.5}
              className="shrink-0"
              style={{ color: `var(--color-${tone}-deep)` }}
            />
          ) : (
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: `var(--color-${tone})` }}
            />
          )}
          <span
            className="font-black truncate"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 16.5,
              letterSpacing: "-0.01em",
              color: emphasised ? `var(--color-${tone}-deep)` : "var(--color-ink-strong)",
            }}
          >
            {label}
          </span>
          <span className="text-[13.5px] font-semibold text-ink-subtle truncate">{sub}</span>
        </span>
        <span
          className="rounded-pill px-2.5 py-0.5 text-[13px] font-black tabular-nums shrink-0"
          style={{
            color: `var(--color-${tone}-deep)`,
            background: `color-mix(in srgb, var(--color-${tone}) 12%, white)`,
            border: `1px solid color-mix(in srgb, var(--color-${tone}) 26%, transparent)`,
          }}
        >
          {tasks.length}
        </span>
      </div>
      {/* Tall droppable area so each column fills the screen and there's a
          generous target to drop onto. */}
      <div className="flex flex-col gap-3 min-h-[calc(100vh_-_330px)]">
        {tasks.length === 0 ? (
          <div
            className="rounded-chip px-3 py-6 text-center"
            style={{ border: "1.5px dashed var(--color-hairline-strong)" }}
          >
            <p className="text-[14px] font-semibold text-ink-subtle">
              {droppable ? "Drop a task here." : "Nothing here."}
            </p>
          </div>
        ) : (
          tasks.map((t) => (
            <AgendaCard
              key={t.id}
              t={t}
              canReschedule={canReschedule}
              rescheduleTargets={rescheduleTargets}
              onDropTask={onDropTask}
              statusLabels={statusLabels}
              statusTones={statusTones}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
// Premium agenda card — task-no, status/priority pills, subject·client meta and
// the doer chip. The whole card is the link (and, for admins, the drag handle);
// the calendar button is the keyboard reschedule menu.
function AgendaCard({
  t,
  canReschedule,
  rescheduleTargets,
  onDropTask,
  statusLabels,
  statusTones,
}: {
  t: AgendaTask;
  canReschedule: boolean;
  rescheduleTargets?: RescheduleTarget[];
  onDropTask?: (id: string, ymd: string) => void;
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
}) {
  const statusTone = t.status ? statusTones?.[t.status] ?? "slate" : null;
  const statusLabel = t.status ? statusLabels?.[t.status] ?? null : null;
  const prioTone = t.priority ? PRIORITY_TONE[t.priority] : null;
  const meta = [t.subject?.trim(), t.client?.trim()].filter((p): p is string => !!p);
  const hasBadgeRow = t.taskNo != null || !!statusLabel || !!prioTone || !!t.late;

  return (
    <Link
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
      className={`group relative rounded-chip bg-white border border-hairline p-4 block transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-altus-red/30 ${
        canReschedule ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
    >
      {/* Status accent stripe. */}
      {statusTone && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
          style={{
            background: `linear-gradient(180deg, var(--color-${statusTone}), var(--color-${statusTone}-deep))`,
          }}
        />
      )}
      {canReschedule && (rescheduleTargets?.length ?? 0) > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Reschedule "${t.description || t.title}" to another day`}
              // Stop the click from following the Link to the task page —
              // the button only opens the reschedule menu.
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              // Native drag of the parent Link would otherwise begin from
              // the button; keep the button a pure keyboard/click target.
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-pill text-ink-subtle hover:bg-surface-soft hover:text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-1"
            >
              <CalendarRange size={16} strokeWidth={2.3} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Reschedule to</DropdownMenuLabel>
            {rescheduleTargets?.map((target) => (
              <DropdownMenuItem
                key={target.ymd}
                disabled={target.ymd === t.dueYmd}
                onSelect={() => onDropTask?.(t.id, target.ymd)}
              >
                {target.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Badge row — task no + status + priority. */}
      {hasBadgeRow && (
        <span
          className="flex items-center gap-1.5 flex-wrap mb-2"
          style={{ paddingRight: canReschedule ? 34 : undefined }}
        >
          {t.taskNo != null && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[12px] font-black tabular-nums text-ink-subtle"
              style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
            >
              #{t.taskNo}
            </span>
          )}
          {statusLabel && statusTone && (
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold whitespace-nowrap"
              style={{
                color: `var(--color-${statusTone}-deep)`,
                background: `color-mix(in srgb, var(--color-${statusTone}) 12%, white)`,
                border: `1px solid color-mix(in srgb, var(--color-${statusTone}) 26%, transparent)`,
              }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: `var(--color-${statusTone})` }}
              />
              {statusLabel}
            </span>
          )}
          {t.priority && prioTone && (
            <span
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-bold whitespace-nowrap"
              style={{
                color: `var(--color-${prioTone}-deep)`,
                background: `color-mix(in srgb, var(--color-${prioTone}) 12%, white)`,
                border: `1px solid color-mix(in srgb, var(--color-${prioTone}) 26%, transparent)`,
              }}
            >
              <Flag size={11} strokeWidth={2.6} />
              {PRIORITY_LABELS[t.priority]}
            </span>
          )}
          {t.late && <LateBadge />}
        </span>
      )}

      <span
        className="text-[16px] font-semibold text-ink-strong block group-hover:text-altus-red-deep transition-colors"
        style={{
          lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          paddingRight: !hasBadgeRow && canReschedule ? 34 : undefined,
        }}
      >
        {t.description || t.title}
      </span>

      {(meta.length > 0 || t.doerName) && (
        <span className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink-subtle truncate">
            {meta.join(" · ")}
          </span>
          {t.doerName && (
            <span className="inline-flex items-center gap-1.5 shrink-0" title={t.doerName}>
              <EmployeeAvatar name={t.doerName} size="sm" />
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
