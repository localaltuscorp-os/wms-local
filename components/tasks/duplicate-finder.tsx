"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  CheckCircle2,
  CopyMinus,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { bulkDelete } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import type { DuplicateGroup } from "@/lib/queries/duplicates";

/**
 * Admin duplicate-cleanup checklist. Each card is one duplicate set (same
 * doer · same due date · identical details, recurrence excluded). The oldest
 * copy is marked "Keep" and everything newer starts pre-checked, so the
 * common case — CSV imported twice — is review → one Delete click.
 */
export function DuplicateFinder({
  groups,
  statusLabels,
  statusTones,
}: {
  groups: DuplicateGroup[];
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const extras = React.useMemo(
    () => groups.flatMap((g) => g.tasks.slice(1).map((t) => t.id)),
    [groups],
  );
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(extras),
  );

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Permanently delete ${ids.length} duplicate task${ids.length === 1 ? "" : "s"}?\n\nThis removes the tasks and their history and cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await bulkDelete(ids);
      if (!res.ok) {
        fireToast({ message: res.error || "Delete failed.", type: "error" });
        return;
      }
      fireToast({
        message: `Deleted ${ids.length} duplicate${ids.length === 1 ? "" : "s"}.`,
      });
      setSelected(new Set());
      router.refresh();
    });
  }

  const totalExtras = extras.length;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 max-md:px-4 py-8 pb-32">
      <button
        type="button"
        onClick={() => router.push("/tasks" as Route)}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-subtle hover:text-ink-strong transition-colors mb-5"
      >
        <ArrowLeft size={15} strokeWidth={2.4} />
        Back to Tasks
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <h1
          className="text-ink-strong inline-flex items-center gap-2.5"
          style={{ fontFamily: "var(--font-display)", fontSize: 27, fontWeight: 600 }}
        >
          <CopyMinus size={24} strokeWidth={2} style={{ color: "var(--color-altus-red)" }} />
          Duplicate tasks
        </h1>
      </div>
      <p className="text-ink-soft mb-7" style={{ fontSize: 15, maxWidth: "70ch" }}>
        Tasks that share the <strong>same doer, same due date and identical details</strong>,
        with no repeat frequency — usually the result of a sheet imported twice. The oldest
        copy in each set is kept; newer copies start selected for deletion.
      </p>

      {groups.length === 0 ? (
        <div
          className="rounded-section border border-hairline bg-surface-card px-6 py-14 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
        >
          <CheckCircle2
            size={36}
            strokeWidth={1.8}
            className="mx-auto"
            style={{ color: "var(--color-green-deep)" }}
            aria-hidden
          />
          <p className="text-ink-strong mt-3 font-semibold" style={{ fontSize: 17 }}>
            No duplicates found
          </p>
          <p className="text-ink-soft mt-1" style={{ fontSize: 15 }}>
            Every active task is unique by doer, due date and details.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-5">
            <p className="text-[14px] font-semibold text-ink-soft tabular-nums">
              {groups.length} duplicate {groups.length === 1 ? "set" : "sets"} ·{" "}
              {totalExtras} extra {totalExtras === 1 ? "copy" : "copies"}
            </p>
            <span className="text-ink-subtle" aria-hidden>·</span>
            <button
              type="button"
              onClick={() => setSelected(new Set(extras))}
              className="text-[13.5px] font-bold text-altus-red hover:underline"
            >
              Select all extras
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[13.5px] font-bold text-ink-subtle hover:text-ink-strong hover:underline"
            >
              Clear selection
            </button>
          </div>

          <div className="grid gap-4">
            {groups.map((g) => (
              <GroupCard
                key={g.key}
                group={g}
                selected={selected}
                onToggle={toggle}
                statusLabels={statusLabels}
                statusTones={statusTones}
              />
            ))}
          </div>

          {/* Sticky action bar */}
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
            <div
              className="flex items-center gap-4 rounded-pill border border-hairline-strong bg-surface-card px-5 py-3"
              style={{ boxShadow: "0 12px 32px -8px rgba(15,23,42,0.25)" }}
            >
              <span className="text-[14px] font-bold text-ink-strong tabular-nums whitespace-nowrap">
                {selected.size} selected
              </span>
              <button
                type="button"
                disabled={pending || selected.size === 0}
                onClick={deleteSelected}
                className="inline-flex items-center gap-2 rounded-pill bg-altus-red px-5 h-11 text-[14.5px] font-bold text-white transition-colors hover:bg-altus-red-deep disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
                ) : (
                  <Trash2 size={16} strokeWidth={2.4} />
                )}
                Delete selected
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));

function GroupCard({
  group,
  selected,
  onToggle,
  statusLabels,
  statusTones,
}: {
  group: DuplicateGroup;
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
}) {
  const first = group.tasks[0]!;
  return (
    <section
      className="rounded-section border border-hairline bg-surface-card overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
      aria-label={`Duplicate set — ${group.doerName}, due ${dateLabel(group.dueAt)}`}
    >
      <header className="flex items-center gap-x-3 gap-y-1 flex-wrap px-5 py-3.5 border-b border-hairline bg-surface-soft/60">
        <span className="font-bold text-ink-strong" style={{ fontSize: 15 }}>
          {group.doerName}
        </span>
        <span className="text-ink-subtle" aria-hidden>·</span>
        <span className="font-semibold text-ink-soft tabular-nums" style={{ fontSize: 14 }}>
          Due {dateLabel(group.dueAt)}
        </span>
        {(group.client || group.subject) && (
          <>
            <span className="text-ink-subtle" aria-hidden>·</span>
            <span className="text-ink-muted truncate" style={{ fontSize: 14 }}>
              {[group.client, group.subject].filter(Boolean).join(" · ")}
            </span>
          </>
        )}
        <span
          className="ml-auto rounded-pill px-2.5 py-0.5 font-bold tabular-nums"
          style={{
            fontSize: 12.5,
            background: "var(--color-red-bg)",
            color: "var(--color-red-deep)",
          }}
        >
          ×{group.tasks.length}
        </span>
      </header>

      <p className="px-5 pt-3 text-ink-strong" style={{ fontSize: 15, lineHeight: 1.5 }}>
        {first.title?.trim() || first.description?.trim() || "(no description)"}
      </p>

      <ul className="px-3 py-3 grid gap-1">
        {group.tasks.map((t, i) => {
          const keeper = i === 0;
          const tone = statusTones[t.status] ?? "slate";
          return (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-chip px-2 py-2 hover:bg-surface-soft transition-colors"
            >
              {keeper ? (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center shrink-0"
                  title="Oldest copy — kept"
                >
                  <ShieldCheck size={17} strokeWidth={2.2} style={{ color: "var(--color-green-deep)" }} />
                </span>
              ) : (
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={(e) => onToggle(t.id, e.target.checked)}
                  aria-label={`Select task #${t.taskNo ?? ""} for deletion`}
                  className="h-5 w-5 shrink-0 accent-[var(--color-altus-red)] cursor-pointer"
                />
              )}
              <span className="font-bold tabular-nums text-ink-subtle shrink-0" style={{ fontSize: 13.5 }}>
                {t.taskNo != null ? `#${t.taskNo}` : "—"}
              </span>
              <span
                className="inline-flex items-center rounded-pill px-2 py-0.5 font-semibold shrink-0"
                style={{
                  fontSize: 12,
                  background: `var(--color-${tone}-bg)`,
                  color: `var(--color-${tone}-deep)`,
                }}
              >
                {statusLabels[t.status] ?? t.status}
              </span>
              <span className="text-ink-soft shrink-0" style={{ fontSize: 13 }}>
                {PRIORITY_LABELS[t.priority]}
              </span>
              <span className="text-ink-muted tabular-nums" style={{ fontSize: 13 }}>
                created {dateLabel(t.createdAt)}
              </span>
              {keeper && (
                <span
                  className="rounded-pill px-2 py-0.5 font-bold uppercase shrink-0"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.05em",
                    background: "var(--color-green-bg)",
                    color: "var(--color-green-deep)",
                  }}
                >
                  Keep
                </span>
              )}
              <Link
                href={`/tasks/${t.id}` as Route}
                target="_blank"
                className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-ink-subtle hover:text-altus-red transition-colors shrink-0"
                aria-label={`Open task #${t.taskNo ?? ""} in a new tab`}
              >
                <ExternalLink size={13.5} strokeWidth={2.2} />
                Open
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
