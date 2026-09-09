import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { isLoginLive, isCandidateAccount } from "@/lib/auth/current";
import {
  resolveDeviceContext,
  deviceIdFromRequest,
  touchLastSeen,
} from "@/lib/security/device-access";

/**
 * Auth for the native app's `/api/mobile/*` endpoints. The app signs in with
 * Firebase on-device and sends the Firebase ID token as a Bearer header; we
 * verify it with Firebase Admin (the same `verifyIdToken` the web session
 * exchange uses) and resolve the enrolled employee. Stateless — no cookie —
 * because the Firebase client SDK auto-refreshes the token on the device.
 */
export type MobileAuth =
  | { ok: true; employee: Employee; deviceRowId: string | null }
  | { ok: false; status: number; error: string };

export interface MobileAuthOptions {
  /**
   * Skip the registered-device check.
   *
   * EXACTLY ONE endpoint may set this: `POST /api/mobile/attendance/register-
   * device`, whose entire purpose is to enroll a phone that is by definition not
   * yet registered. Gating it would make enrollment impossible — the phone could
   * never become registered because it is not registered. Every other endpoint
   * leaves it unset.
   */
  skipDeviceCheck?: boolean;
}

/**
 * ── DEVICE ACCESS ON THE NATIVE SURFACE ────────────────────────────────────
 * The app sends its keystore device id on the `x-altus-device-id` header (see
 * android-app AuthInterceptor). That id is the same one the punch allowlist has
 * always used, so a phone already approved for attendance is already approved
 * here — nobody re-enrolls.
 *
 * A build that predates the header sends no id and is refused as
 * `device-unidentified`. That is the correct answer to "an unidentified device
 * is asking for WMS data", and it is why `DEVICE_ACCESS_ENFORCEMENT=off` exists:
 * an operator rolling out the new app build turns enforcement off for the
 * length of that rollout, deliberately and visibly, rather than the server
 * quietly trusting whoever omits the header.
 */
export async function authenticateMobileRequest(
  req: Request,
  options: MobileAuthOptions = {},
): Promise<MobileAuth> {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "").trim() : null;
  if (!token) return { ok: false, status: 401, error: "missing-token" };

  let uid: string;
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { ok: false, status: 401, error: "invalid-token" };
  }

  const employee = await db.query.employees.findFirst({
    where: eq(employees.firebaseUid, uid),
  });
  if (!employee) return { ok: false, status: 403, error: "not-enrolled" };
  if (!isLoginLive(employee)) return { ok: false, status: 403, error: "deactivated" };
  // A candidate guest-account has NO mobile surface — the app is web-form only.
  if (isCandidateAccount(employee)) return { ok: false, status: 403, error: "candidate" };

  if (options.skipDeviceCheck) return { ok: true, employee, deviceRowId: null };

  const ctx = await resolveDeviceContext(employee, deviceIdFromRequest(req));
  if (!ctx.allowed) {
    // 403 with a machine-readable reason so the app can route the person to the
    // right screen ("Register this device" vs "Waiting for approval") instead of
    // showing one generic refusal for four different situations.
    return { ok: false, status: 403, error: `device-${ctx.reason}` };
  }
  if (ctx.device) void touchLastSeen(ctx.device.id);
  return { ok: true, employee, deviceRowId: ctx.device?.id ?? null };
}

/** Shared CORS headers so the Expo *web* preview (a browser on localhost) can
 *  call these endpoints. Native apps ignore CORS, so this is purely for the
 *  in-browser dev preview. The Bearer token is the real gate. */
export const MOBILE_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Altus-Device-Id",
  "Access-Control-Max-Age": "86400",
} as const;
