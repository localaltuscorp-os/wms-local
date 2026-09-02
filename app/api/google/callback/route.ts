import { NextResponse, after, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getCurrentEmployee } from "@/lib/auth/current";
import { exchangeCode, fetchGoogleEmail } from "@/lib/google/calendar";
import { backfillDoerCalendar } from "@/lib/google/sync";

export const dynamic = "force-dynamic";

/** OAuth redirect target — exchange the code for a refresh token and store it
 *  on the signed-in employee. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = `${origin}/profile`;

  const me = await getCurrentEmployee();
  if (!me) return NextResponse.redirect(`${origin}/login`);

  const jar = await cookies();
  const expected = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");

  if (url.searchParams.get("error")) {
    return NextResponse.redirect(`${back}?google=denied`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${back}?google=error`);
  }

  try {
    const redirectUri = `${origin}/api/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.refresh_token) {
      // No refresh token returned (rare — happens if a prior grant exists and
      // Google withholds it). We force prompt=consent on connect to avoid this.
      return NextResponse.redirect(`${back}?google=error`);
    }
    const email = await fetchGoogleEmail(tokens.access_token);
    await db
      .update(employees)
      .set({
        googleRefreshToken: tokens.refresh_token,
        googleEmail: email,
        googleConnectedAt: new Date(),
      })
      .where(eq(employees.id, me.id));
    // Seed the calendar with the doer's existing active tasks, without
    // delaying the redirect — best-effort, logs internally.
    after(() => backfillDoerCalendar(me.id));
    return NextResponse.redirect(`${back}?google=connected`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[google callback]", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${back}?google=error`);
  }
}
