import type { RunSummary } from "./types";

/**
 * What the settings screen is told about the Drive save. Client-safe, and
 * deliberately missing the refresh token — built by `toDriveStatus` in
 * ./settings, the only place a settings row is turned into something a browser
 * receives.
 */
export interface DriveStatus {
  /** The one account the save is allowed to connect to. */
  expectedAccount: string;
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  /** GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET present (always true in dummy mode). */
  googleConfigured: boolean;
  /** Local dummy mode: "Drive" is a folder on disk, not Google. */
  dummyMode: boolean;
  dummyDriveFolder: string | null;
  scheduleEnabled: boolean;
  intervalMonths: number;
  dayOfMonth: number;
  nextRunAt: string | null;
  lastCompletedAt: string | null;
  lastRunStartedAt: string | null;
  /** A save has started and not finished (it resumes on the next run). */
  inProgress: boolean;
  lastRunSummary: RunSummary | null;
  lastError: string | null;
}
