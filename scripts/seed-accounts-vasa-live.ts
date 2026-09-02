// Seed Accounts · Vasa Family Interpersonal from the LIVE Google Sheet tab
// "11. Vasa Family Interpersonal" — a series of dated N×N interpersonal-balance
// snapshots. We store EVERY non-zero cell as one row (party=row, counterparty=
// col, amount=SIGNED, as_on=snapshot date), preserving both mirror cells exactly
// as the sheet has them. Party roster is also seeded into the `vasa_party`
// lookup (ordered) so the matrix UI can add/remove parties.
//
//   pnpm tsx --env-file=.env.local scripts/seed-accounts-vasa-live.ts
import { db } from "@/lib/db";
import { accountsVasaBalances, accountsLookups } from "@/db/schema";
import { getServiceAccountToken, GOOGLE_SCOPES } from "@/lib/google/service-account";

const SHEET_ID = "1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM";
const TAB = "11. Vasa Family Interpersonal "; // trailing space is part of the name
const PARTY_HINTS = ["MJV", "IJV", "CMV", "KAS"];

const clean = (s: unknown) => (s ?? "").toString().replace(/\s+/g, " ").trim();
function canon(raw: string): string {
  const s = clean(raw);
  if (/^GP\s*\(CG New\)$/i.test(s) || /^CG New$/i.test(s)) return "CG New";
  if (/^DHARAV$/i.test(s)) return "Dharav";
  return s;
}
function parseAmt(s: unknown): number | null {
  const t = clean(s).replace(/[,₹\s]/g, "");
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

async function fetchValues(range: string, render: string): Promise<string[][]> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=${render}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { values?: string[][] }).values ?? [];
}

interface Cell { asOn: string; rowParty: string; colParty: string; amount: number }

async function main() {
  const [fmt, raw] = await Promise.all([
    fetchValues(`${TAB}!A1:AB899`, "FORMATTED_VALUE"),
    fetchValues(`${TAB}!A1:AB899`, "UNFORMATTED_VALUE"),
  ]);
  const at = (arr: string[][], r: number) => arr[r] ?? [];

  const cells: Cell[] = [];
  const rosterOrder: string[] = [];
  const seenParty = new Set<string>();
  const addParty = (p: string) => { const c = canon(p); if (c && !seenParty.has(c)) { seenParty.add(c); rosterOrder.push(c); } };
  const snapshots: string[] = [];

  for (let r = 0; r < fmt.length; r++) {
    const row = at(fmt, r);
    const looksHeader = !clean(row[1]) && PARTY_HINTS.every((h, k) => clean(row[2 + k]) === h);
    if (!looksHeader) continue;

    const cols: Array<{ c: number; name: string }> = [];
    for (let c = 2; c < 28; c++) { const nm = clean(row[c]); if (nm) { cols.push({ c, name: canon(nm) }); } else break; }
    cols.forEach((c) => addParty(c.name));

    let asOn = "";
    for (let up = 1; up <= 5; up++) {
      const m = /as on\s*(.*)$/i.exec(clean(at(fmt, r - up)[1]) || clean(at(fmt, r - up)[2]));
      if (m) { asOn = (m[1] ?? "").trim(); break; }
    }
    if (asOn && !snapshots.includes(asOn)) snapshots.push(asOn);

    for (let rr = r + 1; rr < fmt.length; rr++) {
      const p = clean(at(fmt, rr)[1]);
      if (!p) break;
      addParty(p);
      const rowParty = canon(p);
      for (const { c, name } of cols) {
        if (name === rowParty) continue;
        const v = parseAmt(at(raw, rr)[c] ?? at(fmt, rr)[c]);
        if (v === null) continue;
        cells.push({ asOn, rowParty, colParty: name, amount: v });
      }
    }
  }

  // Wipe + reload the balances (source of truth is now the app; this is the seed).
  await db.delete(accountsVasaBalances);
  let sort = 0;
  const values = cells.map((c) => ({
    party: c.rowParty,
    direction: c.amount < 0 ? "Owes" : "Owed by",
    counterparty: c.colParty,
    amount: String(c.amount),
    asOn: c.asOn,
    sortOrder: sort++,
  }));
  // chunked insert
  for (let i = 0; i < values.length; i += 200) await db.insert(accountsVasaBalances).values(values.slice(i, i + 200));

  // Seed the party roster lookup (ordered). De-dup on the (kind, lower(value))
  // unique index; existing entries are left as-is.
  for (let i = 0; i < rosterOrder.length; i++) {
    await db.insert(accountsLookups)
      .values({ kind: "vasa_party", value: rosterOrder[i]!, sortOrder: i, active: true })
      .onConflictDoNothing();
  }

  console.log(`Snapshots: ${snapshots.length} → ${snapshots.join(", ")}`);
  console.log(`Parties (${rosterOrder.length}): ${rosterOrder.join(", ")}`);
  console.log(`Cells imported: ${cells.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
