import { NextResponse } from "next/server";
import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";
import { canExportModule } from "@/lib/modules/backup/access";
import { buildModuleDownload } from "@/lib/modules/backup/download";
import { moduleBackup } from "@/lib/modules/backup/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * THE EXPORT BUTTON'S ROUTE — one module, as a ZIP, now.
 *
 * `?scope=new` takes only what the nightly save has not carried yet; the
 * default is everything.
 *
 * A PREDICATE, NOT A REDIRECTING GUARD: this answers a `fetch`, and a redirect
 * to /login would be followed and saved as the ZIP file. Same reasoning as the
 * HR records download (lib/hr/records-export/access.ts).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const { moduleId } = await params;
  const def = moduleBackup(moduleId);
  if (!def) return NextResponse.json({ error: "unknown-module" }, { status: 404 });

  const me = await getCurrentEmployee();
  if (!me || isCandidateAccount(me)) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 });
  }
  if (!(await canExportModule(me, moduleId))) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: `You don't have permission to export ${def.label}. Ask a super-admin to grant it on Module Backups.`,
      },
      { status: 403 },
    );
  }

  const scope = new URL(req.url).searchParams.get("scope") === "new" ? "new" : "all";
  const result = await buildModuleDownload({ moduleId, scope });

  return new NextResponse(result.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Length": String(result.bytes.byteLength),
      "Cache-Control": "no-store",
      // Read by the button to warn when the archive is short of files.
      "X-Files-Skipped": String(result.truncatedFiles),
    },
  });
}
