import type { Employee } from "@/db/schema";
import { pendingDeviceRegistration } from "@/lib/security/device-registration";
import { deviceNameHelp } from "@/lib/security/device-registration-rules";
import { DeviceRegistrationModal } from "@/components/security/device-registration-modal";

/**
 * Renders the first-login registration modal, or nothing (0222).
 *
 * A server component so the decision is made where the device context already
 * lives — the client is told only what it must draw, and never gets to decide
 * whether it must draw it.
 *
 * Mounted in the (app) layout rather than in a page: a page-level mount would
 * leave every other route unregistered, and the hub is not necessarily the
 * first thing an employee opens after signing in.
 *
 * Returns null for an exempt actor, an already-registered device, a disabled
 * enforcement switch and the native app — all decided in
 * `pendingDeviceRegistration`, which documents why for each.
 *
 * ── FAIL-SOFT: A PROMPT MUST NEVER TAKE THE APPLICATION DOWN ───────────────
 * This is mounted in the (app) LAYOUT, so it renders on the way to every single
 * page. Unguarded, one failed query here is a total blackout: the layout throws,
 * the error boundary replaces the whole app, and every route — hub, tasks,
 * salary, attendance — shows "We hit a snag" for everybody at once. That is not
 * hypothetical. Two failure modes were observed against the real database while
 * this was being built:
 *
 *   · `canceling statement due to statement timeout` on the pooler
 *   · `getaddrinfo ENOTFOUND …pooler.supabase.com` — a DNS blip
 *
 * and a schema/database skew does it permanently: `mobile_devices` gains its
 * columns in migrations 0215 and 0222, and until those are applied EVERY read of
 * that table throws `column "revoked_by_id" does not exist`.
 *
 * A registration prompt is worth none of that. Swallowing here degrades to
 * exactly the state the function already returns for an exempt actor or an
 * already-registered device — no modal — which is the mildest possible outcome
 * and the one every other gate in this codebase already chooses (see the
 * `catch` in `currentUserAgent` and `readDeviceCookieValue` in the same module,
 * `touchLastSeen`, and the sign-in route's "FAIL-OPEN ON AN INFRASTRUCTURE
 * ERROR, not on a verdict").
 *
 * ── WHAT THIS DOES NOT WEAKEN ─────────────────────────────────────────────
 * Nothing. The modal COLLECTS a device name and a consent; it is not an
 * authorization boundary and never was. Access is decided by
 * `resolveDeviceContext` inside `requireUser()`, which is a separate call on a
 * separate path and is deliberately left strict — an access verdict that failed
 * open on an exception would be a real hole, and that decision is not this
 * component's to make.
 *
 * ── AND NOT IN `pendingDeviceRegistration` ITSELF ─────────────────────────
 * Deliberately caught HERE rather than inside the shared function, because
 * `completeDeviceRegistration` also calls it and reads a null as "nothing to do,
 * report success". Swallowing there would turn a failed database read into a
 * registration that silently recorded nothing. The render path can shrug; the
 * write path must not.
 */
export async function DeviceRegistrationGate({ employee }: { employee: Employee }) {
  let pending;
  try {
    pending = await pendingDeviceRegistration(employee);
  } catch (err) {
    // Logged, not swallowed silently: a prompt that stops appearing for
    // everybody is the kind of thing that should be visible in the server log
    // rather than inferred from nobody ever registering a device.
    console.error("[device-registration] could not resolve pending registration", err);
    return null;
  }
  if (!pending) return null;

  return (
    <DeviceRegistrationModal
      kind={pending.kind}
      platform={pending.platform}
      needsDeviceName={pending.needsDeviceName}
      deviceNameHelp={deviceNameHelp(pending.platform)}
    />
  );
}
