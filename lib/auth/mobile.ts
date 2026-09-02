import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/db/schema";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

/**
 * Auth for the native app's `/api/mobile/*` endpoints. The app signs in with
 * Firebase on-device and sends the Firebase ID token as a Bearer header; we
 * verify it with Firebase Admin (the same `verifyIdToken` the web session
 * exchange uses) and resolve the enrolled employee. Stateless — no cookie —
 * because the Firebase client SDK auto-refreshes the token on the device.
 */
export type MobileAuth =
  | { ok: true; employee: Employee }
  | { ok: false; status: number; error: string };

export async function authenticateMobileRequest(req: Request): Promise<MobileAuth> {
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
  if (!employee.isActive) return { ok: false, status: 403, error: "deactivated" };
  return { ok: true, employee };
}

/** Shared CORS headers so the Expo *web* preview (a browser on localhost) can
 *  call these endpoints. Native apps ignore CORS, so this is purely for the
 *  in-browser dev preview. The Bearer token is the real gate. */
export const MOBILE_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;
