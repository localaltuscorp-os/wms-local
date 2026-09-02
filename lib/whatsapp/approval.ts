import "server-only";
import { sendTemplate } from "@/lib/whatsapp/client";
import { isDispatchV2On, isDispatchV2DryRun } from "@/lib/dispatch/flag";

/**
 * WS-7 · WhatsApp senders that carry a one-click approve DEEP-LINK.
 *
 * These deliberately DO NOT go through `lib/whatsapp/templates.ts` (which is
 * keyed to the `NotificationKind` enum in db/schema.ts — off-limits for this
 * slice). Instead they call `sendTemplate` directly with two NEW Meta utility
 * templates that must be registered in Business Manager (see INTEGRATION NOTE):
 *
 *   vp_attendance_confirm — body vars {name, scope, week}; ONE dynamic
 *                           URL button whose base is
 *                           `${SITE_URL}/api/approve/` and whose {{1}} suffix
 *                           is the raw approval token.
 *   vp_pms_report         — body vars {name, quarter, score}; a static URL
 *                           button to /pms (no dynamic suffix needed).
 *
 * Meta URL-button dynamic param shape:
 *   { type: "button", sub_type: "url", index: "0",
 *     parameters: [{ type: "text", text: "<token>" }] }
 *
 * DOUBLE-GATED behind DISPATCH_V2 exactly like the email senders.
 */

const T_ATTENDANCE_CONFIRM = "vp_attendance_confirm";
const T_PMS_REPORT = "vp_pms_report";

export type WhatsAppDispatchResult =
  | { sent: true; id: string }
  | { sent: false; skipped?: true; dryRun?: true; error?: string };

function textParam(s: string) {
  return { type: "text" as const, text: s };
}

/** Shared gate: DISPATCH_V2 + opt-in + phone presence. */
function preflight(
  recipient: { whatsappOptedIn: boolean; whatsappPhone: string | null },
): WhatsAppDispatchResult | null {
  if (!isDispatchV2On()) return { sent: false, skipped: true };
  if (!recipient.whatsappOptedIn || !recipient.whatsappPhone) {
    return { sent: false, skipped: true };
  }
  if (isDispatchV2DryRun()) return { sent: false, dryRun: true };
  return null;
}

/** Monday attendance-confirmation reminder + one-click approve button. */
export async function sendAttendanceConfirmWhatsApp(args: {
  recipient: {
    whatsappOptedIn: boolean;
    whatsappPhone: string | null;
    whatsappTemplateLocale?: string | null;
  };
  name: string;
  scopeLabel: string;
  weekLabel: string;
  /** Raw approval token — becomes the URL-button {{1}} suffix. */
  approveTokenSuffix: string;
}): Promise<WhatsAppDispatchResult> {
  const gate = preflight(args.recipient);
  if (gate) return gate;
  const r = await sendTemplate({
    toPhone: args.recipient.whatsappPhone!,
    templateName: T_ATTENDANCE_CONFIRM,
    languageCode: args.recipient.whatsappTemplateLocale ?? "en",
    components: [
      {
        type: "body",
        parameters: [
          textParam(args.name),
          textParam(args.scopeLabel),
          textParam(args.weekLabel),
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [textParam(args.approveTokenSuffix)],
      },
    ],
  });
  return r.ok ? { sent: true, id: r.id } : { sent: false, error: r.error };
}

/** Quarterly PMS report ping (static button to /pms — no token). */
export async function sendPmsReportWhatsApp(args: {
  recipient: {
    whatsappOptedIn: boolean;
    whatsappPhone: string | null;
    whatsappTemplateLocale?: string | null;
  };
  name: string;
  quarterLabel: string;
  overallScore: number;
}): Promise<WhatsAppDispatchResult> {
  const gate = preflight(args.recipient);
  if (gate) return gate;
  const r = await sendTemplate({
    toPhone: args.recipient.whatsappPhone!,
    templateName: T_PMS_REPORT,
    languageCode: args.recipient.whatsappTemplateLocale ?? "en",
    components: [
      {
        type: "body",
        parameters: [
          textParam(args.name),
          textParam(args.quarterLabel),
          textParam(`${Math.round(args.overallScore)}/100`),
        ],
      },
    ],
  });
  return r.ok ? { sent: true, id: r.id } : { sent: false, error: r.error };
}
