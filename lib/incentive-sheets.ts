import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, incentiveRequests } from "@/db/schema";
import { ensureIncentiveColumns } from "@/lib/ensure-incentive-schema";

/**
 * Sheet-sourced incentives (Manan 2026-06) — 10 Qualified Leads + 10 Referrals.
 *
 * The Apps Script web app (?action=getLeads) returns the raw rows from the
 * `Qualified Leads` and `Participant Leads` sheets. We replicate the sheet
 * formulas here: keep VALID rows, group by (month · employee · introducer),
 * and award ₹100 for every full 10 in a group. Each qualifying group becomes
 * one idempotent ledger entry (source='sheet'), keyed by `source_ref` so a
 * re-sync updates the amount instead of duplicating — and never disturbs a
 * row an admin has already approved or paid.
 */

interface LeadRow {
  date?: string;        // qualified date (M) / referral date (O)
  invite?: string;      // status: "Yes" (qualified) / "Done" (referral)
  participant?: string; // Q — participant name + grouping key
  prospect?: string;    // C + D — prospect name
  employee?: string;    // R — the earner
}

/** A single PS-Sold sale, already matched/computed by the Apps Script. */
interface PsSoldRow {
  scheme?: string;      // "ps_sold_30d" | "ps_sold_social"
  date?: string;        // Billing date
  month?: string;       // "Apr-26" (optional — derived from date if absent)
  employee?: string;    // the earner (raw name from sheet)
  participant?: string; // participant name
  prospect?: string;    // prospect name
  amount?: number | string;
}

interface SheetPayload {
  qualifiedLeads?: LeadRow[];
  participantLeads?: LeadRow[];
  psSold?: PsSoldRow[];
}

/** Labels for the per-sale PS schemes returned in `psSold`. */
const PS_LABELS: Record<string, string> = {
  ps_sold_30d: "PS Sold in 30 Days",
  ps_sold_social: "PS Sold through Social Media",
};

type Scheme = "qualified_leads" | "referrals";

interface Group {
  scheme: Scheme;
  label: string;
  month: string;        // "Apr-26"
  employee: string;     // raw name from sheet (R)
  participant: string;  // Q — grouping key + participant name
  prospect: string;     // sample prospect (C + D) for the group
  count: number;
  amount: number;
  sampleDate: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop "(Intern - …)" suffixes
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** "Apr-26" from a date string/serial; "" if unparseable. */
function monthKey(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" }).replace(" ", "-");
}

/** "12 Apr 2026" from a date string/serial; the raw value if unparseable. */
function fmtDate(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

/** Replicate the sheet formula: filter valid → group → award `perTen` per full 10. */
function computeGroups(rows: LeadRow[], validValue: string, scheme: Scheme, label: string, perTen: number): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const invite = String(r.invite ?? "").toLowerCase().trim();
    const emp = String(r.employee ?? "").trim();
    const participant = String(r.participant ?? "").trim();
    const prospect = String(r.prospect ?? "").trim();
    const date = String(r.date ?? "").trim();
    if (invite !== validValue || !emp || !participant || !date) continue;
    const month = monthKey(date);
    if (!month) continue;
    const key = `${month}|${norm(emp)}|${norm(participant)}`;
    const g = map.get(key) ?? { scheme, label, month, employee: emp, participant, prospect, count: 0, amount: 0, sampleDate: date };
    g.count += 1;
    g.sampleDate = date;
    if (prospect) g.prospect = prospect;
    map.set(key, g);
  }
  const out: Group[] = [];
  for (const g of map.values()) {
    if (g.count < 10) continue;
    g.amount = Math.floor(g.count / 10) * perTen;
    out.push(g);
  }
  return out;
}

/**
 * Pull the sheets, compute both schemes, and upsert the ledger. Returns a
 * summary. Throws only on a hard fetch/parse failure.
 */
export async function syncSheetIncentives(webAppUrl: string, socialEarner?: string): Promise<SyncResult> {
  await ensureIncentiveColumns();
  // Apps Script web apps can be slow on a cold start; cap the wait so the
  // admin gets a clear timeout error instead of an indefinite spinner.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  let res: Response;
  try {
    res = await fetch(`${webAppUrl}${webAppUrl.includes("?") ? "&" : "?"}action=getLeads`, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Sheet endpoint timed out after 55s. The Apps Script is slow or asleep — open the web-app URL once to wake it, confirm the deployment access is set to “Anyone”, then try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Sheet endpoint returned ${res.status}`);
  const json = (await res.json()) as SheetPayload & { error?: string };
  if (json.error) throw new Error(json.error);

  const groups = [
    ...computeGroups(json.qualifiedLeads ?? [], "yes", "qualified_leads", "10 Qualified Leads", 100),
    ...computeGroups(json.participantLeads ?? [], "done", "referrals", "10 Referrals", 250),
  ];

  // Employee name → id (normalised, intern suffixes stripped).
  const roster = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.isActive, true));
  const byName = new Map(roster.map((e) => [norm(e.name), e.id]));

  // Existing sheet-source rows, keyed by source_ref.
  const existing = await db
    .select({
      id: incentiveRequests.id,
      sourceRef: incentiveRequests.sourceRef,
      status: incentiveRequests.status,
      paid: incentiveRequests.paid,
      amount: incentiveRequests.amount,
    })
    .from(incentiveRequests)
    .where(eq(incentiveRequests.source, "sheet"));
  const bySourceRef = new Map(existing.map((r) => [r.sourceRef ?? "", r]));

  const result: SyncResult = { created: 0, updated: 0, skipped: 0, warnings: [] };
  const seen = new Set<string>();

  // Shared idempotent upsert — keyed by source_ref so a re-sync refreshes the
  // amount on rows the admin hasn't decided/paid yet, and never duplicates.
  async function upsert(empId: string, sourceRef: string, label: string, amount: number, details: Record<string, string>) {
    seen.add(sourceRef);
    const prior = bySourceRef.get(sourceRef);
    try {
      if (!prior) {
        await db.insert(incentiveRequests).values({
          employeeId: empId, type: "sheet", details, amount, label, source: "sheet", sourceRef,
        });
        result.created += 1;
      } else if (prior.status === "pending" && !prior.paid && prior.amount !== amount) {
        await db.update(incentiveRequests)
          .set({ amount, details, updatedAt: new Date() })
          .where(eq(incentiveRequests.id, prior.id));
        result.updated += 1;
      }
    } catch (err) {
      result.skipped += 1;
      if (result.warnings.length < 25) {
        result.warnings.push(`Ledger write failed (${label}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 10-Qualified-Leads / 10-Referrals — one entry per qualifying group of 10.
  for (const g of groups) {
    const empId = byName.get(norm(g.employee));
    if (!empId) {
      result.skipped += 1;
      if (result.warnings.length < 25) result.warnings.push(`No app employee matches "${g.employee}" (${g.label}, ${g.month}).`);
      continue;
    }
    const sourceRef = `${g.scheme}|${g.month}|${empId}|${norm(g.participant)}`;
    await upsert(empId, sourceRef, g.label, g.amount, {
      date: fmtDate(g.sampleDate),
      month: g.month,
      participant: g.participant,
      prospect: g.prospect,
      count: String(g.count),
    });
  }

  // PS Sold (30 Days / Social Media) — one entry per matched sale row.
  for (const r of json.psSold ?? []) {
    const scheme = String(r.scheme ?? "").trim();
    const label = PS_LABELS[scheme];
    if (!label) continue; // unknown scheme — ignore
    // "Social" earner can be overridden permanently by the admin setting.
    const employee =
      scheme === "ps_sold_social" && socialEarner && socialEarner.trim()
        ? socialEarner.trim()
        : String(r.employee ?? "").trim();
    const empId = byName.get(norm(employee));
    if (!empId) {
      result.skipped += 1;
      if (result.warnings.length < 25) result.warnings.push(`No app employee matches "${employee}" (${label}).`);
      continue;
    }
    const month = String(r.month ?? "").trim() || monthKey(String(r.date ?? ""));
    const prospect = String(r.prospect ?? "").trim();
    const participant = String(r.participant ?? "").trim();
    const amount = Math.max(0, Math.round(Number(r.amount) || 0));
    // Key on the sale itself (scheme · month · prospect · participant), NOT the
    // earner — so a re-sync never duplicates even if the earner default or a
    // per-entry employee was changed.
    const sourceRef = `${scheme}|${month}|${norm(prospect)}|${norm(participant)}`;
    await upsert(empId, sourceRef, label, amount, {
      date: fmtDate(String(r.date ?? "")),
      month,
      participant,
      prospect,
    });
  }

  return result;
}
