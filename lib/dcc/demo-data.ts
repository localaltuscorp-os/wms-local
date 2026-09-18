import {
  outcomeOf,
  type DashboardEntry,
  type DashboardItem,
  type DashboardPerson,
  type DashboardReview,
} from "./dashboard";
import { SP1_DISPOSITIONS, type Sp1Disposition, type Sp1LogRow } from "./sp1";
import { scheduledDueOn, type DccStatus } from "./util";

/**
 * MADE-UP DCC DATA, FOR LOOKING AT THE SCREEN (`/dcc/dashboard?demo=1`).
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 * A dashboard is impossible to judge empty, and every section of this one is
 * empty until people have been filling DCC for weeks. This module invents a
 * fortnight of a nine-person team so the layout, the colours, the leaderboards
 * and the SP1 sheet can be seen full before any of it is true.
 *
 * ── WHY IT IS NOT SEEDED INTO THE DATABASE ─────────────────────────────────
 * THE ONLY SAFE PLACE FOR FAKE DATA IS MEMORY. This checkout talks to the LIVE
 * Supabase database — the one real people sign into — so writing nine invented
 * employees and two thousand invented entries into it would mean deleting them
 * again afterwards, by hand, from production, and hoping the delete matched the
 * insert. Nothing here touches the database, no row is written, and closing the
 * tab is the whole cleanup.
 *
 * ── WHY IT IS DETERMINISTIC ────────────────────────────────────────────────
 * `Math.random()` would give the page a different shape on every refresh and on
 * every re-render, so a screenshot could not be reproduced and "the heatmap
 * looks wrong" could never be checked twice. Every number below comes from a
 * seeded generator keyed by person, date and field, so the same URL always
 * draws the same dashboard.
 *
 * PURE. No `server-only`, no database, no clock — the caller passes the dates.
 */

/** The query flag that turns it on, so the page and the badge agree on one word. */
export const DCC_DEMO_PARAM = "demo";

/** Ids carry the prefix so an invented person is never mistaken for a real one. */
const ID = (n: number) => `demo-${String(n).padStart(2, "0")}`;

/**
 * Nine invented people across eight functions (lib/org/functions.ts), so the
 * function tabs each have somebody in them and `others` stays empty.
 *
 * `quality` is how reliably this person fills their DCC and `volume` is how many
 * calls they make. Both are fixed per person rather than rolled, because the
 * leaderboard is only worth looking at if somebody is reliably top and somebody
 * else is reliably bottom.
 */
const DEMO_PEOPLE: { name: string; department: string; quality: number; volume: number }[] = [
  { name: "Mitul Shah", department: "Sales", quality: 0.94, volume: 1.35 },
  { name: "Priya Raval", department: "Sales", quality: 0.88, volume: 1.15 },
  { name: "Rohan Desai", department: "Marketing", quality: 0.81, volume: 0.7 },
  { name: "Aarti Mehta", department: "Hand Holding", quality: 0.9, volume: 0.95 },
  { name: "Karan Bhatt", department: "Operations", quality: 0.73, volume: 0.85 },
  { name: "Sneha Joshi", department: "HR", quality: 0.86, volume: 0.45 },
  { name: "Devang Patel", department: "Accounts", quality: 0.68, volume: 0.35 },
  { name: "Nisha Kapoor", department: "Admin", quality: 0.79, volume: 0.5 },
  { name: "Harsh Trivedi", department: "Apps", quality: 0.62, volume: 0.25 },
];

/**
 * The compliances, by section.
 *
 * `difficulty` subtracts from the owner's quality, which is what gives the
 * most-missed panel something to rank: "Desk photo before 10 am" is dropped by
 * everybody, not by one person, exactly like the real thing.
 */
const DEMO_ITEMS: {
  section: string;
  code: string;
  title: string;
  difficulty: number;
  /** A target turns the row into a number to fill rather than a yes/no. */
  target?: string;
  unit?: string;
}[] = [
  { section: "Calling", code: "C1", title: "Log every client call", difficulty: 0.0, target: "40", unit: "calls" },
  { section: "Calling", code: "C2", title: "Clear yesterday's callback list", difficulty: 0.16 },
  { section: "Client", code: "L1", title: "Send today's proposals", difficulty: 0.06, target: "3", unit: "proposals" },
  { section: "Client", code: "L2", title: "Follow up yesterday's tentatives", difficulty: 0.1 },
  { section: "Reporting", code: "R1", title: "Sign off yesterday's numbers", difficulty: 0.04 },
  { section: "Admin", code: "A1", title: "Desk photo before 10 am", difficulty: 0.22 },
];

/**
 * The shape of a working day's calls, as a share of the day's total.
 *
 * Taken from the sheet's own proportions rather than spread evenly: most calls
 * ring out or reach a busy line, and a registration is rare. A flat fifteen-way
 * split would make Connected Ratio sit at a meaningless 73% on every column and
 * the colour bands would carry no information.
 */
const CALL_MIX: Record<Sp1Disposition, number> = {
  registered: 0.03,
  registered_next: 0.02,
  verbal_yes: 0.04,
  tentative: 0.06,
  tentative_next: 0.03,
  call_next: 0.05,
  get_back: 0.04,
  not_interested: 0.08,
  dnd: 0.03,
  past_attended: 0.03,
  old_graduate: 0.02,
  no_busy: 0.18,
  ringing: 0.22,
  call_back: 0.12,
  wrong_number: 0.05,
};

/* ── THE SEEDED GENERATOR ─────────────────────────────────────────────────── */

/** FNV-1a: a string key becomes a 32-bit seed. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One number in [0, 1) for a given key.
 *
 * KEYED, NOT SEQUENTIAL: a running generator would make every value depend on
 * how many were drawn before it, so adding one compliance to the list would
 * redraw the whole fortnight. Keying by `${person}|${date}|${field}` means each
 * cell is independent and the rest of the page does not move when one changes.
 */
function rand(key: string): number {
  let t = hash(key) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Monday–Saturday. Sunday is not a working day here, as in the sheet. */
const WORKING_MASK = 0b0111111;

function isSunday(ymd: string): boolean {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay() === 0;
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/* ── THE DATA ─────────────────────────────────────────────────────────────── */

/** The dashboard's item, plus the two fields the daily board also shows. */
export interface DemoItem extends DashboardItem {
  targetNumber: string | null;
  unit: string | null;
}

export interface DccDemo {
  people: DashboardPerson[];
  roster: { id: string; name: string; avatarUrl: string | null }[];
  items: DemoItem[];
  entries: DashboardEntry[];
  reviews: DashboardReview[];
  callRows: Sp1LogRow[];
}

/** Whether an id belongs to this invented roster — the page's `?person=` guard. */
export function isDemoPerson(id: string): boolean {
  return DEMO_PEOPLE.some((_, i) => ID(i + 1) === id);
}

export function buildDccDemo(args: {
  /** Every working day the sheet shows, so no column is blank for lack of data. */
  sheetDates: readonly string[];
  /** The first day compliance history is wanted from — streaks look back further. */
  historyFrom: string;
  /** The compliance window's last day. Never past today. */
  to: string;
  today: string;
  /** Narrow to one invented person, mirroring `?person=`. */
  onlyId?: string | null;
}): DccDemo {
  const chosen = args.onlyId && isDemoPerson(args.onlyId) ? args.onlyId : null;

  const roster = DEMO_PEOPLE.map((p, i) => ({ id: ID(i + 1), name: p.name, avatarUrl: null }))
    .filter((p) => !chosen || p.id === chosen);

  const people: DashboardPerson[] = roster.map((r) => {
    const src = DEMO_PEOPLE[Number(r.id.slice(-2)) - 1]!;
    return { id: r.id, name: r.name, avatarUrl: null, departments: [src.department] };
  });

  const items: DemoItem[] = [];
  const entries: DashboardEntry[] = [];
  const reviews: DashboardReview[] = [];
  const callRows: Sp1LogRow[] = [];

  const historyDays = eachDay(args.historyFrom, args.to);

  for (const person of people) {
    const src = DEMO_PEOPLE[Number(person.id.slice(-2)) - 1]!;

    /* Five of the six compliances each, chosen by the person's own seed, so the
       roster is not nine identical checklists — a section breakdown where every
       section has exactly the same population tells you nothing. */
    const mine = DEMO_ITEMS.filter((_, i) => i < 4 || rand(`${person.id}|item|${i}`) < 0.6);

    for (const def of mine) {
      const itemId = `${person.id}-${def.code}`;
      items.push({
        id: itemId,
        ownerEmployeeId: person.id,
        section: def.section,
        code: def.code,
        title: def.title,
        weekdays: WORKING_MASK,
        scheduleKind: "scheduled",
        isParticipantList: false,
        activeFrom: null,
        targetNumber: def.target ?? null,
        unit: def.unit ?? null,
      });

      for (const date of historyDays) {
        if (isSunday(date)) continue;

        /* TODAY IS DELIBERATELY HALF-DONE. A dashboard where today is already
           100% hides the whole "open, not missed" distinction the KPI strip
           exists to make, and the heatmap's last column would never be amber. */
        if (date === args.today) {
          const r = rand(`${itemId}|${date}|today`);
          if (r < 0.45) entries.push(entry(itemId, date, "Done"));
          else if (r < 0.6) entries.push(entry(itemId, date, "Pending"));
          continue; // the rest of today is genuinely not filled yet
        }

        const good = src.quality - def.difficulty;
        const r = rand(`${itemId}|${date}|status`);
        if (r < good) entries.push(entry(itemId, date, "Done"));
        else if (r < good + 0.07) entries.push(entry(itemId, date, "Not done"));
        else if (r < good + 0.11) entries.push(entry(itemId, date, "NA"));
        else if (r < good + 0.15) entries.push(entry(itemId, date, "Pending"));
        // else: no row at all — an unfilled slot, which is what a miss looks like
      }
    }

    // A manager's sign-off on most past days, with the occasional rework.
    for (const date of historyDays) {
      if (isSunday(date) || date >= args.today) continue;
      const r = rand(`${person.id}|${date}|review`);
      if (r < 0.62) reviews.push({ ownerEmployeeId: person.id, reviewDate: date, status: "approved" });
      else if (r < 0.74)
        reviews.push({ ownerEmployeeId: person.id, reviewDate: date, status: "needs_rework" });
    }

    /* The call log, across the SHEET's dates rather than the compliance window —
       the sheet shows the whole fortnight, including days the charts stop
       before. Days after today stay empty, so the current week looks the way a
       half-finished week actually looks. */
    for (const date of args.sheetDates) {
      if (date > args.today || isSunday(date)) continue;
      const busy = 0.7 + rand(`${person.id}|${date}|busy`) * 0.7;
      const total = Math.round(46 * src.volume * busy);
      if (total <= 0) continue;
      for (const d of SP1_DISPOSITIONS) {
        // ±40% of the outcome's nominal share, so no two columns are identical.
        const jitter = 0.6 + rand(`${person.id}|${date}|${d}`) * 0.8;
        const count = Math.round(total * CALL_MIX[d] * jitter);
        if (count > 0) callRows.push({ employeeId: person.id, logDate: date, disposition: d, count });
      }
    }
  }

  return { people, roster, items, entries, reviews, callRows };
}

/**
 * THE CANONICAL CASING, NOT A LOWERCASE LOOKALIKE.
 *
 * `outcomeOf` lowercases before comparing, so "done" tallied correctly on the
 * dashboard — but the daily board keys its colours and icons off `DccStatus`
 * itself ("Done", "Not done", "NA", "Pending"), and a lowercase status matched
 * nothing there: every sample row rendered with no status at all. One
 * vocabulary, so a reader that compares exactly and a reader that lowercases
 * both land in the same place.
 */
function entry(itemId: string, entryDate: string, status: DccStatus): DashboardEntry {
  return { itemId, entryDate, status, valueNumber: null, note: null, subjectId: null };
}

/* ── THE DAILY BOARD ──────────────────────────────────────────────────────── */

/**
 * Whose day My Day shows in sample mode.
 *
 * The signed-in viewer is real and their invented compliances would have to
 * belong to somebody, so the board borrows the first invented person outright
 * and the page says whose day it is. Pretending the real viewer owns invented
 * rows would make the screen look like their own DCC had been filled in.
 */
export const DEMO_VIEWER_ID = ID(1);

export interface DemoBoardRow {
  itemId: string;
  title: string;
  section: string | null;
  code: string | null;
  targetNumber: string | null;
  unit: string | null;
  masterDesignation: string | null;
  status: DccStatus | null;
  note: string | null;
  value: string | null;
}

/** One invented person's compliances for one day, in the board's own shape. */
export function demoBoardRows(demo: DccDemo, personId: string, date: string): DemoBoardRow[] {
  const day = new Date(`${date}T00:00:00Z`);
  const byItem = new Map(demo.entries.filter((e) => e.entryDate === date).map((e) => [e.itemId, e]));
  return demo.items
    .filter((it) => it.ownerEmployeeId === personId && scheduledDueOn(it, day))
    .map((it, i) => {
      const e = byItem.get(it.id);
      const filled = e && outcomeOf(e) !== "unfilled";
      return {
        itemId: it.id,
        title: it.title,
        section: it.section,
        code: it.code,
        targetNumber: it.targetNumber,
        unit: it.unit,
        // Two of them come from a position master, so the badge and the
        // read-only treatment are visible on the sample board too.
        masterDesignation: i < 2 ? "Sales Executive" : null,
        status: (e?.status as DccStatus | undefined) ?? null,
        note: filled && i === 0 ? "Sheet updated before the evening call." : null,
        // A target row shows a number, which is the other half of the board.
        value: filled && it.targetNumber ? String(Math.round(Number(it.targetNumber) * 0.9)) : null,
      };
    });
}
