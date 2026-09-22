import type { NextRequest } from "next/server";
import { startHrDriveConnect } from "@/lib/hr/records-export/oauth";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const dynamic = "force-dynamic";

/** Start connecting the HR Google account's Drive (HR-admin only — checked inside). */
export async function GET(req: NextRequest) {
  // The MODULE gate. A route handler renders no layout, so `requirePathView`
  // never runs for it: without this, revoking a module hides its screen while
  // this endpoint keeps answering. First in the body, so a denied caller is
  // refused before the handler does any work (rendering, mailing, Chromium).
  const denial = await apiViewDenial(req);
  if (denial) return denial;
  return startHrDriveConnect(req);
}
