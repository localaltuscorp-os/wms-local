import "server-only";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { tcFeedback, tcServices, employees } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const FEEDBACK_TAT_HOURS = 72;

export interface FeedbackRow {
  id: string;
  feedbackDate: string;
  type: string;
  ratedName: string;
  clientName: string | null;
  service: string | null;
  rating: number | null;
  q1: string | null;
  q2: string | null;
  escalate: boolean;
  escalatedToName: string | null;
  resolution: boolean;
  resolutionHow: string | null;
  signedOff: boolean;
  signedOffByName: string | null;
  archived: boolean;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  tatHours: number | null;
  overdue: boolean;
  hasVoice: boolean;
  hasPicture: boolean;
}

function rowMap(r: {
  id: string; feedbackDate: string; type: string; ratedEmpName: string | null; ratedName: string | null;
  clientName: string | null; service: string | null; rating: number | null; q1: string | null; q2: string | null;
  escalate: boolean; escalatedToName: string | null; resolution: boolean; resolutionHow: string | null;
  signedOff: boolean; signedOffByName: string | null; archived: boolean; status: string;
  createdAt: Date; resolvedAt: Date | null; voiceNotePath: string | null; picturePath: string | null;
}): FeedbackRow {
  const now = Date.now();
  const created = r.createdAt.getTime();
  const tatHours = r.resolvedAt ? Math.round(((r.resolvedAt.getTime() - created) / 3_600_000) * 10) / 10 : null;
  const overdue = !r.resolution && (now - created) / 3_600_000 > FEEDBACK_TAT_HOURS;
  return {
    id: r.id, feedbackDate: r.feedbackDate, type: r.type,
    ratedName: r.ratedEmpName || r.ratedName || "—",
    clientName: r.clientName, service: r.service, rating: r.rating, q1: r.q1, q2: r.q2,
    escalate: r.escalate, escalatedToName: r.escalatedToName,
    resolution: r.resolution, resolutionHow: r.resolutionHow,
    signedOff: r.signedOff, signedOffByName: r.signedOffByName,
    archived: r.archived, status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    tatHours, overdue,
    hasVoice: !!r.voiceNotePath, hasPicture: !!r.picturePath,
  };
}

export async function listFeedback(opts: { includeArchived?: boolean } = {}): Promise<FeedbackRow[]> {
  const ratedEmp = alias(employees, "rated_emp");
  const escTo = alias(employees, "esc_to");
  const signer = alias(employees, "signer");
  const rows = await db
    .select({
      id: tcFeedback.id, feedbackDate: tcFeedback.feedbackDate, type: tcFeedback.type,
      ratedEmpName: ratedEmp.name, ratedName: tcFeedback.ratedName,
      clientName: tcFeedback.clientName, service: tcServices.name, rating: tcFeedback.rating,
      q1: tcFeedback.q1, q2: tcFeedback.q2,
      escalate: tcFeedback.escalate, escalatedToName: escTo.name,
      resolution: tcFeedback.resolution, resolutionHow: tcFeedback.resolutionHow,
      signedOff: tcFeedback.signedOff, signedOffByName: signer.name,
      archived: tcFeedback.archived, status: tcFeedback.status,
      createdAt: tcFeedback.createdAt, resolvedAt: tcFeedback.resolvedAt,
      voiceNotePath: tcFeedback.voiceNotePath, picturePath: tcFeedback.picturePath,
    })
    .from(tcFeedback)
    .leftJoin(ratedEmp, eq(ratedEmp.id, tcFeedback.ratedEmployeeId))
    .leftJoin(tcServices, eq(tcServices.id, tcFeedback.serviceId))
    .leftJoin(escTo, eq(escTo.id, tcFeedback.escalatedToId))
    .leftJoin(signer, eq(signer.id, tcFeedback.signedOffById))
    .orderBy(desc(tcFeedback.createdAt));
  const mapped = rows.map(rowMap);
  return opts.includeArchived ? mapped : mapped.filter((r) => !r.archived);
}

export interface FeedbackDetail extends FeedbackRow {
  voiceUrl: string | null;
  pictureUrl: string | null;
  voiceTranscript: string | null;
}

export async function getFeedback(id: string): Promise<FeedbackDetail | null> {
  const ratedEmp = alias(employees, "rated_emp");
  const escTo = alias(employees, "esc_to");
  const signer = alias(employees, "signer");
  const [r] = await db
    .select({
      id: tcFeedback.id, feedbackDate: tcFeedback.feedbackDate, type: tcFeedback.type,
      ratedEmpName: ratedEmp.name, ratedName: tcFeedback.ratedName,
      clientName: tcFeedback.clientName, service: tcServices.name, rating: tcFeedback.rating,
      q1: tcFeedback.q1, q2: tcFeedback.q2,
      escalate: tcFeedback.escalate, escalatedToName: escTo.name,
      resolution: tcFeedback.resolution, resolutionHow: tcFeedback.resolutionHow,
      signedOff: tcFeedback.signedOff, signedOffByName: signer.name,
      archived: tcFeedback.archived, status: tcFeedback.status,
      createdAt: tcFeedback.createdAt, resolvedAt: tcFeedback.resolvedAt,
      voiceNotePath: tcFeedback.voiceNotePath, picturePath: tcFeedback.picturePath,
      voiceTranscript: tcFeedback.voiceTranscript,
    })
    .from(tcFeedback)
    .leftJoin(ratedEmp, eq(ratedEmp.id, tcFeedback.ratedEmployeeId))
    .leftJoin(tcServices, eq(tcServices.id, tcFeedback.serviceId))
    .leftJoin(escTo, eq(escTo.id, tcFeedback.escalatedToId))
    .leftJoin(signer, eq(signer.id, tcFeedback.signedOffById))
    .where(eq(tcFeedback.id, id))
    .limit(1);
  if (!r) return null;
  const base = rowMap(r);
  async function sign(path: string | null): Promise<string | null> {
    if (!path) return null;
    try {
      const { data } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  }
  return {
    ...base,
    voiceUrl: await sign(r.voiceNotePath),
    pictureUrl: await sign(r.picturePath),
    voiceTranscript: r.voiceTranscript,
  };
}

export interface FeedbackStats {
  total: number;
  open: number;
  escalated: number;
  resolved: number;
  signedOff: number;
  overdue: number;
  avgRating: number | null;
}

export async function feedbackStats(): Promise<FeedbackStats> {
  const rows = await listFeedback({ includeArchived: false });
  const ratings = rows.map((r) => r.rating).filter((x): x is number => x != null);
  return {
    total: rows.length,
    open: rows.filter((r) => !r.resolution && !r.escalate).length,
    escalated: rows.filter((r) => r.escalate && !r.resolution).length,
    resolved: rows.filter((r) => r.resolution).length,
    signedOff: rows.filter((r) => r.signedOff).length,
    overdue: rows.filter((r) => r.overdue).length,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
  };
}
