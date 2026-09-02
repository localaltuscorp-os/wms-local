import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountsVasaBalances } from "@/db/schema";

export interface VasaRow {
  id: string;
  party: string | null;
  direction: string | null;
  counterparty: string | null;
  amount: string | null;
  asOn: string | null;
  notes: string | null;
  sortOrder: number | null;
}

export async function listVasaBalances(): Promise<VasaRow[]> {
  return db
    .select({
      id: accountsVasaBalances.id,
      party: accountsVasaBalances.party,
      direction: accountsVasaBalances.direction,
      counterparty: accountsVasaBalances.counterparty,
      amount: accountsVasaBalances.amount,
      asOn: accountsVasaBalances.asOn,
      notes: accountsVasaBalances.notes,
      sortOrder: accountsVasaBalances.sortOrder,
    })
    .from(accountsVasaBalances)
    .where(eq(accountsVasaBalances.archived, false))
    .orderBy(asc(accountsVasaBalances.sortOrder));
}

/** One matrix cell: rowParty owes/owed colParty `amount` (signed) at snapshot `asOn`. */
export interface VasaCell {
  party: string;
  counterparty: string;
  amount: string;
  asOn: string | null;
}

/** Every non-archived matrix cell across all snapshots. */
export async function listVasaCells(): Promise<VasaCell[]> {
  const rows = await db
    .select({
      party: accountsVasaBalances.party,
      counterparty: accountsVasaBalances.counterparty,
      amount: accountsVasaBalances.amount,
      asOn: accountsVasaBalances.asOn,
    })
    .from(accountsVasaBalances)
    .where(eq(accountsVasaBalances.archived, false));
  return rows
    .filter((r) => r.party && r.counterparty && r.amount !== null)
    .map((r) => ({ party: r.party!, counterparty: r.counterparty!, amount: r.amount!, asOn: r.asOn }));
}

/** Distinct snapshot dates (as-on), newest first — parsing DD/MM/YYYY labels. */
export async function listVasaSnapshots(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ asOn: accountsVasaBalances.asOn })
    .from(accountsVasaBalances)
    .where(eq(accountsVasaBalances.archived, false));
  const parse = (s: string | null): number => {
    if (!s) return 0;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s.trim());
    if (!m) return 0;
    const [, d, mo, y] = m;
    return new Date(Number(y!.length === 2 ? `20${y}` : y), Number(mo) - 1, Number(d)).getTime();
  };
  return rows
    .map((r) => r.asOn)
    .filter((s): s is string => !!s)
    .sort((a, b) => parse(b) - parse(a));
}
