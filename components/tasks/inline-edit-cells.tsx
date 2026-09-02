"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Check, Loader2, Search } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { CriticalBadge } from "@/components/ui/critical-badge";
import { fireToast } from "@/lib/toast";
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/db/enums";
import {
  reassignDoer,
  setTaskPriority,
  rescheduleTask,
} from "@/app/(app)/tasks/actions";

// Shared urgency calc (kept in sync with task-table.tsx). Terminal tasks are
// never "overdue".
const URGENCY_TERMINAL = new Set<TaskStatus>([
  "done",
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
]);
function dueColor(dueAt: Date | null, status: TaskStatus): { color: string; label: string; strong: boolean } {
  if (!dueAt || URGENCY_TERMINAL.has(status)) return { color: "var(--color-ink-muted)", label: "", strong: false };
  const d = dueAt instanceof Date ? dueAt : new Date(dueAt as unknown as string);
  if (Number.isNaN(d.getTime())) return { color: "var(--color-ink-muted)", label: "", strong: false };
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) return { color: "var(--color-red-deep)", label: `${Math.abs(days)}d overdue`, strong: true };
  if (days === 0) return { color: "var(--color-orange-deep)", label: "Due today", strong: true };
  if (days <= 2) return { color: "var(--color-ink-soft)", label: `in ${days}d`, strong: false };
  return { color: "var(--color-ink-muted)", label: "", strong: false };
}

function safeDate(value: Date | null, pattern: string): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as unknown as string);
  return Number.isNaN(d.getTime()) ? "—" : format(d, pattern);
}
function toYmd(value: Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as unknown as string);
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd");
}

// ── Doer ───────────────────────────────────────────────────────────────────
export function InlineDoerCell({
  taskId,
  doerId,
  doerName,
  employees,
  editable,
}: {
  taskId: string;
  doerId: string;
  doerName: string | null;
  employees: { id: string; name: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [name, setName] = React.useState(doerName);
  React.useEffect(() => setName(doerName), [doerName]);

  const display = name ? (
    <span className="inline-flex items-center gap-2.5">
      <EmployeeAvatar name={name} size="sm" />
      <span className="text-ink-strong font-bold" style={{ fontSize: 15 }}>
        {name}
      </span>
    </span>
  ) : (
    <span className="text-ink-subtle">—</span>
  );

  if (!editable) return display;

  const filtered = q.trim()
    ? employees.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    : employees;

  async function pick(id: string, nm: string) {
    setOpen(false);
    setQ("");
    if (id === doerId) return;
    const prev = name;
    setName(nm);
    setPending(true);
    try {
      const res = await reassignDoer(taskId, id);
      if (!res.ok) {
        setName(prev);
        fireToast({ message: res.error || "Could not reassign." });
      } else {
        fireToast({ message: `Reassigned to ${nm}.` });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(n) => !pending && setOpen(n)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="inline-flex items-center gap-2.5 rounded-pill px-1.5 py-1 -mx-1.5 hover:bg-surface-soft transition-colors"
          style={{ cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1 }}
          aria-label="Reassign doer"
        >
          {display}
          {pending ? (
            <Loader2 size={12} className="shrink-0" style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[240px] rounded-chip border bg-surface-card p-1.5"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }}
        >
          <div className="relative mb-1.5">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" strokeWidth={2.2} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 pl-8 pr-2 rounded-chip border border-hairline bg-surface-soft text-[14px] outline-none focus:border-altus-red"
            />
          </div>
          <ul role="listbox" className="max-h-[260px] overflow-y-auto">
            {filtered.map((e) => {
              const sel = e.id === doerId;
              return (
                <li
                  key={e.id}
                  role="option"
                  aria-selected={sel}
                  onClick={(ev) => { ev.stopPropagation(); void pick(e.id, e.name); }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-chip text-[14px] cursor-pointer hover:bg-surface-soft"
                  style={{ fontWeight: sel ? 700 : 500 }}
                >
                  <EmployeeAvatar name={e.name} size="sm" />
                  <span className="flex-1 text-ink-strong">{e.name}</span>
                  {sel && <Check size={14} strokeWidth={2.6} className="text-altus-red" />}
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2.5 py-3 text-center text-[13px] text-ink-subtle">No match</li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Priority ─────────────────────────────────────────────────────────────────
export function InlinePriorityCell({
  taskId,
  priority,
  editable,
}: {
  taskId: string;
  priority: TaskPriority;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [shown, setShown] = React.useState<TaskPriority>(priority);
  React.useEffect(() => setShown(priority), [priority]);

  const chip = shown === "imp_urgent" ? <CriticalBadge /> : (
    <span className="text-body-lg text-ink-muted">{PRIORITY_LABELS[shown]}</span>
  );
  if (!editable) return chip;

  async function pick(p: TaskPriority) {
    setOpen(false);
    if (p === shown) return;
    const prev = shown;
    setShown(p);
    setPending(true);
    try {
      const res = await setTaskPriority(taskId, p);
      if (!res.ok) {
        setShown(prev);
        fireToast({ message: res.error || "Could not change priority." });
      } else {
        fireToast({ message: `Priority set to ${PRIORITY_LABELS[p]}.` });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(n) => !pending && setOpen(n)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-pill px-1.5 py-1 -mx-1.5 hover:bg-surface-soft transition-colors"
          style={{ cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1 }}
          aria-label="Change priority"
        >
          {chip}
          {pending ? (
            <Loader2 size={12} className="shrink-0" style={{ animation: "spinFast 0.8s linear infinite" }} />
          ) : (
            <ChevronDown size={12} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] min-w-[180px] rounded-chip border bg-surface-card p-1"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }}
        >
          <ul role="listbox">
            {TASK_PRIORITIES.map((p) => {
              const sel = p === shown;
              return (
                <li
                  key={p}
                  role="option"
                  aria-selected={sel}
                  onClick={(e) => { e.stopPropagation(); void pick(p); }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-chip text-[14px] cursor-pointer hover:bg-surface-soft"
                  style={{ fontWeight: sel ? 700 : 500 }}
                >
                  <span className="flex-1 text-ink-strong">{PRIORITY_LABELS[p]}</span>
                  {sel && <Check size={14} strokeWidth={2.6} className="text-altus-red" />}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Due date ─────────────────────────────────────────────────────────────────
export function InlineDueCell({
  taskId,
  dueAt,
  status,
  editable,
}: {
  taskId: string;
  dueAt: Date | null;
  status: TaskStatus;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [shown, setShown] = React.useState<Date | null>(dueAt);
  React.useEffect(() => setShown(dueAt), [dueAt]);

  const u = dueColor(shown, status);
  const display = (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className="text-body-lg tabular-nums" style={{ color: u.color, fontWeight: u.strong ? 700 : undefined }}>
        {safeDate(shown, "MMM d")}
      </span>
      {u.label && (
        <span className="text-[11px] font-bold tabular-nums" style={{ color: u.color }}>{u.label}</span>
      )}
    </span>
  );
  if (!editable) return display;

  async function commit(ymd: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
    setOpen(false);
    const prev = shown;
    setShown(new Date(`${ymd}T12:00:00+05:30`));
    setPending(true);
    try {
      const res = await rescheduleTask(taskId, ymd);
      if (!res.ok) {
        setShown(prev);
        fireToast({ message: res.error || "Could not reschedule." });
      } else {
        fireToast({ message: "Due date updated." });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={(n) => !pending && setOpen(n)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-chip px-1.5 py-1 -mx-1.5 hover:bg-surface-soft transition-colors"
          style={{ cursor: pending ? "wait" : "pointer", opacity: pending ? 0.7 : 1 }}
          aria-label="Reschedule due date"
        >
          {display}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] rounded-chip border bg-surface-card p-3"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px rgba(15,23,42,0.18)" }}
        >
          <label className="block text-[12px] font-bold text-ink-subtle uppercase tracking-[0.06em] mb-1.5">
            Due date
          </label>
          <input
            autoFocus
            type="date"
            defaultValue={toYmd(shown)}
            onChange={(e) => void commit(e.target.value)}
            className="h-10 px-3 rounded-chip border border-hairline bg-surface-soft text-[14px] outline-none focus:border-altus-red"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
