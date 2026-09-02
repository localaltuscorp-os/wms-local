"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AuditEvent } from "./audit-event";
import { dotColorFor, eventFilterBucket } from "./audit-event-meta";
import type { AuditFeedRow } from "@/lib/queries/audit";
import type { TaskStatus } from "@/db/enums";

interface Props {
  events: AuditFeedRow[];
  statusLabels?: Record<TaskStatus, string>;
  /** Current user — used by AuditEvent to gate the edit/delete buttons on
   *  comment rows (author within 15 minutes, or admin). */
  me?: { id: string; isAdmin: boolean };
}

type FilterKey = "all" | "comments" | "status" | "edits";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "comments", label: "Comments" },
  { key: "status", label: "Status" },
  { key: "edits", label: "Edits" },
];

/**
 * Right-rail audit-feed timeline.
 *
 * - Vertical line down the left of each row, color-coded dot per event_type.
 * - Newest first.  "Just now" badge if within 30 seconds.
 * - One-shot ring pulse on the newest row.
 * - Local client-side filter (All / Comments / Status / Edits).
 * - Scrolls within its own container past ~600px so the sticky rail behaves.
 */
export function AuditFeed({ events, statusLabels, me }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const counts = useMemo(() => countByBucket(events), [events]);

  const visible = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((ev) => eventFilterBucket(ev.eventType) === filter);
  }, [events, filter]);

  // The "freshness" of the newest event drives the "Just now" badge + ring.
  const newestFresh = useMemo(() => {
    const first = events[0];
    if (!first) return false;
    return Date.now() - first.createdAt.getTime() < 30_000;
  }, [events]);

  return (
    <section
      className="bg-surface-card rounded-section border border-hairline overflow-hidden"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      {/* Header row + filters */}
      <header className="px-5 pt-4 pb-3 border-b border-hairline">
        <div className="flex items-center justify-between gap-2">
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: "-0.015em",
            }}
          >
            Activity
          </h2>
          <span className="text-[13px] text-ink-subtle tabular-nums">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all" ? events.length : counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`audit-filter-chip ${active ? "audit-filter-chip-active" : ""}`}
                aria-pressed={active}
              >
                {f.label}
                <span
                  className="tabular-nums"
                  style={{
                    opacity: 0.8,
                    fontWeight: 700,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Body: timeline list */}
      <div
        className="px-5 py-4"
        style={{ maxHeight: 600, overflowY: "auto" }}
      >
        {visible.length === 0 ? (
          <p className="text-[15px] text-ink-subtle italic py-6 text-center">
            No events match this filter.
          </p>
        ) : (
          <ol className="relative">
            {/* Vertical timeline rail — sits 7px from the left to align with dots. */}
            <span
              aria-hidden
              className="absolute top-1 bottom-1 w-px"
              style={{
                left: 7,
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red) 20%, transparent), color-mix(in srgb, var(--color-purple) 16%, transparent) 50%, transparent)",
              }}
            />
            <AnimatePresence initial={false}>
              {visible.map((ev, idx) => {
                const isNewest = idx === 0 && ev.id === events[0]?.id;
                const fresh = isNewest && newestFresh;
                return (
                  <motion.li
                    key={ev.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={{
                      duration: 0.3,
                      ease: [0.2, 0.7, 0.3, 1],
                    }}
                    className="relative pl-7 pb-4 last:pb-1"
                  >
                    <span
                      aria-hidden
                      className="absolute top-1.5 rounded-full"
                      style={{
                        left: 3,
                        width: 10,
                        height: 10,
                        background: dotColorFor(ev.eventType),
                        boxShadow:
                          "0 0 0 3px var(--color-surface-card), 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent)",
                        animation:
                          isNewest && fresh
                            ? "timelineDotPulse 1.8s ease-in-out 0s 3"
                            : undefined,
                      }}
                    />
                    <div
                      className="rounded-md -mx-2 px-2 py-1"
                      style={
                        isNewest
                          ? {
                              animation:
                                "auditRingOnce 2.6s ease-out 1",
                            }
                          : undefined
                      }
                    >
                      <AuditEvent row={ev} fresh={fresh} statusLabels={statusLabels} me={me} />
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}

function countByBucket(events: AuditFeedRow[]): Record<string, number> {
  const out: Record<string, number> = { comments: 0, status: 0, edits: 0 };
  for (const ev of events) {
    const b = eventFilterBucket(ev.eventType);
    out[b] = (out[b] ?? 0) + 1;
  }
  return out;
}
