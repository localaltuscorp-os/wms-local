"use server";

import * as XLSX from "xlsx";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { weeklyGoals, employees, incentiveRequests } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { mondayOf, nextWeekStart } from "@/lib/weekly-goals/week";
import { TASK_PRIORITIES, type TaskPriority } from "@/db/enums";
import {
  CreateWeeklyGoalSchema,
  type CreateWeeklyGoalInput,
  EditWeeklyGoalSchema,
  type EditWeeklyGoalInput,
  SetPctDoneSchema,
  type SetPctDoneInput,
  CarryOverSchema,
  type CarryOverInput,
  DeleteWeeklyGoalSchema,
} from "@/lib/validators/weekly-goal";
import { ensureIncentiveColumns } from "@/lib/ensure-incentive-schema";

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

function revalidateWeeklyGoals() {
  revalidatePath("/weekly-goals");
  revalidatePath("/weekly-goals/dashboard");
  updateTag(CACHE_TAGS.weeklyGoals);
}

/** Next Sr. No. for an (employee, week) — max(position)+1, 1-based. */
async function nextPosition(employeeId: string, weekStart: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${weeklyGoals.position}), 0)::int` })
    .from(weeklyGoals)
    .where(
      and(eq(weeklyGoals.employeeId, employeeId), eq(weeklyGoals.weekStart, weekStart)),
    );
  return (row?.max ?? 0) + 1;
}

/**
 * Fetch a goal + decide whether the signed-in user may write it.
 * Owners (the goal's employee) and admins may edit; nobody else.
 */
type LoadResult =
  | { ok: false; error: string }
  | { ok: true; row: typeof weeklyGoals.$inferSelect };

async function loadWritableGoal(
  id: string,
  me: { id: string; isAdmin: boolean },
): Promise<LoadResult> {
  const [row] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, id)).limit(1);
  if (!row) return { ok: false, error: "Goal not found" };
  if (!me.isAdmin && row.employeeId !== me.id) {
    return { ok: false, error: "You can only edit your own weekly goals" };
  }
  return { ok: true, row };
}

/**
 * Create one weekly-goal row. Non-admins can only file goals against
 * themselves; admins can file against anyone. The week is snapped to its
 * Monday defensively. Used by the fast-add row (one submit = one priority).
 */
export async function createWeeklyGoal(
  input: CreateWeeklyGoalInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Owner enforcement: a non-admin may only target their own row.
  const employeeId = me.isAdmin ? data.employeeId : me.id;
  const weekStart = mondayOf(data.weekStart);

  try {
    const position = await nextPosition(employeeId, weekStart);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId,
        weekStart,
        position,
        client: data.client,
        subject: data.subject,
        priority: data.priority,
        incentive: data.incentive,
        kpi: data.kpi,
        targetDone: data.targetDone,
        explanation: data.explanation,
        linkUrl: data.linkUrl,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: weeklyGoals.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateWeeklyGoals();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Edit a goal's content fields (client/subject/priority/flags/notes). */
export async function editWeeklyGoal(
  input: EditWeeklyGoalInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = EditWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...fields } = parsed.data;

  const loaded = await loadWritableGoal(id, me);
  if (!loaded.ok) return loaded;

  // Only write the keys actually provided so a partial edit doesn't clobber.
  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[k] = v;
  }

  try {
    await db.update(weeklyGoals).set(patch).where(eq(weeklyGoals.id, id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Set "% Done (Actual)". Owner enters it; admin (Manan) can overwrite. We
 * snapshot who moved it + when so the dashboard can show provenance.
 */
export async function setWeeklyGoalPct(
  input: SetPctDoneInput,
): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = SetPctDoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid percentage" };
  }
  const loaded = await loadWritableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    await db
      .update(weeklyGoals)
      .set({
        pctDone: parsed.data.pctDone,
        pctUpdatedById: me.id,
        pctUpdatedAt: new Date(),
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(weeklyGoals.id, parsed.data.id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Carry a goal forward into a later week WITHOUT touching the original — used
 * when a priority wasn't finished, was only partly done, or simply repeats.
 * Writes a fresh row in the target week linked back via `carriedFromId`.
 */
export async function carryOverWeeklyGoal(
  input: CarryOverInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const parsed = CarryOverSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadWritableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;
  const src = loaded.row;

  const toWeek = parsed.data.toWeekStart
    ? mondayOf(parsed.data.toWeekStart)
    : nextWeekStart(src.weekStart);

  try {
    const position = await nextPosition(src.employeeId, toWeek);
    const [row] = await db
      .insert(weeklyGoals)
      .values({
        employeeId: src.employeeId,
        weekStart: toWeek,
        position,
        client: src.client,
        subject: src.subject,
        priority: src.priority,
        incentive: src.incentive,
        kpi: src.kpi,
        targetDone: src.targetDone,
        explanation: src.explanation,
        linkUrl: src.linkUrl,
        pctDone: parsed.data.keepProgress ? src.pctDone : 0,
        carriedFromId: src.id,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: weeklyGoals.id });
    if (!row) return { ok: false, error: "Insert returned no row" };
    revalidateWeeklyGoals();
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function deleteWeeklyGoal(input: { id: string }): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = DeleteWeeklyGoalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id" };

  const loaded = await loadWritableGoal(parsed.data.id, me);
  if (!loaded.ok) return loaded;

  try {
    await db.delete(weeklyGoals).where(eq(weeklyGoals.id, parsed.data.id));
    revalidateWeeklyGoals();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ================================================================== */
/* Bulk import from CSV / Excel / Google Sheets                         */
/* ================================================================== */

/** Normalise a header cell for fuzzy matching: lowercase, alphanumerics only. */
function normHeader(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Which weekly-goal field a spreadsheet column maps to (or null to ignore). */
type ImportField =
  | "client"
  | "subject"
  | "priority"
  | "incentive"
  | "kpi"
  | "target"
  | "pctDone"
  | "explanation"
  | "link"
  | "employee";

function mapHeader(raw: string): ImportField | null {
  const h = normHeader(raw);
  if (!h) return null;
  // Order matters: check the more specific tokens first.
  if (h.includes("employee") || h.includes("assignee") || h.includes("doer") || h.includes("teammember") || h === "email")
    return "employee";
  if (h.includes("client")) return "client";
  if (h.includes("subject")) return "subject";
  if (h.includes("priority") || h === "prio") return "priority";
  if (h.includes("incentive")) return "incentive";
  if (h.includes("kpi")) return "kpi";
  if (h.includes("target")) return "target";
  if (h.includes("percent") || h.includes("%") || h.includes("pct") || h.includes("done") || h.includes("actual"))
    return "pctDone";
  if (h.includes("explanation") || h.includes("explain") || h.includes("note") || h.includes("remark") || h.includes("comment"))
    return "explanation";
  if (h.includes("link") || h.includes("url") || h.includes("proof")) return "link";
  return null; // Sr. No. and anything unrecognised is skipped.
}

function parsePriority(raw: unknown): TaskPriority {
  const v = normHeader(raw);
  if (!v) return "imp_not_urgent";
  if (v === "1" || v.includes("critical")) return "imp_urgent";
  if (v === "3" || (v.includes("noti") && v.includes("urgent")) || v === "urgent") return "not_imp_urgent";
  if (v === "4" || v.includes("normal") || v.includes("low")) return "not_imp_not_urgent";
  if (v === "2" || v.includes("important")) return "imp_not_urgent";
  // Eisenhower phrasings: "important & urgent" → critical.
  if (v.includes("imp") && v.includes("urgent") && !v.includes("not")) return "imp_urgent";
  return "imp_not_urgent";
}

function parseYesNo(raw: unknown): boolean {
  const v = normHeader(raw);
  return v === "yes" || v === "y" || v === "true" || v === "1" || v === "✓" || v === "done";
}

function parsePct(raw: unknown): number {
  const n = Math.round(Number(String(raw ?? "").replace(/[^0-9.\-]/g, "")));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function cleanText(raw: unknown, max: number): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Import many weekly goals at once from an uploaded CSV / Excel file (the same
 * format you'd export from Google Sheets). The first row must be headers whose
 * names match the Weekly Goals columns (Client, Subject, Priority, Incentive,
 * KPI, Target, % Done, Explanation, Link). Each remaining row becomes one goal
 * in the chosen week.
 *
 * Targeting:
 *  - Non-admins: every row is filed against themselves (any Employee column is
 *    ignored).
 *  - Admins: rows go to `employeeId` (the person in view). If the file has an
 *    Employee/Email column, each row can override that to fan out across people.
 */
export async function importWeeklyGoals(
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number; warnings: string[] }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const file = formData.get("file");
  const weekStartRaw = String(formData.get("weekStart") ?? "");
  const scopedEmployee = String(formData.get("employeeId") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)) return { ok: false, error: "Invalid week" };
  const weekStart = mondayOf(weekStartRaw);

  // Parse the workbook (xlsx handles .xlsx, .xls and .csv transparently).
  let matrix: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { ok: false, error: "The file has no sheets" };
    const ws = wb.Sheets[sheetName]!;
    matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  } catch (err) {
    return { ok: false, error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (matrix.length < 2) return { ok: false, error: "File needs a header row and at least one data row" };

  // Build the column → field map from the first row.
  const headerRow = matrix[0] ?? [];
  const colMap: (ImportField | null)[] = headerRow.map((c) => mapHeader(String(c)));
  if (!colMap.some((f) => f && f !== "employee")) {
    return {
      ok: false,
      error: "Couldn't recognise any columns. Make sure the first row has headers like Client, Subject, Priority, Target, % Done.",
    };
  }

  // For admins, resolve an optional per-row Employee/Email column against the
  // roster (by name or email). Non-admins always file against themselves.
  const roster = me.isAdmin
    ? await db
        .select({ id: employees.id, name: employees.name, email: employees.email })
        .from(employees)
        .where(eq(employees.isActive, true))
    : [];
  const byName = new Map(roster.map((e) => [normHeader(e.name), e.id]));
  const byEmail = new Map(roster.map((e) => [String(e.email ?? "").toLowerCase().trim(), e.id]));

  const warnings: string[] = [];
  // Goals grouped by their target employee so positions stay sequential.
  const pending = new Map<string, Array<Omit<typeof weeklyGoals.$inferInsert, "employeeId" | "weekStart" | "position">>>();

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const get = (field: ImportField): unknown => {
      const idx = colMap.indexOf(field);
      return idx === -1 ? "" : row[idx];
    };

    const client = cleanText(get("client"), 160);
    const subject = cleanText(get("subject"), 160);
    const target = cleanText(get("target"), 2000);
    const explanation = cleanText(get("explanation"), 4000);
    // Skip fully-blank rows silently.
    if (!client && !subject && !target && !explanation) continue;

    // Resolve target employee.
    let employeeId = me.isAdmin ? scopedEmployee : me.id;
    if (me.isAdmin) {
      const empCell = String(get("employee") ?? "").trim();
      if (empCell) {
        const resolved = byEmail.get(empCell.toLowerCase()) ?? byName.get(normHeader(empCell));
        if (resolved) employeeId = resolved;
        else warnings.push(`Row ${r + 1}: employee "${empCell}" not found — skipped.`);
      }
    }
    if (!employeeId || employeeId === "all") {
      warnings.push(`Row ${r + 1}: no team member to assign — pick a person first or add an Employee column.`);
      continue;
    }

    let linkUrl = cleanText(get("link"), 2000);
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) linkUrl = `https://${linkUrl}`;

    const list = pending.get(employeeId) ?? [];
    list.push({
      client,
      subject,
      priority: parsePriority(get("priority")),
      incentive: parseYesNo(get("incentive")),
      kpi: parseYesNo(get("kpi")),
      targetDone: target,
      pctDone: parsePct(get("pctDone")),
      explanation,
      linkUrl,
      createdById: me.id,
      updatedById: me.id,
    });
    pending.set(employeeId, list);
  }

  let imported = 0;
  try {
    for (const [employeeId, goals] of pending) {
      let position = await nextPosition(employeeId, weekStart);
      const values = goals.map((g) => ({ ...g, employeeId, weekStart, position: position++ }));
      if (values.length === 0) continue;
      await db.insert(weeklyGoals).values(values);
      imported += values.length;
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  const skipped = matrix.length - 1 - imported;
  revalidateWeeklyGoals();
  return { ok: true, imported, skipped: Math.max(0, skipped), warnings: warnings.slice(0, 20) };
}

/* ================================================================== */
/* Weekly-goal incentive — admin attaches a ₹ amount when incentive=Yes,*/
/* which flows into the Incentive ledger (source='weekly_goal').        */
/* ================================================================== */

/** Admin sets the incentive flag + amount on a weekly goal. When incentive is
 *  Yes with amount > 0 we upsert a pending Incentive entry linked by source_ref
 *  = goal id; otherwise we remove any entry. Idempotent, never disturbs an
 *  approved/paid entry's verdict. */
export async function setWeeklyGoalIncentive(input: {
  id: string;
  incentive: boolean;
  amount: number;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Invalid id" };
  const amount = Math.max(0, Math.min(10_000_000, Math.round(Number(input.amount) || 0)));

  const [goal] = await db.select().from(weeklyGoals).where(eq(weeklyGoals.id, input.id)).limit(1);
  if (!goal) return { ok: false, error: "Goal not found" };

  try {
    await ensureIncentiveColumns();
    await db.update(weeklyGoals)
      .set({ incentive: input.incentive, incentiveAmount: input.incentive ? amount : 0, updatedById: me.id, updatedAt: new Date() })
      .where(eq(weeklyGoals.id, input.id));

    const [existing] = await db.select({ id: incentiveRequests.id, status: incentiveRequests.status })
      .from(incentiveRequests)
      .where(and(eq(incentiveRequests.source, "weekly_goal"), eq(incentiveRequests.sourceRef, input.id)))
      .limit(1);

    const label = `Weekly Goal — ${goal.client || goal.subject || goal.targetDone || "Priority"}`.slice(0, 200);

    if (input.incentive && amount > 0) {
      if (existing) {
        // Refresh amount/label only if not yet decided/paid.
        if (existing.status === "pending") {
          await db.update(incentiveRequests)
            .set({ amount, label, updatedAt: new Date() })
            .where(eq(incentiveRequests.id, existing.id));
        }
      } else {
        await db.insert(incentiveRequests).values({
          employeeId: goal.employeeId,
          type: "weekly_goal",
          details: { week: goal.weekStart },
          amount,
          label,
          source: "weekly_goal",
          sourceRef: input.id,
        } as typeof incentiveRequests.$inferInsert);
      }
    } else if (existing && existing.status === "pending") {
      // Turned off / zeroed — drop the pending entry (keep decided ones).
      await db.delete(incentiveRequests).where(eq(incentiveRequests.id, existing.id));
    }
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidateWeeklyGoals();
  revalidatePath("/incentive");
  return { ok: true };
}
