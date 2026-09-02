import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import {
  listMaterials,
  getInductionForEmployee,
  isManager,
  type TcMaterialRow,
  type InductionItem,
} from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** `YYYY-MM-DD` → "3 Jun 2026". Wrapped in `new Date` (noon UTC) so a bare
 *  date string never trips a timezone / string→Date bug. */
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Which material kind the row is — drives the mobile screen's leading glyph.
 *  Mirrors the web MaterialsTable icon logic (video wins, then pdf / xls). */
function materialKind(r: TcMaterialRow): string {
  if (r.videoUrl) return "video";
  if (r.fileType === "pdf") return "pdf";
  if (r.fileType === "xls") return "xls";
  if (r.fileType) return r.fileType;
  return "other";
}

/**
 * GET /api/mobile/training — the Training Centre for the SIGNED-IN user
 * (Training workspace). Owner-scoped, mirroring the web `/training` page's data
 * (the material library with the viewer's own watched flag) PLUS the user's
 * personalised induction path (getInductionForEmployee for their department),
 * which the web surfaces as the induction filter.
 *
 * Reuses the web query functions [listMaterials] / [getInductionForEmployee]
 * verbatim so the phone and the web page can never diverge. Creator names are
 * resolved here (via the same [listEmployeeOptions] the web page uses) so the
 * client renders "Created by" without a second round-trip. Read-only: material
 * is authored / tests are taken on the web.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: MOBILE_CORS },
    );
  }
  const me = auth.employee;

  const manager =
    (await isManager(me.id)) || me.isAdmin || isSuperAdmin(me.email);

  const [rows, induction, employeeOptions] = await Promise.all([
    // Managers see archived material too (matches the web page's canManage).
    listMaterials(me.id, { includeArchived: manager }),
    getInductionForEmployee(me.id, me.departmentId),
    listEmployeeOptions(),
  ]);

  const nameById = new Map(employeeOptions.map((e) => [e.id, e.name]));
  const creators = (ids: string[]): string[] =>
    ids.map((id) => nameById.get(id)).filter((n): n is string => !!n);

  // Library — the viewer's own watched flag; managers also get archived rows.
  const materials = rows.map((r) => ({
    id: r.id,
    addedOn: r.addedOn,
    addedOnLabel: fmtDate(r.addedOn),
    subject: r.subject ?? null,
    los: r.los ?? null,
    fileName: r.fileName ?? null,
    kind: materialKind(r),
    videoUrl: r.videoUrl ?? null,
    version: r.version ?? null,
    partOfInduction: r.partOfInduction,
    archived: r.archived,
    createdByNames: creators(r.createdByIds),
    watchedByMe: r.watchedByMe,
  }));

  // The user's personalised induction path (department-tagged induction
  // material with watch + test completion). Empty when they have no department.
  const inductionItems = induction.map((m: InductionItem) => ({
    id: m.id,
    subject: m.subject ?? null,
    los: m.los ?? null,
    fileName: m.fileName ?? null,
    kind: m.videoUrl
      ? "video"
      : m.fileType === "pdf"
        ? "pdf"
        : m.fileType === "xls"
          ? "xls"
          : m.fileType ?? "other",
    videoUrl: m.videoUrl ?? null,
    watched: m.watched,
    test1Passed: m.test1Passed,
    test2Passed: m.test2Passed,
    complete: m.complete,
  }));

  const inductionDone = inductionItems.filter((m) => m.complete).length;
  const watchedCount = materials.filter((m) => m.watchedByMe).length;

  return NextResponse.json(
    {
      ownerName: me.name,
      canManage: manager,
      stats: {
        materials: materials.length,
        watched: watchedCount,
        inductionTotal: inductionItems.length,
        inductionDone,
      },
      induction: inductionItems,
      materials,
    },
    { headers: MOBILE_CORS },
  );
}
