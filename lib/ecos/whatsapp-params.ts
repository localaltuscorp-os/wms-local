/**
 * The WhatsApp message a broadcast sends — one approved Meta template.
 *
 * Meta only delivers PRE-APPROVED templates, so a free-text broadcast cannot go
 * out as written. What goes out is a short notice built on one utility template
 * (named by META_WHATSAPP_BROADCAST_TEMPLATE) with four body variables:
 *
 *   {{1}} who it is from      e.g. "Altus HR"
 *   {{2}} the subject         e.g. "Office closed on Friday"
 *   {{3}} a short summary     the first ~160 characters of the message
 *   {{4}} the link            the full broadcast in the app
 *
 * Suggested template body (register it in Meta Business Manager, category
 * UTILITY):  "New message from {{1}}: *{{2}}*\n\n{{3}}\n\nRead it in full: {{4}}"
 *
 * Meta rejects a variable that contains a newline, a tab, or four spaces in a
 * row, and one that is empty — `cleanTemplateParam` removes all of those.
 *
 * PURE: no I/O.
 */

export const WA_PARAM_LIMITS = { from: 60, title: 80, summary: 160, link: 300 } as const;

/** One template variable, made acceptable to Meta. Never empty. */
export function cleanTemplateParam(value: string | null | undefined, max: number): string {
  const flat = (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (!flat) return "-";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export interface BroadcastWhatsAppParams {
  from: string;
  title: string;
  bodyText: string;
  link: string;
}

/** The `components` payload for the broadcast template. */
export function buildBroadcastTemplateComponents(input: BroadcastWhatsAppParams): unknown[] {
  return [
    {
      type: "body",
      parameters: [
        cleanTemplateParam(input.from, WA_PARAM_LIMITS.from),
        cleanTemplateParam(input.title, WA_PARAM_LIMITS.title),
        cleanTemplateParam(input.bodyText || input.title, WA_PARAM_LIMITS.summary),
        cleanTemplateParam(input.link, WA_PARAM_LIMITS.link),
      ].map((text) => ({ type: "text", text })),
    },
  ];
}

/** What happened to one recipient on the WhatsApp channel (broadcast_recipients.channel_outcomes.whatsapp). */
export type WhatsAppOutcome =
  | { status: "sent"; id: string; at: string }
  | { status: "skipped"; reason: WhatsAppSkipReason; at: string }
  | { status: "failed"; reason: string; at: string };

export type WhatsAppSkipReason = "not_opted_in" | "no_phone" | "not_configured";

const SKIP_REASONS: readonly string[] = ["not_opted_in", "no_phone", "not_configured"];

/** The WhatsApp outcome inside a stored `channel_outcomes` value, or null when absent or unreadable. */
export function whatsappOutcomeOf(outcomes: unknown): WhatsAppOutcome | null {
  if (!outcomes || typeof outcomes !== "object") return null;
  const raw = (outcomes as Record<string, unknown>).whatsapp;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const at = typeof o.at === "string" ? o.at : "";
  if (o.status === "sent" && typeof o.id === "string") return { status: "sent", id: o.id, at };
  if (o.status === "skipped" && typeof o.reason === "string" && SKIP_REASONS.includes(o.reason)) {
    return { status: "skipped", reason: o.reason as WhatsAppSkipReason, at };
  }
  if (o.status === "failed") return { status: "failed", reason: typeof o.reason === "string" ? o.reason : "", at };
  return null;
}
