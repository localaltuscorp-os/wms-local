import "server-only";
import { sendTemplate } from "@/lib/whatsapp/client";
import {
  buildTemplateComponents,
  templateNameForKind,
} from "@/lib/whatsapp/templates";
import type { NotificationKind } from "@/db/schema";
import type { RecipientChannelPrefs } from "@/lib/notifications/channel-prefs";

/**
 * M4 Commit 3b — real WhatsApp dispatch, replacing the Commit 2 stub.
 *
 * Contract (mirrors the dispatcher's `ChannelOutcome`):
 *   - `"sent"` — Meta Cloud API acknowledged the templated send.
 *   - `"skip"` — recipient opted out, no phone on file, or the send
 *                returned `{ ok: false }` (missing env / 4xx / network).
 *
 * `sendTemplate` itself never throws (it converts errors to a
 * `{ ok: false }` outcome), so this function is safe to call from the
 * dispatcher's `Promise.allSettled` fan-out.
 */
export interface WhatsAppDispatchCtx {
  kind: NotificationKind;
  actorName: string;
  taskSubject: string;
  body?: string;
  shortId: string;
  digestCount?: number;
  digestPreview?: string;
  // M5.1 — admin-resolved status label forwarded into the template
  // builder; preferred over the raw row.body JSON for status_changed.
  statusLabel?: string;
}

export async function sendWhatsApp(
  recipient: RecipientChannelPrefs,
  ctx: WhatsAppDispatchCtx,
): Promise<"sent" | "skip"> {
  if (!recipient.whatsappOptedIn || !recipient.whatsappPhone) return "skip";
  const r = await sendTemplate({
    toPhone: recipient.whatsappPhone,
    templateName: templateNameForKind(ctx.kind),
    languageCode: recipient.whatsappTemplateLocale ?? "en",
    components: buildTemplateComponents(ctx.kind, ctx),
  });
  return r.ok ? "sent" : "skip";
}

/**
 * Daily-digest variant.  Fires the `vp_overdue_digest` utility template
 * with `{count, preview}` parameters.  Used by
 * `app/api/cron/digest/route.ts` alongside the email + Slack arms.
 *
 * Mirrors the Slack equivalent's contract: returns "sent" | "skip" and
 * never throws — failures collapse to "skip" via the underlying
 * `sendTemplate`.
 */
export async function sendWhatsAppDigest(
  recipient: RecipientChannelPrefs,
  overdueTasks: { subject: string; daysOverdue: number }[],
): Promise<"sent" | "skip"> {
  if (!recipient.whatsappOptedIn || !recipient.whatsappPhone) return "skip";
  const preview = overdueTasks
    .slice(0, 3)
    .map((t) => t.subject)
    .join(", ");
  const r = await sendTemplate({
    toPhone: recipient.whatsappPhone,
    templateName: "vp_overdue_digest",
    languageCode: recipient.whatsappTemplateLocale ?? "en",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: String(overdueTasks.length) },
          { type: "text", text: preview },
        ],
      },
    ],
  });
  return r.ok ? "sent" : "skip";
}
