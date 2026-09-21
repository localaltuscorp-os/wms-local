import type { NextRequest } from "next/server";
import { startModuleDriveConnect } from "@/lib/modules/backup/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Connect Google Drive" on the Module Backups page. */
export async function GET(req: NextRequest) {
  return startModuleDriveConnect(req);
}
