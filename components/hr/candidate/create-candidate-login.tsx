"use client";

import * as React from "react";
import { KeyRound, Loader2, X, Copy, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { createCandidateAccount } from "@/app/(app)/hr/candidate-account-actions";
import type { Credentials } from "@/lib/hr/candidate/account-types";

const RED = "var(--color-altus-red)";
const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red";

/**
 * HR control: mint a one-time candidate login so a job applicant fills their own
 * interview form without borrowing HR's account (mig 0183). Shows the generated
 * credentials ONCE — HR hands them to the candidate. The account deactivates
 * itself when the candidate submits.
 */
export function CreateCandidateLogin() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [position, setPosition] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [creds, setCreds] = React.useState<Credentials | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
    setPosition("");
    setCreds(null);
    setWarning(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await createCandidateAccount({
      name: name.trim(),
      email: email.trim(),
      positionApplied: position.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setCreds(res.credentials ?? null);
    setWarning(res.warning ?? null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-strong transition-colors hover:border-altus-red"
      >
        <KeyRound size={16} strokeWidth={2.4} /> Candidate login
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(15,23,42,0.42)] p-4" onClick={close}>
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="w-[460px] max-w-[94vw] rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-black text-ink-strong">Create a candidate login</h2>
              <button type="button" onClick={close} aria-label="Close" className="text-ink-muted hover:text-ink-strong">
                <X size={18} />
              </button>
            </div>

            {creds ? (
              <CredentialsView creds={creds} warning={warning} onDone={close} />
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <p className="text-[13px] leading-[1.5] text-ink-muted">
                  Creates a one-time login the candidate uses to fill their <strong>own</strong> interview form — no
                  need to lend your account. It deactivates automatically when they submit.
                </p>
                <Field label="Full name">
                  <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={INPUT} />
                </Field>
                <Field label="Email">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={INPUT} />
                </Field>
                <Field label="Position (optional)">
                  <input value={position} onChange={(e) => setPosition(e.target.value)} className={INPUT} />
                </Field>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
                  style={{ background: RED }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Create login
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function CredentialsView({
  creds,
  warning,
  onDone,
}: {
  creds: Credentials;
  warning: string | null;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg px-3 py-2 text-[12.5px] font-semibold"
        style={{ background: "var(--color-amber-bg, #fef3e2)", color: "var(--color-amber-deep, #b45309)" }}
      >
        Shown once — copy these and hand them to the candidate. The password can’t be retrieved later (only reset).
      </div>
      {warning ? <div className="text-[12.5px] font-semibold text-[color:var(--color-altus-red)]">{warning}</div> : null}
      <CopyRow label="Login link" value={creds.loginUrl} />
      <CopyRow label="Email" value={creds.email} />
      <CopyRow label="Password" value={creds.password} mono />
      <button
        type="button"
        onClick={onDone}
        className="mt-1 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-[14px] font-bold text-white"
        style={{ background: RED }}
      >
        Done
      </button>
    </div>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(`Copy ${label}:`, value);
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-soft px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-muted">{label}</div>
        <div className={`truncate text-[13px] text-ink-strong ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="shrink-0 inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-white hover:text-ink-strong"
      >
        {copied ? <Check size={15} className="text-[color:var(--color-green-deep)]" /> : <Copy size={15} />}
      </button>
    </div>
  );
}
