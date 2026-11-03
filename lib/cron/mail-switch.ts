import "server-only";
import { NextResponse } from "next/server";

/**
 * Local-only switch for the cron jobs that email people.
 *
 * Set `CRON_MAIL_OFF=on` in a developer's own `.env.local` to stop those
 * routes from sending. It is read from the environment and is NOT set in
 * code, so any deployment that does not define it (including Vercel) keeps
 * sending as before.
 */
export function isCronMailOff(): boolean {
  return (process.env.CRON_MAIL_OFF ?? "").trim().toLowerCase() === "on";
}

export function cronMailOffResponse(): NextResponse {
  return NextResponse.json({ ok: true, skipped: "cron_mail_off" });
}
