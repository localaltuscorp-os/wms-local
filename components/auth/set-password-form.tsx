"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Lock, KeyRound, Check, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { AuthField } from "./auth-field";
import { AuthSubmit } from "./auth-submit";
import { AuthError } from "./auth-error";
import { PasswordEye } from "./password-eye";
import { PasswordStrength, scorePassword } from "./password-strength";

type Status = "loading" | "ready" | "saving" | "signingIn" | "done" | "error";

/** Map Firebase auth error codes to copy users can act on. */
function translateFirebaseError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "auth/weak-password":
      return "Firebase rejected that password — try at least 8 characters with a number and a symbol.";
    case "auth/expired-action-code":
      return "This link has expired. Ask your admin to resend it.";
    case "auth/invalid-action-code":
      return "This link is no longer valid — it may have already been used. Ask your admin to resend it.";
    case "auth/user-disabled":
      return "This account is disabled. Ask your admin to reactivate it.";
    case "auth/user-not-found":
      return "We couldn't find an account for this link. Ask your admin to invite you again.";
    case "auth/network-request-failed":
      return "Network hiccup. Check your connection and try again.";
    default:
      return "Couldn't save your password — try the link again, or request a new one.";
  }
}

export function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const oobCode = params.get("oobCode");

  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!oobCode) {
      setStatus("error");
      setError("This link is missing required information.");
      return;
    }
    verifyPasswordResetCode(getFirebaseAuth(), oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setStatus("ready");
        // Overlap navigation cost with the rest of the form-fill: by the
        // time the user clicks submit, the dashboard's RSC payload is already
        // warm in the Next client cache, so step 5 (router.replace) is
        // an instant transition instead of a fresh round-trip.
        router.prefetch("/" as Route);
      })
      .catch((err) => {
        setStatus("error");
        setError(translateFirebaseError(err));
      });
  }, [oobCode, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oobCode || !email) return;
    setError(null);

    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords don't match yet.");
      return;
    }

    setStatus("saving");
    startTransition(async () => {
      try {
        await confirmPasswordReset(getFirebaseAuth(), oobCode, pw);
        setStatus("signingIn");

        // Always auto-sign-in after a successful password set — the
        // user just proved they own the email, no need to make them
        // type it again. Drops the brittle isInvite heuristic that
        // sniffed continueUrl substrings.
        try {
          const cred = await signInWithEmailAndPassword(
            getFirebaseAuth(),
            email,
            pw,
          );
          // Token was just minted by signInWithEmailAndPassword above —
          // `true` would force a needless Firebase round-trip (200-400ms
          // from India). Default `getIdToken()` returns the cached one.
          const idToken = await cred.user.getIdToken();
          const res = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          if (!res.ok) throw new Error("session-exchange-failed");
          setStatus("done");
          router.replace("/" as Route);
        } catch (signInErr) {
          // Password was set, but auto-sign-in failed — fall back to
          // sending the user to /login with their password ready.
          console.warn(
            "[set-password] auto-sign-in failed; routing to /login",
            signInErr,
          );
          setStatus("done");
          router.replace("/login" as Route);
        }
      } catch (err) {
        setStatus("error");
        setError(translateFirebaseError(err));
      }
    });
  }

  if (status === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-3 py-6 text-[14px]"
        style={{ color: "var(--color-ink-subtle)" }}
      >
        <Loader2
          className="h-5 w-5"
          style={{ animation: "spinFast 0.8s linear infinite" }}
          aria-hidden
        />
        <span>Verifying your link…</span>
      </div>
    );
  }

  if (status === "error" && !email) {
    return (
      <div className="flex flex-col gap-4">
        <AuthError message={error} />
        <div
          className="flex flex-col gap-2 text-center pt-2"
          style={{
            borderTop: "1px solid rgba(15, 23, 42, 0.06)",
            paddingTop: 16,
          }}
        >
          <Link
            href={"/forgot-password" as Route}
            className="auth-link font-semibold"
          >
            Request a new reset link →
          </Link>
          <Link
            href={"/login" as Route}
            className="auth-link"
            style={{ fontSize: 13 }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  const tier = scorePassword(pw);
  const matches = confirm.length > 0 && pw === confirm;
  const mismatched = confirm.length > 0 && pw !== confirm;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {email && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.18 }}
          className="rounded-xl px-4 py-3 text-[14px]"
          style={{
            background: "rgba(15, 23, 42, 0.04)",
            border: "1px solid rgba(15, 23, 42, 0.06)",
          }}
        >
          <span style={{ color: "var(--color-ink-subtle)" }}>For </span>
          <span className="font-semibold" style={{ color: "#0F172A" }}>
            {email}
          </span>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.25 }}
      >
        <AuthField
          label="New password"
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          icon={<Lock className="h-5 w-5" aria-hidden />}
          trailing={
            <PasswordEye visible={showPw} onToggle={() => setShowPw((v) => !v)} />
          }
        />
        <AnimatePresence>
          {pw.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24 }}
            >
              <PasswordStrength password={pw} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.32 }}
      >
        <AuthField
          label="Confirm password"
          type={showConfirm ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          icon={<KeyRound className="h-5 w-5" aria-hidden />}
          trailing={
            <div className="flex items-center gap-1">
              <AnimatePresence>
                {matches && (
                  <motion.span
                    key="match"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{
                      duration: 0.32,
                      ease: [0.2, 0.7, 0.3, 1],
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--color-green), var(--color-green-deep))",
                      boxShadow:
                        "0 4px 12px -2px color-mix(in srgb, var(--color-green) 60%, transparent)",
                    }}
                    aria-label="Passwords match"
                  >
                    <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
              <PasswordEye
                visible={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
            </div>
          }
        />
        {mismatched && (
          <p
            className="mt-2 text-[13px] font-medium"
            style={{
              color: "rgb(168, 4, 0)",
              animation: "errorSlide 220ms ease both",
            }}
          >
            Doesn't match yet — keep typing.
          </p>
        )}
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
        >
          <AuthError message={error} />
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.4 }}
        className="pt-1"
      >
        <AuthSubmit
          pending={isPending || status === "saving" || status === "signingIn" || status === "done"}
          pendingLabel={
            status === "signingIn"
              ? "Signing you in…"
              : status === "done"
                ? "Almost there…"
                : "Saving your password…"
          }
          disabled={tier.score < 1 || !matches}
        >
          Save and sign in
        </AuthSubmit>
      </motion.div>
    </form>
  );
}
