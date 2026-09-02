"use client";

/**
 * Goals Canvas — LEVEL DROP (Phase 5, brief §4): the shared drop-flow behind
 * BOTH cross-level drag targets — the sidebar bridge (drag-bridge.ts hit-test)
 * and the in-canvas <LevelDock/> (real dnd-kit droppables, the touch/
 * collapsed-sidebar/mobile fallback). One code path:
 *
 *   1. `defaultBucketFor` picks the SMART DEFAULT bucket at the target level
 *      (month goal → its owning quarter; else the current bucket clamped into
 *      the goal's FY; week/day → the current week / today),
 *   2. `performLevelDrop` runs the move through the shell's optimistic spine —
 *      year/quarter/month re-home in-table, week/day CONVERT across tables —
 *      via the ONE dispatcher `moveGoalAcross` (cascade/actions.ts),
 *   3. a ~6s ADJUST/UNDO toast follows (never a blocking popover): sibling-
 *      bucket chips re-bucket the landed row (moveGoalToPeriod /
 *      moveWeeklyToWeek), [Undo] reverses the move (moveGoalAcross back, or
 *      undoConvertGoal for the cross-table converts).
 *
 * HARD LAWS: amber tokens only (tokens.ts ramp — brand-red forbidden); zero
 * queries; keyboard equivalent exists (MoveGoalControl's "Move to…"); the
 * toast is sonner (already aria-live polite) + the board renders the hook's
 * `announcement` in its own live region.
 */

import * as React from "react";
import { toast } from "sonner";
import { useDroppable } from "@dnd-kit/core";
import { Undo2 } from "lucide-react";
import {
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  monthKey as monthKeyOf,
  monthKeysOfQuarter,
  quarterKey as quarterKeyOf,
  quarterKeyOfMonthKey,
  quarterOfKey,
  quartersOfFy,
} from "@/lib/goals/types";
import { weeksOfMonth } from "@/lib/goals/fy-calendar";
import { periodKeyLabel, periodKeyShort, type GoalDTO } from "@/components/goals/cascade/util";
import { POLICY_REASONS } from "@/lib/goals/policy";
import { fireToast } from "@/lib/toast";
import {
  moveGoalAcross,
  moveGoalToPeriod,
  moveWeeklyToWeek,
  undoConvertGoal,
  type MoveAcrossResult,
} from "@/app/(app)/goals/cascade/actions";
import { ACCENT, ACCENT_DEEP, TINT, accentMix } from "./tokens";
import { DROP_LEVEL_LABEL, useGoalDrag } from "./drag-bridge";
import type { GoalPatch } from "./optimistic";
import { useCanvasShell } from "./shell-context";
import { mondayKeyOf, weekNoOf, weekRangeLabel } from "./stage";
import { ZOOM_LEVELS, type ZoomLevel } from "./types";

/* ------------------------------------------------------------------ */
/* Smart default bucket                                                */
/* ------------------------------------------------------------------ */

/** The FY a goal's own period key belongs to. */
export function fyOfGoal(g: GoalDTO): number {
  return g.period === "year"
    ? Number(g.periodKey)
    : g.period === "quarter"
      ? fyStartYearOfKey(g.periodKey)
      : fyStartYearOfMonthKey(g.periodKey);
}

/** Local "YYYY-MM-DD". */
function dayKeyOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * The smart DEFAULT bucket a level-drop lands in (adjustable via the toast):
 * month → quarter uses the month's OWNING quarter; everything else prefers the
 * CURRENT bucket clamped into the goal's FY (quarter source → its own months
 * first); week/day → the current week's Monday / today.
 */
export function defaultBucketFor(g: GoalDTO, level: ZoomLevel, now: Date): string {
  const fy = fyOfGoal(g);
  if (level === "year") return String(fy);
  if (level === "quarter") {
    if (g.period === "month") return quarterKeyOfMonthKey(g.periodKey); // owning quarter
    const nowQ = quarterKeyOf(now);
    return fyStartYearOfKey(nowQ) === fy ? nowQ : `${fy}-Q1`;
  }
  if (level === "month") {
    const nowM = monthKeyOf(now);
    if (g.period === "quarter") {
      const own = monthKeysOfQuarter(fy, quarterOfKey(g.periodKey));
      return own.includes(nowM) ? nowM : (own[0] ?? nowM);
    }
    return fyStartYearOfMonthKey(nowM) === fy ? nowM : (monthKeysOfQuarter(fy, 1)[0] ?? nowM);
  }
  if (level === "week") return mondayKeyOf(now);
  return dayKeyOf(now);
}

/** Human name of a landed bucket — toast/announcement copy. */
export function bucketLabelOf(level: ZoomLevel, bucket: string): string {
  if (level === "week") return `W${weekNoOf(bucket)} (${weekRangeLabel(bucket)})`;
  if (level === "day") return bucket === dayKeyOf(new Date()) ? "today's plan" : `the ${bucket} plan`;
  return periodKeyLabel(bucket);
}

/* ------------------------------------------------------------------ */
/* Adjust/undo toast (sonner custom — ~6s, non-blocking)               */
/* ------------------------------------------------------------------ */

interface AdjustChip {
  key: string;
  label: string;
  onPick: () => void;
}

function AdjustToast(props: {
  title: string;
  chips: AdjustChip[];
  onUndo: (() => void) | null;
  dismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border p-3"
      style={{
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        background: "var(--color-surface-card)",
        borderColor: accentMix(TINT.strong),
        boxShadow: `0 16px 40px -14px rgba(15,23,42,0.35), 0 4px 12px -6px ${accentMix(30)}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-bold leading-snug text-ink-strong">{props.title}</span>
        {props.onUndo && (
          <button
            type="button"
            onClick={() => {
              props.onUndo?.();
              props.dismiss();
            }}
            className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-[9px] px-2.5 text-[11.5px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Undo2 size={12} strokeWidth={2.6} aria-hidden="true" />
            Undo
          </button>
        )}
      </div>
      {props.chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            or
          </span>
          {props.chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                c.onPick();
                props.dismiss();
              }}
              className="inline-flex h-6.5 items-center rounded-chip px-2 text-[11.5px] font-bold transition-colors"
              style={{
                color: ACCENT_DEEP,
                background: accentMix(TINT.fill),
                border: `1px solid ${accentMix(TINT.strong)}`,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function openAdjustToast(opts: {
  title: string;
  chips: AdjustChip[];
  onUndo: (() => void) | null;
}): void {
  toast.custom(
    (t) => (
      <AdjustToast
        title={opts.title}
        chips={opts.chips}
        onUndo={opts.onUndo}
        dismiss={() => toast.dismiss(t)}
      />
    ),
    { duration: 6000 },
  );
}

/* ------------------------------------------------------------------ */
/* useLevelDrop — the shared drop-flow                                  */
/* ------------------------------------------------------------------ */

export interface LevelDropApi {
  /** Run the level-drop flow for a goals-table card onto a target level. */
  performLevelDrop: (g: GoalDTO, level: ZoomLevel) => void;
  /** Last drop's outcome sentence — render in an aria-live region. */
  announcement: string;
}

export function useLevelDrop(): LevelDropApi {
  const shell = useCanvasShell();
  const { mutation, policy } = shell;
  const shellGoals = shell.goals;
  const [announcement, setAnnouncement] = React.useState("");

  const performLevelDrop = React.useCallback(
    (g: GoalDTO, level: ZoomLevel) => {
      const sameLevel = level === g.period;
      // Option A affordance check — the server re-asserts the same line.
      if (!(sameLevel ? policy.canReQuarter : policy.canRehomeLevel)) {
        fireToast({ message: POLICY_REASONS.rehomeLevel, type: "error" });
        return;
      }
      const now = new Date();
      const bucket = defaultBucketFor(g, level, now);
      const landedLabel = bucketLabelOf(level, bucket);

      /* --- adjust chips: sibling buckets at the LANDED level --- */
      const siblingChips = (movedId: string, weeklyId: string | null): AdjustChip[] => {
        if (level === "quarter" || level === "month") {
          const keys =
            level === "quarter"
              ? quartersOfFy(fyStartYearOfKey(bucket))
              : monthKeysOfQuarter(
                  fyStartYearOfKey(quarterKeyOfMonthKey(bucket)),
                  quarterOfKey(quarterKeyOfMonthKey(bucket)),
                );
          return keys
            .filter((k) => k !== bucket)
            .map((k) => ({
              key: k,
              label: periodKeyShort(k),
              onPick: () => {
                void mutation
                  .mutate({ type: "update", id: movedId, fields: { periodKey: k } }, () =>
                    moveGoalToPeriod({ id: movedId, periodKey: k }),
                  )
                  .then((ok) => {
                    if (ok) setAnnouncement(`Moved "${g.title}" to ${periodKeyLabel(k)}`);
                  });
              },
            }));
        }
        if (level === "week" && weeklyId) {
          const mk = bucket.slice(0, 7);
          return weeksOfMonth(fyStartYearOfMonthKey(mk), Number(mk.slice(5, 7)) - 1)
            .map((w) => w.mondayISO)
            .filter((m) => m !== bucket)
            .map((m) => ({
              key: m,
              label: `W${weekNoOf(m)}`,
              onPick: () => {
                // The landed row is a WEEKLY row now — re-bucket via the weekly
                // verb (ritual stamps live on weekly_goals; revalidation lands it).
                void moveWeeklyToWeek({ id: weeklyId, weekStart: m }).then((res) => {
                  fireToast(
                    res.ok
                      ? { message: `Moved to W${weekNoOf(m)}`, type: "success" }
                      : { message: res.error ?? "Couldn't move the week", type: "error" },
                  );
                  if (res.ok) setAnnouncement(`Moved "${g.title}" to W${weekNoOf(m)}`);
                });
              },
            }));
        }
        return []; // year (single FY) + day — no sibling buckets to offer
      };

      /* --- same place (e.g. month card dropped on "Monthly", already in the
             current month): no write — still offer the sibling chips. --- */
      if (sameLevel && bucket === g.periodKey) {
        setAnnouncement(`"${g.title}" is already in ${landedLabel}`);
        openAdjustToast({
          title: `Already in ${landedLabel}`,
          chips: siblingChips(g.id, null),
          onUndo: null,
        });
        return;
      }

      /* --- optimistic patch --- */
      let patch: GoalPatch;
      if (level === "week" || level === "day") {
        // Cross-table convert — the source card leaves this canvas instantly.
        patch = { type: "remove", id: g.id };
      } else {
        // Mirror the server's re-parent rule so the card lands right INSTANTLY
        // (same prediction as MoveGoalControl; the returned row reconciles).
        const parentPeriod = level === "quarter" ? "year" : level === "month" ? "quarter" : null;
        const parentKey =
          level === "quarter"
            ? String(fyStartYearOfKey(bucket))
            : level === "month"
              ? quarterKeyOfMonthKey(bucket)
              : null;
        const parent =
          parentPeriod && parentKey
            ? (shellGoals
                .filter(
                  (x) =>
                    x.id !== g.id &&
                    x.employeeId === g.employeeId &&
                    x.period === parentPeriod &&
                    x.periodKey === parentKey,
                )
                .sort((a, b) => a.position - b.position)[0] ?? null)
            : null;
        patch = {
          type: "update",
          id: g.id,
          fields: {
            period: level,
            periodKey: bucket,
            parentGoalId: parent?.id ?? null,
            position: 9_999,
            ...(sameLevel ? {} : { source: "manual" as const }),
          },
        };
      }

      /* --- fire, then follow with the adjust/undo toast --- */
      let result: MoveAcrossResult | null = null;
      void mutation
        .mutate(patch, async () => {
          const res = await moveGoalAcross({ id: g.id, targetLevel: level, bucketKey: bucket });
          result = res;
          return res;
        })
        .then((ok) => {
          const res = result;
          if (!ok || !res?.ok) return; // mutate already toasted the error
          setAnnouncement(`Moved "${g.title}" to ${DROP_LEVEL_LABEL[level]} · ${landedLabel}`);

          const weeklyId = res.kind === "weekly" ? res.weeklyRow.id : null;
          const detachedIds = res.rows.map((r) => r.id);
          const undo = () => {
            if (res.kind === "goal") {
              // In-table move — reverse via the same dispatcher.
              void mutation
                .mutate(
                  {
                    type: "update",
                    id: g.id,
                    fields: {
                      period: g.period,
                      periodKey: g.periodKey,
                      parentGoalId: g.parentGoalId,
                      position: g.position,
                      source: g.source,
                    },
                  },
                  () =>
                    moveGoalAcross({ id: g.id, targetLevel: g.period, bucketKey: g.periodKey }),
                )
                .then((undone) => {
                  if (undone) setAnnouncement(`Moved "${g.title}" back to ${periodKeyLabel(g.periodKey)}`);
                });
              return;
            }
            // Cross-table convert — its own inverse (un-archive + retire twin).
            void mutation
              .mutate({ type: "insert", row: g }, () =>
                undoConvertGoal({
                  goalId: g.id,
                  weeklyId: res.kind === "weekly" ? res.weeklyRow.id : null,
                  dailyItemId: res.kind === "daily" ? res.dailyItem.id : null,
                  reattachChildIds: detachedIds,
                }),
              )
              .then((undone) => {
                if (undone) setAnnouncement(`Restored "${g.title}" to ${periodKeyLabel(g.periodKey)}`);
              });
          };

          openAdjustToast({
            title: `Moved to ${DROP_LEVEL_LABEL[level]} · ${landedLabel}`,
            chips: siblingChips(g.id, weeklyId),
            onUndo: undo,
          });
        });
    },
    [mutation, policy, shellGoals],
  );

  return { performLevelDrop, announcement };
}

/* ------------------------------------------------------------------ */
/* LevelDock — in-canvas fallback rail (real dnd-kit droppables)        */
/* ------------------------------------------------------------------ */

export const LEVEL_DOCK_PREFIX = "leveldock:";

/**
 * A slim floating rail of the 5 level chips, rendered only WHILE a goal card
 * is dragging (the bridge store says so). Being real useDroppable targets
 * inside the board's DndContext, it works on touch, with a collapsed sidebar,
 * in the mobile drawer — and as the graceful fallback if sidebar hit-testing
 * ever misbehaves. Shares the exact drop-flow via goals-board's onDragEnd.
 */
export function LevelDock(): React.JSX.Element | null {
  const drag = useGoalDrag();
  if (!drag.dragging) return null;
  return (
    <div
      role="group"
      aria-label="Drop on a level to move this goal"
      className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border p-1.5"
      style={{
        background: "var(--color-surface-card)",
        borderColor: accentMix(TINT.strong),
        boxShadow: "0 18px 44px -16px rgba(15,23,42,0.4), 0 4px 12px rgba(15,23,42,0.10)",
      }}
    >
      {ZOOM_LEVELS.map((lvl) => (
        <DockChip
          key={lvl}
          level={lvl}
          valid={lvl === drag.sourceLevel ? drag.canReQuarter : drag.canRehomeLevel}
        />
      ))}
    </div>
  );
}

function DockChip(props: { level: ZoomLevel; valid: boolean }): React.JSX.Element {
  const { level, valid } = props;
  const { setNodeRef, isOver } = useDroppable({
    id: `${LEVEL_DOCK_PREFIX}${level}`,
    disabled: !valid,
  });
  return (
    <div
      ref={setNodeRef}
      title={valid ? `Drop to move to ${DROP_LEVEL_LABEL[level]}` : POLICY_REASONS.rehomeLevel}
      className="flex h-9 items-center rounded-xl px-3 text-[12px] font-bold transition-colors"
      style={
        !valid
          ? { color: "var(--color-ink-faint)", opacity: 0.45 }
          : isOver
            ? { color: "#fff", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }
            : {
                color: ACCENT_DEEP,
                background: accentMix(TINT.fill),
                border: `1.5px dashed ${accentMix(TINT.strong)}`,
              }
      }
    >
      {DROP_LEVEL_LABEL[level]}
    </div>
  );
}
