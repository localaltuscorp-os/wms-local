import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { canExportHrRecords } from "@/lib/hr/records-export/access";
import { getDriveStatus } from "@/lib/hr/records-export/settings";
import { runDriveSync } from "@/lib/hr/records-export/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Stop taking on new people after this long, leaving room to finish the current one. */
const BUDGET_MS = 45_000;

/**
 * POST /api/hr/records/drive/run — "Save to Drive now", one slice at a time.
 *
 * Each call saves people for up to BUDGET_MS and returns `partial` or `done`;
 * the settings screen calls again while it is `partial`, showing progress. That
 * keeps every request well inside the function time limit however many people
 * there are, and a closed tab simply leaves the save paused where it was.
 *
 * Not rate-limited on purpose: the save lock (lib/hr/records-export/sync.ts)
 * already makes a second concurrent call return `busy` immediately.
 */
export async function POST(): Promise<NextResponse> {
  const me = await requireUser();
  if (!(await canExportHrRecords(me))) {
    return NextResponse.json({ ok: false, error: "Only HR admins can save records to Drive." }, { status: 403 });
  }
  const result = await runDriveSync({ trigger: "manual", budgetMs: BUDGET_MS });
  return NextResponse.json({ ok: true, result, status: await getDriveStatus() });
}
