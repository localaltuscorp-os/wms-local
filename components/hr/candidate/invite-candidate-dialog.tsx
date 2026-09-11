"use client";

import * as React from "react";
import { Send, Loader2, X, Copy, Check, MailCheck, AlertTriangle } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  inviteCandidateByLink,
  type CandidateInvite,
} from "@/app/(app)/hr/candidate-invite-actions";

const RED = "var(--color-altus-red)";
const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red";

/**
 * PRE-INTERVIEW → "Send the form to a candidate".
 *
 * Four fields, because four fields is the whole ask: first name, last name, cell
 * and email. The server creates the candidate, mints a personal link and mails
 * it; the candidate fills the form with NO login and can come back to the same
 * link afterwards to correct what they sent.
 *
 * The URL is shown ONCE, on the success panel, and deliberately cannot be
 * re-read later — the plaintext token is never stored anywhere (see
 * lib/hr/candidate/access-link.ts). If HR needs it again the only answer is to
 * send a fresh link, which revokes the old one. So the copy control is offered
 * prominently here, and the panel says plainly that this is the last look.
 */
export function InviteCandidateDialog({
  trigger,
  onInvited,
  purpose = "form",
}: {
  /** Render-prop for the opening control, so callers keep their own button style. */
  trigger: (open: () => void) => React.ReactNode;
  onInvited?: () => void;
  /**
   * 'form' (Pre-Interview) asks the candidate for their details; 'policies'
   * (Post-Interview) sends them every policy to read and sign. Same four
   * fields, same candidate record — only the errand differs, and sending one
   * never revokes the other's link.
   */
  purpose?: "form" | "policies";
}) {
  const policies = purpose === "policies";
  const [open, setOpen] = React.useState(false);
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<CandidateInvite | null>(null);
  /** The server's question when the address belongs to a closed candidate. */
  const [confirmReopen, setConfirmReopen] = React.useState<string | null>(null);

  function close() {
    setOpen(false);
    setFirst("");
    setLast("");
    setMobile("");
    setEmail("");
    setSent(null);
    setConfirmReopen(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    void send(false);
  }

  /**
   * `reopenClosed` is passed ONLY on the second attempt, after the server has
   * told us this address belongs to a closed candidate and HR has answered the
   * question in `confirmReopen`. It is never set automatically — that is the
   * entire point of the round trip.
   */
  async function send(reopenClosed: boolean) {
    if (busy) return;
    setBusy(true);
    const res = await inviteCandidateByLink({
      firstName: first,
      lastName: last,
      mobile,
      email,
      purpose,
      ...(reopenClosed ? { reopenClosed: true } : null),
    });
    setBusy(false);
    if (!res.ok) {
      if (res.needsConfirm) {
        setConfirmReopen(res.error);
        return;
      }
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setConfirmReopen(null);
    setSent(res);
    onInvited?.();
  }

  return (
    <>
      {trigger(() => setOpen(true))}

      {open ? (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4" onClick={close}>
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={
              policies
                ? "Send the policies to a candidate to sign"
                : "Send the interview form to a candidate"
            }
            className="w-[480px] max-w-[94vw] rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-[16px] font-black text-ink-strong">
                {policies ? "Send the policies to sign" : "Send the interview form"}
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="text-ink-muted hover:text-ink-strong">
                <X size={18} />
              </button>
            </div>

            {sent ? (
              <SentPanel invite={sent} onDone={close} />
            ) : confirmReopen ? (
              <ReopenPanel
                message={confirmReopen}
                busy={busy}
                onCancel={() => setConfirmReopen(null)}
                onConfirm={() => void send(true)}
              />
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <p className="text-[13px] leading-[1.5] text-ink-muted">
                  {policies ? (
                    <>
                      Enter the candidate&apos;s basic details. They get every company policy to read
                      and sign by email — <strong>no login, no password</strong> — and can come back to
                      the same link to change what they signed.
                    </>
                  ) : (
                    <>
                      Enter the candidate&apos;s basic details. They get their own Candidate Interview
                      Form by email — <strong>no login, no password</strong> — and can come back to the
                      same link to edit it, even after they submit.
                    </>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name">
                    <input value={first} onChange={(e) => setFirst(e.target.value)} required autoFocus className={INPUT} />
                  </Field>
                  <Field label="Last name">
                    <input value={last} onChange={(e) => setLast(e.target.value)} required className={INPUT} />
                  </Field>
                </div>
                <Field label="Cell number">
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className={INPUT}
                  />
                </Field>
                <Field label="Email address">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    type="email"
                    autoComplete="email"
                    className={INPUT}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}{" "}
                  {policies ? "Send the policies" : "Send the form"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Success: confirmation, the show-once URL, and why it is show-once. */
/**
 * The one question this dialog asks before acting.
 *
 * Typing an address that happens to match a closed candidate would otherwise
 * reopen that person's record and hand back their access, looking from here
 * exactly like inviting somebody new. Reopening is a decision, so it gets a
 * decision's UI: what will happen, stated plainly, and two clearly different
 * buttons. Cancel returns to the form with the typed details intact.
 */
function ReopenPanel({
  message,
  busy,
  onCancel,
  onConfirm,
}: {
  message: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <AlertTriangle size={18} className="mt-[2px] shrink-0 text-amber-600" />
        <p className="text-[13px] leading-[1.55] text-amber-900">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-hairline-strong px-4 py-2 text-[13px] font-bold text-ink-strong disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: RED }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          Reopen and send
        </button>
      </div>
    </div>
  );
}

function SentPanel({ invite, onDone }: { invite: CandidateInvite; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    void navigator.clipboard
      .writeText(invite.url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => fireToast({ message: "Couldn't copy — select the link and copy it manually.", type: "error" }));
  }

  const expiry = new Date(invite.expiresAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-3">
      {invite.warning ? (
        <p className="flex items-start gap-2 rounded-lg border p-3 text-[12.5px] font-semibold leading-[1.5]"
          style={{
            background: "color-mix(in srgb, #f59e0b 10%, white)",
            borderColor: "color-mix(in srgb, #f59e0b 34%, white)",
            color: "#b45309",
          }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {invite.warning}
        </p>
      ) : (
        <p className="flex items-start gap-2 text-[13px] leading-[1.5] text-ink-muted">
          <MailCheck size={15} className="mt-0.5 shrink-0" style={{ color: "#166534" }} />
          The form has been emailed to the candidate. It works until {expiry}.
        </p>
      )}

      <div>
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Their private link
        </span>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={invite.url}
            onFocus={(e) => e.currentTarget.select()}
            className={`${INPUT} font-mono text-[12px]`}
          />
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-ink-soft"
          >
            {copied ? <Check size={14} style={{ color: "#166534" }} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-subtle">
          This is the only time the link is shown — it isn&apos;t stored anywhere we can read it back.
          If it&apos;s lost, send a new one from the candidate&apos;s row (that cancels this one).
        </p>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-1 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-[14px] font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${RED}, var(--color-altus-red-deep))` }}
      >
        Done
      </button>
    </div>
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
