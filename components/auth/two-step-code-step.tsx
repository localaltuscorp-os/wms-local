"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Step two of sign-in: type the 6-digit code that was emailed.
 *
 * Holds only the opaque `challenge` handle from step one — no password, no
 * Firebase token. On success the server has already set the session and the
 * pass cookie (good until midnight IST); `onVerified` finishes the sign-in the
 * same way a one-step login did.
 */
export function TwoStepCodeStep({
  challenge: initialChallenge,
  maskedEmail,
  onVerified,
  onCancel,
}: {
  challenge: string;
  maskedEmail: string;
  onVerified: (customToken: string | null) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [challenge, setChallenge] = useState(initialChallenge);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResending, setResending] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/two-step/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challenge, code }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          customToken?: string | null;
        };
        if (!res.ok) {
          setError(payload.message ?? "That code didn't work. Try again.");
          setCode("");
          return;
        }
        await onVerified(payload.customToken ?? null);
      } catch {
        setError("Network hiccup. Check your connection and try once more.");
      }
    });
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const res = await fetch("/api/auth/two-step/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        challenge?: string;
        maskedEmail?: string;
        message?: string;
      };
      if (!res.ok || !payload.challenge) {
        setError(payload.message ?? "Couldn't send a new code. Sign in again.");
        return;
      }
      setChallenge(payload.challenge);
      setCode("");
      setNotice(`New code sent to ${payload.maskedEmail ?? maskedEmail}.`);
    } catch {
      setError("Network hiccup. Check your connection and try once more.");
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <h1
        className="text-center"
        style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#fff" }}
      >
        Check your email
      </h1>
      <p className="mt-2 text-center" style={{ fontSize: 14.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
        We sent a 6-digit code to <strong style={{ color: "rgba(255,255,255,0.85)" }}>{maskedEmail}</strong>.
        <br />
        You won&apos;t be asked again on this browser until tomorrow.
      </p>

      <div className="mt-7 space-y-4">
        <label className="block">
          <span
            className="mb-1.5 block"
            style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono-display), monospace", fontWeight: 700 }}
          >
            Sign-in code
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            aria-label="6-digit sign-in code"
            className="w-full bg-transparent text-center outline-none"
            style={{
              padding: "14px 16px",
              fontSize: 26,
              letterSpacing: "0.5em",
              color: "#fff",
              fontFamily: "var(--font-mono-display), monospace",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          />
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-xl px-4 py-3"
            style={{ background: "rgba(225,6,0,0.12)", border: "1px solid rgba(225,6,0,0.4)", color: "#FECACA", fontSize: 13.5, lineHeight: 1.5 }}
          >
            {error}
          </div>
        )}
        {notice && !error && (
          <div
            role="status"
            className="rounded-xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.8)", fontSize: 13.5, lineHeight: 1.5 }}
          >
            {notice}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || code.length !== 6}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, #F4554D 0%, #E10600 50%, #A80400 100%)",
            color: "#fff",
            padding: "15px 22px",
            borderRadius: 13,
            fontSize: 16,
            fontWeight: 700,
            boxShadow: "0 12px 30px -12px rgba(225,6,0,0.7), 0 1px 0 rgba(255,255,255,0.22) inset",
          }}
        >
          <span>{isPending ? "Checking…" : "Verify and sign in"}</span>
          {!isPending && <ArrowRight size={17} />}
        </button>

        <div className="flex items-center justify-between pt-0.5" style={{ fontSize: 13.5 }}>
          <button
            type="button"
            onClick={onCancel}
            className="transition-colors hover:text-white"
            style={{ color: "rgba(255,255,255,0.6)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Use a different account
          </button>
          <button
            type="button"
            onClick={onResend}
            disabled={isResending}
            className="transition-colors hover:text-white disabled:opacity-60"
            style={{ color: "rgba(255,255,255,0.6)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            {isResending ? "Sending…" : "Send a new code"}
          </button>
        </div>
      </div>
    </form>
  );
}
