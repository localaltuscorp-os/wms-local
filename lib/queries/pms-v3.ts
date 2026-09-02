/**
 * PMS v3 (WS-2) — the read layer. server-only. Inert until PMS_V3=true.
 *
 * Wires the PURE v3 engines (grade-band / blend) to live data. Every function is
 * flag-agnostic at the data layer (the PAGES gate on the flag), but nothing here
 * is referenced by the live v2 score, so importing it never changes an existing
 * number. All policy comes from pms_v3_config (parsed once), never a literal.
 */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import {
  pmsV3Config,
  pmsSubjectiveScore,
  pmsConstitutionPara,
  pmsConstitutionScore,
  pmsXfactor,
} from "@/lib/pms/v3/schema";
import { parseV3Config, activeBand, type PmsV3Config } from "@/lib/pms/v3/config";
import { computeGrade, kpiPoints, type GradeResult } from "@/lib/pms/v3/grade-band";
import { blendFactor, perceptionGap, type RaterScores } from "@/lib/pms/v3/blend";
import {
  computePmsTotal,
  type ConstitutionParaInput,
  type PmsTotalResult,
} from "@/lib/pms/v3/total";
import { getIncentivePaidByPerson } from "@/lib/queries/incentives";
import { getMonthlyCtcByPerson } from "@/lib/pms/v3/ctc";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

function nameKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Read + parse the singleton v3 config (defaults when the row is absent). */
export async function getV3Config(): Promise<PmsV3Config> {
  const rows = await withRetry(
    () => db.select().from(pmsV3Config).where(eq(pmsV3Config.id, "default")).limit(1),
    { ...RETRY, label: "pms-v3-config" },
  );
  return parseV3Config(rows[0]?.config ?? {});
}

/** True when the employee manages at least one active report. */
async function managerIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await withRetry(
    () =>
      db
        .selectDistinct({ id: employees.managerId })
        .from(employees)
        .where(and(inArray(employees.managerId, ids), eq(employees.isActive, true))),
    { ...RETRY, label: "pms-v3-managers" },
  );
  return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
}

// ── Incentive → grade band ───────────────────────────────────────────────────

export interface GradeBandRow {
  employeeId: string;
  name: string;
  grade: GradeResult;
}

/**
 * Grade band per person for a "YYYY-MM" month: PAID incentive ÷ monthly CTC,
 * resolved to a band via config. Reads BOTH shared-key producers and matches by
 * employeeId first, then normalised name.
 */
export async function getGradeBandsForMonth(
  people: { id: string; name: string }[],
  month: string,
): Promise<GradeBandRow[]> {
  const cfg = await getV3Config();
  const [paid, ctc] = await Promise.all([
    getIncentivePaidByPerson(month),
    getMonthlyCtcByPerson(month),
  ]);
  return people.map((p) => {
    const key = nameKey(p.name);
    const paidAmt = paid.get(p.id) ?? paid.get(key) ?? 0;
    const ctcAmt = ctc.get(p.id) ?? ctc.get(key) ?? 0;
    return { employeeId: p.id, name: p.name, grade: computeGrade(paidAmt, ctcAmt, cfg) };
  });
}

// ── Monthly subjective scoring ───────────────────────────────────────────────

export interface FactorScoreView {
  factorKey: string;
  self: number | null;
  manager: number | null;
  /** Manan's score — part of the perception gap, visible to the subject too. */
  manan: number | null;
  /** Q1/Q2 justifications — MANAN-ONLY (null unless canSeeJustifications). */
  justify: {
    self: { given: string | null; taken: string | null } | null;
    manager: { given: string | null; taken: string | null } | null;
    manan: { given: string | null; taken: string | null } | null;
  } | null;
  /** Blended final (per the manager/non-manager rule). */
  final: number | null;
  gap: ReturnType<typeof perceptionGap>;
}

/**
 * KPI = a MANUAL monthly attainment % (0–100), NOT auto-derived (Sir, 2026-07-09).
 * The manager enters it per junior; Manan enters it for everyone. Stored in
 * pms_subjective_score with factorKey="kpi", raterRole "manager" | "manan", and
 * `points` holding the 0–100 attainment (smallint). Manan is the authority: the
 * EFFECTIVE attainment is Manan's value if present, else the manager's. Points =
 * clamp(pct)/100 × kpi weight block; withheld (null) while the non-manager band
 * is pending Sir's ruling.
 */
export interface KpiView {
  /** kpi weight block from the active band (null while non-manager band pending). */
  blockWeight: number | null;
  /** Attainment % entered by the manager (junior's manager). */
  managerPct: number | null;
  /** Attainment % entered by Manan (authority / override). */
  mananPct: number | null;
  /** The attainment used for points: Manan's if present, else the manager's. */
  effectivePct: number | null;
  /** Weighted points earned, or null when withheld (no attainment / band pending). */
  points: number | null;
}

export interface MonthlyScoreView {
  subjectId: string;
  period: string;
  isManager: boolean;
  /** null when the non-manager band is still pending Sir's ruling. */
  band: Record<string, number> | null;
  factors: FactorScoreView[];
  /** KPI pillar (manual attainment % → weighted points). */
  kpi: KpiView;
  canSeeJustifications: boolean;
  config: PmsV3Config;
}

/**
 * Assemble the monthly scoring view for one subject. Manan's numeric scores are
 * always included (the perception gap self/manager/Manan is shown back to the
 * person), but the Q1/Q2 justifications are gated to Manan by
 * `canSeeJustifications`.
 */
export async function getMonthlyScoreView(
  subjectId: string,
  period: string,
  opts: { canSeeJustifications: boolean },
): Promise<MonthlyScoreView> {
  const cfg = await getV3Config();
  const [rows, isMgrSet] = await Promise.all([
    withRetry(
      () =>
        db
          .select()
          .from(pmsSubjectiveScore)
          .where(and(eq(pmsSubjectiveScore.subjectId, subjectId), eq(pmsSubjectiveScore.period, period))),
      { ...RETRY, label: "pms-v3-subjective" },
    ),
    managerIds([subjectId]),
  ]);
  const isManager = isMgrSet.has(subjectId);
  const band = activeBand(cfg, isManager);

  // Index rows by factor + role.
  type Row = (typeof rows)[number];
  const byFactor = new Map<string, { self?: Row; manager?: Row; manan?: Row }>();
  for (const r of rows) {
    const slot = byFactor.get(r.factorKey) ?? {};
    if (r.raterRole === "self") slot.self = r;
    else if (r.raterRole === "manager") slot.manager = r;
    else if (r.raterRole === "manan") slot.manan = r;
    byFactor.set(r.factorKey, slot);
  }

  // ── KPI (objective, MANUAL attainment %) ────────────────────────────────────
  // Stored as pms_subjective_score rows with factorKey="kpi": `points` holds the
  // 0–100 attainment, raterRole "manager" | "manan". Manan overrides the manager.
  const kpiSlot = byFactor.get("kpi") ?? {};
  const kpiManagerPct = kpiSlot.manager?.points ?? null;
  const kpiMananPct = kpiSlot.manan?.points ?? null;
  const kpiEffectivePct = kpiMananPct ?? kpiManagerPct;
  const kpiBlockWeight = band?.["kpi"] ?? null;
  const kpi: KpiView = {
    blockWeight: kpiBlockWeight,
    managerPct: kpiManagerPct,
    mananPct: kpiMananPct,
    effectivePct: kpiEffectivePct,
    points:
      kpiEffectivePct != null && kpiBlockWeight != null
        ? kpiPoints(kpiEffectivePct, kpiBlockWeight)
        : null,
  };

  const subjectiveFactors = cfg.factors.filter((f) => f.kind === "subjective");

  const factors: FactorScoreView[] = subjectiveFactors.map((f) => {
    const slot = byFactor.get(f.key) ?? {};
    const scores: RaterScores = {
      self: slot.self?.points ?? null,
      manager: slot.manager?.points ?? null,
      manan: slot.manan?.points ?? null,
    };
    const blended = blendFactor(scores, isManager, cfg);
    const j = (r?: Row) =>
      r ? { given: r.justifyGiven ?? null, taken: r.justifyTaken ?? null } : null;
    return {
      factorKey: f.key,
      self: scores.self,
      manager: scores.manager,
      manan: scores.manan,
      justify: opts.canSeeJustifications
        ? { self: j(slot.self), manager: j(slot.manager), manan: j(slot.manan) }
        : null,
      final: blended.final,
      gap: perceptionGap(scores),
    };
  });

  return {
    subjectId,
    period,
    isManager,
    band,
    factors,
    kpi,
    canSeeJustifications: opts.canSeeJustifications,
    config: cfg,
  };
}

/** X-Factor rows for a subject/month (Manan-only surface). */
export async function getXFactors(subjectId: string, period: string) {
  return withRetry(
    () =>
      db
        .select()
        .from(pmsXfactor)
        .where(and(eq(pmsXfactor.subjectId, subjectId), eq(pmsXfactor.period, period)))
        .orderBy(asc(pmsXfactor.createdAt)),
    { ...RETRY, label: "pms-v3-xfactor" },
  );
}

// ── Constitution para-by-para ────────────────────────────────────────────────

export interface ConstitutionParaView {
  id: string;
  position: number;
  isHeading: boolean;
  title: string | null;
  body: string;
  weight: number;
  adminScore: number | null;
  selfScore: number | null;
}

/** The Constitution paragraphs + this subject's admin/self scores for a period. */
export async function getConstitutionView(
  subjectId: string,
  period: string,
): Promise<ConstitutionParaView[]> {
  const [paras, scores] = await Promise.all([
    withRetry(
      () =>
        db
          .select()
          .from(pmsConstitutionPara)
          .where(eq(pmsConstitutionPara.active, true))
          .orderBy(asc(pmsConstitutionPara.position)),
      { ...RETRY, label: "pms-v3-const-paras" },
    ),
    withRetry(
      () =>
        db
          .select()
          .from(pmsConstitutionScore)
          .where(
            and(
              eq(pmsConstitutionScore.subjectId, subjectId),
              eq(pmsConstitutionScore.period, period),
            ),
          ),
      { ...RETRY, label: "pms-v3-const-scores" },
    ),
  ]);
  const admin = new Map<string, number | null>();
  const self = new Map<string, number | null>();
  for (const s of scores) {
    if (s.raterRole === "admin") admin.set(s.paraId, s.points ?? null);
    else if (s.raterRole === "self") self.set(s.paraId, s.points ?? null);
  }
  return paras.map((p) => ({
    id: p.id,
    position: p.position,
    isHeading: p.isHeading,
    title: p.title,
    body: p.body,
    weight: Number(p.weight ?? 0),
    adminScore: admin.get(p.id) ?? null,
    selfScore: self.get(p.id) ?? null,
  }));
}

// ── Overall monthly TOTAL (the capstone /100 rollup) ─────────────────────────

export interface MonthlyTotalRow {
  employeeId: string;
  name: string;
  isManager: boolean;
  total: PmsTotalResult;
}

/**
 * The overall monthly PMS total for MANY people in a bounded number of queries
 * (config + managers + grades + one batched read each of subjective, constitution
 * paras, constitution scores, X-Factor). Assembles the pure `computePmsTotal`
 * inputs per person: incentive grade, EFFECTIVE KPI attainment %, blended
 * subjective finals (perception model), the constitution para admin/self scores,
 * and the summed X-Factor points. Single source of truth for both the roster and
 * the per-person score page (which calls this with a one-element list).
 */
export async function getMonthlyTotalsForMonth(
  people: { id: string; name: string }[],
  month: string,
): Promise<MonthlyTotalRow[]> {
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const cfg = await getV3Config();

  const [grades, isMgrSet, subjRows, paras, constRows, xfRows] = await Promise.all([
    getGradeBandsForMonth(people, month),
    managerIds(ids),
    withRetry(
      () =>
        db
          .select()
          .from(pmsSubjectiveScore)
          .where(and(inArray(pmsSubjectiveScore.subjectId, ids), eq(pmsSubjectiveScore.period, month))),
      { ...RETRY, label: "pms-v3-totals-subjective" },
    ),
    withRetry(
      () =>
        db
          .select()
          .from(pmsConstitutionPara)
          .where(eq(pmsConstitutionPara.active, true))
          .orderBy(asc(pmsConstitutionPara.position)),
      { ...RETRY, label: "pms-v3-totals-const-paras" },
    ),
    withRetry(
      () =>
        db
          .select()
          .from(pmsConstitutionScore)
          .where(and(inArray(pmsConstitutionScore.subjectId, ids), eq(pmsConstitutionScore.period, month))),
      { ...RETRY, label: "pms-v3-totals-const-scores" },
    ),
    withRetry(
      () =>
        db
          .select()
          .from(pmsXfactor)
          .where(and(inArray(pmsXfactor.subjectId, ids), eq(pmsXfactor.period, month))),
      { ...RETRY, label: "pms-v3-totals-xfactor" },
    ),
  ]);

  const gradeById = new Map(grades.map((g) => [g.employeeId, g.grade]));

  // subject → factorKey → { self, manager, manan } points
  const subjBy = new Map<string, Map<string, RaterScores>>();
  for (const r of subjRows) {
    const byFactor = subjBy.get(r.subjectId) ?? new Map<string, RaterScores>();
    const slot = byFactor.get(r.factorKey) ?? { self: null, manager: null, manan: null };
    if (r.raterRole === "self") slot.self = r.points ?? null;
    else if (r.raterRole === "manager") slot.manager = r.points ?? null;
    else if (r.raterRole === "manan") slot.manan = r.points ?? null;
    byFactor.set(r.factorKey, slot);
    subjBy.set(r.subjectId, byFactor);
  }

  // subject → paraId → { admin, self } points
  const constBy = new Map<string, Map<string, { admin: number | null; self: number | null }>>();
  for (const s of constRows) {
    const byPara = constBy.get(s.subjectId) ?? new Map<string, { admin: number | null; self: number | null }>();
    const slot = byPara.get(s.paraId) ?? { admin: null, self: null };
    if (s.raterRole === "admin") slot.admin = s.points ?? null;
    else if (s.raterRole === "self") slot.self = s.points ?? null;
    byPara.set(s.paraId, slot);
    constBy.set(s.subjectId, byPara);
  }

  // subject → summed X-Factor points
  const xfBy = new Map<string, number>();
  for (const x of xfRows) {
    xfBy.set(x.subjectId, (xfBy.get(x.subjectId) ?? 0) + Number(x.points ?? 0));
  }

  const subjectiveKeys = cfg.factors.filter((f) => f.kind === "subjective").map((f) => f.key);

  return people.map((p) => {
    const isManager = isMgrSet.has(p.id);
    const byFactor = subjBy.get(p.id) ?? new Map<string, RaterScores>();

    // Blended subjective finals (perception model).
    const subjectiveFinals: Record<string, number | null> = {};
    for (const key of subjectiveKeys) {
      const scores = byFactor.get(key) ?? { self: null, manager: null, manan: null };
      subjectiveFinals[key] = blendFactor(scores, isManager, cfg).final;
    }

    // KPI effective attainment %: Manan's if present, else the manager's.
    const kpiSlot = byFactor.get("kpi");
    const kpiEffectivePct = kpiSlot ? (kpiSlot.manan ?? kpiSlot.manager) : null;

    // Constitution para inputs (admin + self per para).
    const byPara = constBy.get(p.id);
    const constitution: ConstitutionParaInput[] = paras.map((para) => {
      const slot = byPara?.get(para.id);
      return {
        isHeading: para.isHeading,
        weight: Number(para.weight ?? 0),
        adminScore: slot?.admin ?? null,
        selfScore: slot?.self ?? null,
      };
    });

    const total = computePmsTotal(
      {
        grade: gradeById.get(p.id) ?? null,
        kpiEffectivePct,
        constitution,
        subjectiveFinals,
        xFactorPoints: xfBy.get(p.id) ?? 0,
      },
      cfg,
      isManager,
    );

    return { employeeId: p.id, name: p.name, isManager, total };
  });
}

/** Whether the Constitution has been seeded yet (0 rows ⇒ show the seed prompt). */
export async function constitutionSeeded(): Promise<boolean> {
  const rows = await withRetry(
    () => db.select({ id: pmsConstitutionPara.id }).from(pmsConstitutionPara).limit(1),
    { ...RETRY, label: "pms-v3-const-seeded" },
  );
  return rows.length > 0;
}
