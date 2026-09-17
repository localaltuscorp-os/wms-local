import type { NextRequest } from "next/server";
import { startHrDriveConnect } from "@/lib/hr/records-export/oauth";

export const dynamic = "force-dynamic";

/** Start connecting the HR Google account's Drive (HR-admin only — checked inside). */
export async function GET(req: NextRequest) {
  return startHrDriveConnect(req);
}
