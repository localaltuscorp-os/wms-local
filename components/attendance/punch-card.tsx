"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  LogIn,
  LogOut,
  Loader2,
  MapPin,
  MapPinOff,
  ShieldCheck,
} from "lucide-react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { fireToast } from "@/lib/toast";
import { distanceMeters, evaluateGeofence } from "@/lib/geo";
import { isAuthenticatorAlreadyRegistered } from "@/lib/webauthn/errors";
import {
  punchAttendance,
  startBiometricSetup,
  startBiometricPunch,
} from "@/app/(app)/attendance/actions";

/** Marks (in this browser) that this device has a working passkey, so the punch
 *  flow goes straight to authenticate instead of attempting a re-enroll. Set
 *  after ANY successful biometric punch (enroll OR authenticate) so a device
 *  enrolled on an older build self-heals on its first punch. */
const ENROLL_KEY = "att_cred_enrolled";

type BioProof = {
  assertion?: Awaited<ReturnType<typeof startAuthentication>>;
  registration?: Awaited<ReturnType<typeof startRegistration>>;
  deviceLabel?: string;
};

interface Office {
  lat: number;
  lng: number;
  radiusM: number;
}

interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
}

/**
 * Biometric punch kiosk — live clock, geofence status, fingerprint-gated
 * check-in/out. The server re-verifies everything (distance + WebAuthn
 * assertion); what's here is the honest preview of what the server will say.
 */
export function PunchCard({
  todayLabel,
  inLabel,
  outLabel,
  tz,
  office,
  biometricExempt,
}: {
  todayLabel: string;
  inLabel: string | null;
  outLabel: string | null;
  tz: string;
  office: Office | null;
  /** Admin-set: this employee's device has no biometric sensor, so they're
   *  allowed to punch with location only. Everyone else MUST set up biometric. */
  biometricExempt: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [bioSupported, setBioSupported] = React.useState<boolean | null>(null);
  const [fix, setFix] = React.useState<Fix | null>(null);
  const [fixError, setFixError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);
  // Hard-denied (the OS/browser won't re-prompt) → show the re-enable hint.
  const [denied, setDenied] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    if (!browserSupportsWebAuthn()) {
      setBioSupported(false);
    } else {
      platformAuthenticatorIsAvailable().then((ok) => alive && setBioSupported(ok));
    }
    return () => {
      alive = false;
    };
  }, []);

  // Request a GPS fix and reflect it in the live geofence status. Surfaced as a
  // one-tap "Enable location" button so a missed or denied permission is a
  // zero-effort fix rather than a silent punch failure later.
  const requestLocation = React.useCallback((fromUser = false) => {
    setLocating(true);
    getPosition()
      .then((f) => {
        setFix(f);
        setFixError(null);
        setDenied(false);
      })
      .catch((e: Error & { denied?: boolean }) => {
        setFixError(e.message);
        setDenied(Boolean(e.denied));
        // Only nag with a toast when the user tapped the button — not on the
        // silent warm-up fetch when the screen first opens.
        if (fromUser) fireToast({ message: e.message, type: "error" });
      })
      .finally(() => setLocating(false));
  }, []);

  // Warm the fix on open (punch always refetches a fresh one anyway).
  React.useEffect(() => {
    if (!office) return;
    requestLocation();
  }, [office, requestLocation]);

  const liveDistance =
    office && fix
      ? distanceMeters(fix.lat, fix.lng, office.lat, office.lng)
      : null;
  // Mirror the server's accuracy-aware rule so the status chip can't say
  // "outside" while a punch would actually succeed (the false-outside users hit).
  const liveVerdict =
    office && fix && liveDistance != null
      ? evaluateGeofence(liveDistance, fix.accuracyM, office.radiusM)
      : null;

  function punch(kind: "in" | "out") {
    startTransition(async () => {
      try {
        // 1. Best GPS fix; check the fence with the same rule the server uses.
        let location: Fix | undefined;
        if (office) {
          location = await getPosition();
          setFix(location);
          setFixError(null);
          const verdict = evaluateGeofence(
            distanceMeters(location.lat, location.lng, office.lat, office.lng),
            location.accuracyM,
            office.radiusM,
          );
          if (!verdict.ok) {
            fireToast({
              message:
                verdict.reason === "too_imprecise"
                  ? `GPS too imprecise (±${Math.round(location.accuracyM)}m). Turn on Precise Location (iPhone) / High-accuracy mode (Android), then try again.`
                  : `You're ~${Math.round(verdict.effectiveDistanceM)}m from the office — punches register only within ${office.radiusM}m.`,
              type: "error",
            });
            return;
          }
        } else {
          location = await getPosition().catch(() => undefined);
        }

        // 2. Biometric: per-device, authenticate an enrolled device or enroll a
        //    new one — with a bidirectional fallback so a punch never dead-ends
        //    on the wrong branch (see acquireBioProof).
        let proof: BioProof = {};
        if (bioSupported) {
          const enrolledHere = localStorage.getItem(ENROLL_KEY) === "1";
          proof = await acquireBioProof(enrolledHere);
        } else if (!biometricExempt) {
          fireToast({
            message:
              "This device has no fingerprint or Face ID. Ask an admin to mark you exempt to punch with location only.",
            type: "error",
          });
          return;
        }

        // 3. Server verifies geofence + biometric and writes the row. Retry
        //    once on a transient network failure ("Failed to fetch").
        const res = await withNetworkRetry(() =>
          punchAttendance({
            kind,
            note: note.trim() || undefined,
            location,
            assertion: proof.assertion,
            registration: proof.registration,
            deviceLabel: proof.deviceLabel,
          }),
        );
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        // Any successful biometric punch proves this device has a working
        // passkey — remember it so the next punch authenticates directly.
        if (proof.assertion || proof.registration) {
          localStorage.setItem(ENROLL_KEY, "1");
        }
        fireToast({
          message:
            kind === "in" ? "Checked in — have a great day!" : "Checked out. See you tomorrow!",
        });
        setNote("");
        router.refresh();
      } catch (err) {
        fireToast({ message: mapPunchError(err), type: "error" });
      }
    });
  }

  return (
    <section
      className="rounded-section bg-surface-card overflow-hidden"
      style={{
        border: "1px solid var(--color-hairline)",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
    >
      {/* Clock face */}
      <div
        className="px-6 pt-6 pb-5 max-md:px-4 text-center"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red) 4%, var(--color-surface-card)) 0%, var(--color-surface-card) 100%)",
        }}
      >
        <p
          className="uppercase text-ink-subtle"
          style={{
            fontFamily: "var(--font-mono-display)",
            fontSize: 12.5,
            letterSpacing: "0.12em",
          }}
        >
          {todayLabel}
        </p>
        <LiveClock tz={tz} />

        {/* Status chips */}
        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
          {office &&
            (locating ? (
              <Chip tone="slate" icon={<MapPin size={13} strokeWidth={2.4} />}>
                Locating…
              </Chip>
            ) : fix && !fixError && liveVerdict ? (
              liveVerdict.ok ? (
                <Chip tone="green" icon={<MapPin size={13} strokeWidth={2.4} />}>
                  At the office · in range
                </Chip>
              ) : liveVerdict.reason === "too_imprecise" ? (
                <Chip tone="amber" icon={<MapPin size={13} strokeWidth={2.4} />}>
                  Improving GPS… (±{Math.round(fix.accuracyM)}m)
                </Chip>
              ) : (
                <Chip tone="red" icon={<MapPinOff size={13} strokeWidth={2.4} />}>
                  ~{Math.round(liveVerdict.effectiveDistanceM)}m away · outside {office.radiusM}m
                </Chip>
              )
            ) : (
              // No fix yet or permission denied → one tap to fix it. This is the
              // prominent CTA on open, ahead of biometric setup, because
              // location is what actually gates the punch.
              <button
                type="button"
                onClick={() => requestLocation(true)}
                className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold text-white transition-colors"
                style={{ background: "var(--color-altus-red)" }}
              >
                <MapPin size={13} strokeWidth={2.4} />
                Enable location
              </button>
            ))}
          {bioSupported === false ? (
            <Chip tone="slate" icon={<Fingerprint size={13} strokeWidth={2.4} />}>
              {biometricExempt
                ? "Location-only (exempt)"
                : "No fingerprint / Face ID on this device"}
            </Chip>
          ) : (
            <Chip tone="green" icon={<ShieldCheck size={13} strokeWidth={2.4} />}>
              Fingerprint / Face ID
            </Chip>
          )}
        </div>

        {/* Hard-denied: the browser won't re-prompt, so "Enable location" can't
            help on its own. Point people to their site settings to re-allow it. */}
        {denied && (
          <p
            className="mt-2.5 mx-auto max-w-[20rem] text-[12.5px] leading-snug text-ink-subtle"
            role="note"
          >
            Location is blocked for this site. Allow{" "}
            <span className="font-semibold text-ink-soft">Location</span> for this
            site in your browser settings, then tap Enable location again.
          </p>
        )}
      </div>

      <div className="px-6 pb-6 max-md:px-4">
        {/* Today's punches */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat label="Checked in" value={inLabel} />
          <Stat label="Checked out" value={outLabel} />
        </div>

        <label
          htmlFor="punch-note"
          className="block text-[13.5px] font-semibold text-ink-soft mb-1.5"
        >
          Note / reason <span className="font-normal text-ink-subtle">(optional)</span>
        </label>
        <input
          id="punch-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. client visit in the morning"
          className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white mb-4"
        />

        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <PunchButton
            kind="in"
            done={inLabel !== null}
            pending={pending}
            biometric={bioSupported !== false}
            onClick={() => punch("in")}
          />
          <PunchButton
            kind="out"
            done={outLabel !== null}
            pending={pending}
            biometric={bioSupported !== false}
            onClick={() => punch("out")}
          />
        </div>
      </div>
    </section>
  );
}

function LiveClock({ tz }: { tz: string }) {
  // Render a stable placeholder on the server; tick only after mount so
  // there's no hydration mismatch.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const text = now
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";
  return (
    <p
      className="text-ink-strong tabular-nums mt-1"
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 52,
        fontWeight: 650,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
      }}
      aria-label="Current time"
    >
      {text}
    </p>
  );
}

function PunchButton({
  kind,
  done,
  pending,
  biometric,
  blocked = false,
  onClick,
}: {
  kind: "in" | "out";
  done: boolean;
  pending: boolean;
  biometric: boolean;
  /** Biometric setup required but not done — disable until they register. */
  blocked?: boolean;
  onClick: () => void;
}) {
  const Icon = pending ? Loader2 : biometric ? Fingerprint : kind === "in" ? LogIn : LogOut;
  return (
    <button
      type="button"
      disabled={pending || done || blocked}
      onClick={onClick}
      className="inline-flex h-14 items-center justify-center gap-2.5 rounded-xl text-[16px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-40"
      style={{
        background:
          kind === "in"
            ? "linear-gradient(135deg, #16A34A, #15803D)"
            : "linear-gradient(135deg, #E10600, #A80400)",
      }}
    >
      <Icon size={20} strokeWidth={2.3} className={pending ? "animate-spin" : undefined} />
      {done
        ? kind === "in"
          ? "Checked in"
          : "Checked out"
        : kind === "in"
          ? "Check in"
          : "Check out"}
    </button>
  );
}

function Chip({
  tone,
  icon,
  children,
}: {
  tone: "green" | "red" | "amber" | "slate";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-3 h-8 text-[13px] font-bold"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-center"
      style={{ background: "var(--color-surface-soft)" }}
    >
      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
      <div
        className="mt-1 tabular-nums font-bold"
        style={{
          fontSize: 22,
          color: value ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

/**
 * Acquire the best GPS fix we can in a short window. Phones first return a
 * coarse network fix (±500–1000m) and refine over a few seconds, so we watch
 * for up to MAX_WAIT_MS, keep the most accurate fix seen, and resolve early
 * once it's good enough. `maximumAge: 0` forbids a stale cached fix.
 */
function getPosition(): Promise<Fix> {
  const GOOD_ENOUGH_M = 35;
  const MAX_WAIT_MS = 11_000;
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location not supported on this device."));
      return;
    }
    let best: Fix | null = null;
    let watchId: number | null = null;
    const finish = (err?: Error & { denied?: boolean }) => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err ?? new Error("Couldn't get your location — try again."));
    };
    const timer = setTimeout(() => finish(), MAX_WAIT_MS);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const f: Fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        };
        if (!best || f.accuracyM < best.accuracyM) best = f;
        if (best.accuracyM <= GOOD_ENOUGH_M) finish();
      },
      (err) => {
        // Only fatal while we still have no fix; a late error after a good fix
        // is ignored (we already have something to use).
        if (!best) {
          const denied = err.code === err.PERMISSION_DENIED;
          const e = new Error(
            denied
              ? "Location access denied — allow it to punch."
              : "Couldn't get your location — try again.",
          ) as Error & { denied?: boolean };
          e.denied = denied;
          finish(e);
        }
      },
      { enableHighAccuracy: true, timeout: MAX_WAIT_MS, maximumAge: 0 },
    );
  });
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Mac/.test(ua)) return "Mac";
  return "This device";
}

/** Authenticate this device's existing passkey. Returns `null` (so the caller
 *  can enroll) when the server holds no credential for this user — e.g. an
 *  admin reset their devices. */
async function authenticatePunch(): Promise<BioProof | null> {
  const opts = await startBiometricPunch();
  if (!opts.ok) throw new Error(opts.error);
  if (!opts.options) return null;
  return { assertion: await startAuthentication({ optionsJSON: opts.options }) };
}

/** Enroll this device's fingerprint/Face ID and return the registration to
 *  punch with (the user-verified ceremony doubles as presence proof). */
async function enrollPunch(): Promise<BioProof> {
  const start = await startBiometricSetup();
  if (!start.ok) throw new Error(start.error);
  return {
    registration: await startRegistration({ optionsJSON: start.options }),
    deviceLabel: guessDeviceLabel(),
  };
}

/**
 * Get biometric proof for a punch, deciding per device with a BIDIRECTIONAL
 * fallback so a punch can't dead-end on the wrong branch:
 *  - marker set → authenticate; if the server has no credential (reset), enroll.
 *  - marker unset → enroll; but if WebAuthn reports the device is ALREADY
 *    registered (enrolled on an older build, or the marker was cleared),
 *    authenticate instead. (This is the fix for devices enrolled before the
 *    per-device marker existed — they were getting blocked at check-out by
 *    `ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`.)
 */
async function acquireBioProof(enrolledHere: boolean): Promise<BioProof> {
  if (enrolledHere) {
    return (await authenticatePunch()) ?? (await enrollPunch());
  }
  try {
    return await enrollPunch();
  } catch (err) {
    if (isAuthenticatorAlreadyRegistered(err)) {
      const proof = await authenticatePunch();
      if (proof) return proof;
    }
    throw err;
  }
}

/** A `fetch`/server-action failure that's a connectivity blip, not a real
 *  server response — worth one automatic retry. */
function isNetworkError(err: unknown): boolean {
  const e = err as Error | undefined;
  return (
    e instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(e?.message ?? "")
  );
}

/** Run `fn`; retry exactly once after a short pause if it failed on the
 *  network (so a momentary signal drop doesn't lose a punch). */
async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isNetworkError(err)) {
      await new Promise((r) => setTimeout(r, 800));
      return fn();
    }
    throw err;
  }
}

/** Turn a raw punch failure into an actionable message — the three real-world
 *  failure modes employees hit (imprecise GPS, unset biometric / Android
 *  Credential Manager, and lost connection) instead of a cryptic browser error. */
function mapPunchError(err: unknown): string {
  const e = err as (Error & { name?: string }) | undefined;
  const msg = (e?.message ?? "").toLowerCase();
  if (e?.name === "NotAllowedError") {
    return "Biometric cancelled — tap to try again.";
  }
  if (msg.includes("credential manager") || e?.name === "UnknownError" || e?.name === "NotReadableError") {
    return "Couldn't use your fingerprint / Face ID. Set up a screen lock + fingerprint on your phone (and update Google Play Services), or ask an admin to mark you exempt.";
  }
  if (isNetworkError(err)) {
    return "Couldn't reach the server. Check your connection, fully reload the app, and try again.";
  }
  return e?.message || "Punch failed. Please try again.";
}
