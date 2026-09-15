/**
 * The DCC dashboard drawer's payload — one person's due KPIs, day by day.
 *
 * Its own client-safe module because the server action that builds it lives in
 * a "use server" file, which may only export async functions.
 */
import type { SlotOutcome } from "./dashboard";

export interface DccDetailRow {
  itemId: string;
  code: string | null;
  section: string | null;
  title: string;
  outcome: SlotOutcome;
  value: string | null;
  note: string | null;
}

export interface DccDetailDay {
  date: string;
  rows: DccDetailRow[];
}

export type DccDetailResult =
  | { ok: true; days: DccDetailDay[] }
  | { ok: false; error: string };

/** The drawer reads at most this many days, so a year view drills into its last stretch. */
export const DETAIL_MAX_DAYS = 62;
