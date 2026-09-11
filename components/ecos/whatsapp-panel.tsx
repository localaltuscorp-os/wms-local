"use client";

import * as React from "react";
import { Check, Copy, MessageCircle, PhoneOff } from "lucide-react";
import { whatsappShareUrl } from "@/lib/reports/section-report";

/**
 * MANUAL WHATSAPP — one send link per recipient.
 *
 * "WhatsApp" is a DELIVERY CHANNEL the sender can tick on a broadcast, but the
 * app has no automated WhatsApp transport for broadcasts: `whatsapp_manual` is
 * exactly what its name says, a channel that a human completes. This panel is
 * that human's tool — it turns the recipient list into pre-filled
 * `api.whatsapp.com/send` links so the sender does not retype the message once
 * per person, or worse, paste a different wording each time.
 *
 * ── WHY IT IS NOT A BULK SEND ──────────────────────────────────────────────
 * There is no "send to everyone" button, because there is nothing to press it
 * against: each link opens WhatsApp with the message pre-filled and the SENDER
 * still presses send. That is a deliberate limit of the manual channel, not a
 * missing feature — the app never holds a WhatsApp session and so can never
 * claim a message was delivered when it was not. `deliveredChannels` is stamped
 * elsewhere, by the sender marking it, for the same reason.
 *
 * ── PHONE NUMBERS ──────────────────────────────────────────────────────────
 * `phone` is already resolved upstream (lib/ecos/queries.ts) to the opted-in
 * WhatsApp number, falling back to the employee's phone, and is null when
 * neither exists. People without a number are listed SEPARATELY rather than
 * hidden: a sender who thinks the panel covers the whole audience would other-
 * wise quietly miss them. The parent only renders this panel when the sender
 * actually ticked the channel, so the roster of numbers is never on screen by
 * default.
 */

export interface WhatsappTarget {
  employeeId: string;
  name: string;
  phone: string | null;
}

/**
 * The one wording every link carries. Kept in a single function so the copy
 * button and the per-person links can never drift apart — the failure mode
 * being a sender who copies one text and sends another.
 *
 * `link` arrives as an app-relative path; it is made absolute against the
 * CURRENT origin at click time rather than from an env var, so a message sent
 * from staging points at staging and one sent from production points at
 * production.
 */
function composeMessage(args: {
  subject: string;
  from: string;
  bodyText: string;
  link: string;
}): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = args.link.startsWith("http") ? args.link : `${origin}${args.link}`;
  return [`*${args.subject}*`, "", args.bodyText.trim(), "", `From: ${args.from}`, url]
    .join("\n")
    .trim();
}

export function WhatsappPanel({
  targets,
  subject,
  from,
  bodyText,
  link,
}: {
  targets: WhatsappTarget[];
  subject: string;
  from: string;
  bodyText: string;
  link: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const withPhone = React.useMemo(
    () => targets.filter((t) => (t.phone ?? "").trim().length > 0),
    [targets],
  );
  const withoutPhone = React.useMemo(
    () => targets.filter((t) => (t.phone ?? "").trim().length === 0),
    [targets],
  );

  // Built on demand, not in render: `composeMessage` reads window.location, and
  // doing that during render would differ between the server pass and hydration.
  const message = React.useCallback(
    () => composeMessage({ subject, from, bodyText, link }),
    [subject, from, bodyText, link],
  );

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and fails on insecure origins. The links
      // below still work, so a failed copy is not worth an error dialog.
      setCopied(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink-strong">
            WhatsApp — send manually
          </h3>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {withPhone.length} of {targets.length} recipients have a number. Each link opens
            WhatsApp with the message ready; you still press send.
          </p>
        </div>
        <button
          type="button"
          onClick={copyMessage}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-[12px] font-bold text-ink-strong hover:bg-surface-soft"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy message"}
        </button>
      </header>

      {withPhone.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {withPhone.map((t) => (
            <li key={t.employeeId}>
              <a
                href={whatsappShareUrl(t.phone as string, message())}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-input border border-line px-3 py-2 hover:bg-surface-soft"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-strong">
                    {t.name}
                  </span>
                  <span className="block truncate text-[11px] tabular-nums text-ink-soft">
                    {t.phone}
                  </span>
                </span>
                <MessageCircle size={16} className="shrink-0 text-ink-soft" aria-hidden />
                <span className="sr-only">Send to {t.name} on WhatsApp</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {withoutPhone.length > 0 && (
        <div className="mt-3 rounded-input border border-line bg-surface-soft px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
            <PhoneOff size={13} aria-hidden />
            No number on file — reach these {withoutPhone.length} another way
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {withoutPhone.map((t) => t.name).join(", ")}
          </p>
        </div>
      )}
    </section>
  );
}
