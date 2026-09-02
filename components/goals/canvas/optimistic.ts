"use client";

/**
 * Goals Canvas — OPTIMISTIC MUTATION SPINE (design §3.4, Phase 1).
 *
 * Pure client helpers for the React 19 `useOptimistic` reconciliation the shell
 * (goals-canvas.tsx) owns. The flow, per mutation:
 *
 *   1. `applyGoalPatch` mutates the LOCAL tree instantly (no spinner),
 *   2. the server action fires; every single-row action now RETURNS the
 *      mutated/created row (`ActionResult<{ row: GoalDTO }>`),
 *   3. on success the returned row is written into the shell's confirmed
 *      overlay — the optimistic value reconciles to exact server truth
 *      (server-normalised money strings, positions, stamps),
 *   4. on error the optimistic layer reverts automatically when the transition
 *      settles (base state was never touched) + a toast fires.
 *
 * NO `router.refresh()` anywhere in the canvas — the actions' own
 * `revalidatePath` refreshes the base RSC payload in the same round-trip.
 *
 * ⚠ Write routing: these patches are for CASCADE (`goals`-table) rows only —
 * weekly rows route through their own actions/tables so the ritual stamps land
 * right (lib/goals/node-adapter.ts, design §4.3).
 */

import * as React from "react";
import { fireToast } from "@/lib/toast";
import type { GoalDTO, WeeklyDTO } from "./types";

/* ------------------------------------------------------------------ */
/* Patch model                                                         */
/* ------------------------------------------------------------------ */

export type GoalPatch =
  /** Merge `fields` into the row with `id`. */
  | { type: "update"; id: string; fields: Partial<GoalDTO> }
  /** Merge per-row `fields` into MANY rows at once (Phase 2 rebalance —
   *  mirrors the atomic `redistributeChildren` transaction). */
  | { type: "updateMany"; updates: Array<{ id: string; fields: Partial<GoalDTO> }> }
  /** Append a freshly-created row (usually a temp `optimistic-*` id). */
  | { type: "insert"; row: GoalDTO }
  /** Remove a row (archive / destructive move). */
  | { type: "remove"; id: string }
  /** Re-number `position` = index+1 for the listed ids (drag-reorder). */
  | { type: "reorder"; ids: string[] };

/** Pure reducer over the loaded goal set — the `useOptimistic` update fn. */
export function applyGoalPatch(state: GoalDTO[], patch: GoalPatch): GoalDTO[] {
  switch (patch.type) {
    case "update":
      return state.map((g) => (g.id === patch.id ? { ...g, ...patch.fields, id: g.id } : g));
    case "updateMany": {
      const fieldsById = new Map(patch.updates.map((u) => [u.id, u.fields]));
      return state.map((g) => {
        const fields = fieldsById.get(g.id);
        return fields ? { ...g, ...fields, id: g.id } : g;
      });
    }
    case "insert":
      return [...state, patch.row];
    case "remove":
      return state.filter((g) => g.id !== patch.id);
    case "reorder": {
      const pos = new Map(patch.ids.map((id, i) => [id, i + 1]));
      return state.map((g) => {
        const p = pos.get(g.id);
        return p != null && p !== g.position ? { ...g, position: p } : g;
      });
    }
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Temp rows (quick-add)                                               */
/* ------------------------------------------------------------------ */

const TEMP_PREFIX = "optimistic-";

export function isOptimisticId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

/**
 * A placeholder GoalDTO for an in-flight `createGoal` — server defaults
 * mirrored from the insert in app/(app)/goals/cascade/actions.ts. The temp row
 * is replaced by the returned server row when the transition settles.
 */
export function buildOptimisticGoal(input: {
  employeeId: string;
  period: GoalDTO["period"];
  periodKey: string;
  title: string;
  area?: string | null;
}): GoalDTO {
  return {
    id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
    employeeId: input.employeeId,
    // A quick-add row is always self-created → no creator/date recorded (self).
    createdAt: null,
    createdByName: null,
    period: input.period,
    periodKey: input.periodKey,
    parentGoalId: null,
    position: 9_999, // sorts last in its bucket until the server assigns Sr. No.
    area: input.area ?? null,
    title: input.title,
    uom: null,
    targetQty: null,
    actualQty: null,
    targetAmount: null,
    actualAmount: null,
    notes: null,
    teamInvolved: null,
    teamDependencyPct: null,
    shareWithTeam: false,
    pctDone: 0,
    acceptPct: null,
    reviewNotes: null,
    evidenceUrl: null,
    weight: 100,
    adopted: true,
    source: "manual",
    category: "goal",
    clonedFromId: null,
    incentiveEnabled: false,
    incentiveAmount: null,
    incentiveKind: null,
    monthlyMasterRef: null,
    targetDate: null,
  };
}

/* ------------------------------------------------------------------ */
/* Mutation API (implemented by the shell, consumed via context/props)  */
/* ------------------------------------------------------------------ */

/** Every extended single-row action satisfies this structurally
 *  (`{ ok: true, row } | { ok: false, error }`, extra keys welcome). */
export interface GoalActionResult {
  ok: boolean;
  error?: string;
  row?: GoalDTO | null;
  /** Multi-row actions (redistributeChildren) return EVERY mutated row so the
   *  shell can reconcile the whole batch with server truth in one pass. */
  rows?: GoalDTO[] | null;
}

export interface GoalMutationApi {
  /**
   * Optimistically apply `patch`, run `action`, reconcile with the returned
   * row — or roll back + toast on error. Resolves `true` when the server
   * accepted the write (so callers can clear per-field busy state).
   */
  mutate: (
    patch: GoalPatch,
    action: () => Promise<GoalActionResult>,
    opts?: {
      /** Restore any LOCAL field state on failure (the tree reverts itself). */
      onError?: () => void;
    },
  ) => Promise<boolean>;
  /** True while any canvas mutation transition is in flight. */
  pending: boolean;
}

/* ------------------------------------------------------------------ */
/* useOptimisticGoals — THE shell spine (goals-canvas.tsx)              */
/* ------------------------------------------------------------------ */

/**
 * The Phase-1 optimistic mutation spine as a reusable hook. Three layers,
 * bottom-up:
 *   propsGoals    — the RSC base payload (refreshed by the actions' own
 *                   revalidatePath in the same action round-trip),
 *   confirmedRows — rows the server RETURNED from settled actions, keyed by
 *                   id; overlays props until a fresh payload arrives (then
 *                   cleared — new server data always wins),
 *   goals         — useOptimistic over the merged base: in-flight patches
 *                   show instantly and auto-revert on failure.
 */
export function useOptimisticGoals(propsGoals: GoalDTO[]): {
  goals: GoalDTO[];
  mutation: GoalMutationApi;
} {
  const [confirmedRows, setConfirmedRows] = React.useState<Map<string, GoalDTO>>(
    () => new Map(),
  );
  React.useEffect(() => {
    // Fresh RSC payload landed — drop the overlay, server truth is in base.
    setConfirmedRows((m) => (m.size === 0 ? m : new Map()));
  }, [propsGoals]);

  const baseGoals = React.useMemo<GoalDTO[]>(() => {
    if (confirmedRows.size === 0) return propsGoals;
    const seen = new Set<string>();
    const merged = propsGoals.map((g) => {
      seen.add(g.id);
      return confirmedRows.get(g.id) ?? g;
    });
    for (const [id, row] of confirmedRows) if (!seen.has(id)) merged.push(row);
    return merged;
  }, [propsGoals, confirmedRows]);

  const [goals, addOptimisticPatch] = React.useOptimistic(baseGoals, applyGoalPatch);
  const [pending, startTransition] = React.useTransition();

  const mutate = React.useCallback<GoalMutationApi["mutate"]>(
    (patch: GoalPatch, action: () => Promise<GoalActionResult>, opts) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          addOptimisticPatch(patch);
          try {
            const res = await action();
            if (!res.ok) {
              opts?.onError?.();
              fireToast({ message: res.error ?? "Something went wrong.", type: "error" });
              resolve(false);
              return; // optimistic layer reverts when the transition settles
            }
            if (res.row || res.rows?.length) {
              const returned = [...(res.row ? [res.row] : []), ...(res.rows ?? [])];
              // Reconcile: the server rows become base truth immediately —
              // no gap between optimistic reset and the revalidated payload.
              setConfirmedRows((m) => {
                const next = new Map(m);
                for (const row of returned) next.set(row.id, row);
                return next;
              });
            }
            resolve(true);
          } catch {
            opts?.onError?.();
            // §2.7 offline copy — a thrown action fetch while offline says so
            // plainly; the optimistic layer has already reverted to truth.
            fireToast({
              message:
                typeof navigator !== "undefined" && !navigator.onLine
                  ? "You may be offline — nothing was saved."
                  : "Something went wrong.",
              type: "error",
            });
            resolve(false);
          }
        });
      }),
    [addOptimisticPatch],
  );

  const mutation = React.useMemo<GoalMutationApi>(
    () => ({ mutate, pending }),
    [mutate, pending],
  );

  return { goals, mutation };
}

/* ------------------------------------------------------------------ */
/* Weekly rows — the SECOND write path (weekly_goals table, §4.3)       */
/* ------------------------------------------------------------------ */

/**
 * Minimal structural slice of a returned `weekly_goals` server row — every
 * weekly action's `.returning()` payload satisfies this (extra columns fine).
 * Kept structural so the client never imports the drizzle schema.
 */
export interface WeeklyServerRow {
  id: string;
  weekStart: string;
  subject: string | null;
  targetDone: string | null;
  area: string | null;
  uom: string | null;
  pctDone: number;
  acceptPct: number | null;
  position: number;
  carriedFromId: string | null;
  monthGoalId: string | null;
  targetQty: string | null;
  actualQty: string | null;
  targetAmount: string | null;
  actualAmount: string | null;
  weight: number;
  adopted: boolean;
  /** Ritual stamps (Phase 6) — present on every full `.returning()` weekly row;
   *  optional so narrower historical shapes stay assignable. */
  committedAt?: Date | string | null;
  approvedByManagerAt?: Date | string | null;
}

export type WeeklyPatch =
  | { type: "update"; id: string; fields: Partial<WeeklyDTO> }
  | { type: "insert"; row: WeeklyDTO };

export interface WeeklyActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  row?: WeeklyServerRow | null;
}

/**
 * Optimistic mutations for WEEKLY rows. Same contract as GoalMutationApi but
 * routed to the weekly overlay the goals-canvas shell owns — weekly writes
 * MUST go through weekly actions (ritual stamps live on weekly_goals; never
 * route them through a `goals` action — lib/goals/node-adapter.ts).
 */
export interface WeeklyMutationApi {
  mutate: (
    patch: WeeklyPatch,
    action: () => Promise<WeeklyActionResult>,
    opts?: { onError?: () => void },
  ) => Promise<boolean>;
  pending: boolean;
}
