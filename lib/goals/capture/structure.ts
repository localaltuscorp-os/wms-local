import "server-only";
import { z } from "zod";
import type { GoalPeriod } from "@/lib/goals/types";

/**
 * Goal Capture — the ONLY AI in the system.
 *
 * `structureGoals(rawText, ctx)` turns a plain-language brain-dump into
 * validated goal rows via a single OpenAI-compatible chat-completion call
 * (default: OpenRouter free, model `moonshotai/kimi-k2:free`). The endpoint is
 * env-configured, so swapping to Kimi-direct / Gemini / a LOCAL Ollama box is a
 * config change, not a code change.
 *
 * Robustness: free models don't always honour `response_format` strictly, so we
 * (a) request json_schema, (b) also instruct JSON-only in the prompt, and
 * (c) parse defensively + re-validate with zod here. Zod is the real guardrail.
 */

const BASE_URL = process.env.GOAL_CAPTURE_BASE_URL || "https://openrouter.ai/api/v1";
// Free OpenRouter models come and go (a slug can vanish or rate-limit upstream),
// so we try a list in order and use the first that returns valid rows. Override
// with GOAL_CAPTURE_MODEL (comma-separated) — e.g. a paid model or a local one.
const MODELS = (
  process.env.GOAL_CAPTURE_MODEL ||
  "nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-20b:free,nvidia/nemotron-3-nano-30b-a3b:free"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_ROWS = 25;

export interface CaptureContext {
  fyStartYear: number;
  /** When capturing FROM a board, its level+period bucket every row lands in. */
  level?: GoalPeriod;
  periodKey?: string;
  /** Grounding lists so the model reuses real options (free-text, so soft). */
  areas: string[];
  measures: string[];
  types: string[];
}

export interface CapturedRow {
  title: string;
  area: string | null;
  uom: string | null;
  targetQty: number | null;
  actualQty: number | null;
  category: string | null;
  period: GoalPeriod;
  periodKey: string;
}

export type StructureResult =
  | { ok: true; rows: CapturedRow[]; model: string }
  | { ok: false; error: string };

/** Loose shape the model returns — normalised/clamped below. */
const RawRow = z.object({
  title: z.string().trim().min(1).max(400),
  area: z.union([z.string(), z.null()]).optional(),
  uom: z.union([z.string(), z.null()]).optional(),
  target: z.union([z.number(), z.string(), z.null()]).optional(),
  actual: z.union([z.number(), z.string(), z.null()]).optional(),
  type: z.union([z.string(), z.null()]).optional(),
  period: z.union([z.string(), z.null()]).optional(),
  periodKey: z.union([z.string(), z.null()]).optional(),
});

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Resolve a row's (period, periodKey) — board context wins; else the model's
 *  guess, clamped; else current-FY Year. */
function resolvePeriod(
  ctx: CaptureContext,
  rawPeriod: unknown,
  rawKey: unknown,
): { period: GoalPeriod; periodKey: string } {
  if (ctx.level && ctx.periodKey) return { period: ctx.level, periodKey: ctx.periodKey };
  const p = String(rawPeriod ?? "").toLowerCase();
  const key = String(rawKey ?? "").trim();
  const fy = String(ctx.fyStartYear);
  if (p === "quarter" && /^\d{4}-q[1-4]$/i.test(key)) return { period: "quarter", periodKey: key.toUpperCase() };
  if (p === "month" && /^\d{4}-\d{2}$/.test(key)) return { period: "month", periodKey: key };
  if (p === "year" && /^\d{4}$/.test(key)) return { period: "year", periodKey: key };
  // Unparseable / unstated → current-FY Year.
  return { period: "year", periodKey: fy };
}

function systemPrompt(ctx: CaptureContext): string {
  const bucketNote = ctx.level && ctx.periodKey
    ? `All goals belong to the ${ctx.level} bucket "${ctx.periodKey}". Do NOT change period/periodKey.`
    : `Infer period per goal from the words: "this year"→period "year", periodKey "${ctx.fyStartYear}"; "Q1".."Q4"→period "quarter", periodKey "${ctx.fyStartYear}-Q1"; a month→period "month", periodKey "YYYY-MM". If unstated, use period "year", periodKey "${ctx.fyStartYear}".`;
  return [
    "You convert a person's plain-language description of their work goals into structured rows.",
    "Return ONLY a JSON object: {\"goals\":[ ...rows ]}. No prose, no markdown fences.",
    "Each row: {title, area, uom, target, actual, type, period, periodKey}.",
    "- title: the goal, one line, required.",
    `- area: the focus pillar. Prefer one of: ${ctx.areas.join(", ")}. If none fit, use the best short label.`,
    `- uom: unit of measure. Prefer one of: ${ctx.measures.join(", ")}.`,
    "- target/actual: numbers only (or null). actual defaults 0.",
    `- type: prefer one of: ${ctx.types.join(", ")} (or null).`,
    bucketNote,
    "Split multiple goals into separate rows. Do not invent goals that were not mentioned.",
    `Return at most ${MAX_ROWS} rows.`,
  ].join("\n");
}

/** Pull the first JSON object/array out of a model reply (handles fences/prose). */
function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function structureGoals(
  rawText: string,
  ctx: CaptureContext,
): Promise<StructureResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, error: "Goal Capture isn't configured." };
  const text = rawText.trim();
  if (!text) return { ok: false, error: "Nothing to capture — say or type your goals." };

  let lastErr = "The AI didn't return any goals — try rephrasing.";

  for (const model of MODELS) {
    let content: string;
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://altuscorp.in",
          "X-Title": "Altus Goal Capture",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 2000,
          messages: [
            { role: "system", content: systemPrompt(ctx) },
            { role: "user", content: text.slice(0, 6000) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastErr = `AI unavailable (${res.status}).`;
        // Model gone / rate-limited / upstream error → fall through to the next.
        if ([404, 408, 429, 500, 502, 503, 524].includes(res.status)) continue;
        return { ok: false, error: `${lastErr} ${body.slice(0, 100)}` };
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      content = data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = `Couldn't reach the AI: ${(err as Error).message ?? "network error"}`;
      continue;
    }

    const parsed = extractJson(content);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { goals?: unknown } | null)?.goals)
        ? (parsed as { goals: unknown[] }).goals
        : null;
    if (!arr) {
      lastErr = "The AI didn't return any goals — try rephrasing.";
      continue;
    }

    const rows: CapturedRow[] = [];
    for (const item of arr.slice(0, MAX_ROWS)) {
      const r = RawRow.safeParse(item);
      if (!r.success) continue;
      const { period, periodKey } = resolvePeriod(ctx, r.data.period, r.data.periodKey);
      rows.push({
        title: r.data.title.trim().slice(0, 400),
        area: str(r.data.area, 160),
        uom: str(r.data.uom, 80),
        targetQty: num(r.data.target),
        actualQty: num(r.data.actual),
        category: str(r.data.type, 60),
        period,
        periodKey,
      });
    }
    if (rows.length === 0) {
      lastErr = "Couldn't find any goals in that — try rephrasing.";
      continue;
    }
    return { ok: true, rows, model };
  }

  return { ok: false, error: lastErr };
}
