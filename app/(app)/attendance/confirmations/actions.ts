"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { confirmWeekAttendance, mondayConfirmUiEnabled } from "@/lib/attendance/confirmations";

export type ConfirmActionResult =
  | { ok: true; confirmedAt: string }
  | { ok: false; error: string };

const PATH = "/attendance/confirmations";

const Schema = z.object({
  ownerEmployeeId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Bad week."),
  /** When true, skip the path revalidation (bulk fills refresh once at the end). */
  silent: z.boolean().optional(),
});

/**
 * WS-5 — confirm one person's prior-week attendance. Gated behind
 * MONDAY_CONFIRM_UI; the lib re-checks the viewer's lane so the action can't be
 * forged past the UI. Records on `approval_tokens` (shared with the emailed
 * one-click token flow).
 */
export async function confirmWeek(input: unknown): Promise<ConfirmActionResult> {
  if (!mondayConfirmUiEnabled()) return { ok: false, error: "Monday confirmations are not enabled." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited as ConfirmActionResult;

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const res = await confirmWeekAttendance(me, parsed.data.ownerEmployeeId, parsed.data.weekStart);
  if (res.ok && !parsed.data.silent) revalidatePath(PATH as Route);
  return res;
}
