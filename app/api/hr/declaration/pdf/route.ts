import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { designations, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getLetter } from "@/lib/hr/letters/registry";
import { formatDateHr } from "@/lib/format";
import { apiViewDenial } from "@/lib/permissions/api-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/hr/declaration/pdf — MY OWN declaration, rendered and downloaded.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM /api/hr/letters/pdf ───────────────────
 * The letters endpoint, and the whole `/hr/letters/*` surface, is HR-STAFF only
 * (`isHrStaff` = super-admin ∪ the HR department). That is correct for the
 * letters module: it renders ANY template for ANY person and takes arbitrary
 * `bodyHtml`, which is why it is locked down.
 *
 * But the Declaration Letter has to be printed and signed by EVERY employee, and
 * almost none of them are HR staff — Ruchita, who keeps the signed file, is
 * Founder/Operations and is redirected away from that page. Without this route
 * the instruction "print it, sign it, hand it in" is impossible to follow for the
 * people it is addressed to.
 *
 * ── WHAT MAKES IT SAFE TO OPEN UP ─────────────────────────────────────────
 * It takes NO INPUT AT ALL. Not a template key, not a person, not HTML, not a
 * letterhead. The template is hard-wired to `declaration` and the values are read
 * from the caller's own `employees` row. So the most a signed-in person can do is
 * render their own declaration with their own name on it — there is no roster to
 * enumerate, no other document to reach, and no path into the rich/Chromium
 * renderer that the letters endpoint has to defend.
 *
 * `apiViewDenial` is still called, matching every other handler
 * (`tests/unit/route-handler-coverage.test.ts` fails any handler that skips it).
 * No catalogue node claims this path yet, so today it is a no-op — the moment one
 * does, this route starts obeying it like any other. Listed in that test's
 * `UNOWNED_BY_DESIGN`, for the same reason as the avatar route: it is
 * self-only, and a 403 on somebody's own signed declaration is not a boundary
 * worth enforcing until the module actually has one.
 */
export async function GET(request: Request): Promise<Response> {
  const me = await requireUser();

  const denial = await apiViewDenial(request);
  if (denial) return denial;

  // Rendering a PDF is pdfkit work, not a read — rate-limited like a write so a
  // loop on this URL cannot pin the server.
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return Response.json({ error: limited.error }, { status: 429 });

  const template = getLetter("declaration");
  if (!template) return Response.json({ error: "The declaration is not available." }, { status: 404 });

  // The caller's own details, seeded into the same fields the editor fills when
  // HR picks a person — so a self-served copy and an HR-served copy are the
  // same document.
  const [row] = await db
    .select({
      name: employees.name,
      designation: designations.name,
      joinedAt: employees.joinedAt,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(eq(employees.id, me.id))
    .limit(1);

  const values: Record<string, string> = {
    employeeName: row?.name ?? me.name ?? "",
    designation: row?.designation ?? "",
    dateOfJoining: row?.joinedAt ? formatDateHr(row.joinedAt) : "",
  };

  try {
    // Lazily imported: pdfkit must stay out of the client bundle and out of the
    // edge runtime, exactly as the letters route does it.
    const { renderLetterPdf } = await import("@/lib/hr/letters/pdf");
    const pdf = await renderLetterPdf({
      template,
      entity: template.entityDefault ?? "altus-corp",
      values,
      date: formatDateHr(new Date()),
      fitOnePage: false,
    });

    const who = (values.employeeName || "declaration").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 60);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${who}-Declaration.pdf"`,
        // Never cached: it carries the person's own details and a date stamp.
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not build the PDF." },
      { status: 500 },
    );
  }
}
