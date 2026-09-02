import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { devicePushTokens } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";

/**
 * Native-mobile push via Firebase Cloud Messaging (HTTP v1). Reuses the same
 * Firebase service-account credentials as the Sheets/backup integrations
 * (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) — no extra secret. Best-effort
 * and self-cleaning: tokens Firebase reports as unregistered are pruned so the
 * table doesn't accumulate dead devices.
 *
 * Kill switch: PUSH_OFF=true. Never throws (the notification dispatch is
 * strictly best-effort).
 */
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "altuscorp-e7140";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

export interface PushPayload {
  title: string;
  body: string;
  /** In-app deep-link route, e.g. "task/<id>" or "attendance". */
  route?: string;
}

export async function sendFcmToEmployee(employeeId: string, payload: PushPayload): Promise<void> {
  if (process.env.PUSH_OFF === "true") return;
  try {
    const tokens = await db
      .select({ token: devicePushTokens.token })
      .from(devicePushTokens)
      .where(eq(devicePushTokens.employeeId, employeeId));
    if (tokens.length === 0) return;

    const accessToken = await getServiceAccountToken([GOOGLE_SCOPES.messaging]);
    const dead: string[] = [];

    await Promise.all(
      tokens.map(async ({ token }) => {
        try {
          const res = await fetch(FCM_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: payload.title, body: payload.body || " " },
                data: payload.route ? { route: payload.route } : {},
                android: {
                  priority: "HIGH",
                  notification: { channelId: "altus_default" },
                },
              },
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            // A retired token → 404 / UNREGISTERED / INVALID_ARGUMENT. Prune it.
            if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(text)) {
              dead.push(token);
            }
          }
        } catch {
          /* network hiccup for one token — skip, keep the rest */
        }
      }),
    );

    if (dead.length > 0) {
      await db.delete(devicePushTokens).where(inArray(devicePushTokens.token, dead)).catch(() => {});
    }
  } catch (err) {
    console.warn("[fcm] push failed:", (err as Error)?.message ?? err);
  }
}
