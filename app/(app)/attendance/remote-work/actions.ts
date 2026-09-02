"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { RECURRENCE_MODES, REMOTE_REASON_BUCKETS, REMOTE_WORK_MODES } from "@/db/enums";
import { canApproveRemoteWork } from "@/lib/auth/attendance-permissions";
import {
  amendRemoteWork,
  decideRemoteWork,
  listMyRemoteWork,
  listPendingRemoteWork,
  removeRemoteWork,
  requestRemoteWork,
  type RemoteWorkRow,
} from "@/lib/attendance/remote-work";
import { listClientLocations, type ClientLocationRow } from "@/lib/attendance/client-locations";

/**
 * Remote-work request, review, amend and remove — as server actions.
 *
 * THIN BY DESIGN. Every rule — who may decide, who may amend, whether a client
 * site is required, how a repeat expands, whether a decided request may be
 * re-opened — lives in `lib/attendance/remote-work.ts`, so the mobile API and
 * any future caller reach the same behaviour without this file being in the
 * path. What is added here is the session, the rate limit and the cache
 * invalidation.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const ClockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times are HH:MM, 24-hour.");

const RequestSchema = z.object({
  workDate: DateSchema,
  workMode: z.enum(REMOTE_WORK_MODES),
  clientLocationId: z.string().uuid().nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  reasonBucket: z.enum(REMOTE_REASON_BUCKETS).nullable().optional(),
  allDay: z.boolean().optional(),
  startTime: ClockSchema.nullable().optional(),
  endTime: ClockSchema.nullable().optional(),
  recurrence: z.enum(RECURRENCE_MODES).optional(),
  repeatUntil: DateSchema.nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  // Calendar-style repeat extensions (all optional — absent means the original
  // 0209 behavior). Validated again in lib/attendance/recurrence; these bounds
  // just refuse garbage before it gets that far.
  interval: z.number().int().min(1).max(99).optional(),
  unit: z.enum(["day", "week", "month"]).optional(),
  monthly: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("day"), day: z.number().int().min(1).max(31) }),
      z.object({
        kind: z.literal("weekday"),
        ordinal: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(-1),
        ]),
        weekday: z.number().int().min(0).max(6),
      }),
    ])
    .nullable()
    .optional(),
  end: z.enum(["until", "count", "never"]).optional(),
  count: z.number().int().min(1).max(60).optional(),
});

/**
 * Raise (or replace a pending) request. A repeat becomes one row per date — see
 * lib/attendance/recurrence for why the pattern is expanded and never stored.
 */
export async function submitRemoteWorkRequest(
  input: z.input<typeof RequestSchema>,
): Promise<Result<{ ids: string[]; skipped: { date: string; reason: string }[] }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const res = await requestRemoteWork({
    // The SUBJECT is always the signed-in person. A request is asked for on your
    // own behalf; there is no "raise this for someone else" path, so there is no
    // employee id to trust from the client.
    employeeId: me.id,
    ...parsed.data,
  });
  if (!res.ok) return res;

  revalidatePath("/attendance/remote-work");
  revalidatePath("/attendance");
  return { ok: true, ids: res.ids, skipped: res.skipped };
}

const DecisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(1000).nullable().optional(),
});

/** Approve or reject. Rutvisha and Manan only — enforced in the lib. */
export async function decideRemoteWorkRequest(
  input: z.input<typeof DecisionSchema>,
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const res = await decideRemoteWork({
    requestId: parsed.data.requestId,
    decidedBy: { id: me.id, email: me.email },
    decision: parsed.data.decision,
    note: parsed.data.note ?? null,
  });
  if (!res.ok) return res;

  revalidatePath("/attendance/remote-work");
  revalidatePath("/attendance");
  return { ok: true };
}

const AmendSchema = z.object({
  requestId: z.string().uuid(),
  workMode: z.enum(REMOTE_WORK_MODES),
  clientLocationId: z.string().uuid().nullable().optional(),
  allDay: z.boolean(),
  startTime: ClockSchema.nullable().optional(),
  endTime: ClockSchema.nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  reasonBucket: z.enum(REMOTE_REASON_BUCKETS).nullable().optional(),
});

/** Correct a request in place. The date is deliberately not editable. */
export async function amendRemoteWorkRequest(input: z.input<typeof AmendSchema>): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AmendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
  }

  const res = await amendRemoteWork({ ...parsed.data, actor: { id: me.id, email: me.email } });
  if (!res.ok) return res;

  revalidatePath("/attendance/remote-work");
  revalidatePath("/attendance");
  return { ok: true };
}

const RemoveSchema = z.object({
  requestId: z.string().uuid(),
  wholeSeries: z.boolean().optional(),
});

/** Withdraw a day, or the whole repeat it belongs to. */
export async function removeRemoteWorkRequest(
  input: z.input<typeof RemoveSchema>,
): Promise<Result<{ removed: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const res = await removeRemoteWork({
    requestId: parsed.data.requestId,
    wholeSeries: parsed.data.wholeSeries,
    actor: { id: me.id, email: me.email },
  });
  if (!res.ok) return res;

  revalidatePath("/attendance/remote-work");
  revalidatePath("/attendance");
  return { ok: true, removed: res.removed };
}

export interface RemoteWorkPageData {
  mine: RemoteWorkRow[];
  /** Empty for everyone who cannot decide — the queue is not merely hidden. */
  pending: RemoteWorkRow[];
  canApprove: boolean;
  clientLocations: ClientLocationRow[];
}

/**
 * Everything the page renders.
 *
 * `pending` is fetched ONLY for an approver. Returning the queue and letting the
 * component hide it would ship every pending request to every browser, which is
 * a data leak dressed as a UI decision.
 */
export async function loadRemoteWorkPage(): Promise<RemoteWorkPageData> {
  const me = await requireUser();
  const canApprove = canApproveRemoteWork(me.email);
  const [mine, pending, locations] = await Promise.all([
    listMyRemoteWork(me.id),
    canApprove ? listPendingRemoteWork() : Promise.resolve([]),
    listClientLocations(),
  ]);
  return { mine, pending, canApprove, clientLocations: locations };
}
