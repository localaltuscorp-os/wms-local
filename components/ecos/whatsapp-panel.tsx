"use client";

import * as React from "react";
import { MessageCircle, Copy, Check, ExternalLink } from "lucide-react";
import { fireToast } from "@/lib/toast";

/**
 * MANUAL WHATSAPP — send this broadcast on WhatsApp, by hand, in one tap each.
 *
 * WHY MANUAL AND NOT AUTOMATIC. The org's WhatsApp sending goes through the
 * Business API, where every outbound message must match a pre-registered
 * template (lib/whatsapp/templates.ts). A broadcast is free text written five
 * seconds ago, so it can never be one — there is no template to approve it
 * against, and inventing one per announcement is not a thing the API allows.
 *
 * So this does the honest version: it builds the message once, and gives the
 * sender a `wa.me` deep link per recipient that opens WhatsApp with the text
 * already typed. The sender presses send. Nothing is delivered without a human
 * doing it, which is also exactly what "manual WhatsApp" was asked for.
 *
 * People with no number on file are listed separately rather than silently
 * dropped — "I messaged everyone" should not quietly mean "everyone with a
 * phone number in the HR record".
 */

export interface WhatsappTarget {
  employeeId: string;
  name: string;
  phone: string | null;
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
  /** Absolute path to the broadcast, appended so they can open the full thing. */
  link: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [sent, setSent] = React.useState<Set<string>>(new Set());

  const message = React.useMemo(() => {
    const body = bodyText.trim().replace(/\n{3,}/g, "\n\n");
    return [`*${subject}*`, `From: ${from}`, "", body, "", `Full message: ${link}`]
      .join("\n")
      .trim();
  }, [subject, from, bodyText, link]);

  const withPhone = targets.filter((t) => t.phone);
  const withoutPhone = targets.filter((t) => !t.phone);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      fireToast({ message: "Couldn't copy — select the text and copy it manually.", type: "error" });
    }
  };

  // wa.me wants digits only. A stored number may carry +, spaces or dashes.
  const waHref = (phone: string) =>
    `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(message)}`;

  return (
    <section className="rounded-2xl border border-hairline bg-surface-card p-5">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex size-8 items-center justify-center rounded-lg"
          style={{ background: "color-mix(in srgb, #25D366 14%, white)", color: "#128C7E" }}
        >
          <MessageCircle size={16} strokeWidth={2.4} />
        </span>
        <h2 className="text-[15px] font-bold text-ink-strong">Send on WhatsApp</h2>
      </div>
      <p className="mt-1.5 text-[12.5px] font-medium text-ink-muted">
        Opens WhatsApp with this message already written. You press send — nothing goes
        out on its own.
      </p>

      <div className="mt-3 rounded-xl border border-hairline bg-surface-muted p-3">
        <pre className="max-h-[130px] overflow-auto whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink-strong">
          {message}
        </pre>
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink-strong transition hover:border-hairline-strong"
        >
          {copied ? <Check size={13} strokeWidth={3} className="text-emerald-600" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy message"}
        </button>
      </div>

      {withPhone.length > 0 && (
        <ul className="mt-3 max-h-[260px] space-y-1 overflow-y-auto pr-1">
          {withPhone.map((t) => (
            <li
              key={t.employeeId}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 odd:bg-surface-muted"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong" title={t.name}>
                {t.name}
                {sent.has(t.employeeId) && (
                  <span className="ml-1.5 text-[11px] font-bold text-emerald-600">opened</span>
                )}
              </span>
              <a
                href={waHref(t.phone!)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSent((s) => new Set(s).add(t.employeeId))}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110"
                style={{ background: "#25D366" }}
              >
                <ExternalLink size={12} strokeWidth={2.6} /> Send
              </a>
            </li>
          ))}
        </ul>
      )}

      {withoutPhone.length > 0 && (
        <p className="mt-3 rounded-lg border border-hairline bg-surface-muted px-3 py-2 text-[12px] font-medium text-ink-muted">
          <strong className="text-ink-strong">{withoutPhone.length}</strong>{" "}
          {withoutPhone.length === 1 ? "recipient has" : "recipients have"} no phone number on
          file, so there is nobody to open WhatsApp to:{" "}
          {withoutPhone
            .slice(0, 6)
            .map((t) => t.name)
            .join(", ")}
          {withoutPhone.length > 6 ? `, +${withoutPhone.length - 6} more` : ""}.
        </p>
      )}
    </section>
  );
}
