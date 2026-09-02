"use client";

/**
 * AssignmentChip — the first-class Self / Assigned pill, shared across every
 * Goals surface (level table, board card, Kanban parent + child cards).
 *
 * Subtle by design: "Self" is a quiet neutral pill, "Assigned" a red-tinted one
 * whose tooltip carries the full "Assigned by {who} · {when} · {source}" line.
 * Pass a `GoalDTO` (chip derives the info) or a pre-derived `AssignmentInfo`.
 */

import * as React from "react";
import {
  assignmentInfo,
  assignmentSummary,
  type AssignmentInfo,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { cn } from "@/lib/utils";

const redTint = (pct: number) => `color-mix(in srgb, var(--color-altus-red) ${pct}%, transparent)`;

export function AssignmentChip({
  goal,
  info: infoProp,
  className,
}: {
  goal?: GoalDTO;
  info?: AssignmentInfo;
  className?: string;
}) {
  const info = infoProp ?? (goal ? assignmentInfo(goal) : null);
  if (!info) return null;
  const assigned = info.type === "assigned";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-[0.06em] leading-none",
        className,
      )}
      title={assigned ? assignmentSummary(info) : "Created by the goal owner"}
      style={
        assigned
          ? { color: "var(--color-altus-red-deep)", background: redTint(11) }
          : {
              color: "var(--color-ink-subtle)",
              background: "var(--color-surface-soft)",
              boxShadow: "inset 0 0 0 1px var(--color-hairline)",
            }
      }
    >
      {assigned ? "Assigned" : "Self"}
    </span>
  );
}

/**
 * A one-line "Assignment" detail row — "Self-created" or "Assigned by {who} ·
 * {when} · {source}" (name/date bolded). Used in the card drawer + the table's
 * expandable detail row.
 */
export function AssignmentLine({ info }: { info: AssignmentInfo }) {
  if (info.type === "self") {
    return (
      <span className="text-[13px] font-semibold" style={{ color: "var(--color-ink-soft)" }}>
        Self-created
      </span>
    );
  }
  return (
    <span className="text-[13px] font-semibold" style={{ color: "var(--color-ink-soft)" }}>
      Assigned by{" "}
      <b style={{ color: "var(--color-ink-strong)" }}>{info.by ?? "a manager"}</b>
      {info.on && (
        <>
          {" · "}
          <span className="tabular-nums">{info.on}</span>
        </>
      )}
      {" · "}
      <span style={{ color: "var(--color-altus-red-deep)" }}>{info.source}</span>
    </span>
  );
}
