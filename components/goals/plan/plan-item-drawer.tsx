"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import { X, Check, ExternalLink, Loader2 } from "lucide-react";
import { PRIORITY_LABELS } from "@/db/enums";
import type { TaskPriority } from "@/db/enums";
import { Avatar } from "@/components/ui/avatar";
import type { PlanItem } from "./types";
import { planCategory, CATEGORY_ACCENT } from "./source-tag";

/**
 * Right-side SLIDE-OVER for one plan commitment.
 *
 * A slide-over, not the centred `ItemDetailModal` that source cards use: this
 * opens from a table row, and a centred sheet would cover the very list you are
 * working down. 75vw (Sir) — wide enough that a task reads as a document rather
 * than a column, with the list still visible down the left edge.
 *
 * PORTALLED TO document.body, and that is load-bearing rather than tidiness.
 * Its parent in day-review carries `.wg-rise`, whose `fadeUp` animation ends on
 * `transform: translateY(0)` with fill-mode `both` — so the transform is never
 * removed. Any non-`none` transform makes a descendant's `position: fixed`
 * resolve against THAT element instead of the viewport, which is why this panel
 * used to render as a box floating in the middle of the page, clipped short of
 * the bottom and scrolling internally with room to spare around it. Portalling
 * lifts it out of every transformed ancestor for good; widening it without this
 * would only have produced a bigger misplaced box.
 *
 * Sections that have no data for this row are NOT rendered. Subtasks and the
 * activity timeline only exist for rows backed by a WMS task — an ad-hoc
 * commitment or a weekly goal has neither anywhere in the schema — so showing
 * them with a permanent "No activity" would be dead space on most rows.
 *
 * The shell mirrors `components/tasks/task-detail-drawer.tsx` (scrim, Esc to
 * close, body scroll lock, sticky header) rather than importing it: that one
 * hard-codes closing via the `?task=` query param, which this has no part in.
 */
export function PlanItemDrawer({
  item,
  employeeName,
  avatarUrl,
  busy,
  onToggleDone,
  onClose,
}: {
  item: PlanItem | null;
  employeeName: string;
  avatarUrl?: string | null;
  busy?: boolean;
  onToggleDone: (item: PlanItem) => void;
  onClose: () => void;
}) {
  // Esc closes; the body is locked so the page behind can't scroll under it.
  React.useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose]);

  // Portals need a DOM target, which does not exist during SSR — render nothing
  // on the server pass and mount on the client.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!item || !mounted) return null;

  const category = planCategory(item.kind, item.carriedOver);
  const heroTitle = item.client?.trim() || item.subject?.trim() || item.title;
  const isTaskBacked = Boolean(item.taskId);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true">
      {/* Scrim — a button so a click anywhere off the panel closes it. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: "rgba(15,23,42,0.32)" }}
      />

      <aside
        className="relative flex h-full w-[75vw] min-w-[420px] flex-col bg-white max-lg:w-[85vw] max-md:w-full max-md:min-w-0"
        style={{
          boxShadow: "-24px 0 60px -24px rgba(15,23,42,0.35)",
          animation: "drawerIn 180ms ease-out",
        }}
      >
        {/* ── 1 · Sticky header: breadcrumb + actions ────────────────────── */}
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-hairline bg-white px-5 py-3">
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-ink-subtle">
              Daily Goals <span className="text-ink-subtle/60">/</span> {category}
              {item.taskNo ? (
                <>
                  {" "}
                  <span className="text-ink-subtle/60">/</span>{" "}
                  <span className="font-mono">#{item.taskNo}</span>
                </>
              ) : null}
            </span>
          </nav>

          <button
            type="button"
            onClick={() => onToggleDone(item)}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
            style={{
              background: item.done
                ? "var(--color-green-deep)"
                : "linear-gradient(135deg, #E10600, #A80400)",
            }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {item.done ? "Done" : "Mark as Done"}
          </button>

          {isTaskBacked && (
            <Link
              href={`/tasks/${item.taskId}` as Route}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
            >
              <ExternalLink size={13} /> Edit
            </Link>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </header>

        {/* ── 2 · Hero context ───────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-hairline px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                style={{
                  background: "var(--color-surface-soft)",
                  color: CATEGORY_ACCENT[category],
                }}
              >
                <span
                  aria-hidden
                  className="inline-block size-1.5 rounded-full"
                  style={{ background: CATEGORY_ACCENT[category] }}
                />
                {category}
              </span>
            </div>

            <h2
              className="mt-2 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(22px, 2.2vw, 30px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.08,
              }}
            >
              {heroTitle}
            </h2>
            {heroTitle !== item.title && (
              <p className="mt-1 text-[14px] font-semibold text-ink-soft">{item.title}</p>
            )}

            {/* Owner sits with the title; the rest of the facts moved into the
                Details card on the right, where a wide panel can hold them as a
                scannable list instead of a wrapping run-on row. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2">
                <Avatar name={employeeName} avatarUrl={avatarUrl ?? null} size={22} />
                <span className="text-[12.5px] font-semibold text-ink-strong">
                  {employeeName}
                </span>
              </span>
            </div>
          </div>

          {/* ── 3 · Body — TWO COLUMNS once there is room for them ─────────
              At 75vw a single column of prose leaves most of the panel empty and
              still makes a long description scroll. Narrative on the left, facts
              in a card on the right (the shape of the WMS task detail view Sir
              pointed at). Collapses back to one column under `lg`, where the
              panel is 85vw/full-width and a 320px sidebar would crush the text. */}
          <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
            <div className="min-w-0 space-y-5">
              <section>
                <SectionLabel>Description</SectionLabel>
                {item.description ? (
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">
                    {item.description}
                  </p>
                ) : (
                  <p className="text-[13px] font-medium italic text-ink-subtle">
                    No description on this commitment.
                  </p>
                )}
              </section>

              {item.doneNote ? (
                <section>
                  <SectionLabel>Close-out note</SectionLabel>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">
                    {item.doneNote}
                  </p>
                </section>
              ) : null}

              {/* Subtasks + activity live on the TASK, so they exist only for
                  task-backed rows. For everything else the sections are omitted
                  rather than shown empty — see the component doc. */}
              {isTaskBacked ? (
                <section>
                  <SectionLabel>Subtasks &amp; activity</SectionLabel>
                  <Link
                    href={`/tasks/${item.taskId}` as Route}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-3 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                  >
                    <ExternalLink size={14} />
                    Open the full task
                  </Link>
                  <p className="mt-1.5 text-[12px] font-medium text-ink-subtle">
                    Its checklist, comments and time log live on the task itself.
                  </p>
                </section>
              ) : null}
            </div>

            <aside className="min-w-0">
              <div className="rounded-section border border-hairline bg-surface-soft p-4">
                <SectionLabel>Details</SectionLabel>
                <dl className="mt-1 divide-y divide-hairline">
                  <DetailRow label="Priority">
                    {item.priority ? (
                      <PriorityPill priority={item.priority} />
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </DetailRow>
                  <DetailRow label="Due">{item.dueYmd ?? "—"}</DetailRow>
                  <DetailRow label="Created">{item.createdYmd ?? "—"}</DetailRow>
                  {item.ageDays != null && (
                    <DetailRow label="Age">{item.ageDays}d open</DetailRow>
                  )}
                  <DetailRow label="Category">{category}</DetailRow>
                </dl>
              </div>
            </aside>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
      {children}
    </p>
  );
}

/** One label/value line in the Details card. Replaces the old inline `Meta`
 *  chip, which was built for a horizontal run under the title. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </dt>
      <dd className="text-right text-[12.5px] font-semibold tabular-nums text-ink-strong">
        {children}
      </dd>
    </div>
  );
}

const PRIORITY_TONE: Record<TaskPriority, { bg: string; fg: string }> = {
  imp_urgent: { bg: "#fee2e2", fg: "#991b1b" },
  imp_not_urgent: { bg: "#fef3c7", fg: "#92400e" },
  not_imp_urgent: { bg: "#e0f2fe", fg: "#075985" },
  not_imp_not_urgent: { bg: "#f1f5f9", fg: "#475569" },
};

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
