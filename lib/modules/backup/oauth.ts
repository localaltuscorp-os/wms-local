import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/lib/accounts/crypto";
import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";
import { buildAuthUrl, exchangeCode, fetchGoogleEmail, isGoogleConfigured } from "@/lib/google/calendar";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { canManageModuleBackups } from "./access";
import { MODULE_BACKUP_DRIVE_ACCOUNT, disconnect, markConnected } from "./settings";

/**
 * Connecting the module backup's own Google account.
 *
 * REUSES THE EXISTING OAUTH CLIENT AND REDIRECT URI (/api/google/callback), so
 * no new Google Cloud setup: three flows now share that address — an employee's
 * calendar, the HR records Drive, and this — told apart by the `state` prefix.
 *
 * DIFFERENT ACCOUNT FROM THE HR BACKUP, deliberately (21 Sep). This writes to
 * MODULE_BACKUP_DRIVE_ACCOUNT; connecting or disconnecting here never touches
 * the HR records connection.
 */

export const MODULE_DRIVE_STATE_PREFIX = "modbackup.";
const STATE_COOKIE = "mod_backup_oauth_state";
export const MODULE_BACKUPS_PATH = "/admin/module-backups";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = ["openid", "email", DRIVE_FILE_SCOPE].join(" ");

async function mayManage(): Promise<"ok" | "login" | "forbidden"> {
  const me = await getCurrentEmployee();
  if (!me) return "login";
  if (isCandidateAccount(me) || !canManageModuleBackups(me)) return "forbidden";
  return "ok";
}

export async function startModuleDriveConnect(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const back = `${origin}${MODULE_BACKUPS_PATH}`;
  const access = await mayManage();
  if (access === "login") return NextResponse.redirect(`${origin}/login`);
  if (access === "forbidden") return NextResponse.redirect(`${back}?drive=forbidden`);

  if (DUMMY_MODE) {
    // No Google in dummy mode: "connect" the on-disk Drive stand-in.
    const me = (await getCurrentEmployee())!;
    await markConnected({
      email: MODULE_BACKUP_DRIVE_ACCOUNT,
      refreshTokenEnc: encryptSecret("dummy-mode") ?? "",
      byId: me.id,
    });
    return NextResponse.redirect(`${back}?drive=connected`);
  }
  if (!isGoogleConfigured()) return NextResponse.redirect(`${back}?drive=unconfigured`);

  const state = MODULE_DRIVE_STATE_PREFIX + crypto.randomBytes(16).toString("hex");
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
      loginHint: MODULE_BACKUP_DRIVE_ACCOUNT,
    }),
  );
}

export async function finishModuleDriveConnect(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = `${origin}${MODULE_BACKUPS_PATH}`;

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const access = await mayManage();
  if (access === "login") return NextResponse.redirect(`${origin}/login`);
  if (access === "forbidden") return NextResponse.redirect(`${back}?drive=forbidden`);

  if (url.searchParams.get("error")) return NextResponse.redirect(`${back}?drive=denied`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${back}?drive=error`);
  }

  try {
    const tokens = await exchangeCode(code, `${origin}/api/google/callback`);
    if (!tokens.refresh_token) return NextResponse.redirect(`${back}?drive=error`);
    // The consent screen lets someone untick Drive. Without it every upload
    // would fail, so refuse the connection now rather than at 3 a.m.
    if (!(tokens.scope ?? "").split(/\s+/).includes(DRIVE_FILE_SCOPE)) {
      return NextResponse.redirect(`${back}?drive=no-scope`);
    }
    const email = ((await fetchGoogleEmail(tokens.access_token)) ?? "").toLowerCase();
    if (email !== MODULE_BACKUP_DRIVE_ACCOUNT) {
      // Not stored, and not revoked either: revoking would also cut that
      // account's own connection to this app, which is not ours to break.
      const as = email ? `&as=${encodeURIComponent(email)}` : "";
      return NextResponse.redirect(`${back}?drive=wrong-account${as}`);
    }
    const me = (await getCurrentEmployee())!;
    // encryptSecret returns null only for an empty input, and a refresh token
    // that got this far is not empty — but a null would silently store "no
    // connection", so refuse instead of writing a broken row.
    const encrypted = encryptSecret(tokens.refresh_token);
    if (!encrypted) return NextResponse.redirect(`${back}?drive=error`);
    await markConnected({ email, refreshTokenEnc: encrypted, byId: me.id });
    return NextResponse.redirect(`${back}?drive=connected`);
  } catch (err) {
    console.error("[module-backup connect]", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${back}?drive=error`);
  }
}

export async function disconnectModuleDrive(): Promise<void> {
  await disconnect();
}
