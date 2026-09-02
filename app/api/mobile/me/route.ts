import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";

// Node runtime (Firebase Admin) + always dynamic (per-request auth).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * GET /api/mobile/me — the native app's "who am I / am I enrolled" check.
 * Verifies the Bearer Firebase ID token and returns the signed-in employee.
 * Doubles as the post-login gate (200 = enrolled & active).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const e = auth.employee;
  return NextResponse.json(
    {
      id: e.id,
      name: e.name,
      email: e.email,
      isAdmin: e.isAdmin,
      avatarUrl: e.avatarUrl ?? null,
      department: e.department ?? null,
    },
    { headers: MOBILE_CORS },
  );
}
