import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { listIntroductions } from "@/lib/queries/people-gives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** `d MMM yyyy` from a bare `YYYY-MM-DD` string, wrapped in `new Date` (noon UTC)
 *  so a date-only string never trips a timezone/string→Date bug. Null passes
 *  through untouched (the client renders an em-dash for a missing reminder). */
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * GET /api/mobile/people-gives — the People Gives referral network (Sales
 * workspace): every logged introduction of who can introduce Altus to whom,
 * newest first. Reuses the exact web query [listIntroductions] so the phone and
 * the web `/people-gives` page can never diverge.
 *
 * People Gives is a shared referral database (the web page shows the whole
 * network, gated only on Sales-workspace access), so this read is the full
 * network — not a personal slice. Auth is the Firebase bearer; the payload is
 * flattened into render-ready display fields (joined names, humanised dates) so
 * the native screen stays a dumb render.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  // AUTHZ: People Gives is the Sales workspace. The web page is Sales-gated; this
  // mobile route was auth-only, leaking the whole referral network (names, cell
  // numbers, prospects) to ANY employee. Gate on Sales access, like mobile/events.
  if (!canAccessWorkspace("sales", await accessFor(auth.employee))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const rows = await listIntroductions();

  const introductions = rows.map((r) => {
    const introducerName = `${r.introducerFirstName} ${r.introducerLastName}`.trim();
    const prospectName = `${r.prospectFirstName} ${r.prospectLastName}`.trim();
    return {
      id: r.id,
      receivedOn: r.receivedOn,
      receivedOnLabel: fmtDate(r.receivedOn) ?? "—",
      referenceSource: r.referenceSource,
      introducerName,
      introducerCell: r.introducerCell,
      prospectCompany: r.prospectCompany,
      prospectName,
      designation: r.designation,
      businessCategory: r.businessCategory,
      natureOfBusiness: r.natureOfBusiness,
      notes: r.notes,
      nextReminderDate: r.nextReminderDate,
      nextReminderLabel: fmtDate(r.nextReminderDate),
      salesPerson: r.salesPerson,
      createdBy: r.createdBy,
    };
  });

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      count: introductions.length,
      introductions,
    },
    { headers: MOBILE_CORS },
  );
}
