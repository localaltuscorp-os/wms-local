import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/db/schema";
import {
  type NotificationChannel,
} from "@/lib/notifications/resolve-channels";

export type IntegrationStatus = {
  channel: NotificationChannel;
  connected: boolean;
  maskedKey: string | null;
  successLast24h: number;
  lastSuccessAt: Date | null;
};

function mask(v: string | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

async function deliveryStats(channel: NotificationChannel) {
  const rows = (await db.execute(sql`
    select
      count(*)::int as count,
      max(created_at) as last
    from notifications
    where created_at > now() - interval '24 hours'
      and ${channel} = any(delivered_channels)
  `)) as unknown as Array<{ count: number; last: Date | null }>;
  const first = rows[0];
  return {
    successLast24h: first?.count ?? 0,
    lastSuccessAt: first?.last ?? null,
  };
}

export const getIntegrationHealth = cache(
  async (): Promise<IntegrationStatus[]> => {
    const out: IntegrationStatus[] = [];

    const resendKey = process.env.RESEND_API_KEY;
    const emailStats = await deliveryStats("email");
    out.push({
      channel: "email",
      connected: !!resendKey,
      maskedKey: mask(resendKey),
      ...emailStats,
    });

    const slackToken = process.env.SLACK_BOT_TOKEN;
    const slackStats = await deliveryStats("slack");
    out.push({
      channel: "slack",
      connected: !!slackToken,
      maskedKey: mask(slackToken),
      ...slackStats,
    });

    const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const waStats = await deliveryStats("whatsapp");
    out.push({
      channel: "whatsapp",
      connected: !!waToken && !!waPhoneId,
      maskedKey: mask(waToken),
      ...waStats,
    });

    const vapidPub = process.env.VAPID_PUBLIC_KEY;
    const subRow = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pushSubscriptions);
    const subCount = subRow[0]?.n ?? 0;
    const pushStats = await deliveryStats("push");
    out.push({
      channel: "push",
      connected: !!vapidPub && subCount > 0,
      maskedKey: vapidPub ? `${vapidPub.slice(0, 6)}…` : null,
      ...pushStats,
    });

    return out;
  },
);
