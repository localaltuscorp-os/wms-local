import { requireUser } from "@/lib/auth/current";
import { renderExitLetterPdf } from "@/lib/salary/exit-letter-pdf";
import {
  EXIT_LETTER_META,
  EXIT_LETTER_TYPES,
  type ExitLetterInput,
  type ExitLetterType,
} from "@/lib/salary/exit-letters";

/**
 * POST /salary/documents/pdf
 *
 * Generates one WS-5 exit letter (Full & Final / Return of Assets / Handover
 * Accepted) as an A4 PDF in the payslip house style. Admin-only, and DARK
 * behind the SALARY_DOCS_UI kill-switch until Sir verifies. POST (not GET) so
 * long free-text fields (asset lists, breakups) aren't capped by URL length.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isType(v: unknown): v is ExitLetterType {
  return typeof v === "string" && (EXIT_LETTER_TYPES as string[]).includes(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.SALARY_DOCS_UI === "false") { // default ON, killable via =false
    return new Response("Not found", { status: 404 });
  }

  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  if (!me.isAdmin) return new Response("Forbidden", { status: 403 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!isType(payload.type)) return new Response("Unknown document type", { status: 400 });
  const entity = str(payload.entity);
  const employeeName = str(payload.employeeName);
  if (!entity) return new Response("Entity is required", { status: 400 });
  if (!employeeName) return new Response("Employee name is required", { status: 400 });

  const input: ExitLetterInput = {
    type: payload.type,
    employeeName,
    entity,
    designation: str(payload.designation),
    letterDate: str(payload.letterDate),
    place: str(payload.place),
    lastWorkingDay: str(payload.lastWorkingDay),
    settlementAmount: str(payload.settlementAmount),
    settlementBreakup: str(payload.settlementBreakup),
    assets: str(payload.assets),
    assetReturnBy: str(payload.assetReturnBy),
    handoverTo: str(payload.handoverTo),
    handoverSummary: str(payload.handoverSummary),
  };

  const buf = await renderExitLetterPdf(input, { generatedBy: me.name });

  const slug = EXIT_LETTER_META[input.type].type;
  const safeName = employeeName.replace(/\s+/g, "");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${slug}-${safeName}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
