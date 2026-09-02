import "server-only";

/**
 * Enterprise Communications (ECOS, migration 0179) — AI compose assistant.
 *
 * Reuses the SAME OpenRouter chat-completions pattern as Goal Capture
 * (lib/goals/capture/structure.ts): an OpenAI-compatible endpoint (default
 * OpenRouter) with a model fallback list, gated on `OPENROUTER_API_KEY`. Unlike
 * Goal Capture we want free-form prose back (not JSON), so we return the raw
 * assistant text. Degrades gracefully with a clear error when the key is unset.
 *
 * Config (shared env with Goal Capture so one key powers both):
 *   OPENROUTER_API_KEY      — required; absent → { ok:false } with a clear message.
 *   GOAL_CAPTURE_BASE_URL   — OpenAI-compatible base (default OpenRouter).
 *   ECOS_AI_MODEL           — comma-separated model fallback list (optional).
 */

const BASE_URL = process.env.GOAL_CAPTURE_BASE_URL || "https://openrouter.ai/api/v1";
const MODELS = (
  process.env.ECOS_AI_MODEL ||
  process.env.GOAL_CAPTURE_MODEL ||
  "nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-20b:free,nvidia/nemotron-3-nano-30b-a3b:free"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export type ComposeAction = "generate" | "rewrite" | "translate" | "summarize";

export interface ComposeInput {
  action: ComposeAction;
  /** The existing draft text to rewrite/translate/summarize (plain text). */
  text?: string;
  /** Free-form instruction / topic (for generate, or extra steering). */
  prompt?: string;
  /** Target language name for translate (e.g. "Hindi", "Marathi"). */
  language?: string;
}

export type ComposeResult = { ok: true; text: string } | { ok: false; error: string };

function systemFor(action: ComposeAction): string {
  const base =
    "You are an assistant that writes clear, professional INTERNAL company communications for an Indian corporate team (Altus Corp). Keep a warm but formal tone. Return ONLY the message body as plain text — no preamble, no markdown fences, no quotes around the whole thing, no sign-off unless asked.";
  switch (action) {
    case "generate":
      return `${base} Draft a complete announcement from the user's brief. Use short paragraphs; a heading is not needed.`;
    case "rewrite":
      return `${base} Rewrite the user's draft to be clearer and more polished, preserving its meaning and every concrete fact (dates, names, amounts).`;
    case "translate":
      return `${base} Translate the user's message into the requested language, preserving meaning, tone, and all concrete facts. Return only the translation.`;
    case "summarize":
      return `${base} Summarize the user's message into a few crisp sentences suitable as a preview / TL;DR.`;
  }
}

function userFor(input: ComposeInput): string {
  const text = (input.text ?? "").trim().slice(0, 8000);
  const prompt = (input.prompt ?? "").trim().slice(0, 2000);
  switch (input.action) {
    case "generate":
      return prompt || text || "Write a short company announcement.";
    case "rewrite":
      return `${prompt ? `Instruction: ${prompt}\n\n` : ""}Draft to rewrite:\n${text}`;
    case "translate":
      return `Target language: ${input.language || "Hindi"}\n\nMessage:\n${text}`;
    case "summarize":
      return `Message to summarize:\n${text}`;
  }
}

/**
 * Runs the compose assistant. Best-effort with a model fallback list; returns a
 * clear error (never throws) so the calling Server Action can surface it.
 */
export async function composeWithAI(input: ComposeInput): Promise<ComposeResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return { ok: false, error: "The AI assistant isn't configured. Ask an admin to add an OPENROUTER_API_KEY." };
  }

  const needsText = input.action !== "generate";
  if (needsText && !(input.text ?? "").trim()) {
    return { ok: false, error: "There's nothing to work with yet — write some text first." };
  }
  if (input.action === "generate" && !(input.prompt ?? "").trim() && !(input.text ?? "").trim()) {
    return { ok: false, error: "Tell the assistant what to write about." };
  }

  let lastErr = "The assistant didn't return anything — try again.";

  for (const model of MODELS) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://altuscorp.in",
          "X-Title": "Altus Communications Assistant",
        },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          max_tokens: 1500,
          messages: [
            { role: "system", content: systemFor(input.action) },
            { role: "user", content: userFor(input) },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastErr = `AI unavailable (${res.status}).`;
        // Transient / model-gone → try the next model in the list.
        if ([404, 408, 429, 500, 502, 503, 524].includes(res.status)) continue;
        return { ok: false, error: `${lastErr} ${body.slice(0, 120)}`.trim() };
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!content) {
        lastErr = "The assistant returned an empty reply — try rephrasing.";
        continue;
      }
      // Strip stray code fences the model may wrap around prose.
      const cleaned = content.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      return { ok: true, text: cleaned };
    } catch (err) {
      lastErr = `Couldn't reach the AI: ${(err as Error).message ?? "network error"}`;
      continue;
    }
  }

  return { ok: false, error: lastErr };
}
