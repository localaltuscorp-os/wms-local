"use server";

/**
 * PMS v3 (WS-2) server actions. EVERY action first calls `guard()`, which is a
 * no-op-and-error whenever PMS_V3 is off — so the dark surface cannot mutate prod
 * even if a stale client POSTs to it. Role rules per spec:
 *   • self scores        → the signed-in subject only
 *   • manager scores      → the subject's manager
 *   • manan scores/X-Factor + config/constitution-admin → canActAsManan (super-admin)
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isPmsV3Enabled } from "@/lib/pms/v3/flag";
import { canActAsManan } from "@/lib/pms/v3/roles";
import {
  pmsV3Config,
  pmsSubjectiveScore,
  pmsXfactor,
  pmsConstitutionPara,
  pmsConstitutionScore,
} from "@/lib/pms/v3/schema";
import { CONSTITUTION_SEED } from "@/lib/pms/v3/constitution-data";

type ActionResult = { ok: true } | { ok: false; error: string };
type Employee = Awaited<ReturnType<typeof requireUser>>;

/** Flag gate + auth. Returns the user or an error result. */
async function guard(): Promise<{ me: Employee } | { error: string }> {
  if (!isPmsV3Enabled()) return { error: "PMS v3 is not enabled." };
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { error: limited.error };
  return { me };
}

const PERIOD = z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM");
const POINTS10 = z.coerce.number().int().min(0).max(10);

// ── Subjective factor score ──────────────────────────────────────────────────

const SubjectiveSchema = z.object({
  subjectId: z.string().uuid(),
  period: PERIOD,
  raterRole: z.enum(["self", "manager", "manan"]),
  factorKey: z.string().min(1).max(64),
  points: POINTS10,
  justifyGiven: z.string().max(2000).optional(),
  justifyTaken: z.string().max(2000).optional(),
});

/** Is `me` the manager of `subjectId`? */
async function isManagerOf(meId: string, subjectId: string): Promise<boolean> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, subjectId), eq(employees.managerId, meId)))
    .limit(1);
  return rows.length > 0;
}

export async function saveSubjectiveScore(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;

  const parsed = SubjectiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  // Authorise by rater role.
  if (d.raterRole === "self" && d.subjectId !== me.id) {
    return { ok: false, error: "You can only self-score yourself." };
  }
  if (d.raterRole === "manager" && !(await isManagerOf(me.id, d.subjectId))) {
    return { ok: false, error: "Only the person's manager can give the manager score." };
  }
  if (d.raterRole === "manan" && !canActAsManan(me.email)) {
    return { ok: false, error: "Only Manan can give the Manan score." };
  }

  try {
    await db
      .insert(pmsSubjectiveScore)
      .values({
        subjectId: d.subjectId,
        period: d.period,
        raterRole: d.raterRole,
        raterId: me.id,
        factorKey: d.factorKey,
        points: d.points,
        justifyGiven: d.justifyGiven ?? null,
        justifyTaken: d.justifyTaken ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          pmsSubjectiveScore.subjectId,
          pmsSubjectiveScore.period,
          pmsSubjectiveScore.raterRole,
          pmsSubjectiveScore.factorKey,
        ],
        set: {
          points: d.points,
          raterId: me.id,
          justifyGiven: d.justifyGiven ?? null,
          justifyTaken: d.justifyTaken ?? null,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(`/pms/v3/score/${d.subjectId}`);
  return { ok: true };
}

// ── KPI attainment (manual %) ────────────────────────────────────────────────

const KpiSchema = z.object({
  subjectId: z.string().uuid(),
  period: PERIOD,
  raterRole: z.enum(["manager", "manan"]),
  // Manual monthly attainment % (0–100). Stored in points (smallint holds 0–100).
  attainmentPct: z.coerce.number().int().min(0).max(100),
});

/**
 * Persist the MANUAL KPI attainment % (Sir, 2026-07-09) into pms_subjective_score
 * as factorKey="kpi", `points` = the 0–100 attainment. A manager may set it only
 * for their own reports; Manan may set it for anyone (his value is the authority).
 * The read layer (getMonthlyScoreView.kpi) converts it to weighted points.
 */
export async function saveKpiAttainment(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;

  const parsed = KpiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  if (d.raterRole === "manager" && !(await isManagerOf(me.id, d.subjectId))) {
    return { ok: false, error: "Only the person's manager can set their KPI attainment." };
  }
  if (d.raterRole === "manan" && !canActAsManan(me.email)) {
    return { ok: false, error: "Only Manan can set the Manan KPI attainment." };
  }

  try {
    await db
      .insert(pmsSubjectiveScore)
      .values({
        subjectId: d.subjectId,
        period: d.period,
        raterRole: d.raterRole,
        raterId: me.id,
        factorKey: "kpi",
        points: d.attainmentPct,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          pmsSubjectiveScore.subjectId,
          pmsSubjectiveScore.period,
          pmsSubjectiveScore.raterRole,
          pmsSubjectiveScore.factorKey,
        ],
        set: { points: d.attainmentPct, raterId: me.id, updatedAt: new Date() },
      });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(`/pms/v3/score/${d.subjectId}`);
  return { ok: true };
}

// ── X-Factor (Manan-only) ────────────────────────────────────────────────────

const XFactorSchema = z
  .object({
    subjectId: z.string().uuid(),
    period: PERIOD,
    points: z.coerce.number().min(0).max(100),
    evidenceKind: z.enum(["recording", "transcript"]),
    evidenceUrl: z.string().url().max(2000).optional(),
    transcriptSummary: z.string().max(4000).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine((v) => (v.evidenceKind === "recording" ? !!v.evidenceUrl : !!v.transcriptSummary), {
    message: "Evidence required: a recording link, or an attached + summarised transcript.",
  });

export async function saveXFactor(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;
  if (!canActAsManan(me.email)) return { ok: false, error: "Only Manan can add X-Factor points." };

  const parsed = XFactorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;
  try {
    await db.insert(pmsXfactor).values({
      subjectId: d.subjectId,
      period: d.period,
      points: String(d.points),
      evidenceKind: d.evidenceKind,
      evidenceUrl: d.evidenceUrl ?? null,
      transcriptSummary: d.transcriptSummary ?? null,
      note: d.note ?? null,
      addedById: me.id,
    });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(`/pms/v3/score/${d.subjectId}`);
  return { ok: true };
}

// ── Constitution: seed / weights / scores ────────────────────────────────────

/** Idempotently seed the Constitution paragraphs from the verbatim capture. */
export async function seedConstitution(): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;
  if (!me.isAdmin && !isSuperAdmin(me.email)) return { ok: false, error: "Admins only." };

  const existing = await db.select({ id: pmsConstitutionPara.id }).from(pmsConstitutionPara).limit(1);
  if (existing.length > 0) return { ok: false, error: "Constitution already seeded." };
  try {
    await db.insert(pmsConstitutionPara).values(
      CONSTITUTION_SEED.map((p) => ({
        position: p.position,
        isHeading: p.isHeading,
        title: p.title,
        body: p.body,
        weight: "0",
        active: true,
      })),
    );
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/v3/constitution");
  return { ok: true };
}

const WeightsSchema = z.object({
  weights: z.array(z.object({ paraId: z.string().uuid(), weight: z.coerce.number().min(0).max(100) })),
});

/** Admin sets the per-paragraph weights (should total 100 — validated in the UI). */
export async function saveConstitutionWeights(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;
  if (!me.isAdmin && !isSuperAdmin(me.email)) return { ok: false, error: "Admins only." };
  const parsed = WeightsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  try {
    for (const w of parsed.data.weights) {
      await db
        .update(pmsConstitutionPara)
        .set({ weight: String(w.weight), updatedAt: new Date() })
        .where(eq(pmsConstitutionPara.id, w.paraId));
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/v3/constitution");
  return { ok: true };
}

const ConstScoreSchema = z.object({
  subjectId: z.string().uuid(),
  period: PERIOD,
  paraId: z.string().uuid(),
  raterRole: z.enum(["admin", "self"]),
  points: POINTS10,
  note: z.string().max(2000).optional(),
});

export async function saveConstitutionScore(input: unknown): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;
  const parsed = ConstScoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const d = parsed.data;

  if (d.raterRole === "self" && d.subjectId !== me.id) {
    return { ok: false, error: "You can only self-score yourself." };
  }
  if (d.raterRole === "admin" && !me.isAdmin && !isSuperAdmin(me.email)) {
    return { ok: false, error: "Only an admin can set the admin score." };
  }
  try {
    await db
      .insert(pmsConstitutionScore)
      .values({
        subjectId: d.subjectId,
        period: d.period,
        paraId: d.paraId,
        raterRole: d.raterRole,
        raterId: me.id,
        points: d.points,
        note: d.note ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          pmsConstitutionScore.subjectId,
          pmsConstitutionScore.period,
          pmsConstitutionScore.paraId,
          pmsConstitutionScore.raterRole,
        ],
        set: { points: d.points, raterId: me.id, note: d.note ?? null, updatedAt: new Date() },
      });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/v3/constitution");
  return { ok: true };
}

// ── Config (admin) ───────────────────────────────────────────────────────────

export async function saveV3Config(config: unknown): Promise<ActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const { me } = g;
  if (!me.isAdmin && !isSuperAdmin(me.email)) return { ok: false, error: "Admins only." };
  if (config === null || typeof config !== "object") {
    return { ok: false, error: "Invalid config payload." };
  }
  try {
    await db
      .insert(pmsV3Config)
      .values({ id: "default", config, updatedById: me.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: pmsV3Config.id,
        set: { config, updatedById: me.id, updatedAt: new Date() },
      });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/pms/v3");
  return { ok: true };
}
