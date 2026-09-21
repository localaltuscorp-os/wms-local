import type { NextRequest } from "next/server";
import { startModuleDriveConnect } from "@/lib/modules/backup/oauth";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Connect Google Drive" on the Module Backups page. */
export async function GET(req: NextRequest) {
  // The MODULE gate, on top of the `mayManage()` check inside
  // `startModuleDriveConnect`: that one asks whether this person may manage
  // backups at all, this one asks whether Module Backups is still granted to
  // them. A handler renders no layout, so nothing else applies the matrix here.
  const denial = await apiViewDenial(req);
  if (denial) return denial;
  return startModuleDriveConnect(req);
}
