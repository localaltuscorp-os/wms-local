import "server-only";
import { db } from "@/lib/db";
import { notifications, type NotificationKind } from "@/db/schema";
import { getResend, FROM, companyBcc, clampSubject } from "@/lib/email/resend";
import { sendFcmToEmployee } from "@/lib/push/fcm";
import { KPI_CHANGE_TYPE_LABELS, type KpiChangeType } from "@/db/enums";
import { formatDate, localDateString } from "@/lib/format";
import { kpiNotificationsOn, KPI_NOTIFICATIONS_FLAG } from "./flag";

/**
 * KPI Management notification ENGINE — multi-channel fan-out.
 *
 * Maps a KPI change event → one channel-agnostic composed message
 * ({@link composeKpiMessage}), then fans it out across three independently
 * gated channels via {@link dispatchKpiNotification}:
 *
 *   • IN-APP  — a row in the shared `notifications` table (the same inbox path
 *               every other module writes to). ON by default; non-intrusive.
 *   • PUSH    — native FCM via {@link sendFcmToEmployee}; respects `PUSH_OFF`.
 *   • EMAIL   — Resend; GATED behind {@link kpiNotificationsOn} (env
 *               `KPI_NOTIFICATIONS_ON`, default OFF). When gated off, the
 *               message is still composed + logged ("would notify") — never sent.
 *
 * Every arm is best-effort and independently swallowed: a channel failure (or
 * the whole dispatch) must NEVER throw and NEVER fail the KPI mutation. The
 * caller records the append-only history row BEFORE dispatch, so the audit
 * trail is complete regardless of which channels are live.
 *
 * The composer is pure + channel-agnostic so every channel reuses the exact
 * same content (subject/html for email, title/body for in-app + push):
 *   // PHASE 2: Teams / Slack / WhatsApp fan-out — feed the same KpiNotifyEvent
 *   //          + KpiComposedMessage into new channel adapters here.
 */

const BRAND = "#E10600";

/**
 * The `notifications.kind` value for KPI change rows. The column is a `text`
 * column typed as the frozen {@link NotificationKind} union in db/schema.ts;
 * this module cannot extend that union (schema.ts is owned elsewhere), so the
 * literal is declared here and cast at the single insert boundary. The inbox UI
 * falls back to a generic bell icon + "/inbox" link for kinds it doesn't
 * recognise, so an unmapped kind renders cleanly.
 */
export const KPI_NOTIFICATION_KIND = "kpi_changed";

export interface KpiNotifyRecipient {
  /** The affected employee's id — targets the in-app row + the FCM push. */
  employeeId: string;
  name: string;
  /** Office (login) email — always present. */
  officeEmail: string;
  /**
   * Personal email. The `employees` table has NO personal-email column today,
   * so this is effectively always undefined and the engine sends office-only.
   * Wired here so the moment a personal-email field lands, both addresses are
   * covered with zero engine changes.
   */
  personalEmail?: string | null;
}

export interface KpiNotifyEvent {
  changeType: KpiChangeType;
  recipient: KpiNotifyRecipient;
  kpiName: string;
  effectiveQuarter: string;
  weightage: number;
  target: string;
  /** Only meaningful for value edits (updated / weightage_changed / target_changed). */
  previousValue?: string | null;
  newValue?: string | null;
  changedByName: string;
  /** The actor (HR staff) who made the change — stamped on the in-app row. */
  changedById?: string | null;
  reason?: string | null;
  changedAt?: Date;
}

export interface KpiComposedMessage {
  subject: string;
  html: string;
  /**
   * Short, plain-text headline for the compact channels (in-app inbox row +
   * push notification title). Mirrors the email subject.
   */
  title: string;
  /**
   * One-line, plain-text summary for the compact channels (in-app body + push
   * body). Never JSON — the inbox renders it as readable text.
   */
  body: string;
  /** The structured field pairs — reused verbatim by any future channel. */
  fields: Array<[string, string]>;
  changeLabel: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

function fmtWhen(d: Date): string {
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${formatDate(localDateString("Asia/Kolkata", d))}, ${time}`;
}

/**
 * PURE + channel-agnostic. Turns an event into a subject + field pairs + HTML
 * body. No I/O — safe to call regardless of the gate (used by both the live send
 * and the "would notify" log so the two never drift).
 */
export function composeKpiMessage(event: KpiNotifyEvent): KpiComposedMessage {
  const when = event.changedAt ?? new Date();
  const changeLabel = KPI_CHANGE_TYPE_LABELS[event.changeType];
  const isValueChange =
    event.changeType === "updated" ||
    event.changeType === "weightage_changed" ||
    event.changeType === "target_changed";

  const fields: Array<[string, string]> = [
    ["KPI", event.kpiName],
    ["Change", changeLabel],
    ["Effective Quarter", event.effectiveQuarter || "—"],
    ["Weightage", `${event.weightage}`],
    ["Target", event.target || "—"],
  ];
  if (isValueChange) {
    fields.push(["Previous value", (event.previousValue ?? "").trim() || "—"]);
    fields.push(["New value", (event.newValue ?? "").trim() || "—"]);
  }
  fields.push(["Changed by", event.changedByName]);
  fields.push(["Date & time", fmtWhen(when)]);
  if (event.reason?.trim()) fields.push(["Reason", event.reason.trim()]);

  const subject = clampSubject(
    `Your KPI "${event.kpiName}" was ${changeLabel.toLowerCase()} — Altus Corp`,
  );

  // Compact, channel-agnostic strings for the in-app inbox row + push. Plain
  // text only (the inbox shows `body` verbatim, so it must never be JSON).
  const title = `Your KPI "${event.kpiName}" was ${changeLabel.toLowerCase()}`;
  const summaryBits = isValueChange
    ? [
        `${(event.previousValue ?? "").trim() || "—"} → ${(event.newValue ?? "").trim() || "—"}`,
        event.effectiveQuarter || null,
      ]
    : [
        `Weightage ${event.weightage}`,
        event.target?.trim() ? `Target ${event.target.trim()}` : null,
        event.effectiveQuarter || null,
      ];
  summaryBits.push(`by ${event.changedByName}`);
  const body = summaryBits.filter((b): b is string => !!b).join(" · ");

  const rows = fields
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:7px 14px 7px 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;vertical-align:top">${esc(k)}</td>
           <td style="padding:7px 0;font-size:14px;color:#1a1a1a;font-weight:600">${esc(v)}</td>
         </tr>`,
    )
    .join("");

  const greeting = event.recipient.name.trim()
    ? `Hi ${esc(event.recipient.name.trim().split(" ")[0] ?? "")},`
    : "Hello,";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Altus Corp · KPI</div>
      <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">KPI ${esc(changeLabel)}</h1>
      <div style="color:#666;font-size:14px">An update to your performance KPIs</div>
    </div>
    <p style="font-size:14px;margin:0 0 14px">${greeting} the HR team recorded the following change to your KPIs.</p>
    <table style="width:100%;border-collapse:collapse;margin:6px 0 16px">${rows}</table>
    <p style="font-size:12.5px;color:#666;margin-top:10px">If anything here looks off, please reach out to the HR team.</p>
    <p style="margin-top:24px;color:#999;font-size:11px">This is an automated update from the Altus Corp Dashboard.</p>
  </div>`;

  return { subject, html, title, body, fields, changeLabel };
}

export interface KpiNotifyResult {
  /** Whether a live email actually went out. */
  sent: boolean;
  /** Present when nothing was sent — why. */
  skipped?: "gated" | "no_recipient" | "resend_unconfigured" | "error";
  /** The recipient addresses the message targeted (office + personal if present). */
  recipients: string[];
}

/**
 * Compose + (conditionally) dispatch a KPI change notification.
 *
 * GATED: when {@link kpiNotificationsOn} is false (default), NO email is sent —
 * the engine composes the message and logs a "would notify" line so intent is
 * observable, then returns `{ sent:false, skipped:"gated" }`. The caller has
 * ALREADY recorded the append-only history row by the time this runs, so the
 * audit trail is complete whether or not mail is live.
 *
 * Never throws — a Resend outage must never fail the KPI mutation.
 */
export async function notifyKpiChange(event: KpiNotifyEvent): Promise<KpiNotifyResult> {
  const message = composeKpiMessage(event);

  const recipients = [event.recipient.officeEmail, event.recipient.personalEmail]
    .map((e) => (e ?? "").trim())
    .filter((e) => e.length > 0);

  if (recipients.length === 0) {
    console.warn(`[kpi-notify] no recipient email for "${event.kpiName}" — skipped.`);
    return { sent: false, skipped: "no_recipient", recipients };
  }

  // GATE: default OFF. Record intent, do NOT send.
  if (!kpiNotificationsOn()) {
    console.info(
      `[kpi-notify] GATED (${KPI_NOTIFICATIONS_FLAG}!=="true") — would notify ${recipients.join(", ")}: ${message.subject}`,
    );
    return { sent: false, skipped: "gated", recipients };
  }

  try {
    const resend = getResend();
    if (!resend) {
      console.info(`[kpi-notify] RESEND unconfigured — would notify ${recipients.join(", ")}: ${message.subject}`);
      return { sent: false, skipped: "resend_unconfigured", recipients };
    }
    const { error } = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject: message.subject,
      html: message.html,
      ...companyBcc(),
    });
    if (error) {
      console.error(`[kpi-notify] send failed: ${error.message}`);
      return { sent: false, skipped: "error", recipients };
    }
    return { sent: true, recipients };
  } catch (e) {
    console.error(`[kpi-notify] send threw:`, e);
    return { sent: false, skipped: "error", recipients };
  }
}

/* ------------------------------------------------------------------ */
/* IN-APP channel — ON by default (non-intrusive inbox row)            */
/* ------------------------------------------------------------------ */

/**
 * Write the KPI change to the affected employee's in-app inbox by inserting a
 * row into the shared `notifications` table — the SAME path every other module
 * surfaces through (see lib/notifications/dispatch.ts). We insert directly
 * (rather than via `notify()`) precisely BECAUSE the KPI engine owns its own
 * per-channel gating: `notify()` would additionally route email/push through
 * the admin notification-matrix, bypassing `KPI_NOTIFICATIONS_ON` / `PUSH_OFF`.
 *
 * ON by default and best-effort: any failure is swallowed so it can never fail
 * the KPI mutation. Returns whether a row was written.
 */
export async function notifyKpiChangeInApp(
  event: KpiNotifyEvent,
  message: KpiComposedMessage,
): Promise<boolean> {
  try {
    await db.insert(notifications).values({
      userId: event.recipient.employeeId,
      // The frozen NotificationKind union lives in db/schema.ts (owned
      // elsewhere); the column itself is `text`, so a KPI-specific literal is
      // safe. Cast at this single boundary — see KPI_NOTIFICATION_KIND.
      kind: KPI_NOTIFICATION_KIND as NotificationKind,
      title: message.title,
      body: message.body,
      actorId: event.changedById ?? null,
    });
    return true;
  } catch (e) {
    console.warn(`[kpi-notify] in-app insert failed:`, (e as Error)?.message ?? e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* PUSH channel — native FCM; respects PUSH_OFF                        */
/* ------------------------------------------------------------------ */

/**
 * Send a native-mobile push for the KPI change via the shared FCM helper. The
 * `PUSH_OFF` kill-switch + dead-token pruning + never-throws contract all live
 * inside {@link sendFcmToEmployee}; we simply reuse it. Best-effort.
 */
export async function notifyKpiChangePush(
  event: KpiNotifyEvent,
  message: KpiComposedMessage,
): Promise<void> {
  await sendFcmToEmployee(event.recipient.employeeId, {
    title: message.title,
    body: message.body,
    // No dedicated mobile KPI screen yet — land the user on the dashboard.
    route: "dashboard",
  }).catch((e) => {
    console.warn(`[kpi-notify] push failed:`, (e as Error)?.message ?? e);
  });
}

/* ------------------------------------------------------------------ */
/* Orchestrator — compose once, fan out across all channels            */
/* ------------------------------------------------------------------ */

export interface KpiDispatchResult {
  /** Whether the in-app inbox row was written (default-on channel). */
  inApp: boolean;
  /** Whether a push was attempted (false only when PUSH_OFF is set). */
  pushAttempted: boolean;
  /** The gated email outcome. */
  email: KpiNotifyResult;
}

/**
 * Compose the message ONCE, then fan out across in-app + push + email under
 * `Promise.allSettled`. Per-channel gating:
 *   • in-app — always on (non-intrusive inbox row)
 *   • push   — respects `PUSH_OFF` (inside sendFcmToEmployee)
 *   • email  — respects `KPI_NOTIFICATIONS_ON` (inside notifyKpiChange)
 *
 * Whole dispatch is best-effort — it never throws, so the KPI mutation is never
 * blocked by a notification failure.
 */
export async function dispatchKpiNotification(
  event: KpiNotifyEvent,
): Promise<KpiDispatchResult> {
  const message = composeKpiMessage(event);
  const pushAttempted = process.env.PUSH_OFF !== "true";

  const [inAppSettled, , emailSettled] = await Promise.allSettled([
    notifyKpiChangeInApp(event, message),
    notifyKpiChangePush(event, message),
    notifyKpiChange(event),
  ]);

  return {
    inApp: inAppSettled.status === "fulfilled" ? inAppSettled.value : false,
    pushAttempted,
    email:
      emailSettled.status === "fulfilled"
        ? emailSettled.value
        : { sent: false, skipped: "error", recipients: [] },
  };
}
