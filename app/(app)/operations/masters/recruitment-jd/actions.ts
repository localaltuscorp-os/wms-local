"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { recruitmentJdSends, recruitmentJds } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  effectiveRecruiterJd,
  emptyJdContent,
  isJdBlank,
  isValidEmail,
  normalizeJdContent,
  normalizeWhatsAppPhone,
  sameJdContent,
  slugify,
} from "@/lib/operations/recruitment-jd";
import { RECRUITMENT_JD_SEED_BY_SLUG } from "@/lib/operations/recruitment-jd-seed";
import {
  isMissingRecruitmentJdTable,
  loadJdBySlug,
  nextRecruitmentJdSortOrder,
} from "@/lib/queries/recruitment-jd";
import { sendRecruitmentJdEmail } from "@/lib/email/recruitment-jd-email";

/**
 * Recruitment JDs — the page is open to the Operations room, but every WRITE
 * here is HR staff only (lib/hr/access.ts), exactly as the neighbouring Job
 * Description master does it: everyone may read a JD we are hiring against;
 * only recruiters change one or send it to a candidate.
 *
 * ── THE MASTER AND THE COPY ────────────────────────────────────────────────
 * The MASTER is the original — Rutvisha's JD. Recruiters edit their own COPY
 * and send that; saving a copy identical to the master stores nothing (null), so
 * later master edits keep flowing through until somebody genuinely diverges.
 * "Reset to master" drops the copy; "Restore the original" puts the master back
 * to the text shipped in lib/operations/recruitment-jd-seed.ts.
 *
 * Roles are addressed by SLUG, not by a grade from `interview_positions` —
 * see migration 0236 for why.
 */

const PATH = "/operations/masters/recruitment-jd";
type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_SET_UP =
  "Recruitment JDs aren't set up in this database yet — migration 0236_recruitment_jd_roles.sql must be applied first.";

const Slug = z.string().trim().min(1).max(120);

function failFrom(err: unknown): { ok: false; error: string } {
  if (isMissingRecruitmentJdTable(err)) return { ok: false, error: NOT_SET_UP };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

async function guard() {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  return { me, limited };
}

/* ── 1 · Editing ──────────────────────────────────────────────────────────── */

const SaveInput = z.object({
  slug: Slug,
  which: z.enum(["master", "recruiter"]),
  content: z.record(z.string(), z.unknown()),
});

export async function saveRecruitmentJd(input: unknown): Promise<Result> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid JD." };
  const { slug, which } = parsed.data;

  try {
    const loaded = await loadJdBySlug(slug);
    if (!loaded) return { ok: false, error: "That role no longer exists." };
    const content = normalizeJdContent(parsed.data.content, loaded.title);
    const now = new Date();

    if (which === "master") {
      await db
        .update(recruitmentJds)
        .set({
          masterContent: content,
          // The title follows the master's own Job Title, so renaming the role
          // in the editor renames it in the list rather than leaving the two
          // disagreeing about what the job is called.
          title: content.title.trim() || loaded.title,
          masterUpdatedById: me.id,
          masterUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(recruitmentJds.slug, slug));
    } else {
      // Identical to the master = no separate copy, so master edits keep reaching it.
      const recruiterContent = sameJdContent(content, loaded.master) ? null : content;
      await db
        .update(recruitmentJds)
        .set({
          recruiterContent,
          recruiterUpdatedById: me.id,
          recruiterUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(recruitmentJds.slug, slug));
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
  const parsed = z.object({ slug: Slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const now = new Date();
    await db
      .update(recruitmentJds)
      .set({ recruiterContent: null, recruiterUpdatedById: me.id, recruiterUpdatedAt: now, updatedAt: now })
      .where(eq(recruitmentJds.slug, parsed.data.slug));
  } catch (err) {
    return failFrom(err);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Put the master back to the original text in lib/operations/recruitment-jd-seed.ts.
 *
 * The seed is never applied automatically to a master that already exists (a
 * deploy that silently undid an HR edit would be worse than a stale master), so
 * this is the deliberate way to take an updated original.
 */
export async function restoreRecruitmentJdMaster(input: unknown): Promise<Result> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = z.object({ slug: Slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const seed = RECRUITMENT_JD_SEED_BY_SLUG.get(parsed.data.slug);
  if (!seed) return { ok: false, error: "This role has no original to restore — it was added here." };
  try {
    const now = new Date();
    await db
      .update(recruitmentJds)
      .set({
        masterContent: seed.content,
        title: seed.title,
        masterUpdatedById: me.id,
        masterUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(recruitmentJds.slug, parsed.data.slug));
  } catch (err) {
    return failFrom(err);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/* ── 2 · Adding and retiring a role ───────────────────────────────────────── */

export async function addRecruitmentJdRole(input: unknown): Promise<Result<{ slug: string }>> {
  const { me, limited } = await guard();
  if (limited) return limited;
  const parsed = z.object({ title: z.string().trim().min(2).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the role a title." };
  const title = parsed.data.title.trim();
  const base = slugify(title);
  if (!base) return { ok: false, error: "That title has no letters or numbers in it." };

  try {
    // A second role with the same name gets -2, -3 … rather than a hard refusal:
    // "Sales Manager (Pune)" and "Sales Manager" are a normal pair to want.
    let slug = base;
    for (let n = 2; n < 50; n++) {
      if (!(await loadJdBySlug(slug))) break;
      slug = `${base}-${n}`;
    }
    await db.insert(recruitmentJds).values({
      slug,
      title,
      sortOrder: await nextRecruitmentJdSortOrder(),
      masterContent: emptyJdContent(title),
      masterUpdatedById: me.id,
      masterUpdatedAt: new Date(),
    });
    revalidatePath(PATH);
    return { ok: true, slug };
  } catch (err) {
    return failFrom(err);
  }
}

/**
 * Retire a role. ARCHIVED, never deleted: `recruitment_jd_sends` rows point at
 * it, and they are the record of what was actually sent to a candidate.
 */
export async function retireRecruitmentJdRole(input: unknown): Promise<Result> {
  const { limited } = await guard();
  if (limited) return limited;
  const parsed = z.object({ slug: Slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    await db
      .update(recruitmentJds)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(recruitmentJds.slug, parsed.data.slug));
  } catch (err) {
    return failFrom(err);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/* ── 3 · Sending ──────────────────────────────────────────────────────────── */

/** The JD a send uses, or a refusal. */
async function jdToSend(slug: string) {
  const loaded = await loadJdBySlug(slug);
  if (!loaded) return { ok: false as const, error: "That role no longer exists." };
  const content = effectiveRecruiterJd(loaded.master, loaded.recruiter);
  if (!content || isJdBlank(content)) {
    return { ok: false as const, error: "This role has no JD written yet." };
  }
  return { ok: true as const, loaded, content };
}

const WhatsAppInput = z.object({
  slug: Slug,
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
    const found = await jdToSend(parsed.data.slug);
    if (!found.ok) return found;
    await db.insert(recruitmentJdSends).values({
      jdId: found.loaded.jd.id,
      positionLabel: found.loaded.title,
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
  slug: Slug,
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
    const found = await jdToSend(parsed.data.slug);
    if (!found.ok) return found;
    const res = await sendRecruitmentJdEmail({
      to: parsed.data.to,
      recipientName: parsed.data.recipientName,
      note: parsed.data.note,
      content: found.content,
    });
    await db.insert(recruitmentJdSends).values({
      jdId: found.loaded.jd.id,
      positionLabel: found.loaded.title,
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
