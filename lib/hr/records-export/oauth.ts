import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";
import { buildAuthUrl, exchangeCode, fetchGoogleEmail, isGoogleConfigured } from "@/lib/google/calendar";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { canExportHrRecords } from "./access";
import { HR_RECORDS_DRIVE_ACCOUNT, markDriveConnected } from "./settings";

/**
 * Connecting hr.altuscorp@gmail.com's Drive.
 *
 * REUSES THE CALENDAR OAUTH CLIENT AND ITS REDIRECT URI (/api/google/callback),
 * so no new URI has to be registered in Google Cloud. The two flows are told
 * apart by the `state` value: this one starts with "hrdrive.", and the callback
 * route hands those to `finishHrDriveConnect`. The state is still compared with
 * the cookie exactly as the calendar flow does, so the prefix grants nothing.
 */

export const HR_DRIVE_STATE_PREFIX = "hrdrive.";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = ["openid", "email", DRIVE_FILE_SCOPE].join(" ");
const STATE_COOKIE = "g_oauth_state";
export const RECORDS_BACKUP_PATH = "/hr/records-backup";

async function mayManage(): Promise<"ok" | "login" | "forbidden"> {
  const me = await getCurrentEmployee();
  if (!me) return "login";
  if (isCandidateAccount(me) || !(await canExportHrRecords(me))) return "forbidden";
  return "ok";
}

export async function startHrDriveConnect(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const back = `${origin}${RECORDS_BACKUP_PATH}`;
  const access = await mayManage();
  if (access === "login") return NextResponse.redirect(`${origin}/login`);
  if (access === "forbidden") return NextResponse.redirect(`${back}?drive=forbidden`);

  if (DUMMY_MODE) {
    // No Google in dummy mode: "connect" the on-disk Drive as the HR account.
    const me = (await getCurrentEmployee())!;
    await markDriveConnected({ email: HR_RECORDS_DRIVE_ACCOUNT, refreshToken: "dummy-mode", byId: me.id });
    return NextResponse.redirect(`${back}?drive=connected`);
  }
  if (!isGoogleConfigured()) return NextResponse.redirect(`${back}?drive=unconfigured`);

  const state = HR_DRIVE_STATE_PREFIX + crypto.randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(
    buildAuthUrl(`${origin}/api/google/callback`, state, {
      scope: SCOPES,
      loginHint: HR_RECORDS_DRIVE_ACCOUNT,
      includeGrantedScopes: false,
    }),
  );
}

export async function finishHrDriveConnect(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = `${origin}${RECORDS_BACKUP_PATH}`;

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const access = await mayManage();
  if (access === "login") return NextResponse.redirect(`${origin}/login`);
  if (access === "forbidden") return NextResponse.redirect(`${back}?drive=forbidden`);

  if (url.searchParams.get("error")) return NextResponse.redirect(`${back}?drive=denied`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) return NextResponse.redirect(`${back}?drive=error`);

  try {
    const tokens = await exchangeCode(code, `${origin}/api/google/callback`);
    if (!tokens.refresh_token) return NextResponse.redirect(`${back}?drive=error`);
    // The consent screen lets the user untick Drive. Without it every upload
    // would fail, so refuse the connection now rather than at 3 a.m.
    if (!(tokens.scope ?? "").split(/\s+/).includes(DRIVE_FILE_SCOPE)) {
      return NextResponse.redirect(`${back}?drive=no-scope`);
    }
    const email = ((await fetchGoogleEmail(tokens.access_token)) ?? "").toLowerCase();
    if (email !== HR_RECORDS_DRIVE_ACCOUNT) {
      // Not stored and not revoked — revoking would also cut that account's
      // own Calendar connection to this app, which is not ours to break.
      const as = email ? `&as=${encodeURIComponent(email)}` : "";
      return NextResponse.redirect(`${back}?drive=wrong-account${as}`);
    }
    const me = (await getCurrentEmployee())!;
    await markDriveConnected({ email, refreshToken: tokens.refresh_token, byId: me.id });
    return NextResponse.redirect(`${back}?drive=connected`);
  } catch (err) {
    console.error("[hr-records-drive connect]", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${back}?drive=error`);
  }
}
