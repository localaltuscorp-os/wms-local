"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ambAmbassadors, ambDocuments, ambReferrals, tasks } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadWritableAmbassador } from "@/lib/ambassadors/access";
import { getAmbassador } from "@/lib/queries/ambassadors";
import { generateText, GeminiNotConfiguredError } from "@/lib/ai/gemini";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createTasksCore } from "@/lib/tasks/create-task";
import { inr } from "@/lib/ambassadors/format";

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/ambassadors";
const MAX_BYTES = 25 * 1024 * 1024;
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

// ── AI summary (on-demand, cached) ──────────────────────────────────────────
export async function summarizeAmbassador(id: string): Promise<Result<{ summary: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const detail = await getAmbassador(id);
  if (!detail) return { ok: false, error: "Ambassador not found." };
  const a = detail.ambassador;

  const referrals = detail.referrals;
  const won = referrals.filter((r) => ["won", "payment", "commission_generated", "commission_paid"].includes(r.stage));
  const revenue = won.reduce((s, r) => s + (r.dealAmount ?? 0), 0);
  const owed = referrals.filter((r) => r.commissionStatus !== "paid").reduce((s, r) => s + (r.commissionAmount ?? 0), 0);
  const lastActivity = detail.activities[0]?.occurredAt ?? null;

  const facts = [
    `Partner: ${a.name}${a.company ? ` (${a.company})` : ""}`,
    `Tier: ${a.tier ?? "unrated"} · Partner score: ${a.partnerScore ?? "—"}/100`,
    `Payout terms: ${a.payoutType === "flat" ? `${inr(Number(a.payoutValue))} flat per conversion` : `${Number(a.payoutValue)}% of each deal`}`,
    `Referrals sent: ${referrals.length} · Converted: ${won.length} · Conversion: ${referrals.length ? Math.round((won.length / referrals.length) * 100) : 0}%`,
    `Revenue driven: ${inr(revenue)} · Commission currently owed: ${inr(owed)}`,
    `Products they pitch: ${detail.products.map((p) => p.name).join(", ") || "none set"}`,
    `Monthly target: ${a.monthlyTarget ? inr(Number(a.monthlyTarget)) : "not set"}`,
    `Last activity: ${lastActivity ? new Date(lastActivity).toDateString() : "none logged"}`,
    `Recent referrals: ${referrals.slice(0, 6).map((r) => `${r.prospectName} [${r.stage}]`).join("; ") || "none"}`,
  ].join("\n");

  const prompt = `You are a sales-operations analyst writing a crisp briefing on a referral PARTNER (an "ambassador") for the team that manages the relationship. Use ONLY the facts below — do not invent numbers or names.

${facts}

Write a tight briefing (max ~110 words) in plain professional English with these mini-sections, each one short:
- Who they are & their value (1–2 sentences).
- Health: are they active and converting, or cooling off?
- Next best action: the single most useful thing the owner should do next.
Be specific and reference the real numbers. No preamble, no bullet symbols beyond short labels.`;

  let summary: string;
  try {
    summary = await generateText(prompt);
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) return { ok: false, error: err.message };
    return { ok: false, error: `Could not generate summary: ${(err as Error).message}` };
  }

  try {
    await db.update(ambAmbassadors).set({ aiSummary: summary, aiSummaryAt: new Date(), updatedAt: new Date() }).where(eq(ambAmbassadors.id, id));
  } catch {
    /* the summary is still returned even if caching fails */
  }
  revalidatePath(`${PATH}/${id}`);
  return { ok: true, summary };
}

// ── Documents (version-controlled) ──────────────────────────────────────────
export async function uploadAmbassadorDocument(form: FormData): Promise<Result<{ id: string; version: number }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ambassadorId = String(form.get("ambassadorId") ?? "");
  const gate = await loadWritableAmbassador(ambassadorId, me);
  if (!gate.ok) return gate;

  const rawName = String(form.get("name") ?? "").trim();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  const name = rawName || file.name;

  // Version-control: a re-upload under the same logical name bumps the version
  // and points at the row it supersedes; older versions are kept.
  const [prev] = await db
    .select({ id: ambDocuments.id, version: ambDocuments.version })
    .from(ambDocuments)
    .where(and(eq(ambDocuments.ambassadorId, ambassadorId), eq(ambDocuments.name, name)))
    .orderBy(desc(ambDocuments.version))
    .limit(1);
  const version = (prev?.version ?? 0) + 1;

  const path = `ambassadors/${ambassadorId}/${crypto.randomUUID()}/${safeName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  try {
    const [row] = await db
      .insert(ambDocuments)
      .values({
        ambassadorId,
        name,
        version,
        storageKey: path,
        mime: file.type || null,
        sizeBytes: file.size,
        supersedesId: prev?.id ?? null,
        uploadedById: me.id,
      })
      .returning({ id: ambDocuments.id });
    revalidatePath(`${PATH}/${ambassadorId}`);
    return { ok: true, id: row!.id, version };
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${(err as Error).message}` };
  }
}

/** A short-lived signed URL to view/download a document. */
export async function ambassadorDocumentUrl(id: string): Promise<Result<{ url: string }>> {
  await requireWorkspace("sales");
  const [doc] = await db.select({ storageKey: ambDocuments.storageKey }).from(ambDocuments).where(eq(ambDocuments.id, id)).limit(1);
  if (!doc) return { ok: false, error: "Document not found." };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storageKey, 300);
  if (error || !data?.signedUrl) return { ok: false, error: "Could not open the document." };
  return { ok: true, url: data.signedUrl };
}

export async function deleteAmbassadorDocument(id: string): Promise<Result> {
  const me = await requireWorkspace("sales");
  const [doc] = await db
    .select({ ambassadorId: ambDocuments.ambassadorId, storageKey: ambDocuments.storageKey })
    .from(ambDocuments)
    .where(eq(ambDocuments.id, id))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found." };
  const gate = await loadWritableAmbassador(doc.ambassadorId, me);
  if (!gate.ok) return gate;
  try {
    await db.delete(ambDocuments).where(eq(ambDocuments.id, id));
    await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([doc.storageKey]).catch(() => {});
    revalidatePath(`${PATH}/${doc.ambassadorId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Could not delete: ${(err as Error).message}` };
  }
}

// ── Cross-module: create a follow-up task from a referral/ambassador ─────────
export async function createFollowUpTask(input: {
  ambassadorId: string;
  referralId?: string | null;
  title: string;
  dueAt?: string | null; // ISO date; defaults to +3 days
  doerId?: string | null;
}): Promise<Result<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const gate = await loadWritableAmbassador(input.ambassadorId, me);
  if (!gate.ok) return gate;

  let subject = gate.row.company || gate.row.name;
  let doerId = input.doerId ?? gate.row.ownerId ?? me.id;
  if (input.referralId) {
    const [ref] = await db
      .select({ prospect: ambReferrals.prospectName, company: ambReferrals.prospectCompany, assigned: ambReferrals.assignedToId })
      .from(ambReferrals)
      .where(eq(ambReferrals.id, input.referralId))
      .limit(1);
    if (ref) {
      subject = ref.company || ref.prospect || subject;
      doerId = input.doerId ?? ref.assigned ?? doerId;
    }
  }

  const due = input.dueAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const res = await createTasksCore(
    { id: me.id, name: me.name },
    {
      title: input.title.trim().slice(0, 240) || `Follow up: ${gate.row.name}`,
      subject: subject?.slice(0, 120) ?? null,
      doerId,
      initiatorId: me.id,
      priority: "imp_not_urgent",
      dueAt: due,
      notes: `Ambassador follow-up · ${gate.row.name}`,
    },
  );
  if (!res.ok) return res;

  // Backlink the task to its referral (load-neutral nullable column).
  if (input.referralId) {
    await db.update(tasks).set({ ambReferralId: input.referralId }).where(eq(tasks.id, res.id)).catch(() => {});
  }
  revalidatePath(`${PATH}/${input.ambassadorId}`);
  return { ok: true, id: res.id };
}
