"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { wasPasswordResetByAdmin } from "@/app/(auth)/login/actions";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";

/**
 * Glass-themed login form. Same Firebase + session-exchange logic as
 * the legacy `login-form.tsx`; the differences are visual — floating
 * labels, glass-card-friendly contrast, gradient red submit. Lives
 * alongside the original so other auth surfaces (forgot-password,
 * set-password, welcome) can keep their light-panel styling unchanged.
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

export function LoginFormGlass() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const cred = await signInWithEmailAndPassword(
          getFirebaseAuth(),
          email,
          password,
        );
        const idToken = await cred.user.getIdToken();
        await exchangeIdTokenForSession(idToken);
        router.replace(requestedNext as Route);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if ((err as Error)?.message === "not-enrolled") {
          setError(
            "This email isn't enrolled in Altus Corp. Ask your admin to invite you.",
          );
          try {
            await firebaseSignOut(getFirebaseAuth());
          } catch {
            /* best effort */
          }
          return;
        }
        // A credential failure might be because an admin reset this account.
        // Check the marker and, if set, show the specific message instead of
        // the generic "wrong password".
        const credentialFail =
          code === "auth/wrong-password" ||
          code === "auth/invalid-credential" ||
          code === "auth/invalid-login-credentials";
        if (credentialFail && (await wasPasswordResetByAdmin(email))) {
          setError(
            "Your password was changed by an administrator. Please use the new password, or contact support.",
          );
          return;
        }
        setError(translateFirebaseError(code));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.2, 0.7, 0.3, 1] }}
      >
        {/* Eyebrow */}
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-[7px] w-[7px] rounded-full"
            style={{
              background: "#E10600",
              boxShadow: "0 0 14px #E10600",
            }}
          />
          <span
            style={{
              fontSize: 12,
              letterSpacing: "0.26em",
              color: "rgba(255,255,255,0.60)",
              fontFamily: "var(--font-mono-display)",
              fontWeight: 700,
            }}
          >
            WELCOME BACK
          </span>
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 68,
            lineHeight: 1.0,
            letterSpacing: "-0.03em",
            color: "rgba(255,255,255,0.97)",
          }}
        >
          Sign in to{" "}
          <span
            style={{
              background:
                "linear-gradient(110deg, #F4554D, #E10600 50%, #A80400)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Altus
          </span>
          .
        </h1>
        <p
          className="mt-4"
          style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.60)",
            lineHeight: 1.55,
          }}
        >
          Use the email your admin set up for you.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
        className="mt-10 space-y-6"
      >
        <GlassField
          label="Work email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
        />
        <GlassField
          label="Password"
          type={showPw ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          trailing={
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ color: "rgba(255,255,255,0.55)" }}
              className="hover:opacity-100 transition-opacity"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="rounded-lg px-5 py-4"
            style={{
              background: "rgba(225, 6, 0, 0.10)",
              border: "1px solid rgba(225, 6, 0, 0.35)",
              color: "#FECACA",
              fontSize: 15,
              lineHeight: 1.5,
            }}
          >
            {error}
          </motion.div>
        )}

        <div className="flex items-center justify-end pt-0.5">
          <Link
            href={"/forgot-password" as Route}
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.78)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
            className="hover:text-white transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="group relative mt-2 flex w-full items-center justify-center gap-2.5 overflow-hidden transition-transform active:scale-[0.99] disabled:opacity-70"
          style={{
            background:
              "linear-gradient(135deg, #F4554D 0%, #E10600 50%, #A80400 100%)",
            color: "#FFFFFF",
            padding: "22px 28px",
            borderRadius: 16,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "0.01em",
            boxShadow:
              "0 10px 30px -10px rgba(225, 6, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.20) inset",
          }}
        >
          <span className="relative z-10">
            {isPending ? "Signing you in…" : "Sign in"}
          </span>
          {!isPending && (
            <ArrowRight
              size={18}
              className="relative z-10 transition-transform group-hover:translate-x-1"
            />
          )}
          <span
            aria-hidden
            className="absolute inset-y-0 -left-full w-1/2 transition-transform duration-700 group-hover:translate-x-[300%]"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
            }}
          />
        </button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.42, delay: 0.55 }}
        className="mt-10 text-center"
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.50)",
          lineHeight: 1.6,
        }}
      >
        By signing in you agree to the{" "}
        <Link
          href={"/terms" as Route}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "rgba(255,255,255,0.85)",
            textDecoration: "underline",
          }}
        >
          terms
        </Link>{" "}
        and{" "}
        <Link
          href={"/privacy" as Route}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "rgba(255,255,255,0.85)",
            textDecoration: "underline",
          }}
        >
          privacy policy
        </Link>
        .
      </motion.p>
    </form>
  );
}

function GlassField({
  label,
  type,
  autoComplete,
  required,
  value,
  onChange,
  trailing,
}: {
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;
  return (
    <div
      className="relative"
      style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: `1px solid ${focused ? "rgba(225, 6, 0, 0.55)" : "rgba(255, 255, 255, 0.12)"}`,
        borderRadius: 16,
        transition: "border-color 220ms, background 220ms, box-shadow 220ms",
        boxShadow: focused ? "0 0 0 4px rgba(225, 6, 0, 0.10)" : "none",
      }}
    >
      <label
        style={{
          position: "absolute",
          left: 20,
          top: lifted ? 10 : 22,
          fontSize: lifted ? 11 : 17,
          letterSpacing: lifted ? "0.22em" : "0",
          color: lifted ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.48)",
          fontFamily: lifted ? "var(--font-mono-display)" : "var(--font-sans)",
          fontWeight: lifted ? 600 : 400,
          textTransform: lifted ? "uppercase" : "none",
          transition: "all 200ms cubic-bezier(0.2,0.7,0.3,1)",
          pointerEvents: "none",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full bg-transparent outline-none"
        style={{
          padding: "32px 20px 14px",
          paddingRight: trailing ? 54 : 20,
          fontSize: 18,
          color: "#FFFFFF",
          fontFamily: "var(--font-sans)",
        }}
      />
      {trailing && (
        <div className="absolute right-5 top-1/2 -translate-y-1/2">
          {trailing}
        </div>
      )}
    </div>
  );
}
