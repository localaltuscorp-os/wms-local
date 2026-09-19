"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { wasPasswordResetByAdmin } from "@/app/(auth)/login/actions";
import { resetBrowserSessionId } from "@/lib/ecos/browser-session";
import { TwoStepCodeStep } from "@/components/auth/two-step-code-step";

/**
 * Canva-style login: a compact dark card form. Same Firebase email/password +
 * session-exchange auth as the glass form — only the chrome differs (dark
 * "jump back in" modal over the poster mosaic, Altus-red CTA). Kept separate
 * so the other auth surfaces keep their own styling.
 */

export function LoginFormCanva() {
  const params = useSearchParams();
  // Always land on the Hub by default. Treat a bare "/" next — what the
  // middleware appends when you open the root domain — as "no preference" so it
  // resolves to /hub too; real deep links (?next=/tasks) are still honored.
  const rawNext = params.get("next");
  // SECURITY: only honour SAME-ORIGIN relative paths. Without this, `?next=`
  // could be `https://evil.com` or `//evil.com` (protocol-relative) → a
  // post-login OPEN REDIRECT to a phishing site after the user typed real
  // credentials. Mirrors sanitizeNext() in app/(auth)/welcome/page.tsx.
  const isSafeNext = !!rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//");
  const requestedNext = !rawNext || rawNext === "/" || !isSafeNext ? "/hub" : rawNext;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Set when the password was right and a code has been emailed (step two).
  const [twoStep, setTwoStep] = useState<{ challenge: string; maskedEmail: string } | null>(null);
  // proxy.ts sends people back here with reason=two-step when yesterday's
  // two-step pass has run out, so the page can say why they were signed out.
  const passExpired = params.get("reason") === "two-step";

  // After a successful sign-in, whichever step it finished on.
  async function finishSignIn(customToken: string | null | undefined) {
    // Sign the browser's Firebase SDK in with the one-time token, so sign-out,
    // the idle timer and "change password" keep working. The app's own session
    // is already set by the response, so a failure here is not a failed login —
    // only those client-SDK features would need a reload.
    if (customToken) {
      try {
        await signInWithCustomToken(getFirebaseAuth(), customToken);
      } catch (err) {
        console.error("client sign-in with custom token failed", err);
      }
    }
    // HARD navigation (not router.replace): wipes Next's client Router
    // Cache so this freshly-signed-in user never sees a PREVIOUS user's
    // cached pages (e.g. the admin panel) lingering in this browser tab.
    window.location.replace(requestedNext);
  }

  // Broadcasts (0215): closing a broadcast popup with its X snoozes it "until
  // next login", and the marker for a login is this browser-session id. Being
  // on the sign-in screen IS the next login, so clearing it here is what makes
  // a snoozed announcement come back — including for someone who signs out and
  // straight back in without ever closing the tab.
  useEffect(() => {
    resetBrowserSessionId();
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Long-password DoS guard: reject before any auth work touches it.
    if (password.length > 128) {
      setError("That password is too long (max 128 characters).");
      return;
    }
    startTransition(async () => {
      try {
        // THE SERVER CHECKS THE PASSWORD (app/api/auth/login/route.ts).
        //
        // It used to happen here, in the browser, against Firebase — so a wrong
        // password never reached us and nothing could count it. The server now
        // does the exchange, counts each refusal, locks the account on the fifth,
        // and mints the session cookies in the same response.
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          customToken?: string | null;
          challenge?: string;
          maskedEmail?: string;
        };

        // Password accepted; a code is on its way. Move to step two.
        if (payload.error === "two-step-required" && payload.challenge) {
          setPassword("");
          setTwoStep({ challenge: payload.challenge, maskedEmail: payload.maskedEmail ?? "your email" });
          return;
        }

        if (!res.ok) {
          // An administrator-set password is a different problem from a wrong
          // one, and the person cannot tell the two apart without being told.
          if (payload.error === "bad-credentials" && (await wasPasswordResetByAdmin(email.trim()))) {
            setError("Your password was changed by an administrator. Please use the new password, or contact support.");
            return;
          }
          // The server writes these sentences — the attempts-left countdown, the
          // locked message naming who can unlock, the device refusal — so the
          // wording lives in one place (lib/auth/lockout-copy.ts).
          // Only a credential refusal may say "didn't match". A server fault with
          // no message of its own must not read as a wrong password — on
          // 19 Sep a missing table made a correct password look wrong.
          setError(
            payload.message ??
              (payload.error === "bad-credentials"
                ? "Email or password didn't match. Try again."
                : "Sign-in is having trouble right now. Try again in a minute."),
          );
          return;
        }

        await finishSignIn(payload.customToken);
      } catch {
        setError("Network hiccup. Check your connection and try once more.");
      }
    });
  }

  if (twoStep) {
    return (
      <TwoStepCodeStep
        challenge={twoStep.challenge}
        maskedEmail={twoStep.maskedEmail}
        onVerified={finishSignIn}
        onCancel={() => {
          setTwoStep(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      {/* Brand mark — the real Altus logo */}
      <div className="flex justify-center">
        <Image
          src="/logo-mark.png"
          alt="Altus Corp"
          width={48}
          height={55}
          priority
          style={{ height: 54, width: "auto", filter: "drop-shadow(0 8px 20px rgba(225,6,0,0.45))" }}
        />
      </div>

      <h1
        className="mt-5 text-center"
        style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600, fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.02em", color: "#fff" }}
      >
        Welcome back
      </h1>
      <p className="mt-2 text-center" style={{ fontSize: 14.5, color: "rgba(255,255,255,0.55)" }}>
        Sign in to your Altus workspace.
      </p>

      {passExpired && (
        <div
          role="status"
          className="mt-5 rounded-xl px-4 py-3 text-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.8)", fontSize: 13.5, lineHeight: 1.5 }}
        >
          Your sign-in for today has ended. Sign in again to continue.
        </div>
      )}

      <div className="mt-7 space-y-4">
        <Field label="Work Email" type="email" autoComplete="email" required value={email} onChange={setEmail} placeholder="you@altuscorp.com" />
        <Field
          label="Password"
          type={showPw ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          trailing={
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="transition-opacity hover:opacity-100"
              style={{ color: "rgba(255,255,255,0.5)", opacity: 0.8 }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        {error && (
          <div
            role="alert"
            className="rounded-xl px-4 py-3"
            style={{ background: "rgba(225,6,0,0.12)", border: "1px solid rgba(225,6,0,0.4)", color: "#FECACA", fontSize: 13.5, lineHeight: 1.5 }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden transition-transform active:scale-[0.99] disabled:opacity-70"
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
          <span className="relative z-10">{isPending ? "Signing you in…" : "Sign In"}</span>
          {!isPending && <ArrowRight size={17} className="relative z-10 transition-transform group-hover:translate-x-0.5" />}
          <span
            aria-hidden
            className="absolute inset-y-0 -left-full w-1/2 transition-transform duration-700 group-hover:translate-x-[320%]"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }}
          />
        </button>

        <div className="flex justify-center pt-0.5">
          <Link
            href={"/forgot-password" as Route}
            className="transition-colors hover:text-white"
            style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Forgot Password?
          </Link>
        </div>
      </div>

      <div className="mt-7 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.1)" }} />
        <span style={{ fontSize: 11, letterSpacing: "0.2em", color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-mono-display), monospace" }}>ALTUS CORP</span>
        <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.1)" }} />
      </div>

      <p className="mt-5 text-center" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
        By continuing you agree to our{" "}
        <Link href={"/terms" as Route} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "underline" }}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href={"/privacy" as Route} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "underline" }}>
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  type,
  autoComplete,
  required,
  value,
  onChange,
  placeholder,
  trailing,
}: {
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="block">
      <span
        className="mb-1.5 block"
        style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono-display), monospace", fontWeight: 700 }}
      >
        {label}
      </span>
      <div
        className="relative"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${focused ? "rgba(225,6,0,0.6)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 12,
          boxShadow: focused ? "0 0 0 4px rgba(225,6,0,0.12)" : "none",
          transition: "border-color 180ms, box-shadow 180ms",
        }}
      >
        <input
          type={type}
          autoComplete={autoComplete}
          required={required}
          value={value}
          placeholder={placeholder}
          // Hard cap so a pasted megabyte-long password can't even enter state
          // (long-password DoS). The submit handler enforces the real ≤128 rule.
          maxLength={255}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full bg-transparent outline-none"
          style={{ padding: "14px 16px", paddingRight: trailing ? 46 : 16, fontSize: 15.5, color: "#fff", fontFamily: "var(--font-sans), system-ui" }}
        />
        {trailing && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </label>
  );
}
