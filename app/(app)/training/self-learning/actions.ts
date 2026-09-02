"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tcSelfLearning } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";

const PATH = "/training/self-learning";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LogSchema = z.object({
  kind: z.enum(["book", "video", "youtube", "other"]),
  title: z.string().trim().min(1, "Add a title.").max(200),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .url("Enter a valid link.")
    .optional()
    .or(z.literal("")),
  minutes: z.coerce.number().int().min(1, "Log at least 1 minute.").max(1440),
  // Evidence is required (a link or an uploaded file URL).
  evidenceUrl: z.string().trim().min(1, "Evidence is required.").max(2000).url("Enter a valid evidence link."),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  learnDate: z.string().regex(DATE_RE, "Pick a date."),
});

/** Log a self-learning entry for the signed-in employee (own rows only). */
export async function logSelfLearning(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = LogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  try {
    const [row] = await db
      .insert(tcSelfLearning)
      .values({
        employeeId: me.id,
        learnDate: d.learnDate,
        kind: d.kind,
        title: d.title,
        sourceUrl: d.sourceUrl ? d.sourceUrl : null,
        minutes: d.minutes,
        evidenceUrl: d.evidenceUrl,
        notes: d.notes ? d.notes : null,
      })
      .returning({ id: tcSelfLearning.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Delete one of the signed-in employee's own self-learning entries. */
export async function deleteSelfLearning(id: string): Promise<Result> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(id)) return { ok: false, error: "Invalid entry." };
  try {
    await db
      .delete(tcSelfLearning)
      .where(and(eq(tcSelfLearning.id, id), eq(tcSelfLearning.employeeId, me.id)));
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
