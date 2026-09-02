"use client";

import { useState, useTransition } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "./avatar-and-name";

interface Props {
  email: string;
}

function translateFirebaseError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Current password is incorrect.";
    case "auth/weak-password":
      return "New password is too weak — try at least 8 characters with mixed cases and a number.";
    case "auth/requires-recent-login":
      return "Sign out and back in, then try again — Firebase needs a recent sign-in.";
    case "auth/network-request-failed":
      return "Network hiccup. Try again.";
    default:
      return "Couldn't update password. Try again.";
  }
}

export function ChangePasswordCard({ email }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (next === current) {
      setError("New password must be different from the current one.");
      return;
    }

    startTransition(async () => {
      try {
        const auth = getFirebaseAuth();
        const user = auth.currentUser;
        if (!user) {
          setError("You're not signed in here. Refresh and try again.");
          return;
        }
        const cred = EmailAuthProvider.credential(email, current);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, next);
        fireToast({ message: "Password updated." });
        reset();
      } catch (err) {
        setError(translateFirebaseError(err));
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 18px",
    fontSize: 16,
    color: "var(--color-ink-strong)",
    background: "var(--color-surface-input)",
    border: "1px solid var(--color-hairline-strong)",
    borderRadius: 12,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 700,
    color: "var(--color-ink-soft)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
  };

  return (
    <section
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        padding: 32,
      }}
    >
      <SectionHeader
        title="Change password"
        description="Update the password you use to sign in. You'll stay signed in here, but other devices will need the new password next time."
        savedAt={null}
      />

      <form
        onSubmit={submit}
        style={{ display: "grid", gap: 18 }}
      >
        <div>
          <label htmlFor="pw-current" style={labelStyle}>
            Current password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="pw-current"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              style={inputStyle}
            />
            <PwEye
              visible={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="pw-next" style={labelStyle}>
            New password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="pw-next"
              type={showNext ? "text" : "password"}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              style={inputStyle}
            />
            <PwEye visible={showNext} onToggle={() => setShowNext((v) => !v)} />
          </div>
        </div>

        <div>
          <label htmlFor="pw-confirm" style={labelStyle}>
            Confirm new password
          </label>
          <input
            id="pw-confirm"
            type={showNext ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "10px 12px",
              fontSize: 13,
              color: "rgb(168, 4, 0)",
              background: "rgba(225, 6, 0, 0.06)",
              border: "1px solid rgba(225, 6, 0, 0.18)",
              borderRadius: 8,
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={
              pending ||
              current.length === 0 ||
              next.length === 0 ||
              confirm.length === 0
            }
            style={{
              padding: "13px 22px",
              fontSize: 15,
              fontWeight: 600,
              color: "white",
              background:
                pending ||
                current.length === 0 ||
                next.length === 0 ||
                confirm.length === 0
                  ? "rgba(15, 23, 42, 0.18)"
                  : "linear-gradient(135deg, #E10600, #A80400)",
              border: "none",
              borderRadius: 10,
              cursor:
                pending ||
                current.length === 0 ||
                next.length === 0 ||
                confirm.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {pending ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

function PwEye({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      style={{
        position: "absolute",
        right: 8,
        top: "50%",
        transform: "translateY(-50%)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--color-ink-subtle)",
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 8px",
      }}
    >
      {visible ? "Hide" : "Show"}
    </button>
  );
}
