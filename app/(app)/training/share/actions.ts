"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db, tcShares, tcShareFeedback } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { currentWeekStart } from "@/lib/weekly-goals/week";

const PATH = "/training/share";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SHARE_MIN_MINUTES = 10; // 10 min compulsory (spec §3)

const SaveShareSchema = z.object({
  topic: z.string().trim().min(1, "Add a topic.").max(200),
  minutes: z.coerce.number().int().min(SHARE_MIN_MINUTES, `The Share must be at least ${SHARE_MIN_MINUTES} minutes.`).max(180),
  videoUrl: z
    .string()
    .trim()
    .max(2000)
    .url("Enter a valid video link.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Upsert the signed-in employee's Share for the CURRENT ISO week (Monday IST). */
export async function saveShare(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SaveShareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  const weekStart = currentWeekStart();
  try {
    const [row] = await db
      .insert(tcShares)
      .values({
        employeeId: me.id,
        weekStart,
        topic: d.topic,
        minutes: d.minutes,
        videoUrl: d.videoUrl ? d.videoUrl : null,
        notes: d.notes ? d.notes : null,
      })
      .onConflictDoUpdate({
        target: [tcShares.employeeId, tcShares.weekStart],
        set: {
          topic: d.topic,
          minutes: d.minutes,
          videoUrl: d.videoUrl ? d.videoUrl : null,
          notes: d.notes ? d.notes : null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: tcShares.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const RateShareSchema = z.object({
  rating: z.coerce.number().int().min(1, "Pick a rating 1–5.").max(5),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Give (or revise) 1–5 peer feedback on a colleague's Share. One rating per
 *  rater per Share; you cannot rate your own Share. */
export async function rateShare(shareId: string, input: unknown): Promise<Result> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(shareId)) return { ok: false, error: "Invalid Share." };
  const parsed = RateShareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid feedback." };
  const d = parsed.data;
  try {
    // Block rating your own Share (defense-in-depth — the feed already excludes it).
    const [own] = await db
      .select({ id: tcShares.id })
      .from(tcShares)
      .where(and(eq(tcShares.id, shareId), ne(tcShares.employeeId, me.id)))
      .limit(1);
    if (!own) return { ok: false, error: "You can only rate a colleague's Share." };

    await db
      .insert(tcShareFeedback)
      .values({ shareId, raterId: me.id, rating: d.rating, comment: d.comment ? d.comment : null })
      .onConflictDoUpdate({
        target: [tcShareFeedback.shareId, tcShareFeedback.raterId],
        set: { rating: d.rating, comment: d.comment ? d.comment : null },
      });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
