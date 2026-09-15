"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { recruitmentJdSends, recruitmentJds } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  effectiveRecruiterJd,
  isJdBlank,
  isValidEmail,
  normalizeJdContent,
  normalizeWhatsAppPhone,
  sameJdContent,
} from "@/lib/hr/recruitment-jd";
import { loadJdForPosition } from "@/lib/queries/recruitment-jd";
import { sendRecruitmentJdEmail } from "@/lib/email/recruitment-jd-email";

/**
 * Recruitment JDs — HR staff only (lib/hr/access.ts), like the rest of hiring.
 *
 * The master changes only through `saveRecruitmentJd({ which: "master" })`,
 * which the page reaches through a separate, confirmed "Edit master" step.
 * Recruiters edit their copy; saving a copy identical to the master stores
 * nothing (null), so later master updates keep flowing through to it.
 */

const PATH = "/hr/recruitment-jd";
type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_SET_UP = "Recruitment JDs aren't set up yet — migration 0232 must be applied first.";

function failFrom(err: unknown): { ok: false; error: string } {
  const code = (v: unknown) => (typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined);
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  if (code(err) === "42P01" || code(cause) === "42P01") return { ok: false, error: NOT_SET_UP };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

async function guard() {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  return { me, limited };
}

const SaveInput = z.object({
  positionId: z.string().uuid(),
  which: z.enum(["master", "recruiter"]),
  content: z.record(z.string(), z.unknown()),
});

export async function saveRecruitmentJd(input: unknown): Promise<Result> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid JD." };
  const { positionId, which } = parsed.data;

  try {
    const loaded = await loadJdForPosition(positionId);
    if (!loaded) return { ok: false, error: "That position no longer exists." };
    const content = normalizeJdContent(parsed.data.content, loaded.position.label);
    const now = new Date();

    if (which === "master") {
      await db
        .insert(recruitmentJds)
        .values({ positionId, masterContent: content, masterUpdatedById: me.id, masterUpdatedAt: now })
        .onConflictDoUpdate({
          target: recruitmentJds.positionId,
          set: { masterContent: content, masterUpdatedById: me.id, masterUpdatedAt: now, updatedAt: now },
        });
    } else {
      // Identical to the master = no separate copy, so master edits keep reaching it.
      const recruiterContent = sameJdContent(content, loaded.master) ? null : content;
      await db
        .insert(recruitmentJds)
        .values({ positionId, recruiterContent, recruiterUpdatedById: me.id, recruiterUpdatedAt: now })
        .onConflictDoUpdate({
          target: recruitmentJds.positionId,
          set: { recruiterContent, recruiterUpdatedById: me.id, recruiterUpdatedAt: now, updatedAt: now },
        });
    }
  } catch (err) {
    return failFrom(err);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Throw away the recruiter copy — recruiters send the master again. */
export async function resetRecruitmentJd(input: unknown): Promise<Result> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = z.object({ positionId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await db
      .update(recruitmentJds)
      .set({ recruiterContent: null, recruiterUpdatedById: me.id, recruiterUpdatedAt: new Date(), updatedAt: new Date() })
      .where(sql`${recruitmentJds.positionId} = ${parsed.data.positionId}`);
  } catch (err) {
    return failFrom(err);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** The JD a send uses, or a refusal. */
async function jdToSend(positionId: string) {
  const loaded = await loadJdForPosition(positionId);
  if (!loaded) return { ok: false as const, error: "That position no longer exists." };
  const content = effectiveRecruiterJd(loaded.master, loaded.recruiter);
  if (!content || isJdBlank(content)) return { ok: false as const, error: "This position has no JD written yet." };
  return { ok: true as const, loaded, content };
}

const WhatsAppInput = z.object({
  positionId: z.string().uuid(),
  recipientName: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Record a WhatsApp send. The page opens WhatsApp itself (a popup must come
 * from the click); this writes the log line — what was sent, to whom, by whom.
 */
export async function logRecruitmentJdWhatsApp(input: unknown): Promise<Result> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = WhatsAppInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const found = await jdToSend(parsed.data.positionId);
    if (!found.ok) return found;
    await db.insert(recruitmentJdSends).values({
      jdId: found.loaded.jd?.id ?? null,
      positionLabel: found.loaded.position.label,
      channel: "whatsapp",
      recipientName: parsed.data.recipientName || null,
      recipientPhone: normalizeWhatsAppPhone(parsed.data.phone) ?? (parsed.data.phone || null),
      content: found.content,
      status: "opened",
      sentById: me.id,
    });
  } catch (err) {
    return failFrom(err);
  }
  revalidatePath(PATH);
  return { ok: true };
}

const EmailInput = z.object({
  positionId: z.string().uuid(),
  to: z.string().trim().max(320),
  recipientName: z.string().trim().max(200).optional(),
  note: z.string().max(4000).optional(),
});

export async function sendRecruitmentJdByEmail(input: unknown): Promise<Result> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = EmailInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  if (!isValidEmail(parsed.data.to)) return { ok: false, error: "Enter a valid email address." };

  try {
    const found = await jdToSend(parsed.data.positionId);
    if (!found.ok) return found;
    const res = await sendRecruitmentJdEmail({
      to: parsed.data.to,
      recipientName: parsed.data.recipientName,
      note: parsed.data.note,
      content: found.content,
    });
    await db.insert(recruitmentJdSends).values({
      jdId: found.loaded.jd?.id ?? null,
      positionLabel: found.loaded.position.label,
      channel: "email",
      recipientName: parsed.data.recipientName || null,
      recipientEmail: parsed.data.to,
      content: found.content,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : res.error,
      sentById: me.id,
    });
    revalidatePath(PATH);
    return res.ok ? { ok: true } : { ok: false, error: `Email not sent: ${res.error}` };
  } catch (err) {
    return failFrom(err);
  }
}
