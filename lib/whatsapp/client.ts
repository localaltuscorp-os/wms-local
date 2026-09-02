import "server-only";

/**
 * Thin Meta Cloud-API client for WhatsApp templated outbound messages.
 *
 * - Env vars are read AT CALL TIME (`process.env.META_WHATSAPP_*` inside
 *   `sendTemplate`), not at module load. Missing env collapses silently
 *   to `{ ok: false, error: "META_WHATSAPP_* not set" }` so a bare-env
 *   dev environment can still run the rest of the dispatcher.
 * - Network errors are caught and translated to `{ ok: false, error }`;
 *   this function never throws.
 */

export interface SendTemplateInput {
  toPhone: string;
  templateName: string;
  languageCode?: string;
  components: unknown[];
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendTemplate(
  input: SendTemplateInput,
): Promise<SendResult> {
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) {
    return { ok: false, error: "META_WHATSAPP_* not set" };
  }
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.toPhone,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode ?? "en" },
          components: input.components,
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (res.ok && json.messages?.[0]?.id) {
      return { ok: true, id: json.messages[0].id };
    }
    return {
      ok: false,
      error: json.error?.message ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
