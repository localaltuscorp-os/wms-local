import "server-only";

/**
 * Meta Cloud-API **media** client for WhatsApp — the document/image sender the
 * text-only `lib/whatsapp/client.ts` doesn't cover.
 *
 * Two-step model (per Meta):
 *   1. `uploadMedia(buffer, mime)` → `POST /<PHONE_ID>/media` (multipart) → a
 *      short-lived `mediaId`.
 *   2. Send it: `sendDocument` / `sendImage` (`type:'document'|'image'`) inside
 *      an OPEN 24-h customer-service window, OR `sendDocumentTemplate`
 *      (`type:'template'` with a document header) to reach a user PROACTIVELY
 *      outside the 24-h window — which requires a pre-approved Utility template.
 *
 * Same conventions as `client.ts`:
 *  - Env (`META_WHATSAPP_PHONE_NUMBER_ID` / `META_WHATSAPP_ACCESS_TOKEN`) is read
 *    AT CALL TIME; missing env collapses to `{ ok: false, error }`.
 *  - Network / HTTP errors are caught and translated — these functions
 *    NEVER throw, so they're safe inside a freeze action or `Promise.allSettled`.
 */

const GRAPH_VERSION = "v21.0";

export type MediaResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function creds():
  | { ok: true; phoneId: string; token: string }
  | { ok: false; error: string } {
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return { ok: false, error: "META_WHATSAPP_* not set" };
  return { ok: true, phoneId, token };
}

/** POST a JSON message body to /<PHONE_ID>/messages, normalising the outcome. */
async function postMessage(
  phoneId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<MediaResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (res.ok && json.messages?.[0]?.id) return { ok: true, id: json.messages[0].id };
    return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function filenameForMime(mime: string): string {
  if (mime.includes("pdf")) return "upload.pdf";
  if (mime.includes("png")) return "upload.png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "upload.jpg";
  return "upload.bin";
}

/**
 * Upload a media buffer (PDF, JPG, PNG…) to Meta and get back a `mediaId` for a
 * later document/image send. Multipart via the global `FormData`/`Blob`
 * (undici) — the boundary is set by `fetch`.
 */
export async function uploadMedia(buffer: Buffer, mime: string): Promise<MediaResult> {
  const c = creds();
  if (!c.ok) return c;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${c.phoneId}/media`;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    // Uint8Array copy so the Blob owns a plain ArrayBuffer (not a Node Buffer view).
    const blob = new Blob([new Uint8Array(buffer)], { type: mime });
    form.append("file", blob, filenameForMime(mime));
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}` },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: { message?: string };
    };
    if (res.ok && json.id) return { ok: true, id: json.id };
    return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface SendDocumentInput {
  toPhone: string;
  mediaId: string;
  filename: string;
  caption?: string;
}

/** Send a previously-uploaded document. Works only inside an open 24-h window. */
export async function sendDocument(input: SendDocumentInput): Promise<MediaResult> {
  const c = creds();
  if (!c.ok) return c;
  return postMessage(c.phoneId, c.token, {
    to: input.toPhone,
    type: "document",
    document: {
      id: input.mediaId,
      filename: input.filename,
      ...(input.caption ? { caption: input.caption } : {}),
    },
  });
}

export interface SendImageInput {
  toPhone: string;
  mediaId: string;
  caption?: string;
}

/** Send a previously-uploaded image. Works only inside an open 24-h window. */
export async function sendImage(input: SendImageInput): Promise<MediaResult> {
  const c = creds();
  if (!c.ok) return c;
  return postMessage(c.phoneId, c.token, {
    to: input.toPhone,
    type: "image",
    image: {
      id: input.mediaId,
      ...(input.caption ? { caption: input.caption } : {}),
    },
  });
}

export interface SendDocumentTemplateInput {
  toPhone: string;
  templateName: string;
  mediaId: string;
  /** Optional filename shown in the document header. */
  filename?: string;
  languageCode?: string;
  /** Ordered body-placeholder values ({{1}}, {{2}}, …). */
  params?: string[];
}

/**
 * PROACTIVE (out-of-24-h-window) send of a document via a **pre-approved Utility
 * template with a document header**. The uploaded `mediaId` fills the header;
 * `params` fill the body placeholders. This is the only compliant way to push a
 * PDF to someone who hasn't messaged the business in the last 24 h.
 */
export async function sendDocumentTemplate(
  input: SendDocumentTemplateInput,
): Promise<MediaResult> {
  const c = creds();
  if (!c.ok) return c;
  const components: Record<string, unknown>[] = [
    {
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            id: input.mediaId,
            ...(input.filename ? { filename: input.filename } : {}),
          },
        },
      ],
    },
  ];
  if (input.params && input.params.length > 0) {
    components.push({
      type: "body",
      parameters: input.params.map((text) => ({ type: "text", text })),
    });
  }
  return postMessage(c.phoneId, c.token, {
    to: input.toPhone,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode ?? "en" },
      components,
    },
  });
}
