import "server-only";
import { sendTemplate } from "@/lib/whatsapp/client";
import {
  buildBroadcastTemplateComponents,
  type BroadcastWhatsAppParams,
  type WhatsAppOutcome,
} from "@/lib/ecos/whatsapp-params";

/**
 * THE AUTOMATIC WHATSAPP CHANNEL — one broadcast to one person.
 *
 * Sends the approved broadcast template (META_WHATSAPP_BROADCAST_TEMPLATE, see
 * lib/ecos/whatsapp-params) through the existing Meta Cloud API client, and says
 * exactly what happened so the sender can see it on the broadcast page:
 *
 *   sent                     Meta accepted it (id = the message id).
 *   skipped / not_opted_in   the employee has not opted in to WhatsApp.
 *   skipped / no_phone       opted in, but no WhatsApp number on file.
 *   skipped / not_configured the template or Meta credentials are not set —
 *                            always the case in dummy mode and local dev.
 *   failed                   Meta refused it; the reason is Meta's message.
 *
 * Never throws (sendTemplate converts every error into a result).
 */
export async function sendBroadcastWhatsApp(
  recipient: {
    whatsappOptedIn: boolean;
    whatsappPhone: string | null;
    whatsappTemplateLocale: string | null;
  },
  message: BroadcastWhatsAppParams,
): Promise<WhatsAppOutcome> {
  const at = new Date().toISOString();
  if (!recipient.whatsappOptedIn) return { status: "skipped", reason: "not_opted_in", at };
  const phone = recipient.whatsappPhone?.trim();
  if (!phone) return { status: "skipped", reason: "no_phone", at };

  const templateName = process.env.META_WHATSAPP_BROADCAST_TEMPLATE?.trim();
  if (!templateName || !process.env.META_WHATSAPP_ACCESS_TOKEN || !process.env.META_WHATSAPP_PHONE_NUMBER_ID) {
    return { status: "skipped", reason: "not_configured", at };
  }

  const res = await sendTemplate({
    toPhone: phone,
    templateName,
    languageCode: recipient.whatsappTemplateLocale || "en",
    components: buildBroadcastTemplateComponents(message),
  });
  return res.ok
    ? { status: "sent", id: res.id, at }
    : { status: "failed", reason: res.error.slice(0, 300), at };
}
