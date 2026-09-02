import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { kpiAssignments } from "@/db/schema";
import type { KpiTarget, KpiLine, KpiPeriod } from "@/lib/performance/kpi-dictionary";
import { kpiTargetForName } from "@/lib/performance/kpi-dictionary";

/**
 * Bridge: HR "KPI Management" (`kpi_assignments`) → the appraisal KPI engine
 * (`KpiTarget`). This is what makes the KPIs HR assigns actually DRIVE appraisal
 * scoring, instead of the hardcoded name-matched dictionary.
 *
 * A person's ACTIVE + APPLICABLE assignments from their LATEST effective quarter
 * become the KPI lines; their per-KPI weightages are normalised to sum to 100
 * (the internal-KPI bucket convention `computeKpi` expects). Callers fall back to
 * `kpiTargetForName(name)` when this returns null, so anyone without configured
 * KPIs keeps the existing behaviour (non-breaking).
 */

interface AssignmentRow {
  id: string;
  employeeId: string;
  kpiKey: string | null;
  kpiName: string;
  category: string;
  frequency: string;
  weightage: number;
  targetValue: string;
  effectiveQuarter: string;
}

const ASSIGNMENT_COLS = {
  id: kpiAssignments.id,
  employeeId: kpiAssignments.employeeId,
  kpiKey: kpiAssignments.kpiKey,
  kpiName: kpiAssignments.kpiName,
  category: kpiAssignments.category,
  frequency: kpiAssignments.frequency,
  weightage: kpiAssignments.weightage,
  targetValue: kpiAssignments.targetValue,
  effectiveQuarter: kpiAssignments.effectiveQuarter,
};

/** A raw (pre-normalisation) KPI line — either a saved assignment or a still-
 *  inherited dictionary line. */
interface RawLine {
  id: string;
  label: string;
  target: number;
  period: KpiPeriod;
  rawWeight: number;
  unit?: string;
}

/** Only "week" and "month" exist in the engine; weekly maps to week, else month. */
function toPeriod(frequency: string): KpiPeriod {
  return frequency === "weekly" ? "week" : "month";
}

/** Parse a free-text target ("40", "₹1,20,000", "e.g. 40") to a number, or 0. */
function parseTarget(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a KpiTarget from a person's saved assignments (latest quarter) MERGED
 * with any appraisal-dictionary lines they haven't adopted yet — so the
 * appraisal always scores exactly the KPIs the KPI-Management board shows, even
 * during partial adoption. All intra-weights are normalised together to sum to
 * 100 (the engine convention). Returns null when there are neither.
 */
function buildTarget(employeeId: string, name: string, rows: AssignmentRow[]): KpiTarget | null {
  // Saved assignments → raw lines (most recent quarter only, for coherence).
  let assignmentLines: RawLine[] = [];
  const coveredNames = new Set<string>();
  const coveredKeys = new Set<string>();
  if (rows.length > 0) {
    const latestQuarter = rows.reduce(
      (max, r) => (r.effectiveQuarter > max ? r.effectiveQuarter : max),
      rows[0]!.effectiveQuarter,
    );
    const chosen = rows.filter((r) => r.effectiveQuarter === latestQuarter);
    assignmentLines = chosen.map((r) => {
      coveredNames.add(r.kpiName.trim().toLowerCase());
      if (r.kpiKey) coveredKeys.add(r.kpiKey);
      return {
        id: r.id,
        label: r.kpiName,
        target: parseTarget(r.targetValue),
        period: toPeriod(r.frequency),
        rawWeight: r.weightage || 0,
        unit: r.category || undefined,
      };
    });
  }

  // Dictionary lines not yet adopted (matched by key or name).
  const dict = kpiTargetForName(name);
  const dictLines: RawLine[] = dict
    ? dict.lines
        .filter((l) => !coveredKeys.has(l.id) && !coveredNames.has(l.label.trim().toLowerCase()))
        .map((l) => ({
          id: `dict:${l.id}`,
          label: l.label,
          target: l.target,
          period: l.period,
          rawWeight: l.intraWeight,
          unit: l.unit,
        }))
    : [];

  const combined = [...assignmentLines, ...dictLines];
  if (combined.length === 0) return null;

  const totalRaw = combined.reduce((s, l) => s + l.rawWeight, 0);
  const lines: KpiLine[] = combined.map((l) => ({
    id: l.id,
    label: l.label,
    target: l.target,
    period: l.period,
    intraWeight: totalRaw > 0 ? (l.rawWeight / totalRaw) * 100 : 100 / combined.length,
    unit: l.unit,
  }));

  return { key: `kpi-mgmt-${employeeId}`, name: name || "", lines };
}

/** One person's KPI target from their KPI-Management assignments, or null. */
export async function loadKpiTargetForEmployee(
  employeeId: string,
  name = "",
): Promise<KpiTarget | null> {
  const rows = await db
    .select(ASSIGNMENT_COLS)
    .from(kpiAssignments)
    .where(
      and(
        eq(kpiAssignments.employeeId, employeeId),
        eq(kpiAssignments.archived, false),
        eq(kpiAssignments.status, "active"),
        eq(kpiAssignments.applicable, true),
      ),
    );
  return buildTarget(employeeId, name, rows as AssignmentRow[]);
}

/** Batched: `employeeId → KpiTarget` for everyone who has configured KPIs. */
export async function loadKpiTargetsForEmployees(
  ids: string[],
  nameById?: Map<string, string>,
): Promise<Map<string, KpiTarget>> {
  const out = new Map<string, KpiTarget>();
  if (ids.length === 0) return out;
  const rows = (await db
    .select(ASSIGNMENT_COLS)
    .from(kpiAssignments)
    .where(
      and(
        inArray(kpiAssignments.employeeId, ids),
        eq(kpiAssignments.archived, false),
        eq(kpiAssignments.status, "active"),
        eq(kpiAssignments.applicable, true),
      ),
    )) as AssignmentRow[];

  const byEmp = new Map<string, AssignmentRow[]>();
  for (const r of rows) {
    const arr = byEmp.get(r.employeeId) ?? [];
    arr.push(r);
    byEmp.set(r.employeeId, arr);
  }
  for (const [emp, rs] of byEmp) {
    const target = buildTarget(emp, nameById?.get(emp) ?? "", rs);
    if (target) out.set(emp, target);
  }
  return out;
}
