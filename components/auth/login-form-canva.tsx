"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { wasPasswordResetByAdmin } from "@/app/(auth)/login/actions";

/**
 * Canva-style login: a compact dark card form. Same Firebase email/password +
 * session-exchange auth as the glass form — only the chrome differs (dark
 * "jump back in" modal over the poster mosaic, Altus-red CTA). Kept separate
 * so the other auth surfaces keep their own styling.
 */
function translateFirebaseError(code: string | undefined): string {
  switch (code) {
    case "auth/user-disabled":
      return "This account has been deactivated. Reach out to your admin to reinstate access.";
    case "auth/too-many-requests":
      return "Too many attempts in a row — give it a minute, then try again.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Wrong password. Try again, or reset it below.";
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "We couldn't find that email. Double-check the address your admin sent.";
    case "auth/network-request-failed":
      return "Network hiccup. Check your connection and try once more.";
    default:
      return "Email or password didn't match. Try again.";
  }
}

async function exchangeIdTokenForSession(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (res.ok) return;
  let payload: { error?: string } = {};
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 403 && payload.error === "not-enrolled") {
    throw new Error("not-enrolled");
  }
  throw new Error("session-exchange-failed");
}

export function LoginFormCanva() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        const idToken = await cred.user.getIdToken();
        await exchangeIdTokenForSession(idToken);
        router.replace(requestedNext as Route);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if ((err as Error)?.message === "not-enrolled") {
          setError("This email isn't enrolled in Altus Corp. Ask your admin to invite you.");
          try {
            await firebaseSignOut(getFirebaseAuth());
          } catch {
            /* best effort */
          }
          return;
        }
        const credentialFail =
          code === "auth/wrong-password" ||
          code === "auth/invalid-credential" ||
          code === "auth/invalid-login-credentials";
        if (credentialFail && (await wasPasswordResetByAdmin(email))) {
          setError("Your password was changed by an administrator. Please use the new password, or contact support.");
          return;
        }
        setError(translateFirebaseError(code));
      }
    });
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

      <div className="mt-7 space-y-4">
        <Field label="Work email" type="email" autoComplete="email" required value={email} onChange={setEmail} placeholder="you@altuscorp.com" />
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
          <span className="relative z-10">{isPending ? "Signing you in…" : "Sign in"}</span>
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
            Forgot password?
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
