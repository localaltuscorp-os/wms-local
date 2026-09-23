"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Paperclip, Loader2, AlertTriangle, CheckCircle2, RotateCcw, Send } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE } from "@/lib/billing/ui";
import { emailBillingDocumentAction } from "@/app/(app)/billing/documents/actions";

/**
 * THE EMAIL COMPOSER.
 *
 * Opened by "Send Email" — which deliberately does NOT send. Everything arrives
 * filled in: the recipient from the customer on the document, a subject built
 * from the document number and the issuing company, and a written body. The
 * user reads it, edits anything, and only then sends.
 *
 * ── ONE WAY OUT: GMAIL, IN A TAB ───────────────────────────────────────────
 *
 * "Open in Gmail" writes the draft into Gmail's own compose window and sends
 * nothing itself. It needs no `RESEND_API_KEY` and no mail service, and the
 * customer gets a reply-to address belonging to a person rather than a
 * no-reply robot.
 *
 * TWO OTHER BUTTONS WERE HERE AND ARE GONE (Manan, 2026-09-17).
 *   · "Open in my email app" fired a `mailto:`, which on this desktop Windows
 *     hands to the BROWSER — there is no mail program registered — so the
 *     click did nothing at all and simply looked broken.
 *   · "Send from the server" called Resend, whose key this deployment has but
 *     which Resend rejects as invalid. It could only ever fail.
 *
 * THE PDF IS NEVER ATTACHED, because a compose URL has no attachment field and
 * no browser will invent one — see the note on
 * `composeBillingDocumentEmailAction`. Nor is it downloaded for you: pressing
 * "Open in Gmail" used to start a download at the same moment, which meant a
 * file landing in Downloads every time somebody opened a draft, whether they
 * wanted it or not. "Download PDF" is a button, pressed when it is wanted.
 *
 * The attachment is not an upload: the server renders the PDF from the
 * document row on demand, so what goes out can never be an older file than the
 * document it names. The link below opens exactly that file for review.
 */

interface Props {
  id: string;
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  attachmentName: string;
  documentLabel: string;
  /** Present when this document has been emailed before. */
  lastSentTo: string | null;
  /** Customer has no email on file — the To box starts empty and says so. */
  missingRecipient: boolean;
  /** Standing copy list from the Admin Master's email configuration. Editable
   *  here — these are defaults, not a routing rule. */
  defaultCc: string;
  defaultBcc: string;
}

export function EmailComposer({
  id,
  defaultTo,
  defaultSubject,
  defaultBody,
  attachmentName,
  documentLabel,
  lastSentTo,
  missingRecipient,
  defaultCc,
  defaultBcc,
}: Props) {
  const router = useRouter();
  const [to, setTo] = React.useState(defaultTo);
  const [cc, setCc] = React.useState(defaultCc);
  const [bcc, setBcc] = React.useState(defaultBcc);
  const [subject, setSubject] = React.useState(defaultSubject);
  // The plain-text alternative only — the visible message is the invoice picture.
  const body = defaultBody;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  // "Dirty" means CHANGED FROM THE TEMPLATE, which now includes the standing
  // copy list. Comparing cc/bcc against "" would have marked every untouched
  // document dirty the moment these defaults arrived, and the Reset button
  // would have offered to undo something nobody did.
  const dirty =
    to !== defaultTo ||
    subject !== defaultSubject ||
    cc !== defaultCc ||
    bcc !== defaultBcc;

  /** Shared by both routes, so handing off to a mail app can never be looser
   *  about what counts as a finished email than sending it ourselves. */
  function incomplete(): boolean {
    setError(null);
    if (!to.trim()) {
      setError("Add a recipient before sending.");
      return true;
    }
    if (!subject.trim()) {
      setError("The email needs a subject.");
      return true;
    }
    return false;
  }

  /**
   * CONFIRM = SEND. One press sends the email straight from the app through
   * Resend: the message, the document shown in its body, and the PDF attached.
   * Nothing else to open or attach by hand.
   */
  async function confirmSend() {
    if (incomplete()) return;
    setBusy(true);
    try {
      const result = await emailBillingDocumentAction({ id, to, cc, bcc, subject, body });
      if (!result.ok) {
        setError(result.error);
        fireToast({ message: result.error, type: "error" });
        return;
      }
      setSentTo(result.to);
      fireToast({ message: `${documentLabel} sent to ${result.to}`, type: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="rounded-[22px] p-8 text-center" style={CARD_STYLE}>
        <CheckCircle2 size={28} className="mx-auto" style={{ color: "#059669" }} />
        <h2 className="mt-3 text-[18px] font-black text-ink-strong">
          {documentLabel} sent to {sentTo}
        </h2>
        <p className="mx-auto mt-1 max-w-[52ch] text-[13.5px] text-ink-muted">
          The email went out with the document in its body and the PDF attached, and it is
          recorded in the document&apos;s activity trail.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href={`/billing/documents/${id}` as Route}
            className="inline-flex h-10 items-center rounded-chip px-4 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
          >
            Back to the document
          </Link>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <RotateCcw size={14} /> Send again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[22px] p-6 max-md:p-4" style={CARD_STYLE}>
      <h2
        className="text-[16px] font-black text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        Compose email
      </h2>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">
        Pre-filled from the document. Check it, then press Confirm — the email is sent straight
        away with the document in the message and the PDF attached.
      </p>

      {missingRecipient ? (
        <Note tone="warn">
          This customer has no email address on file. Type one here for this send, or add it in
          Admin › Billing Customers so it fills itself in next time.
        </Note>
      ) : null}
      {lastSentTo ? (
        <Note tone="info">This document was last emailed to {lastSentTo}.</Note>
      ) : null}

      <div className="mt-4 space-y-3">
        <Row label="To">
          <input
            className={INPUT}
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="customer@company.com"
            autoComplete="off"
          />
        </Row>
        <Row label="Cc">
          <input
            className={INPUT}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Comma-separated, optional"
            autoComplete="off"
          />
        </Row>
        <Row label="Bcc">
          <input
            className={INPUT}
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="Comma-separated, optional"
            autoComplete="off"
          />
        </Row>
        <Row label="Subject">
          <input
            className={INPUT}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Row>
      </div>

      {/* THE MESSAGE IS THE INVOICE (Manan, 2026-09-19: "in the message box I
          want the template image"). The email body is page one of the PDF as
          a picture — exactly what is shown here — with the PDF attached below.
          The written letter is kept only as the plain-text alternative for
          mail apps that block images; it is not shown or edited here. */}
      <div className="mt-4">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
          Message
        </span>
        <div
          className="max-h-[760px] overflow-auto rounded-[14px] bg-white p-2"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- generated per document, not a static asset */}
          <img
            src={`/billing/documents/${id}/png`}
            alt={documentLabel}
            className="mx-auto block w-full max-w-[760px]"
          />
        </div>
      </div>

      {/* Attachment ---------------------------------------------------- */}
      <div className="mt-4">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
          Attachment
        </span>
        <a
          href={`/billing/documents/${id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-[13px] font-semibold text-ink-strong"
          style={{ background: "rgba(248,250,252,0.9)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <Paperclip size={15} className="text-ink-muted" />
          {attachmentName}
          <span className="text-[11.5px] font-normal text-ink-muted">· open to review</span>
        </a>
        <p className="mt-1 text-[11.5px] text-ink-muted">
          Attached automatically when you press Confirm, built fresh from the document.
        </p>
      </div>

      {error ? <Note tone="warn">{error}</Note> : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void confirmSend()}
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-chip px-6 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {busy ? "Sending…" : "Confirm"}
        </button>
        {dirty && !busy ? (
          <button
            type="button"
            onClick={() => {
              setTo(defaultTo);
              setCc(defaultCc);
              setBcc(defaultBcc);
              setSubject(defaultSubject);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-ink-muted"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
          >
            <RotateCcw size={14} /> Reset to template
          </button>
        ) : null}
      </div>
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13px] text-ink-strong outline-none transition focus:border-[color:var(--color-altus-red)]";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 max-md:grid-cols-1 max-md:gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function Note({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const style =
    tone === "warn"
      ? { background: "#FFEDD5", color: "#431407", boxShadow: "inset 0 0 0 1px #FDBA74" }
      : { background: "#E0E7FF", color: "#1E1B4B", boxShadow: "inset 0 0 0 1px #C7D2FE" };
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-[14px] px-3 py-2 text-[12.5px] font-semibold"
      style={style}
    >
      {tone === "warn" ? <AlertTriangle size={14} className="mt-[2px] shrink-0" /> : null}
      <span>{children}</span>
    </p>
  );
}
