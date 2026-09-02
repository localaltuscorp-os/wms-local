/**
 * Monthly Events Master kill-switch. The WHOLE `/events` surface ships behind
 * this flag until Sir verifies. Mirrors the house convention (MANAGER_GATES_OFF
 * / PUNCH_PLAN_GATE_OFF / DCC_GATE_OFF): read straight off process.env.
 *
 * Default ENABLED. Set `MONTHLY_EVENTS_OFF=true` in the Vercel env to disable —
 * the layout then returns notFound() so every `/events/*` route 404s.
 */
export function monthlyEventsEnabled(): boolean {
  // Flag retired (2026-07) — Monthly Events Master is permanently LIVE, no
  // longer gated by the MONTHLY_EVENTS_OFF env var.
  return true;
}
