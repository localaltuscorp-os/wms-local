import * as XLSX from "xlsx";
import { requireAccountsAccess } from "@/lib/accounts/access";
import { listVasaCells, listVasaSnapshots } from "@/lib/queries/accounts-vasa";
import { listAccountsLookups } from "@/lib/accounts/lookups";
import {
  buildMatrix,
  snapshotXlsx,
  snapshotFilename,
  applyInrFormat,
} from "@/lib/accounts/vasa-report";

/**
 * GET /accounts/vasa-family-interpersonal/export
 *
 *   (no params)       → every chart, stacked, as .xlsx
 *   ?asOn=dd/mm/yyyy  → THAT chart only, as .xlsx
 *
 * CSV IS GONE (Sir). It was the one export that could not carry a number format
 * — every figure arrived as a bare integer with no grouping and no red — so it
 * quietly produced the least readable copy of a sheet whose whole point is
 * readability. Excel and the emailed PDF cover both jobs.
 *
 * The per-chart form is what the List view's Download uses, so a row always
 * yields ITS OWN report — never whichever chart happens to be open in the Sheet
 * view. Both forms build their grid with the shared `buildMatrix`, so the
 * downloaded file and the emailed file cannot drift apart.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireAccountsAccess();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const asOn = url.searchParams.get("asOn");

  const [cells, snapshots, partyOpts] = await Promise.all([
    listVasaCells(),
    listVasaSnapshots(),
    listAccountsLookups("vasa_party"),
  ]);
  const parties = partyOpts.map((o) => o.name);

  // ── One snapshot ──────────────────────────────────────────────────────
  if (asOn) {
    // Only a date that actually exists — otherwise a hand-edited URL would
    // return an empty grid that looks like a real, all-zero report.
    if (!snapshots.includes(asOn)) {
      return new Response("No such chart", { status: 404 });
    }
    const buf = snapshotXlsx(cells, parties, asOn);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${snapshotFilename(asOn, "xlsx")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Every snapshot, stacked (the original behaviour) ──────────────────
  const aoa: (string | number)[][] = [["Vasa Family Interpersonal Balance"], []];
  for (const s of snapshots) {
    for (const line of buildMatrix(cells, parties, s)) aoa.push(line);
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, ...Array(parties.length + 1).fill({ wch: 15 })];
  // Same Indian currency format as the per-chart file — the stacked export used
  // to be the one place figures came out unformatted.
  applyInrFormat(ws, aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Interpersonal Balances");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Vasa-Interpersonal-Balances.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
