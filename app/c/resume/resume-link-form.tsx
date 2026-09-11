"use client";

import * as React from "react";
import { Loader2, MailCheck, Send } from "lucide-react";
import { requestCandidateFormLink } from "./actions";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14.5px] text-ink-strong outline-none focus:border-altus-red";

/** The one-field request form. The success copy is deliberately non-committal —
 *  see the note in ./actions.ts about not confirming who applied. */
export function ResumeLinkForm() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await requestCandidateFormLink(email);
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  if (sent) {
    return (
      <div className="mt-5 flex items-start gap-3 rounded-xl border p-4"
        style={{
          background: "color-mix(in srgb, var(--color-green) 8%, white)",
          borderColor: "color-mix(in srgb, var(--color-green) 26%, white)",
        }}
      >
        <MailCheck size={18} className="mt-0.5 shrink-0" style={{ color: "#166534" }} />
        <p className="text-[13.5px] leading-[1.6] text-ink-strong">
          If we have an interview form for that address, a fresh link is on its way. It replaces any
          earlier link, so please use the newest email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Email address
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          className={INPUT}
        />
      </label>
      {error && <p className="text-[12.5px] font-semibold text-altus-red">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14px] font-bold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send me the link
      </button>
    </form>
  );
}
