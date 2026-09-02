"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail } from "lucide-react";
import { requestPasswordReset } from "@/app/(auth)/forgot-password/actions";

import { AuthField } from "./auth-field";
import { AuthSubmit } from "./auth-submit";
import { AuthError } from "./auth-error";

// Loose email regex — matches the server-side zod check just enough to
// catch obvious typos ("hetesh", "hetesh@", "hetesh@gmail"). Server still
// runs the canonical zod validation; this is purely UX to avoid showing
// "Check your inbox" for input that has no chance of working.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("That doesn't look like a valid email — double-check and try again.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await requestPasswordReset(trimmed);
      setSent(true);
    });
  }

  return (
    <AnimatePresence mode="wait">
      {sent ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.42, ease: [0.2, 0.7, 0.3, 1] }}
          className="text-center"
        >
          {/* Animated checkmark — green ring + drawn check */}
          <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center">
            <svg
              viewBox="0 0 60 60"
              className="h-16 w-16"
              fill="none"
              aria-hidden
            >
              <defs>
                <linearGradient id="ringG" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#86efac" />
                  <stop offset="100%" stopColor="#15803d" />
                </linearGradient>
              </defs>
              <circle
                cx="30"
                cy="30"
                r="27"
                stroke="url(#ringG)"
                strokeWidth="2.5"
                style={{
                  strokeDasharray: 170,
                  animation:
                    "circleDraw 700ms cubic-bezier(0.2, 0.7, 0.3, 1) both",
                  filter:
                    "drop-shadow(0 6px 14px rgba(34, 197, 94, 0.35))",
                }}
              />
              <path
                d="M19 31 L27 39 L42 22"
                stroke="#15803d"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 36,
                  animation:
                    "checkDraw 480ms cubic-bezier(0.2, 0.7, 0.3, 1) 360ms both",
                }}
              />
            </svg>
          </div>

          <h3
            className="font-serif text-[22px] text-[#0F172A]"
            style={{
              fontStyle: "italic",
              letterSpacing: "-0.015em",
              fontWeight: 400,
            }}
          >
            Check your inbox
          </h3>
          <p
            className="mt-2 mx-auto max-w-[360px] text-[15px] leading-[1.55]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            If <span className="font-semibold text-[#0F172A]">{email}</span>{" "}
            matches an account, a reset link is on its way. Open it from the
            same browser, and you'll be back in within a minute.
          </p>

          <p
            className="mt-5 text-[13px]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            Didn't get it? Wait a minute, then check spam.
          </p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={onSubmit}
          className="space-y-4"
          noValidate
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.22 }}
          >
            <AuthField
              label="Work email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              icon={<Mail className="h-5 w-5" aria-hidden />}
            />
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
                className="mt-3"
              >
                <AuthError message={error} />
              </motion.div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.3 }}
            className="pt-1"
          >
            <AuthSubmit pending={isPending} pendingLabel="Sending link">
              Send reset link
            </AuthSubmit>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.42, delay: 0.4 }}
            className="pt-1 text-center text-[13px] leading-[1.55]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            We'll only send the link if your address is registered. Either way,
            you'll see the same confirmation.
          </motion.p>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
