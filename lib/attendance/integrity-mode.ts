/**
 * Attendance device-integrity mode (anti-proxy Phase 2). Controls how strongly
 * the punch enforces mock-location + Play-Integrity/App-Attest signals — a safe,
 * three-stage rollout knob read straight off the environment (no I/O):
 *
 *   off      — ignore integrity/mock signals entirely (default; pre-rollout).
 *   report   — record the verdict + anomaly flags on every punch, but NEVER
 *              block. Run here for a week to see real-device verdicts + tune.
 *   enforce  — refuse a punch that is mocked / fails device+app integrity.
 *
 * Set `ATTENDANCE_INTEGRITY_MODE=report` once the app release that sends the
 * signals is live; flip to `enforce` after the report window looks clean. Kept
 * separate from Play-Integrity *configuration* (whether Google creds exist) —
 * an unconfigured integrity check is treated as "unverified", which enforce
 * mode does NOT block on (it only blocks a POSITIVE failure), so a provisioning
 * gap can never lock the workforce out.
 */
export type IntegrityMode = "off" | "report" | "enforce";

export function attendanceIntegrityMode(): IntegrityMode {
  const v = (process.env.ATTENDANCE_INTEGRITY_MODE ?? "").trim().toLowerCase();
  if (v === "report" || v === "enforce") return v;
  return "off";
}
