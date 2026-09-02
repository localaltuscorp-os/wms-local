"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Calendar, Users, RotateCcw, SlidersHorizontal, Loader2, Sparkles, Layers, Download } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { dotColorFor } from "@/components/tasks/audit-event-meta";
import { TASK_EVENT_TYPES, type TaskEventType } from "@/lib/events";

const EVENT_TYPE_LABELS: Record<TaskEventType, string> = {
  created: "Created",
  field_updated: "Edited",
  status_changed: "Status changed",
  reassigned: "Reassigned",
  transferred_external: "Transferred out",
  priority_changed: "Priority",
  due_changed: "Due date",
  archived: "Archived",
  restored: "Restored",
  commented: "Commented",
};

const SOURCE_OPTIONS = [
  { value: "task", label: "Tasks" },
  { value: "employee", label: "Employees" },
  { value: "settings", label: "Settings" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  task: "Tasks",
  employee: "Employees",
  settings: "Settings",
};

interface Props {
  employees: { value: string; label: string }[];
  initial: {
    actorIds: string[];
    kinds: string[];
    source: string[];
    from: string;
    to: string;
  };
}

function isoOrEmpty(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * Sticky filter bar for /admin/activity.  Mirrors the visual vocabulary of
 * `components/layout/filter-bar.tsx` (filter chips, Apply CTA, Reset link)
 * but is dedicated to activity-specific params:
 *  - ?actor=<id>,<id>
 *  - ?kind=<TaskEventType>,<TaskEventType>
 *  - ?from=<yyyy-mm-dd>
 *  - ?to=<yyyy-mm-dd>
 *
 * Applying drops the `?before=` cursor so the user is paged back to the
 * newest events for the new filters.
 */
export function ActivityFilterBar({ employees, initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [actorIds, setActorIds] = React.useState<string[]>(initial.actorIds);
  const [kinds, setKinds] = React.useState<string[]>(initial.kinds);
  const [source, setSource] = React.useState<string[]>(initial.source ?? []);
  const [from, setFrom] = React.useState<string>(initial.from);
  const [to, setTo] = React.useState<string>(initial.to);

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    // Filter changes invalidate the cursor.
    sp.delete("before");

    if (actorIds.length > 0) sp.set("actor", actorIds.join(","));
    else sp.delete("actor");

    if (kinds.length > 0) sp.set("kind", kinds.join(","));
    else sp.delete("kind");

    if (source.length > 0) sp.set("src", source.join(","));
    else sp.delete("src");

    if (from) sp.set("from", from);
    else sp.delete("from");
    if (to) sp.set("to", to);
    else sp.delete("to");

    startTransition(() => {
      const qs = sp.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as any);
    });
  }

  // Auto-apply: push the new query string whenever a filter changes, debounced
  // so toggling several options coalesces into one navigation. First render is
  // skipped — the page already matches the initial params.
  const didMount = React.useRef(false);
  React.useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(apply, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorIds, kinds, source, from, to]);

  function reset() {
    // Just clear state — the auto-apply effect navigates (and drops ?before=).
    setActorIds([]);
    setKinds([]);
    setSource([]);
    setFrom("");
    setTo("");
  }

  const activeCount =
    (actorIds.length > 0 ? 1 : 0) +
    (kinds.length > 0 ? 1 : 0) +
    (source.length > 0 ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  const kindOptions = TASK_EVENT_TYPES.map((t) => ({
    value: t,
    label: EVENT_TYPE_LABELS[t],
  }));

  return (
    <div
      className="sticky top-0 max-md:top-14 z-30 border-b border-hairline -mx-8 px-8 mb-4 max-md:-mx-4 max-md:px-4"
      style={{
        backgroundColor: "rgba(250, 251, 252, 0.85)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3 py-4">
        <span
          className="inline-flex items-center gap-1.5 text-table-head mr-1"
          style={{ color: "var(--color-ink-subtle)" }}
        >
          <SlidersHorizontal size={14} strokeWidth={2.4} />
          Filters
          {activeCount > 0 && (
            <span
              className="ml-1 inline-flex items-center justify-center rounded-full text-white"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                padding: "0 6px",
                background: "var(--color-altus-red)",
              }}
            >
              {activeCount}
            </span>
          )}
        </span>

        {/* Date range — two simple inputs, no popover */}
        <label className="filter-chip">
          <Calendar size={16} className="text-ink-subtle" strokeWidth={2} />
          <span className="text-[12px] uppercase tracking-wide text-ink-subtle">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-transparent outline-none text-chip text-ink-strong tabular-nums"
            style={{ minWidth: 130 }}
          />
        </label>
        <label className="filter-chip">
          <Calendar size={16} className="text-ink-subtle" strokeWidth={2} />
          <span className="text-[11px] uppercase tracking-wide text-ink-subtle">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-transparent outline-none text-chip text-ink-strong tabular-nums"
            style={{ minWidth: 130 }}
          />
        </label>

        {/* Actor */}
        <div className="filter-chip">
          <Users size={16} className="text-ink-subtle" strokeWidth={2} />
          <MultiSelect
            options={employees}
            selected={actorIds}
            onChange={setActorIds}
            placeholder="All actors"
          />
        </div>

        {/* Kind */}
        <div className="filter-chip">
          <Sparkles size={16} className="text-ink-subtle" strokeWidth={2} />
          <MultiSelect
            options={kindOptions}
            selected={kinds}
            onChange={setKinds}
            placeholder="All event types"
          />
        </div>

        {/* Source */}
        <div className="filter-chip">
          <Layers size={16} className="text-ink-subtle" strokeWidth={2} />
          <MultiSelect
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            selected={source}
            onChange={setSource}
            placeholder="All sources"
          />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Export honours the CURRENT URL params, not the in-progress filter
              state — mirrors T19's pattern on the tasks filter-bar so admins
              export what they see (not what they're about to apply). */}
          <a
            href={`/admin/activity/export?${searchParams.toString()}`}
            download
            className="inline-flex items-center gap-1.5 text-chip text-ink-subtle hover:text-ink-strong transition-colors px-3 py-2 rounded-chip"
            title="Download current view as CSV"
            aria-label="Export CSV"
          >
            <Download size={14} strokeWidth={2.2} />
            Export CSV
          </a>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-chip text-ink-subtle hover:text-ink-strong transition-colors px-3 py-2 rounded-chip"
            aria-label="Reset filters"
          >
            <RotateCcw size={14} strokeWidth={2.2} />
            Reset
          </button>
          {/* Filters auto-apply — no Apply button. This just confirms a refresh
              is in flight. */}
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-chip text-ink-subtle transition-opacity"
            style={{ opacity: isPending ? 1 : 0 }}
          >
            <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
            Updating…
          </span>
        </div>
      </div>
    </div>
  );
}

interface ChipsProps {
  actorIds: string[];
  kinds: TaskEventType[];
  source: string[];
  from: Date | null;
  to: Date | null;
  employeeLabels: Map<string, string>;
}

/**
 * Active-filter chips row.  Each chip removes its own param when clicked,
 * and the "Reset" link clears every activity-specific param at once.  Hides
 * itself entirely when no filters are active.
 */
export function ActivityActiveFilterChips({
  actorIds,
  kinds,
  source,
  from,
  to,
  employeeLabels,
}: ChipsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const hasAny =
    actorIds.length > 0 ||
    kinds.length > 0 ||
    source.length > 0 ||
    from !== null ||
    to !== null;
  if (!hasAny) return null;

  function navigate(mutate: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("before");
    mutate(sp);
    const qs = sp.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as any);
  }

  function removeActor(id: string) {
    navigate((sp) => {
      const remaining = actorIds.filter((a) => a !== id);
      if (remaining.length > 0) sp.set("actor", remaining.join(","));
      else sp.delete("actor");
    });
  }

  function removeKind(k: TaskEventType) {
    navigate((sp) => {
      const remaining = kinds.filter((x) => x !== k);
      if (remaining.length > 0) sp.set("kind", remaining.join(","));
      else sp.delete("kind");
    });
  }

  function removeSource(s: string) {
    navigate((sp) => {
      const remaining = source.filter((x) => x !== s);
      if (remaining.length > 0) sp.set("src", remaining.join(","));
      else sp.delete("src");
    });
  }

  function resetAll() {
    navigate((sp) => {
      sp.delete("actor");
      sp.delete("kind");
      sp.delete("src");
      sp.delete("from");
      sp.delete("to");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {actorIds.map((id) => (
        <Chip key={`a-${id}`} onRemove={() => removeActor(id)}>
          <span className="text-ink-subtle">Actor:</span>
          <span className="text-ink-strong font-medium">
            {employeeLabels.get(id) ?? id.slice(0, 8)}
          </span>
        </Chip>
      ))}
      {kinds.map((k) => (
        <Chip
          key={`k-${k}`}
          dotColor={dotColorFor(k)}
          onRemove={() => removeKind(k)}
        >
          <span className="text-ink-strong font-medium">
            {EVENT_TYPE_LABELS[k]}
          </span>
        </Chip>
      ))}
      {source.map((s) => (
        <Chip key={`s-${s}`} onRemove={() => removeSource(s)}>
          <span className="text-ink-subtle">Source:</span>
          <span className="text-ink-strong font-medium">
            {SOURCE_LABELS[s] ?? s}
          </span>
        </Chip>
      ))}
      {from && (
        <Chip
          key="from"
          onRemove={() =>
            navigate((sp) => {
              sp.delete("from");
            })
          }
        >
          <span className="text-ink-subtle">From:</span>
          <span className="text-ink-strong tabular-nums">{isoOrEmpty(from)}</span>
        </Chip>
      )}
      {to && (
        <Chip
          key="to"
          onRemove={() =>
            navigate((sp) => {
              sp.delete("to");
            })
          }
        >
          <span className="text-ink-subtle">To:</span>
          <span className="text-ink-strong tabular-nums">{isoOrEmpty(to)}</span>
        </Chip>
      )}
      <button
        type="button"
        onClick={resetAll}
        className="ml-1 text-[13px] font-semibold hover:underline"
        style={{ color: "var(--color-altus-red)" }}
      >
        Reset
      </button>
    </div>
  );
}

function Chip({
  children,
  onRemove,
  dotColor,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  dotColor?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white border border-hairline px-2.5 py-1"
      style={{
        fontSize: 13.5,
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      }}
    >
      {dotColor && (
        <span
          aria-hidden
          className="rounded-full"
          style={{
            width: 8,
            height: 8,
            background: dotColor,
            boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.04)",
          }}
        />
      )}
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="text-ink-subtle hover:text-ink-strong ml-0.5"
        aria-label="Remove filter"
      >
        ×
      </button>
    </span>
  );
}
