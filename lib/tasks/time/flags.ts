/**
 * Task Time Intelligence — feature flags + tunables. Kill-switches default the
 * feature ON (opt-out via env), matching the app's other flags.
 */

/** Master switch. Set TIME_INTEL_OFF=true to hide + disable the whole feature. */
export function timeIntelEnabled(): boolean {
  return process.env.TIME_INTEL_OFF !== "true";
}

/** Camera monitoring switch (independent of the master switch). */
export function workCameraEnabled(): boolean {
  return timeIntelEnabled() && process.env.WORK_CAMERA_OFF !== "true";
}

/** Max continuous minutes a live session may run before the cron auto-closes it. */
export function idleCapMinutes(): number {
  const n = Number(process.env.TIME_IDLE_CAP_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 240; // default 4h
}

/** Minutes between camera snapshots while a session is live. */
export function snapshotIntervalMinutes(): number {
  const n = Number(process.env.TIME_SNAPSHOT_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10; // default every 10 min
}

/** The policy version shown on the consent screen (bump to re-prompt everyone). */
export const CAMERA_POLICY_VERSION = "2026-08-03.v1";
