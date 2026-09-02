const numberFmt = new Intl.NumberFormat("en-IN");

export function formatCount(n: number): string {
  return numberFmt.format(n);
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(d: Date): string {
  return dateFmt.format(d);
}

/**
 * Calendar day (YYYY-MM-DD) of `d` in the given IANA timezone. Used by
 * attendance to pin a punch to the employee's own "today" regardless of
 * the server's timezone (Vercel runs UTC).
 */
export function localDateString(timeZone: string, d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Clock time of `d` in the given IANA timezone (e.g. "10:42 am"). */
export function formatTimeInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹ amount in Indian digit grouping, no paise (e.g. "₹1,25,000"). */
export function formatInr(n: number): string {
  return inrFmt.format(n);
}

export function formatDelta(n: number): string {
  if (n > 0) return `↑ ${n}`;
  if (n < 0) return `↓ ${Math.abs(n)}`;
  return `→ 0`;
}

import type { TaskStatus, StatusColorToken } from "@/db/enums";

// M5.1 — client-side fallback maps for status labels + colors. Server
// Components should call `getStatusDisplayMap()` (lib/queries/status-display.ts)
// instead so admin renames flow through. These exist for purely-client surfaces
// and as a safety net if a DB read fails.
export const STATUS_LABELS_FALLBACK: Record<TaskStatus, string> = {
  dont_know:    "Not Read",
  not_started:  "Not Started",
  initiated:    "Initiated",
  follow_up:    "Follow Up",         // legacy — kept for already-imported rows
  need_help:    "Need Help",
  on_hold:      "On Hold",
  need_info:    "Need Info",         // Tier-3 NEW
  follow_up_1:  "Follow Up 1",       // Tier-3 NEW
  follow_up_2:  "Follow Up 2",       // Tier-3 NEW
  follow_up_3:  "Follow Up 3",       // Tier-3 NEW
  done:         "Done",
  approved:     "Approved",
  not_approved: "Not Approved",
  cancelled:    "Cancelled",
  transferred:  "Transferred",
};

// Manan's status colour scheme (2026-05): Not Started=light blue,
// Initiated=yellow, Need Info/Need Help=red, Follow Up 1/2/3=orange,
// Done=green, Not Approved=light red (rose), Approved=purple,
// Cancelled=dark grey (slate), Transferred=brown.
export const STATUS_TONES_FALLBACK: Record<TaskStatus, StatusColorToken> = {
  dont_know:    "stone",
  not_started:  "blue",
  initiated:    "yellow",
  follow_up:    "orange",            // legacy follow-up → orange family
  need_help:    "red",
  on_hold:      "slate",
  need_info:    "red",
  follow_up_1:  "orange",
  follow_up_2:  "orange",
  follow_up_3:  "orange",
  done:         "green",
  approved:     "purple",
  not_approved: "rose",
  cancelled:    "slate",
  transferred:  "brown",
};
