import "server-only";
import { createElement } from "react";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals, whatsappMediaLog, type WeeklyGoal } from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { getDashboard } from "./queries";
import { renderWeeklyGoalsPdf } from "./pdf";
import { goalsWhatsappOn } from "./flag";
import { fyStartYearOf } from "./types";
import { weekNoOf } from "./fy-calendar";
import { weeklyScore } from "@/lib/weekly-goals/effective";
import { mondayOf, nextWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";
import {
  uploadMedia,
  sendDocument,
  sendImage,
  sendDocumentTemplate,
  type MediaResult,
} from "@/lib/whatsapp/media";
import { sendTemplate } from "@/lib/whatsapp/client";

/**
 * SHARED trigger — send an employee's weekly goals report to Manan on WhatsApp.
 *
 * Called from the COMMIT slice's Saturday freeze action (`import
 * { dispatchGoalsReport }`). Renders the 2-sheet PDF (lib/goals/pdf.ts), uploads
 * it via the Meta media API (lib/whatsapp/media.ts), and delivers it per
 * `WA_GOALS_FORMAT` (document | image | text). Deduped on `whatsapp_media_log`
 * (context + person+week ref_key). Gated by `goalsWhatsappOn()` (default OFF).
 *
 * NEVER throws — the caller runs it fire-and-forget inside `afterResponse`; a
 * delivery hiccup must never touch the freeze.
 *
 * WhatsApp constraint: a raw document/image send only works inside an OPEN 24-h
 * customer-service window. To reach Manan PROACTIVELY (the normal case), a
 * pre-approved Utility template with a document header is required — its name in
 * `WA_GOALS_TEMPLATE`. Until that template is approved (a human follow-up), the
 * dispatcher falls back to a raw send (succeeds only if a window is open) and, if
 * that fails and `WA_GOALS_TEXT_TEMPLATE` is set, a text template with a summary.
 */

const CONTEXT = "goals_weekly";

// ── env (read at call time) ─────────────────────────────────────────────────
function envFormat(): "document" | "image" | "text" {
  const v = (process.env.WA_GOALS_FORMAT || "document").trim().toLowerCase();
  return v === "image" || v === "text" ? v : "document";
}

/** Manan's WhatsApp number: explicit env override, else his employee row. */
async function resolveRecipient(): Promise<string | null> {
  const override = process.env.WA_GOALS_RECIPIENT?.trim();
  if (override) return override;
  try {
    const rows = await db
      .select({ phone: employees.whatsappPhone })
      .from(employees)
      .where(eq(employees.email, "manan@unleashed.in"))
      .limit(1);
    return rows[0]?.phone?.trim() || null;
  } catch {
    return null;
  }
}

export interface GoalsReportData {
  employee: { id: string; name: string | null };
  lastWeek: { weekStart: string; goals: WeeklyGoal[] };
  nextWeek: { weekStart: string; goals: WeeklyGoal[] };
  dashboard: Awaited<ReturnType<typeof getDashboard>> & {
    lastWeekScore: number;
    monthAvg: number | null;
  };
}

/**
 * Gather everything the PDF needs for one person + week. Shared by the in-app
 * download route and the WhatsApp dispatcher. `weekStart` is the "last week"
 * anchor (the week whose progress was filled); the committed "next week" is
 * `weekStart + 7`.
 */
export async function buildGoalsReportData(
  employeeId: string,
  weekStart: string,
): Promise<GoalsReportData> {
  const anchor = mondayOf(weekStart);
  const upcoming = nextWeekStart(anchor);
  const monthFirst = `${anchor.slice(0, 7)}-01`;
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  const nextMonthFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const [emp, lastGoals, nextGoals, monthGoals, dashboard] = await withRetry(
    () =>
      Promise.all([
        db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(eq(employees.id, employeeId))
          .limit(1),
        db
          .select()
          .from(weeklyGoals)
          .where(
            and(
              eq(weeklyGoals.employeeId, employeeId),
              eq(weeklyGoals.weekStart, anchor),
              eq(weeklyGoals.archived, false),
            ),
          ),
        db
          .select()
          .from(weeklyGoals)
          .where(
            and(
              eq(weeklyGoals.employeeId, employeeId),
              eq(weeklyGoals.weekStart, upcoming),
              eq(weeklyGoals.archived, false),
            ),
          ),
        db
          .select({ acceptPct: weeklyGoals.acceptPct, pctDone: weeklyGoals.pctDone, weight: weeklyGoals.weight })
          .from(weeklyGoals)
          .where(
            and(
              eq(weeklyGoals.employeeId, employeeId),
              eq(weeklyGoals.archived, false),
              gte(weeklyGoals.weekStart, monthFirst),
              lt(weeklyGoals.weekStart, nextMonthFirst),
            ),
          ),
        getDashboard(employeeId, fyStartYearOf(anchor)),
      ]),
    { timeoutMs: [6000, 12000], label: "goals.buildGoalsReportData" },
  );

  const lastWeekScore = weeklyScore(
    (lastGoals as WeeklyGoal[]).map((g) => ({
      acceptPct: g.acceptPct,
      pctDone: g.pctDone,
      weight: g.weight,
    })),
  );
  const monthAvg = monthGoals.length ? weeklyScore(monthGoals) : null;

  return {
    employee: emp[0] ?? { id: employeeId, name: null },
    lastWeek: { weekStart: anchor, goals: lastGoals as WeeklyGoal[] },
    nextWeek: { weekStart: upcoming, goals: nextGoals as WeeklyGoal[] },
    dashboard: { ...dashboard, lastWeekScore, monthAvg },
  };
}

/** Render the report PDF for one person + week (used by the route + dispatcher). */
export async function renderGoalsReportPdf(
  employeeId: string,
  weekStart: string,
): Promise<{ buffer: Buffer; data: GoalsReportData }> {
  const data = await buildGoalsReportData(employeeId, weekStart);
  const buffer = await renderWeeklyGoalsPdf(data);
  return { buffer, data };
}

function safeName(name: string | null): string {
  return (name || "employee").replace(/\s+/g, "");
}

function summaryText(data: GoalsReportData, weekNo: number, label: string): string {
  const d = data.dashboard;
  const name = data.employee.name?.trim() || "Employee";
  return (
    `${name} — Weekly Goals (W${weekNo}, ${label}). ` +
    `Last week ${d.lastWeekScore}%` +
    (d.monthAvg != null ? ` · month ${d.monthAvg}%` : "") +
    ` · YTD ${d.ytdWeeklyAvg}%.`
  );
}

/**
 * Best-effort scorecard image (PNG) via next/og. Returns null on any failure so
 * the dispatcher falls back to the document. Only exercised for
 * `WA_GOALS_FORMAT=image`.
 */
async function renderScorecardImage(
  name: string,
  scores: { label: string; value: number | null }[],
): Promise<Buffer | null> {
  try {
    const { ImageResponse } = await import("next/og");
    const tile = (s: { label: string; value: number | null }) =>
      createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            padding: "20px 24px",
            borderRadius: 16,
            background: "#F7F7F8",
            width: 240,
          },
        },
        createElement(
          "div",
          { style: { fontSize: 20, color: "#737373", letterSpacing: 1 } },
          s.label,
        ),
        createElement(
          "div",
          { style: { fontSize: 72, fontWeight: 700, color: "#0A0A0A" } },
          s.value == null ? "—" : `${s.value}%`,
        ),
      );
    const element = createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 56,
          background: "#FFFFFF",
        },
      },
      createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", marginBottom: 40 } },
        createElement(
          "div",
          { style: { fontSize: 28, color: "#E10600", fontWeight: 700, letterSpacing: 1 } },
          "ALTUS CORP · WEEKLY GOALS",
        ),
        createElement("div", { style: { fontSize: 44, fontWeight: 700, color: "#0A0A0A" } }, name),
      ),
      createElement(
        "div",
        { style: { display: "flex", gap: 20, flexWrap: "wrap" } },
        ...scores.map(tile),
      ),
    );
    const res = new ImageResponse(element, { width: 1200, height: 630 });
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Insert-or-update the media log row (idempotent on context+ref_key). */
async function logSend(
  refKey: string,
  recipientPhone: string,
  mediaKind: string,
  templateName: string | null,
  result: MediaResult,
): Promise<void> {
  try {
    await db
      .insert(whatsappMediaLog)
      .values({
        recipientPhone,
        mediaKind,
        templateName,
        context: CONTEXT,
        refKey,
        metaMessageId: result.ok ? result.id : null,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
      })
      .onConflictDoUpdate({
        target: [whatsappMediaLog.context, whatsappMediaLog.refKey],
        set: {
          recipientPhone,
          mediaKind,
          templateName,
          metaMessageId: result.ok ? result.id : null,
          status: result.ok ? "sent" : "failed",
          error: result.ok ? null : result.error,
        },
      });
  } catch {
    /* logging is best-effort */
  }
}

/** Whether a successful send already exists for this person+week (dedupe). */
async function alreadySent(refKey: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ status: whatsappMediaLog.status })
      .from(whatsappMediaLog)
      .where(and(eq(whatsappMediaLog.context, CONTEXT), eq(whatsappMediaLog.refKey, refKey)))
      .limit(1);
    return rows[0]?.status === "sent";
  } catch {
    return false;
  }
}

export async function dispatchGoalsReport(employeeId: string, weekStart: string): Promise<void> {
  if (!goalsWhatsappOn()) return; // gate — default OFF

  try {
    const anchor = mondayOf(weekStart);
    const refKey = `${employeeId}:${anchor}`;
    if (await alreadySent(refKey)) return;

    const toPhone = await resolveRecipient();
    if (!toPhone) return; // no recipient on file → silent no-op

    const { buffer, data } = await renderGoalsReportPdf(employeeId, anchor);
    if (buffer.length === 0) return; // render failed → nothing to send

    const weekNo = weekNoOf(anchor);
    const label = formatWeekLabel(anchor);
    const caption = summaryText(data, weekNo, label);
    const filename = `weekly-goals-${safeName(data.employee.name)}-W${weekNo}.pdf`;
    const format = envFormat();

    const template = process.env.WA_GOALS_TEMPLATE?.trim();
    const textTemplate = process.env.WA_GOALS_TEXT_TEMPLATE?.trim();
    const locale = process.env.WA_GOALS_TEMPLATE_LOCALE?.trim() || "en";

    // ── TEXT — summary via a text template (no media) ──
    if (format === "text" && textTemplate) {
      const r = await sendTemplate({
        toPhone,
        templateName: textTemplate,
        languageCode: locale,
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: data.employee.name?.trim() || "Employee" },
              { type: "text", text: caption },
            ],
          },
        ],
      });
      await logSend(refKey, toPhone, "text", textTemplate, r);
      return;
    }

    // ── IMAGE — scorecard JPG/PNG; falls back to document on any failure ──
    if (format === "image") {
      const png = await renderScorecardImage(data.employee.name?.trim() || "Employee", [
        { label: "LAST WEEK", value: data.dashboard.lastWeekScore },
        { label: "THIS WEEK", value: data.dashboard.weekScore },
        { label: "THIS MONTH", value: data.dashboard.monthAvg },
        { label: "YTD AVG", value: data.dashboard.ytdWeeklyAvg },
      ]);
      if (png) {
        const up = await uploadMedia(png, "image/png");
        if (up.ok) {
          const r = await sendImage({ toPhone, mediaId: up.id, caption });
          await logSend(refKey, toPhone, "image", null, r);
          if (r.ok) return;
        }
      }
      // fall through to document delivery
    }

    // ── DOCUMENT (default + image-fallback) ──
    const up = await uploadMedia(buffer, "application/pdf");
    if (!up.ok) {
      await logSend(refKey, toPhone, "document", template ?? null, up);
      return;
    }

    let r: MediaResult;
    let usedTemplate: string | null = null;
    if (template) {
      // Proactive, out-of-24-h-window compliant send.
      usedTemplate = template;
      r = await sendDocumentTemplate({
        toPhone,
        templateName: template,
        mediaId: up.id,
        filename,
        languageCode: locale,
        params: [caption],
      });
    } else {
      // No approved template yet → raw send (works only inside an open window).
      r = await sendDocument({ toPhone, mediaId: up.id, filename, caption });
    }
    await logSend(refKey, toPhone, "document", usedTemplate, r);

    // Last resort: if a raw send failed (likely out of window) and a text
    // template exists, at least notify Manan with the summary text.
    if (!r.ok && !template && textTemplate) {
      const t = await sendTemplate({
        toPhone,
        templateName: textTemplate,
        languageCode: locale,
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: data.employee.name?.trim() || "Employee" },
              { type: "text", text: caption },
            ],
          },
        ],
      });
      if (t.ok) await logSend(refKey, toPhone, "text", textTemplate, t);
    }
  } catch {
    /* fire-and-forget — never throw into the caller's freeze action */
  }
}
