"use server";

/**
 * Goals Canvas — LAZY RITUAL-STATE READS (Phase 6, design §2.6 + §3.3).
 *
 * The Saturday commit + Monday approve rituals surface as CONTEXTUAL STATES of
 * the canvas (RitualBanner), not separate pages. These two read actions feed
 * that banner lazily — fetched only when the banner is visible, never eager-
 * joined into the cascade spine query (§3.3 "lazy detail bundles").
 *
 * SCOPE SAFETY — never leak a peer downline: NEITHER action takes any client
 * parameter. Everything derives server-side from the signed-in user:
 *   · commit  → `loadCommitData({ id: me.id })` — self + own downline only
 *     (the EXACT loader the /goals/commit page uses, reused byte-for-byte),
 *   · approve → `loadApproveBoard(me.id, …)` — own downline only (the exact
 *     loader extracted verbatim from the /goals/approve page).
 * A manager viewing a downline member's canvas still sees THEIR OWN ritual
 * state (the ritual belongs to the viewer, not the viewed cascade).
 *
 * Both fail SAFE (never throw the canvas) and follow the house pipeline:
 * requireGoalsAccess → rateLimitOrError("read") → load → return.
 */

import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadCommitData } from "@/components/goals/commit/data";
import { loadApproveBoard } from "@/components/goals/approve/data";
import { currentWeekStart, prevWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import type { CommitData } from "@/components/goals/commit/types";
import type { ApproveMember } from "@/components/goals/approve/types";

export type CommitRitualResult =
  | { ok: true; data: CommitData }
  | { ok: false; error: string };

export interface ApproveRitualData {
  /** Monday of THIS week (the week being clocked into). */
  weekStart: string;
  lastWeekStart: string;
  weekLabel: string;
  lastWeekLabel: string;
  /** True on Monday IST — the day the approval gate is live. */
  monday: boolean;
  /** The signed-in user's OWN downline (empty = not a manager). */
  members: ApproveMember[];
}

export type ApproveRitualResult =
  | { ok: true; data: ApproveRitualData }
  | { ok: false; error: string };

/** The viewer's Saturday-commit state: self first, then their downline. */
export async function loadCommitRitual(): Promise<CommitRitualResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  try {
    const data = await loadCommitData({ id: me.id, isAdmin });
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Couldn't load the commit state — try again." };
  }
}

/** The viewer's Monday-approve state over their OWN downline (both weeks). */
export async function loadApproveRitual(): Promise<ApproveRitualResult> {
  const { me } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  try {
    const weekStart = currentWeekStart();
    const lastWeekStart = prevWeekStart(weekStart);
    const { members, monday } = await loadApproveBoard(me.id, weekStart, lastWeekStart);
    return {
      ok: true,
      data: {
        weekStart,
        lastWeekStart,
        weekLabel: formatWeekLabel(weekStart),
        lastWeekLabel: formatWeekLabel(lastWeekStart),
        monday,
        members,
      },
    };
  } catch {
    return { ok: false, error: "Couldn't load the approval state — try again." };
  }
}
