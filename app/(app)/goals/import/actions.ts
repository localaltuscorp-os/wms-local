"use server";

import * as XLSX from "xlsx";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { goals, employees } from "@/db/schema";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { goalScopeFor, canManageGoalFor } from "@/lib/goals/scope";
import { autoPctDone, statusForPct } from "@/lib/goals/auto-pct";
import {
  yearKey,
  quarterKey,
  monthKey,
  fyStartYearOfKey,
} from "@/lib/goals/types";
import type { GoalPeriod } from "@/lib/goals/types";
import {
  columnForHeader,
  normKey,
  statusToCode,
  goalTypeToCode,
  incentiveKindToCode,
  visibilityToShare,
  yesNoToBool,
} from "@/lib/goals/template-columns";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Header mapping — driven by the ONE manifest, plus a "periodKey"      */
/* pseudo-field for the legacy cascade CSV (Employee/Period/PeriodKey). */
/* ------------------------------------------------------------------ */
type Field = string; // a manifest column `field`, or "periodKey" pseudo-field

function mapHeader(raw: string): Field | null {
  const k = normKey(raw);
  if (["periodkey", "key", "bucket", "when"].includes(k)) return "periodKey";
  return columnForHeader(raw)?.field ?? null;
}

/** Find the header row (banner rows sit above it in the styled template). */
function findHeaderRow(matrix: unknown[][]): number {
  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    const mapped = (matrix[r] ?? []).map((c) => mapHeader(String(c))).filter(Boolean).length;
    if (mapped >= 2) return r;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Value coercion                                                      */
/* ------------------------------------------------------------------ */
function cleanText(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function parseIntOr(v: unknown, fallback: number | null): number | null {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function parseMoney(v: unknown): string | null {
  const raw = String(v ?? "").replace(/[₹,\s]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

function parseTeam(v: unknown): Array<{ name: string }> | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const names = raw.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
  return names.length ? names.map((name) => ({ name })) : null;
}

/** ISO date 'YYYY-MM-DD' or null. */
function parseIsoDate(v: unknown): string | null {
  const s = String(v ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "07 Jul" | "Jul" | "7" | "2026-07" → MM ('07') for a given year, or null. */
function parseMonthNumber(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s.slice(5, 7);
  const num = s.match(/\b(1[0-2]|0?[1-9])\b/);
  if (num) return String(Number(num[1])).padStart(2, "0");
  const name = s.slice(0, 3).toLowerCase();
  const mo = MONTH_NAME_TO_NUM[name];
  return mo ? String(mo).padStart(2, "0") : null;
}

function mapLevel(raw: string): GoalPeriod | null {
  const k = normKey(raw);
  if (["year", "yearly", "annual", "y"].includes(k)) return "year";
  if (["quarter", "quarterly", "q"].includes(k)) return "quarter";
  if (["month", "monthly", "m"].includes(k)) return "month";
  if (["week", "weekly", "w"].includes(k)) return "week";
  if (["day", "daily", "d"].includes(k)) return "day";
  return null;
}

/** Legacy fallback: resolve a free-text (period, key) pair, shape-inferring. */
function resolvePeriodLegacy(periodRaw: string, keyRaw: string): { period: GoalPeriod; periodKey: string } | null {
  let period = mapLevel(periodRaw);
  const key = keyRaw.trim();
  if (!period) {
    if (/^\d{4}$/.test(key)) period = "year";
    else if (/-Q[1-4]$/i.test(key)) period = "quarter";
    else if (/^\d{4}-\d{2}$/.test(key)) period = "month";
  }
  if (!period) return null;
  if (period === "year") {
    return { period, periodKey: /^\d{4}$/.test(key) ? key : String(yearKey(new Date())) };
  }
  if (period === "quarter") {
    if (/^\d{4}-Q[1-4]$/i.test(key)) return { period, periodKey: key.toUpperCase() };
    const m = key.match(/(\d{4}).*Q([1-4])|Q([1-4]).*(\d{4})/i);
    if (m) {
      const yr = m[1] ?? m[4];
      const q = m[2] ?? m[3];
      if (yr && q) return { period, periodKey: `${yr}-Q${q}` };
    }
    return { period, periodKey: quarterKey(new Date()) };
  }
  if (/^\d{4}-\d{2}$/.test(key)) return { period, periodKey: key };
  return { period, periodKey: monthKey(new Date()) };
}

type PeriodResolution =
  | { ok: true; period: GoalPeriod; periodKey: string }
  | { ok: false; reason: string }
  | { skip: true; reason: string };

/** Resolve a row's period from Level + Year + Quarter/Month, with legacy fallback. */
function resolveRowPeriod(get: (f: Field) => unknown): PeriodResolution {
  const levelRaw = String(get("level") ?? "");
  const keyRaw = String(get("periodKey") ?? "").trim();
  const yearRaw = String(get("year") ?? "").trim();
  const quarterRaw = String(get("quarter") ?? "").trim();
  const monthRaw = String(get("month") ?? "").trim();

  let level = mapLevel(levelRaw);

  // Week / Day rows are managed on the Weekly board — skip cleanly.
  if (level === "week" || level === "day") {
    return { skip: true, reason: `${level} goals import from the Weekly board — skipped.` };
  }

  // Explicit legacy period key wins when present.
  if (keyRaw) {
    const legacy = resolvePeriodLegacy(levelRaw, keyRaw);
    if (legacy) {
      if (legacy.period === "week" || legacy.period === "day") {
        return { skip: true, reason: `${legacy.period} goals import from the Weekly board — skipped.` };
      }
      return { ok: true, period: legacy.period, periodKey: legacy.periodKey };
    }
  }

  // Infer level from whichever period-composition cell is filled.
  if (!level) {
    if (quarterRaw) level = "quarter";
    else if (monthRaw) level = "month";
    else if (yearRaw) level = "year";
  }
  if (!level) return { ok: false, reason: "set Goal Level (Year/Quarter/Month) + Year." };

  const year = /^\d{4}$/.test(yearRaw)
    ? yearRaw
    : monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)
      ? monthRaw.slice(0, 4)
      : String(yearKey(new Date()));

  if (level === "year") return { ok: true, period: "year", periodKey: year };

  if (level === "quarter") {
    const qm = quarterRaw.match(/[1-4]/);
    if (!qm) return { ok: false, reason: "quarter goals need a Quarter (Q1–Q4)." };
    return { ok: true, period: "quarter", periodKey: `${year}-Q${qm[0]}` };
  }

  // month
  if (/^\d{4}-\d{2}$/.test(monthRaw)) return { ok: true, period: "month", periodKey: monthRaw };
  const mm = parseMonthNumber(monthRaw);
  if (!mm) return { ok: false, reason: "month goals need a Month (e.g. 07 Jul)." };
  return { ok: true, period: "month", periodKey: `${year}-${mm}` };
}

async function nextGoalPosition(employeeId: string, period: string, periodKey: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${goals.position}), 0)::int` })
    .from(goals)
    .where(
      and(
        eq(goals.employeeId, employeeId),
        eq(goals.period, period),
        eq(goals.periodKey, periodKey),
      ),
    );
  return (row?.max ?? 0) + 1;
}

/**
 * Bulk-import cascade goals from an xlsx / csv, reading the FULL Goals column
 * manifest (lib/goals/template-columns). Each row becomes a goal at the level
 * named by Goal Level + Year + Quarter/Month. Admins fan rows across people via
 * the Goal Owner column; the `employeeId` form field is the default owner.
 * Round-trips with the exceljs template from GET /goals/template.xlsx.
 */
export async function importGoals(
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number; warnings: string[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = formData.get("file");
  const scopedEmployee = String(formData.get("employeeId") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded" };

  let matrix: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    // The styled template is multi-sheet ("Lists", "Goals", "Examples", "How to
    // use") — the entry grid we import is the "Goals" sheet, NOT sheet[0] (which
    // is "Lists"). Prefer a sheet named "Goals" (case-insensitive); fall back to
    // the first sheet so a plain single-sheet upload still works.
    const sheetName =
      wb.SheetNames.find((n) => n.trim().toLowerCase() === "goals") ?? wb.SheetNames[0];
    if (!sheetName) return { ok: false, error: "The file has no sheets" };
    const ws = wb.Sheets[sheetName]!;
    matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  } catch (err) {
    return { ok: false, error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (matrix.length < 2) return { ok: false, error: "File needs a header row and at least one data row" };

  const headerIdx = findHeaderRow(matrix);
  const headerRow = matrix[headerIdx] ?? [];
  const colMap: (Field | null)[] = headerRow.map((c) => mapHeader(String(c)));
  if (!colMap.includes("title")) {
    return { ok: false, error: "Couldn't find a Goal Title column. Download the template and keep the header row." };
  }

  // Roster for resolving Owner/Reviewer + permission scoping.
  const roster = await db
    .select({ id: employees.id, name: employees.name, email: employees.email })
    .from(employees)
    .where(eq(employees.isActive, true));
  const byName = new Map(roster.map((e) => [normKey(e.name), e.id]));
  const byEmail = new Map(roster.map((e) => [String(e.email ?? "").toLowerCase().trim(), e.id]));
  const resolvePerson = (raw: string): string | null => {
    const s = raw.trim();
    if (!s) return null;
    return byEmail.get(s.toLowerCase()) ?? byName.get(normKey(s)) ?? null;
  };
  const scope = await goalScopeFor({ id: me.id, isAdmin });

  const warnings: string[] = [];
  type Pending = typeof goals.$inferInsert & { _parentRaw: string | null };
  const pending: Pending[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const get = (field: Field): unknown => {
      const idx = colMap.indexOf(field);
      return idx === -1 ? "" : row[idx];
    };

    const title = cleanText(get("title"), 400);
    if (!title) continue; // silently skip blank rows

    // Resolve owner.
    let employeeId = scopedEmployee && scopedEmployee !== "all" ? scopedEmployee : me.id;
    const ownerCell = String(get("owner") ?? "").trim();
    if (ownerCell) {
      const resolved = resolvePerson(ownerCell);
      if (resolved) employeeId = resolved;
      else {
        warnings.push(`Row ${r + 1}: owner "${ownerCell}" not found — skipped.`);
        continue;
      }
    }
    if (!canManageGoalFor(scope, employeeId)) {
      warnings.push(`Row ${r + 1}: you can't add goals for that person — skipped.`);
      continue;
    }

    const period = resolveRowPeriod(get);
    if ("skip" in period) {
      warnings.push(`Row ${r + 1}: ${period.reason}`);
      continue;
    }
    if (!period.ok) {
      warnings.push(`Row ${r + 1}: ${period.reason}`);
      continue;
    }
    if (!Number.isFinite(fyStartYearOfKey(period.periodKey))) {
      warnings.push(`Row ${r + 1}: bad period "${period.periodKey}".`);
      continue;
    }

    // Reviewer (optional).
    let reviewedById: string | null = null;
    const reviewerCell = String(get("reviewer") ?? "").trim();
    if (reviewerCell) {
      reviewedById = resolvePerson(reviewerCell);
      if (!reviewedById) warnings.push(`Row ${r + 1}: reviewer "${reviewerCell}" not found — left blank.`);
    }

    // Numbers + auto progress.
    const targetQty = parseMoney(get("targetQty"));
    const actualQty = parseMoney(get("actualQty"));
    const auto = autoPctDone(targetQty, actualQty);
    const statusCell = statusToCode(get("status"));
    const status = statusCell ?? (auto != null ? statusForPct(auto) : "not_started");

    // Target date is a MONTH-only field.
    const targetDate = period.period === "month" ? parseIsoDate(get("targetDate")) : null;

    const parentRaw = String(get("parentGoalId") ?? "").trim();

    pending.push({
      employeeId,
      period: period.period,
      periodKey: period.periodKey,
      parentGoalId: null, // linked in a safe post-pass below
      _parentRaw: UUID_RE.test(parentRaw) ? parentRaw : null,
      area: cleanText(get("area"), 160) || null,
      title,
      uom: cleanText(get("uom"), 80) || null,
      notes: cleanText(get("notes"), 4000) || null,
      goalType: goalTypeToCode(get("goalType")),
      category: cleanText(get("category"), 60) || "goal",
      targetQty,
      actualQty,
      targetAmount: parseMoney(get("targetAmount")),
      actualAmount: parseMoney(get("actualAmount")),
      teamInvolved: parseTeam(get("team")),
      teamDependencyPct: (() => {
        const n = parseIntOr(get("dependency"), null);
        return n == null ? null : Math.max(0, Math.min(100, n));
      })(),
      reviewedById,
      status,
      pctDone: auto ?? 0,
      shareWithTeam: get("shareWithTeam") ? visibilityToShare(get("shareWithTeam")) : false,
      incentiveEnabled: get("incentiveEnabled") ? yesNoToBool(get("incentiveEnabled")) : false,
      incentiveAmount: parseMoney(get("incentiveAmount")),
      incentiveKind: incentiveKindToCode(get("incentiveKind")),
      weight: 100,
      targetDate,
      adopted: true,
      source: "import",
      createdById: me.id,
      updatedById: me.id,
    });
  }

  // Safe parent linking: only honour a Parent Goal ID that really exists (avoids
  // an FK failure aborting the whole import).
  const parentCandidates = Array.from(
    new Set(pending.map((p) => p._parentRaw).filter((x): x is string => !!x)),
  );
  if (parentCandidates.length) {
    const found = await db
      .select({ id: goals.id })
      .from(goals)
      .where(inArray(goals.id, parentCandidates));
    const okParents = new Set(found.map((g) => g.id));
    for (const p of pending) {
      if (p._parentRaw && okParents.has(p._parentRaw)) p.parentGoalId = p._parentRaw;
    }
  }

  let imported = 0;
  try {
    const posCache = new Map<string, number>();
    for (const g of pending) {
      const cacheKey = `${g.employeeId}|${g.period}|${g.periodKey}`;
      let pos = posCache.get(cacheKey);
      if (pos == null) pos = await nextGoalPosition(g.employeeId, g.period!, g.periodKey!);
      g.position = pos;
      posCache.set(cacheKey, pos + 1);
      const { _parentRaw, ...insert } = g;
      void _parentRaw;
      await db.insert(goals).values(insert);
      imported++;
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath("/goals/cascade");
  revalidatePath("/goals/review");
  revalidatePath("/review"); // the WMS-owned alias of the same workbench
  revalidatePath("/goals/yearly");
  revalidatePath("/goals/quarterly");
  revalidatePath("/goals/monthly");
  revalidatePath("/goals/week");
  const skipped = matrix.length - 1 - imported;
  return { ok: true, imported, skipped: Math.max(0, skipped), warnings: warnings.slice(0, 25) };
}
