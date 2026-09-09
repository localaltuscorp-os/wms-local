"use client";

import * as React from "react";
import { Loader2, PenLine } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { signAgreement } from "@/app/(app)/agreements/sign/[token]/actions";

const GREEN = "#15803d";
const GREEN_DEEP = "#0f5f2d";

/**
 * The employee's e-signature card. Type your full legal name + tick the consent
 * box → "Sign & accept" stamps the agreement. Keyboard-first: name autofocuses,
 * Enter submits, the button stays disabled until both fields are satisfied. On
 * success we reload so the server page re-renders the signed state.
 */
export function SignPanel({
  token,
  employeeName,
  agreementTitle,
}: {
  token: string;
  employeeName: string;
  agreementTitle: string;
}) {
  const [name, setName] = React.useState(employeeName ?? "");
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const ready = name.trim().length >= 2 && agreed && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    const res = await signAgreement({ token, typedName: name, agreed });
    if (!res.ok) {
      setBusy(false);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: "Signed. Thank you — your acceptance has been recorded.", type: "success" });
    // Re-render the page in its signed state.
    location.reload();
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <form
      onSubmit={onFormSubmit}
      className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-2">
        <PenLine size={16} strokeWidth={2.2} className="text-ink-soft" />
        <h2 className="text-[14px] font-bold tracking-tight text-ink-strong">Sign This Document</h2>
      </div>

      <label className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft" htmlFor="sign-name">
        Type Your Full Legal Name
      </label>
      <input
        id="sign-name"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Hetesh Vichare"
        autoComplete="name"
        className="mb-4 w-full rounded-xl border border-hairline bg-surface-soft px-3.5 py-2.5 text-[14px] text-ink-strong outline-none transition focus:border-[color:var(--color-brand,#E10600)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,#E10600_28%,transparent)]"
      />

      <label className="mb-5 flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-ink-strong">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-brand,#E10600)]"
        />
        <span>
          I have read and I agree to this {agreementTitle}. I understand that typing my name and
          clicking below constitutes my legal electronic signature.
        </span>
      </label>

      <button
        type="submit"
        disabled={!ready}
        className="wg-btn wg-sheen inline-flex w-full items-center justify-center gap-2 rounded-pill px-4 py-2.5 text-[14px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
        style={{
          background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`,
          boxShadow:
            "0 8px 20px -10px color-mix(in srgb, #0f5f2d 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" strokeWidth={2.4} /> : <PenLine size={16} strokeWidth={2.4} />}
        {busy ? "Signing…" : "Sign & Accept"}
      </button>
    </form>
  );
}
