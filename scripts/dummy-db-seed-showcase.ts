import type { PGlite } from "@electric-sql/pglite";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DUMMY_STORAGE_DIR } from "../lib/db/dummy-dir";
import { masterKpiFields, type MasterItem } from "../lib/dcc/master";
import { parseFrequency, scheduledDueOn } from "../lib/dcc/util";
import { SP1_DISPOSITIONS, type Sp1Disposition } from "../lib/dcc/sp1";
import { RECRUITMENT_JD_SEED } from "../lib/operations/recruitment-jd-seed";
import { emptyJdContent, normalizeJdContent, type JdContent } from "../lib/operations/recruitment-jd";
import { parseRRule } from "../lib/recurrence/rrule";

/**
 * THE FULL-HOUSE DUMMY DATASET — Operations (Checklist, JD Bank, JD-Master,
 * JD-Specific Person, JD-For Recruitment) and DCC, filled the way they look
 * after a team has been using them for a month (account holder, 2026-09-18:
 * "I want to see how the tables will look after records are filled").
 *
 * The other seeders make each screen NON-EMPTY; this one makes them FULL:
 *
 *   · 14 more invented people across every function, with designations,
 *     departments and a reporting line — so pickers, function tabs and the
 *     DCC leaderboards have a real team in them, not six names.
 *   · JD Bank: a seat per function and rank (two vacant, one shared by two
 *     people), ~50 more tasks using every frequency the form can produce,
 *     SOP links on some, personal tasks and by-name assignments.
 *   · Checklist: three more templates, and nine runs across the life cycle —
 *     completed, running this week, overdue, next month, cancelled, and a
 *     daily standing list — with the Doer Statuses a real team would have left
 *     (the WMS six) and the rulings on them (scripts/dummy-db-seed-wms-columns.ts
 *     fills Client, Subject, Initiator, Frequency and the Approver columns).
 *   · JD-For Recruitment: the eight standard roles plus three more (one with no
 *     JD yet), recruiter edits on three, and a send history by WhatsApp and
 *     email including a failed one.
 *   · DCC: position masters for every designation, each person's KPIs linked
 *     to them plus their own, four weeks of entries ending TODAY (today half
 *     done, on purpose), manager reviews, and the SP1 call log for callers.
 *
 * Dates are relative to the day it runs, so the data is never stale.
 *
 * NOBODY REAL IS IN HERE. Every person, phone number and address is invented;
 * emails are on `example.invalid`, which cannot receive mail. This only ever
 * writes to the local PGlite file (scripts/dummy-db-setup.ts).
 *
 * IDEMPOTENT: fixed ids or an existence check before each insert, and
 * `on conflict do nothing` — re-running tops up (e.g. the DCC days since the
 * last run) instead of duplicating.
 */

const id = (bank: string, n: number) => `00000000-0000-4000-${bank}-${String(n).padStart(12, "0")}`;

/** YYYY-MM-DD, `offset` days from today, in the machine's own calendar. */
function ymd(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** An ISO timestamp `daysAgo` days back, at `hour`:`minute` local time. */
function at(daysAgo: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function addDays(ymdStr: string, n: number): string {
  const [y, m, d] = ymdStr.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + n, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function localDate(ymdStr: string): Date {
  const [y, m, d] = ymdStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/* Deterministic randomness — FNV-1a over a key, so the same run of the seed
   produces the same dataset and a screenshot can be reproduced. */
function rand(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/* ── PEOPLE ───────────────────────────────────────────────────────────────── */

/** The people the earlier seeders created. */
const OLD = {
  me: "00000000-0000-4000-8000-000000000001",
  asha: "00000000-0000-4000-8000-000000000002",
  ravi: "00000000-0000-4000-8000-000000000003",
  meera: "00000000-0000-4000-8000-000000000004",
  imran: "00000000-0000-4000-8000-000000000005",
  long: "00000000-0000-4000-8000-000000000006",
  manan: "00000000-0000-4000-800f-000000000001",
} as const;

const P = {
  mitul: id("8020", 1),
  priya: id("8020", 2),
  karan: id("8020", 3),
  rohan: id("8020", 4),
  nidhi: id("8020", 5),
  aditya: id("8020", 6),
  aarti: id("8020", 7),
  sameer: id("8020", 8),
  pooja: id("8020", 9),
  farhan: id("8020", 10),
  sneha: id("8020", 11),
  devang: id("8020", 12),
  rekha: id("8020", 13),
  arjun: id("8020", 14),
} as const;

type Desig = "Executive" | "Senior Executive" | "Team Lead" | "Manager" | "Intern";

/** [id, name, email, department, designation, manager, role, daysSinceJoining] */
const NEW_PEOPLE: [string, string, string, string, Desig, string, string, number][] = [
  [P.mitul, "Mitul Shah", "mitul.shah@example.invalid", "Sales", "Team Lead", OLD.manan, "both", 820],
  [P.priya, "Priya Raval", "priya.raval@example.invalid", "Sales", "Senior Executive", P.mitul, "doer", 540],
  [P.karan, "Karan Bhatt", "karan.bhatt@example.invalid", "Sales", "Executive", P.mitul, "doer", 150],
  [P.rohan, "Rohan Desai", "rohan.desai@example.invalid", "Marketing", "Team Lead", OLD.manan, "both", 700],
  [P.nidhi, "Nidhi Kapoor", "nidhi.kapoor@example.invalid", "Marketing", "Executive", P.rohan, "doer", 260],
  [P.aditya, "Aditya Rao", "aditya.rao@example.invalid", "Marketing", "Intern", P.rohan, "doer", 45],
  [P.aarti, "Aarti Mehta", "aarti.mehta@example.invalid", "Handholding", "Team Lead", OLD.asha, "both", 610],
  [P.sameer, "Sameer Kulkarni", "sameer.kulkarni@example.invalid", "Handholding", "Executive", P.aarti, "doer", 330],
  [P.pooja, "Pooja Nair", "pooja.nair@example.invalid", "Handholding", "Executive", P.aarti, "doer", 190],
  [P.farhan, "Farhan Qureshi", "farhan.qureshi@example.invalid", "Operations", "Executive", OLD.asha, "doer", 400],
  [P.sneha, "Sneha Joshi", "sneha.joshi@example.invalid", "HR", "Senior Executive", OLD.me, "both", 480],
  [P.devang, "Devang Patel", "devang.patel@example.invalid", "Accounts", "Executive", OLD.meera, "doer", 360],
  [P.rekha, "Rekha Pillai", "rekha.pillai@example.invalid", "Admin", "Executive", OLD.me, "doer", 910],
  [P.arjun, "Arjun Menon", "arjun.menon@example.invalid", "Apps", "Senior Executive", OLD.me, "doer", 230],
];

/** Departments for the people the earlier seeders left without one a function tab can match. */
const OLD_DEPARTMENTS: [string, string][] = [
  [OLD.asha, "Operations"],
  [OLD.ravi, "Operations"],
  [OLD.meera, "Accounts"],
  [OLD.imran, "Apps"],
  [OLD.long, "Accounts"],
  [OLD.manan, "Founder Office"],
];

/** How reliably each person fills their DCC (0–1). Fixed, so the leaderboard has a clear top and bottom. */
const QUALITY: Record<string, number> = {
  [OLD.me]: 0.9,
  [OLD.asha]: 0.93,
  [OLD.ravi]: 0.78,
  [OLD.meera]: 0.88,
  [OLD.imran]: 0.7,
  [OLD.long]: 0.64,
  [OLD.manan]: 0.85,
  [P.mitul]: 0.95,
  [P.priya]: 0.89,
  [P.karan]: 0.66,
  [P.rohan]: 0.84,
  [P.nidhi]: 0.8,
  [P.aditya]: 0.58,
  [P.aarti]: 0.92,
  [P.sameer]: 0.83,
  [P.pooja]: 0.87,
  [P.farhan]: 0.74,
  [P.sneha]: 0.9,
  [P.devang]: 0.69,
  [P.rekha]: 0.81,
  [P.arjun]: 0.86,
};

/** SP1 callers and how many calls they make (1 ≈ 46 a day). */
const CALLERS: [string, number][] = [
  [P.mitul, 1.35],
  [P.priya, 1.15],
  [P.karan, 0.85],
  [P.rohan, 0.6],
  [P.nidhi, 0.75],
  [P.aarti, 0.9],
  [P.sameer, 0.8],
  [P.pooja, 0.95],
];

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

/* ── JD BANK ──────────────────────────────────────────────────────────────── */

/** [n, functionKey, rank name, title, holders] — n continues the earlier seeder's 1–4. */
const POSITIONS: [number, string, string, string, string[]][] = [
  [5, "marketing", "Team Lead", "Marketing · Team Lead", [P.rohan]],
  [6, "marketing", "Executive", "Marketing · Executive", [P.nidhi]],
  [7, "marketing", "Intern - First Year", "Marketing · Intern - First Year", [P.aditya]],
  [8, "handholding", "Team Lead", "Handholding · Team Lead", [P.aarti]],
  // Two people in one seat — the Bank's holder count and "by position" read both.
  [9, "handholding", "Executive", "Handholding · Executive", [P.sameer, P.pooja]],
  [10, "hr", "Senior Executive", "HR · Senior Executive", [P.sneha]],
  [11, "accounts", "Executive", "Accounts · Executive", [P.devang]],
  [12, "admin", "Executive", "Admin · Executive", [P.rekha]],
  [13, "admin", "Manager", "Admin · Manager", []], // vacant — escalates
  [14, "apps", "Senior Executive", "Apps/IT · Senior Executive", [P.arjun]],
  [15, "apps", "Executive", "Apps/IT · Executive", [OLD.imran]],
  [16, "operations", "Sr. Consultant", "Operations · Sr. Consultant", []], // vacant
];

/** Farhan joins Ravi in the existing Operations · Executive seat (position 1). */
const EXTRA_HOLDERS: [number, string][] = [[1, P.farhan]];

type Rec =
  | { kind: "daily" }
  | { kind: "weekdays"; days: number[] }
  | { kind: "monthly_ordinal"; ordinal: 1 | 2 | 3 | 4 | -1; weekday: number }
  | { kind: "yearly"; month: number; day: number }
  | { kind: "once"; date: string }
  | { kind: "interval"; everyDays: number; anchor: string }
  | { kind: "rrule"; rule: string; anchor: string };

const D: Rec = { kind: "daily" };
const W = (...days: number[]): Rec => ({ kind: "weekdays", days }); // 0 = Monday
const M = (ordinal: 1 | 2 | 3 | 4 | -1, weekday: number): Rec => ({ kind: "monthly_ordinal", ordinal, weekday });
const Y = (month: number, day: number): Rec => ({ kind: "yearly", month, day });
const ONCE = (offset: number): Rec => ({ kind: "once", date: ymd(offset) });
const EVERY = (everyDays: number): Rec => ({ kind: "interval", everyDays, anchor: ymd(-5) });
const RR = (rule: string): Rec => ({ kind: "rrule", rule, anchor: ymd(-12) });

interface Links {
  video?: string;
  guide?: string;
  template?: string;
}
const DRIVE = (name: string) => `https://drive.google.com/file/d/dummy-${name}/view`;
const VIDEO = (name: string) => `https://www.youtube.com/watch?v=dummy-${name}`;
const SHEET = (name: string) => `https://docs.google.com/spreadsheets/d/dummy-${name}/edit`;

/** [n, position | null, owner | null, function, task, category, minutes, recurrence, dcc, wms, event, links, notes] */
type Entry = [number, number | null, string | null, string, string, string, number, Rec, boolean, boolean, boolean, Links, string | null];

const ENTRIES: Entry[] = [
  // Operations · Executive (1)
  [12, 1, null, "operations", "Update the vehicle movement log before 11 am", "Logistics", 15, D, true, false, false, {}, null],
  [13, 1, null, "operations", "Raise tomorrow's pickup requests with the transporter", "Logistics", 20, W(0, 1, 2, 3, 4), false, true, false, { guide: DRIVE("pickup-sop") }, "Transporter cut-off is 5 pm. After that, pickups slip a day."],
  [14, 1, null, "operations", "Count the packing material in the store", "Inventory", 40, W(5), false, true, false, { template: SHEET("packing-count") }, null],
  // Operations · Team Lead (2)
  [15, 2, null, "operations", "Weekly vendor performance scorecard", "Vendors", 60, W(4), false, true, false, { template: SHEET("vendor-scorecard"), guide: DRIVE("vendor-rating-rules") }, "Score on-time, damage and billing accuracy. Anything below 70 goes to the monthly review."],
  [16, 2, null, "operations", "Review the SOPs with the team", "Process", 90, EVERY(91), false, true, true, { video: VIDEO("sop-review") }, null],
  [17, 2, null, "operations", "Escalate any dispatch delayed beyond 24 hours", "Escalations", 10, D, true, false, false, {}, null],
  // Accounts · Senior Executive (3)
  [18, 3, null, "accounts", "Vendor payment run", "Payables", 90, W(1, 4), false, true, false, { guide: DRIVE("payment-approval-matrix") }, "Only invoices approved in the WMS. Anything above ₹2 lakh needs Manan Sir's sign-off."],
  [19, 3, null, "accounts", "TDS computation and challan", "Compliance", 75, RR("FREQ=MONTHLY;BYMONTHDAY=7"), false, true, false, { template: SHEET("tds-working") }, null],
  [20, 3, null, "accounts", "Close the books for the month", "Reporting", 180, M(-1, 4), false, true, true, { guide: DRIVE("month-end-close") }, null],
  // HR · Manager (4) — vacant
  [21, 4, null, "hr", "Approve the month's attendance before payroll", "Payroll", 45, M(-1, 3), false, true, false, {}, null],
  [22, 4, null, "hr", "Quarterly engagement survey", "Engagement", 120, RR("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=10"), false, true, true, { template: DRIVE("engagement-survey") }, null],
  // Marketing · Team Lead (5)
  [23, 5, null, "marketing", "Approve the week's content calendar", "Content", 45, W(0), false, true, false, { template: SHEET("content-calendar") }, null],
  [24, 5, null, "marketing", "Review ad spend against leads", "Performance", 30, W(2, 4), true, true, false, {}, "Pause any campaign above ₹450 per lead for three days running."],
  [25, 5, null, "marketing", "Monthly marketing report to the founders", "Reporting", 90, M(1, 0), false, true, true, { template: DRIVE("marketing-report") }, null],
  // Marketing · Executive (6)
  [26, 6, null, "marketing", "Publish two posts on LinkedIn and Instagram", "Social Media", 40, D, true, false, false, { guide: DRIVE("brand-voice") }, null],
  [27, 6, null, "marketing", "Reply to every comment and DM within 4 hours", "Social Media", 20, D, true, false, false, {}, null],
  [28, 6, null, "marketing", "Update the leads sheet from the ad forms", "Leads", 25, D, true, true, false, { template: SHEET("leads-master") }, null],
  [29, 6, null, "marketing", "Send the workshop reminder emailer", "Email", 30, W(1, 3), false, true, true, {}, null],
  // Marketing · Intern (7)
  [30, 7, null, "marketing", "Edit one short-form video", "Video", 90, W(0, 2, 4), true, false, false, { video: VIDEO("reel-editing") }, null],
  [31, 7, null, "marketing", "Collect testimonials after each workshop", "Content", 45, { kind: "once", date: ymd(4) }, false, false, true, {}, "For the Mumbai Sales Masterclass. Two video, three written."],
  // Handholding · Team Lead (8)
  [32, 8, null, "handholding", "Review every client's implementation tracker", "Clients", 60, W(0, 3), true, true, false, { template: SHEET("implementation-tracker") }, null],
  [33, 8, null, "handholding", "Client health call with the top five accounts", "Clients", 75, W(4), false, true, false, {}, null],
  [34, 8, null, "handholding", "Plan next month's handholding batches", "Batches", 60, M(-1, 2), false, true, true, {}, null],
  // Handholding · Executive (9) — two holders
  [35, 9, null, "handholding", "Daily check-in call with assigned clients", "Clients", 45, D, true, false, false, { guide: DRIVE("check-in-script") }, "Log every call in the client's tracker. Three missed calls in a row → tell Aarti."],
  [36, 9, null, "handholding", "Send the session recap to attendees", "Batches", 20, W(1, 3, 5), true, true, false, {}, null],
  [37, 9, null, "handholding", "Collect implementation evidence (photos, registers)", "Evidence", 30, W(2), false, true, false, { template: DRIVE("evidence-checklist") }, null],
  [38, 9, null, "handholding", "Update the attendance sheet after each batch", "Batches", 15, EVERY(7), true, false, false, { template: SHEET("batch-attendance") }, null],
  // HR · Senior Executive (10)
  [39, 10, null, "hr", "Screen new CVs from the job boards", "Recruitment", 60, D, true, false, false, {}, null],
  [40, 10, null, "hr", "Schedule the week's interviews", "Recruitment", 30, W(0), false, true, false, {}, null],
  [41, 10, null, "hr", "Onboarding documents for new joiners", "Onboarding", 45, W(0, 2, 4), false, true, false, { guide: DRIVE("onboarding-docs") }, null],
  [42, 10, null, "hr", "Birthday and work-anniversary wishes", "Engagement", 10, D, true, false, false, {}, null],
  [43, 10, null, "hr", "Renew the group health insurance", "Benefits", 120, Y(4, 1), false, true, false, {}, null],
  // Accounts · Executive (11)
  [44, 11, null, "accounts", "Post the day's vouchers in Tally", "Bookkeeping", 60, D, true, false, false, { video: VIDEO("tally-vouchers") }, null],
  [45, 11, null, "accounts", "Follow up on overdue receivables", "Receivables", 45, W(0, 2, 4), true, true, false, { template: SHEET("receivables-ageing") }, null],
  [46, 11, null, "accounts", "File the GSTR-1", "Compliance", 90, RR("FREQ=MONTHLY;BYMONTHDAY=11"), false, true, false, { guide: DRIVE("gstr1-steps") }, null],
  // Admin · Executive (12)
  [47, 12, null, "admin", "Open the office and check the pantry stock", "Office", 20, D, true, false, false, {}, null],
  [48, 12, null, "admin", "Book travel and hotels for the week's events", "Travel", 45, W(0, 3), false, true, true, { template: SHEET("travel-bookings") }, null],
  [49, 12, null, "admin", "Pay electricity, internet and phone bills", "Utilities", 30, M(1, 1), false, true, false, {}, null],
  [50, 12, null, "admin", "Service the air conditioners", "Maintenance", 60, EVERY(90), false, true, false, {}, null],
  // Admin · Manager (13) — vacant
  [51, 13, null, "admin", "Renew the office lease and insurance", "Facilities", 120, Y(3, 15), false, true, false, { guide: DRIVE("lease-terms") }, null],
  [52, 13, null, "admin", "Approve the monthly admin expenses", "Expenses", 30, M(1, 0), false, true, false, {}, null],
  // Apps/IT · Senior Executive (14)
  [53, 14, null, "apps", "Check last night's database backup", "Infrastructure", 15, D, true, false, false, { guide: DRIVE("backup-restore") }, null],
  [54, 14, null, "apps", "Triage new bug reports", "Support", 45, D, true, true, false, {}, null],
  [55, 14, null, "apps", "Release notes for the week's deploys", "Releases", 30, W(4), false, true, false, { template: DRIVE("release-notes") }, null],
  [56, 14, null, "apps", "Rotate shared account passwords", "Security", 40, RR("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1"), false, true, false, {}, "Update the vault; never share passwords on WhatsApp."],
  // Apps/IT · Executive (15)
  [57, 15, null, "apps", "Set up laptops and emails for new joiners", "Onboarding", 60, W(0), false, true, false, { guide: DRIVE("laptop-setup") }, null],
  [58, 15, null, "apps", "Renew domain and SSL certificates", "Infrastructure", 30, Y(11, 20), false, true, false, {}, null],
  // Operations · Sr. Consultant (16) — vacant
  [59, 16, null, "operations", "Process audit at one client site", "Consulting", 240, M(2, 2), false, true, true, { template: DRIVE("process-audit") }, null],
  [60, 16, null, "operations", "Write the client's improvement roadmap", "Consulting", 180, ONCE(9), false, true, false, {}, null],
  // Personal JDs — owned by a person, not a seat.
  [61, null, P.sneha, "hr", "Run the campus-hiring drive at the university", "Recruitment", 480, ONCE(15), false, true, true, {}, "Coordinate with the placement cell. Carry 50 printed JDs."],
  [62, null, P.sneha, "hr", "Exit interviews for this month's leavers", "Exits", 45, M(-1, 4), false, true, false, { template: DRIVE("exit-interview") }, null],
  [63, null, P.arjun, "apps", "Migrate the old CRM data", "Projects", 240, ONCE(21), false, true, false, { guide: DRIVE("crm-migration-plan") }, null],
  [64, null, P.pooja, "handholding", "Gujarati translation of session material", "Content", 120, W(2), false, true, false, {}, null],
  [65, null, P.rekha, "admin", "Manage the founders' calendar", "Founder Office", 30, D, true, false, false, {}, null],
  [66, null, OLD.me, "hr", "Weekly one-to-one with every HR team member", "People", 60, W(4), false, true, false, {}, null],
  [67, null, P.nidhi, "marketing", "Run the website's SEO audit", "SEO", 150, RR("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH"), false, true, false, { guide: DRIVE("seo-checklist") }, null],
  [68, null, P.devang, "accounts", "Reconcile the petty-cash box", "Cash", 20, W(5), true, false, false, {}, null],
  [69, null, P.aditya, "marketing", "Learn Premiere Pro — one module a week", "Training", 60, W(3), false, false, false, { video: VIDEO("premiere-course") }, null],
];

/** Named people on a seat that is not their own — "Assigned to them by name". [jd n, employee, dcc, wms, event] */
const ASSIGNMENTS: [number, string, boolean, boolean, boolean][] = [
  [13, P.farhan, false, true, false],
  [17, P.farhan, true, false, false],
  [24, P.nidhi, true, true, false],
  [26, P.aditya, true, false, false],
  [29, P.aditya, false, true, true],
  [33, P.pooja, false, true, false],
  [35, P.sameer, true, false, false],
  [35, P.pooja, true, false, false],
  [39, OLD.me, true, false, false],
  [45, OLD.long, true, true, false],
  [47, P.farhan, true, false, false],
  [54, OLD.imran, true, true, false],
  [59, OLD.asha, false, true, true],
  [21, OLD.me, false, true, false],
];

/** A one-page PDF, so a sample SOP opens in the browser like a real one. */
async function samplePdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("ALTUS CORP", { x: 56, y: 780, size: 10, font: bold, color: rgb(0.88, 0.02, 0) });
  page.drawText(title, { x: 56, y: 748, size: 20, font: bold, color: rgb(0.09, 0.09, 0.11) });
  page.drawText("DUMMY DOCUMENT - generated for testing.", { x: 56, y: 726, size: 9, font, color: rgb(0.45, 0.45, 0.5) });
  lines.forEach((line, i) => page.drawText(line, { x: 56, y: 690 - i * 20, size: 11.5, font, color: rgb(0.2, 0.2, 0.24) }));
  return doc.save();
}
const csv = (rows: string[][]) => new TextEncoder().encode(`${rows.map((r) => r.join(",")).join("\n")}\n`);

/** Uploaded SOP files on a few JDs. [jd n, kind, file name, bytes] */
const SAMPLE_FILES: [number, "guidelines" | "template", string, () => Promise<Uint8Array>][] = [
  [13, "guidelines", "Transporter pickup SOP.pdf", () => samplePdf("Transporter pickup SOP", ["1. Raise requests before 5 pm.", "2. Share the load count and dock number.", "3. Confirm the vehicle number by 9 am."])],
  [15, "guidelines", "Vendor rating rules.pdf", () => samplePdf("Vendor rating rules", ["On-time delivery - 40 points", "Damage-free - 30 points", "Billing accuracy - 30 points", "Below 70 goes to the monthly review."])],
  [15, "template", "Vendor scorecard.csv", async () => csv([["Vendor", "On time", "Damage free", "Billing", "Score"], ["Bharat Logistics", "38", "27", "28", "93"], ["Coastal Freight", "30", "22", "25", "77"]])],
  [18, "guidelines", "Payment approval matrix.pdf", () => samplePdf("Payment approval matrix", ["Up to Rs 50,000 - Accounts Senior Executive", "Up to Rs 2 lakh - Finance Team Lead", "Above Rs 2 lakh - Manan Sir"])],
  [35, "guidelines", "Check-in call script.pdf", () => samplePdf("Daily check-in call script", ["1. What did the team finish yesterday?", "2. What is blocked?", "3. What will you show me on Friday?"])],
  [35, "template", "Client call log.csv", async () => csv([["Date", "Client", "Spoke to", "Outcome", "Next step"], ["", "", "", "", ""]])],
  [41, "guidelines", "Onboarding documents list.pdf", () => samplePdf("Onboarding documents", ["Aadhaar and PAN", "Two photographs", "Last three salary slips", "Relieving letter"])],
  [41, "template", "Joining checklist.csv", async () => csv([["Item", "Owner", "Done"], ["Laptop", "Apps/IT", ""], ["Email ID", "Apps/IT", ""], ["ID card", "Admin", ""]])],
  [44, "guidelines", "Voucher posting rules.pdf", () => samplePdf("Voucher posting rules", ["Post every voucher the same day.", "Attach the bill scan to the entry.", "Never post cash above Rs 10,000."])],
];

/* ── CHECKLIST ────────────────────────────────────────────────────────────── */

/** [code, title, category, offsetDays | null, doer, backup, instructions | null, fileLink | null] */
type Item = [string, string, string, number | null, string | null, string | null, string | null, string | null];

const WORKSHOP_ITEMS: Item[] = [
  ["WS-01", "Lock the venue and sign the booking letter", "Venue", -30, OLD.asha, P.farhan, "Hall for 80, projector, AC. Get the cancellation terms in writing.", null],
  ["WS-02", "Publish the event page and registration form", "Marketing", -25, P.nidhi, P.rohan, null, "https://forms.gle/dummy-workshop"],
  ["WS-03", "Run the Meta and LinkedIn ad campaign", "Marketing", -21, P.rohan, P.nidhi, "Budget ₹40,000. Pause any ad above ₹450 per lead.", null],
  ["WS-04", "Tele-call the registered list", "Registrations", -14, P.priya, P.karan, "Use the SP1 dispositions. Target 60% verbal yes.", null],
  ["WS-05", "Print banners, standees and certificates", "Collateral", -7, P.aditya, P.nidhi, null, "https://drive.google.com/drive/folders/dummy-print-files"],
  ["WS-06", "Send the joining instructions and venue map", "Registrations", -3, P.priya, P.mitul, null, null],
  ["WS-07", "Brief the trainers and the floor team", "Team", -2, P.mitul, OLD.asha, null, "https://docs.google.com/presentation/d/dummy-run-sheet"],
  ["WS-08", "Pack the event kit (clicker, HDMI, extension boards)", "Logistics", -1, P.farhan, OLD.ravi, "Checklist is inside the kit box lid.", null],
  ["WS-09", "Registration desk and attendance", "Delivery", 0, P.pooja, P.sameer, null, null],
  ["WS-10", "Run the session and capture photos", "Delivery", 0, P.mitul, P.rohan, null, null],
  ["WS-11", "Share the recording and slides with attendees", "Follow-up", 1, P.nidhi, P.aditya, null, null],
  ["WS-12", "Call every attendee for feedback and next steps", "Follow-up", 3, P.karan, P.priya, "Log interested leads in the CRM the same day.", null],
];

const ONBOARDING_ITEMS: Item[] = [
  ["ON-01", "Sign the engagement letter and collect the advance", "Commercials", null, P.mitul, OLD.asha, null, "https://drive.google.com/file/d/dummy-engagement-letter/view"],
  ["ON-02", "Create the client in the WMS and the CRM", "Setup", null, P.arjun, OLD.imran, null, null],
  ["ON-03", "Kick-off meeting with the owner and managers", "Kick-off", null, P.aarti, OLD.asha, "Agenda: scope, team, weekly rhythm, first 30-day goals.", null],
  ["ON-04", "Share the implementation tracker", "Setup", null, P.aarti, P.sameer, null, "https://docs.google.com/spreadsheets/d/dummy-tracker-template/edit"],
  ["ON-05", "Assign the handholding executive", "Team", null, P.aarti, null, null, null],
  ["ON-06", "Raise the first invoice", "Commercials", null, P.devang, OLD.meera, null, null],
  ["ON-07", "Add the client's people to the WhatsApp group", "Comms", null, P.sameer, P.pooja, null, null],
  ["ON-08", "30-day review with the owner", "Review", null, OLD.asha, P.aarti, null, null],
];

const OFFICE_ITEMS: Item[] = [
  ["OF-01", "Unlock, lights, AC and water purifier on", "Opening", null, P.rekha, P.farhan, null, null],
  ["OF-02", "Check the internet and the printer", "Opening", null, P.rekha, P.arjun, null, null],
  ["OF-03", "Pantry: milk, tea, coffee, sugar", "Pantry", null, P.rekha, null, "Reorder when below two days' stock.", null],
  ["OF-04", "Visitor register and courier desk", "Front desk", null, P.rekha, P.farhan, null, null],
  ["OF-05", "Lock the cash box and the store room", "Closing", null, P.farhan, P.rekha, null, null],
  ["OF-06", "AC, lights and main switch off", "Closing", null, P.farhan, P.rekha, null, null],
];

/** Doer and backup for the rows the earlier seeder created without anybody on them. */
const EXISTING_DOERS: Record<string, [string, string | null]> = {
  "PSO-01": [OLD.asha, OLD.ravi],
  "PSO-02": [P.nidhi, P.rohan],
  "PSO-03": [P.farhan, OLD.ravi],
  "PSO-04": [P.aarti, P.sameer],
  "PSO-05": [OLD.ravi, P.farhan],
  "PSO-06": [P.farhan, OLD.ravi],
  "PSO-07": [P.aarti, OLD.asha],
  "PSO-08": [P.pooja, P.sameer],
  "PSO-09": [P.sameer, P.pooja],
  "PSO-10": [P.pooja, P.aarti],
  "MC-01": [P.sneha, OLD.me],
  "MC-02": [P.devang, OLD.meera],
  "MC-03": [OLD.meera, OLD.long],
};

/* ── DCC ──────────────────────────────────────────────────────────────────── */

/** Position masters. [n, designation, section, code, title, frequency, target, unit] */
const DCC_MASTERS: [number, Desig, string, string, string, string, number | null, string | null][] = [
  [1, "Executive", "Client work", "EX-05", "Update the CRM for every lead touched", "Mon, Wed, Fri", null, null],
  [2, "Team Lead", "Team", "TL-04", "Weekly team huddle", "Every Monday", null, null],
  [3, "Senior Executive", "Start of day", "SE-01", "Mark attendance before 9:45 am", "Daily", null, null],
  [4, "Senior Executive", "Start of day", "SE-02", "Plan the day in the WMS", "Daily", null, null],
  [5, "Senior Executive", "Work", "SE-03", "Close the day's assigned tasks", "Daily", 5, "tasks"],
  [6, "Senior Executive", "Team", "SE-04", "Help one junior with a blocker", "Tue, Thu", null, null],
  [7, "Senior Executive", "End of day", "SE-05", "File the daily activity report", "Daily", null, null],
  [8, "Manager", "Team", "MG-01", "Review the team's DCC and sign off", "Daily", null, null],
  [9, "Manager", "Team", "MG-02", "One-to-one with a direct report", "Mon, Thu", null, null],
  [10, "Manager", "Reporting", "MG-03", "Send the weekly numbers to the founders", "Every Saturday", null, null],
  [11, "Manager", "Hiring", "MG-04", "Interview at least one candidate", "Tue, Fri", 1, "interviews"],
  [12, "Manager", "Reporting", "MG-05", "Monthly business review", "Monthly", null, null],
  [13, "Intern", "Learning", "IN-01", "One hour of the assigned course", "Daily", 60, "minutes"],
  [14, "Intern", "Work", "IN-02", "Submit the day's work for review", "Daily", null, null],
  [15, "Intern", "Learning", "IN-03", "Shadow a senior on a client call", "Wed, Fri", null, null],
  [16, "Intern", "End of day", "IN-04", "Write the day's learning in the journal", "Daily", null, null],
];

/** A person's own KPIs on top of the master. [owner, section, code, title, frequency, target, unit] */
const PERSONAL_KPIS: [string, string, string, string, string, number | null, string | null][] = [
  [P.mitul, "Calls", "SL-01", "Tele-calls to workshop leads", "Daily", 50, "calls"],
  [P.mitul, "Revenue", "SL-02", "Close one consulting deal", "Mon, Wed, Fri", 1, "deals"],
  [P.priya, "Calls", "SL-01", "Tele-calls to workshop leads", "Daily", 45, "calls"],
  [P.priya, "Follow-up", "SL-03", "Send proposals to warm leads", "Tue, Thu, Sat", 3, "proposals"],
  [P.karan, "Calls", "SL-01", "Tele-calls to workshop leads", "Daily", 40, "calls"],
  [P.rohan, "Campaigns", "MK-01", "Check campaign cost per lead", "Daily", null, null],
  [P.nidhi, "Content", "MK-02", "Publish two social posts", "Daily", 2, "posts"],
  [P.aditya, "Content", "MK-03", "Edit one reel", "Mon, Wed, Fri", 1, "reels"],
  [P.aarti, "Clients", "HH-01", "Client health calls", "Daily", 5, "calls"],
  [P.sameer, "Clients", "HH-02", "Daily client check-ins", "Daily", 8, "calls"],
  [P.pooja, "Clients", "HH-02", "Daily client check-ins", "Daily", 8, "calls"],
  [P.farhan, "Dispatch", "OP-01", "Photograph every outbound load", "Daily", 6, "loads"],
  [P.sneha, "Recruitment", "HR-01", "Screen new CVs", "Daily", 15, "CVs"],
  [P.sneha, "Engagement", "HR-02", "Birthday and anniversary wishes", "Daily", null, null],
  [P.devang, "Books", "AC-01", "Post the day's vouchers", "Daily", 25, "vouchers"],
  [P.rekha, "Office", "AD-01", "Pantry and supplies check", "Daily", null, null],
  [P.arjun, "Systems", "IT-01", "Check the overnight backup", "Daily", null, null],
  [P.arjun, "Support", "IT-02", "Close support tickets", "Daily", 6, "tickets"],
];

const NOT_DONE_NOTES = [
  "Client unavailable — rescheduled to tomorrow",
  "System was down in the afternoon",
  "On field visit the whole day",
  "Waiting on the vendor's reply",
  "Clashed with the workshop set-up",
];

/* ── RECRUITMENT JDs ──────────────────────────────────────────────────────── */

function jdContent(fields: Partial<JdContent> & { title: string }): JdContent {
  return { ...emptyJdContent(fields.title), ...fields };
}

const EXTRA_ROLES: { slug: string; sortOrder: number; title: string; content: JdContent | null }[] = [
  {
    slug: "accounts-executive",
    sortOrder: 900,
    title: "Accounts Executive",
    content: jdContent({
      title: "Accounts Executive",
      department: "Accounts",
      location: "Goregaon East, Mumbai",
      employmentType: "Full-time",
      workMode: "On-site",
      workSchedule: "Monday to Saturday, 10:30 am – 7:30 pm",
      experience: "1–3 years in bookkeeping or accounts",
      qualification: "B.Com (mandatory). CA-Inter or M.Com preferred.",
      salary: "₹2.4–3.6 LPA CTC",
      summary: "Keep the books of a growing consulting firm clean, current and audit-ready.",
      responsibilities: "Post vouchers daily in Tally\nBank reconciliation for three entities\nPrepare GST and TDS workings\nFollow up on receivables",
      requirements: "B.Com\n1+ year in Tally Prime\nWorking knowledge of GST",
      skills: "Tally Prime\nExcel (VLOOKUP, pivots)\nGST portal",
      howToApply: "Reply to this message with your CV.",
      atsKeywords: "accounts executive, tally, gst, tds, bank reconciliation, mumbai",
    }),
  },
  {
    slug: "hr-recruiter",
    sortOrder: 910,
    title: "HR Recruiter",
    content: jdContent({
      title: "HR Recruiter",
      department: "HR",
      location: "Goregaon East, Mumbai",
      employmentType: "Full-time",
      experience: "0–2 years",
      summary: "Source, screen and schedule candidates for every open role.",
    }),
  },
  // Added, nothing written yet — the "No JD yet" state.
  { slug: "field-sales-executive-pune", sortOrder: 920, title: "Field Sales Executive — Pune", content: null },
];

/** Recruiter edits on three of the standard roles. [seed index, editor, daysAgo, changes] */
const RECRUITER_EDITS: [number, string, number, Partial<JdContent>][] = [
  [0, P.sneha, 3, { salary: "Sales Manager: ₹3.0–4.5 LPA CTC + incentives. Negotiable for the right candidate.", howToApply: "WhatsApp your CV to Sneha (HR) on this number, or reply to this email." }],
  [2, OLD.me, 6, { location: "Goregaon East, Mumbai — with client visits across Maharashtra", workSchedule: "Monday to Saturday, 10:30 am – 7:30 pm. Second and fourth Saturday off." }],
  [5, P.sneha, 1, { experience: "Freshers welcome. 0–1 year in back-office work preferred.", howToApply: "Walk in any weekday between 11 am and 1 pm with your CV." }],
];

/** [role slug, channel, name, phone | null, email | null, status, sentBy, daysAgo, hour, error] */
const SENDS: [string, "whatsapp" | "email", string, string | null, string | null, "opened" | "sent" | "failed", string, number, number, string | null][] = [];
{
  const firstNames = ["Rahul", "Anjali", "Vikram", "Sonal", "Harsh", "Kritika", "Nikhil", "Tanvi", "Omkar", "Ishita", "Yash", "Mansi", "Siddharth", "Riya", "Aman", "Neha"];
  const lastNames = ["Sawant", "Gupta", "Chavan", "Mistry", "Pandya", "Bose", "Naik", "Kamat", "Jain", "Parmar"];
  const slugs = [
    RECRUITMENT_JD_SEED[0]!.slug,
    RECRUITMENT_JD_SEED[0]!.slug,
    RECRUITMENT_JD_SEED[0]!.slug,
    RECRUITMENT_JD_SEED[1]!.slug,
    RECRUITMENT_JD_SEED[2]!.slug,
    RECRUITMENT_JD_SEED[2]!.slug,
    RECRUITMENT_JD_SEED[3]!.slug,
    RECRUITMENT_JD_SEED[3]!.slug,
    RECRUITMENT_JD_SEED[4]!.slug,
    RECRUITMENT_JD_SEED[5]!.slug,
    RECRUITMENT_JD_SEED[5]!.slug,
    RECRUITMENT_JD_SEED[5]!.slug,
    RECRUITMENT_JD_SEED[6]!.slug,
    RECRUITMENT_JD_SEED[6]!.slug,
    RECRUITMENT_JD_SEED[7]!.slug,
    "accounts-executive",
    "accounts-executive",
  ];
  for (let i = 0; i < 26; i++) {
    const first = firstNames[i % firstNames.length]!;
    const last = lastNames[(i * 3) % lastNames.length]!;
    const whatsapp = rand(`send|${i}|ch`) < 0.62;
    const failed = !whatsapp && i === 9;
    SENDS.push([
      slugs[i % slugs.length]!,
      whatsapp ? "whatsapp" : "email",
      `${first} ${last}`,
      whatsapp ? `+91 90000 ${String(10000 + i * 37).slice(-5)}` : null,
      whatsapp ? null : `${first.toLowerCase()}.${last.toLowerCase()}@example.invalid`,
      whatsapp ? "opened" : failed ? "failed" : "sent",
      rand(`send|${i}|by`) < 0.7 ? P.sneha : OLD.me,
      Math.floor(rand(`send|${i}|day`) * 24),
      10 + Math.floor(rand(`send|${i}|hour`) * 8),
      failed ? "Mailbox unavailable (550). The address may be mistyped." : null,
    ]);
  }
}

/* ── THE SEEDER ───────────────────────────────────────────────────────────── */

export async function seedShowcase(pg: PGlite): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = async (table: string) => {
    const r = await pg.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    counts[table] = r.rows[0]?.n ?? 0;
  };
  const one = async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
    (await pg.query<T>(sql, params)).rows[0];

  /* ── People ──────────────────────────────────────────────────────────── */
  const deptRows = (await pg.query<{ id: string; name: string }>(`select id, name from departments`)).rows;
  const deptId = (name: string) => deptRows.find((d) => d.name.toLowerCase() === name.toLowerCase())?.id ?? null;

  const desigIds = new Map<Desig, string>();
  let desigN = 10;
  for (const name of ["Executive", "Senior Executive", "Team Lead", "Manager", "Intern"] as Desig[]) {
    const found = await one<{ id: string }>(`select id from designations where lower(name) = lower($1) limit 1`, [name]);
    if (found) desigIds.set(name, found.id);
    else {
      const newId = id("8002", ++desigN);
      await pg.query(`insert into designations (id, name) values ($1,$2) on conflict do nothing`, [newId, name]);
      desigIds.set(name, newId);
    }
  }

  for (const [pid, name, email, dept, desig, , role, joined] of NEW_PEOPLE) {
    await pg.query(
      `insert into employees (id, name, email, role, is_admin, is_active, department_id, designation_id, department, joined_at)
       values ($1,$2,$3,$4::employee_role,false,true,$5,$6,$7, now() - ($8::int * interval '1 day'))
       on conflict (id) do nothing`,
      [pid, name, email, role, deptId(dept), desigIds.get(desig)!, dept, joined],
    );
  }
  // Managers second: a manager may be somebody inserted later in the list.
  for (const [pid, , , , , manager] of NEW_PEOPLE) {
    await pg.query(`update employees set manager_id = $2 where id = $1 and manager_id is null`, [pid, manager]);
  }
  for (const [pid, dept] of [...NEW_PEOPLE.map((p) => [p[0], p[3]] as [string, string]), ...OLD_DEPARTMENTS]) {
    const did = deptId(dept);
    if (!did) continue;
    await pg.query(
      `insert into employee_departments (employee_id, department_id) values ($1,$2) on conflict do nothing`,
      [pid, did],
    );
  }
  for (const [pid, dept] of OLD_DEPARTMENTS) {
    await pg.query(`update employees set department = $2 where id = $1 and department is null`, [pid, dept]);
  }
  await bump("employees");

  /* ── JD Bank ─────────────────────────────────────────────────────────── */
  const me = OLD.me;
  for (const [n, fn, rankName, title, holders] of POSITIONS) {
    const rank = await one<{ id: string }>(`select id from jd_ranks where name = $1 limit 1`, [rankName]);
    if (!rank) throw new Error(`jd_ranks has no "${rankName}" — the rank ladder migration is missing.`);
    // The seat's uniqueness is function + rank + variant; skip if that seat exists under another id.
    const clash = await one<{ id: string }>(
      `select id from jd_positions where function_key = $1 and rank_id = $2 and variant is null and id <> $3 limit 1`,
      [fn, rank.id, id("8013", n)],
    );
    if (clash) continue;
    await pg.query(
      `insert into jd_positions (id, function_key, rank_id, title, created_by_id)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [id("8013", n), fn, rank.id, title, me],
    );
  }
  let holderN = 0;
  const seat = async (posN: number, emp: string) => {
    await pg.query(
      `insert into jd_position_holders (id, position_id, employee_id)
       select $1,$2,$3 where exists (select 1 from jd_positions where id = $2)
       on conflict do nothing`,
      [id("8017", ++holderN), id("8013", posN), emp],
    );
  };
  for (const [n, , , , holders] of POSITIONS) for (const h of holders) await seat(n, h);
  for (const [n, h] of EXTRA_HOLDERS) await seat(n, h);
  await bump("jd_positions");
  await bump("jd_position_holders");

  for (const [n, posN, owner, fn, task, category, mins, rec, dcc, wms, event, links, notes] of ENTRIES) {
    if (rec.kind === "rrule" && !parseRRule(rec.rule)) throw new Error(`Unreadable RRULE for JD ${n}: ${rec.rule}`);
    if (posN !== null) {
      const exists = await one(`select 1 from jd_positions where id = $1`, [id("8013", posN)]);
      if (!exists) continue;
    }
    await pg.query(
      `insert into jd_entries
         (id, position_id, owner_employee_id, function_key, task, category, recurrence,
          estimated_minutes, push_dcc, push_wms, push_event, video_url, guidelines_url, template_url,
          notes_html, created_by_id, updated_by_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16, now() - ($17::int * interval '1 day'))
       on conflict (id) do nothing`,
      [
        id("8014", n),
        posN === null ? null : id("8013", posN),
        owner,
        fn,
        task,
        category,
        JSON.stringify(rec),
        mins,
        dcc,
        wms,
        event,
        links.video ?? null,
        links.guide ?? null,
        links.template ?? null,
        notes ? `<p>${notes}</p>` : null,
        me,
        40 - (n % 30),
      ],
    );
  }
  // Sample uploaded files — written to .dummy-storage like a real dummy-mode upload.
  let fileN = 0;
  for (const [jdN, kind, name, bytes] of SAMPLE_FILES) {
    fileN++;
    const exists = await one(`select 1 from jd_entries where id = $1`, [id("8014", jdN)]);
    if (!exists) continue;
    const storagePath = `jd/${me}/${id("8021", fileN)}/${name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const body = await bytes();
    const full = join(DUMMY_STORAGE_DIR, "documents", storagePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    await pg.query(
      `insert into jd_attachments (id, jd_id, kind, storage_path, file_name, mime, size_bytes, uploaded_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
      [id("8022", fileN), id("8014", jdN), kind, storagePath, name, name.endsWith(".pdf") ? "application/pdf" : "text/csv", body.length, me],
    );
  }
  await bump("jd_attachments");

  // One retired entry, so the Bank's Restore button and faded row show up.
  await pg.query(`update jd_entries set is_active = false where id = $1`, [id("8014", 50)]);
  await bump("jd_entries");

  let assignN = 0;
  for (const [jdN, emp, dcc, wms, event] of ASSIGNMENTS) {
    await pg.query(
      `insert into jd_assignments (id, jd_id, employee_id, for_dcc, for_wms, for_event, assigned_by_id)
       select $1,$2,$3,$4,$5,$6,$7 where exists (select 1 from jd_entries where id = $2)
       on conflict do nothing`,
      [id("8014", 920 + ++assignN), id("8014", jdN), emp, dcc, wms, event, me],
    );
  }
  await bump("jd_assignments");

  /* ── Checklist: templates ────────────────────────────────────────────── */
  const templateId = async (name: string, fixed: string, isEvent: boolean, description: string) => {
    const found = await one<{ id: string }>(`select id from ops_checklist_templates where lower(name) = lower($1)`, [name]);
    if (found) return found.id;
    await pg.query(
      `insert into ops_checklist_templates (id, name, is_event, description, created_by_id)
       values ($1,$2,$3,$4,$5) on conflict do nothing`,
      [fixed, name, isEvent, description, me],
    );
    return fixed;
  };
  const tPso = (await one<{ id: string }>(`select id from ops_checklist_templates where name = 'PSO Checklist'`))?.id;
  const tMonthly = (await one<{ id: string }>(`select id from ops_checklist_templates where name = 'Monthly Close'`))?.id;
  const tWorkshop = await templateId("Workshop Checklist", id("8018", 1), true, "Everything from booking the hall to the feedback calls, for a paid workshop.");
  const tOnboard = await templateId("New Client Onboarding", id("8018", 2), false, "From the signed engagement letter to the 30-day review.");
  const tOffice = await templateId("Office Opening & Closing", id("8018", 3), false, "The front office's daily open and close.");

  let itemN = 100;
  const addTemplateItems = async (tid: string, items: Item[]) => {
    let sort = 0;
    for (const [code, title, category, offset, doer, backup, instructions, link] of items) {
      const exists = await one(`select 1 from ops_checklist_items where template_id = $1 and code = $2`, [tid, code]);
      sort++;
      itemN++;
      if (exists) continue;
      await pg.query(
        `insert into ops_checklist_items
           (id, template_id, code, title, category, offset_days, doer_id, backup_id, instructions, file_link, sort_order, created_by_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (id) do nothing`,
        [id("8018", itemN), tid, code, title, category, offset, doer, backup, instructions, link, sort, me],
      );
    }
  };
  await addTemplateItems(tWorkshop, WORKSHOP_ITEMS);
  await addTemplateItems(tOnboard, ONBOARDING_ITEMS);
  await addTemplateItems(tOffice, OFFICE_ITEMS);

  // People on the rows the earlier seeder left unassigned — template rows and their run copies alike.
  for (const [code, [doer, backup]] of Object.entries(EXISTING_DOERS)) {
    await pg.query(
      `update ops_checklist_items set doer_id = $2, backup_id = $3 where code = $1 and doer_id is null`,
      [code, doer, backup],
    );
  }
  await bump("ops_checklist_templates");

  /* ── Checklist: events and runs ──────────────────────────────────────── */
  const categoryId = async (name: string) =>
    (await one<{ id: string }>(`select id from event_categories where lower(name) = lower($1) limit 1`, [name]))?.id ?? null;
  const pso = await categoryId("PSO");
  const training = await categoryId("Training");

  /** [n, template, title, isEvent, event date offset | null, category, status, notes] */
  const RUNS: [number, string | undefined, string, boolean, number | null, string | null, "active" | "completed" | "cancelled", string | null][] = [
    [1, tPso, "PSO Pune", true, -26, pso, "completed", "82 attended of 96 registered."],
    [2, tPso, "PSO Ahmedabad", true, -2, pso, "active", null],
    [3, tWorkshop, "Sales Masterclass Mumbai", true, 4, training, "active", "Two batches: 10 am and 3 pm."],
    [4, tWorkshop, "Sales Masterclass Surat", true, 33, training, "active", null],
    [5, tPso, "PSO Indore", true, 18, pso, "cancelled", "Venue unavailable — moved to November."],
    [6, tMonthly, "Monthly Close — this month", false, null, null, "active", null],
    [7, tOnboard, "Onboarding — Deccan Foods", false, null, null, "active", null],
    [8, tOnboard, "Onboarding — Aurora Textiles", false, null, null, "completed", null],
    [9, tOffice, "Office — daily open & close", false, null, null, "active", null],
  ];

  for (const [n, tid, title, isEvent, offset, category, status, notes] of RUNS) {
    if (!tid) continue;
    const runId = id("8019", n);
    const eventDate = offset === null ? null : ymd(offset);
    let eventId: string | null = null;
    if (isEvent && eventDate) {
      eventId = id("8019", 100 + n);
      await pg.query(
        `insert into calendar_events (id, title, category_id, event_date, all_day, source, created_by_id)
         values ($1,$2,$3,$4,true,'manual',$5) on conflict (id) do nothing`,
        [eventId, title, category, eventDate, me],
      );
    }
    const runTitle = eventDate ? `${title} ${eventDate}` : title;
    const created = await pg.query(
      `insert into ops_checklist_runs (id, template_id, title, is_event, event_id, event_date, status, notes, created_by_id, updated_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) on conflict (id) do nothing returning id`,
      [runId, tid, runTitle, isEvent, eventId, eventDate, status, notes, me],
    );
    if (created.rows.length === 0) continue; // already seeded — its rows are there

    // What createChecklistRun does: copy the template's live rows onto the run.
    await pg.query(
      `insert into ops_checklist_items
         (template_id, run_id, code, title, category, offset_days, doer_id, backup_id, instructions, file_link, jd_entry_id, sort_order, created_by_id)
       select null, $1, code, title, category, offset_days, doer_id, backup_id, instructions, file_link, jd_entry_id, sort_order, $3
       from ops_checklist_items where template_id = $2 and is_active`,
      [runId, tid, me],
    );
  }
  // A row added to one event only, not to its template.
  await pg.query(
    `insert into ops_checklist_items (id, run_id, code, title, category, offset_days, doer_id, backup_id, sort_order, created_by_id)
     select $1, $2, 'WS-X1', 'Arrange a Gujarati interpreter for the 3 pm batch', 'Team', -1, $3, $4, 99, $5
     where exists (select 1 from ops_checklist_runs where id = $2)
     on conflict (id) do nothing`,
    [id("8018", 900), id("8019", 3), P.pooja, P.aarti, me],
  );

  /* Doer Statuses for every run — including the earlier seeder's PSO Nashik —
     that has none yet, in the WMS Tasks six. What a real team leaves behind:
     past rows mostly Done, some Follow Up or Need Info, a few called off
     (Approver Status Cancelled — WMS has no "Not Applicable"), today's half
     done, the future untouched. */
  const runs = (
    await pg.query<{ id: string; status: string; event_date: string | null; is_event: boolean }>(
      `select r.id, r.status, to_char(r.event_date, 'YYYY-MM-DD') as event_date, r.is_event
       from ops_checklist_runs r
       where not exists (select 1 from ops_checklist_checks c where c.run_id = r.id)`,
    )
  ).rows;
  const today = ymd(0);
  const helpNotes = ["Vendor has not confirmed yet", "Need the final attendee count first", "Printer quote is over budget — approve?", "Waiting on the client's GST number"];
  for (const r of runs) {
    const items = (
      await pg.query<{ id: string; offset_days: number | null; sort_order: number; doer_id: string | null }>(
        `select id, offset_days, sort_order, doer_id from ops_checklist_items where run_id = $1 order by sort_order`,
        [r.id],
      )
    ).rows;
    for (const [i, it] of items.entries()) {
      const key = `${r.id}|${it.id}`;
      let status: string | null = null;
      let approver: string | null = null;
      let notes: string | null = null;
      let doneOn: string | null = null;

      if (r.status === "cancelled") {
        if (i < 2) {
          status = "done";
          doneOn = r.event_date ? addDays(r.event_date, it.offset_days ?? 0) : today;
        }
      } else if (r.status === "completed") {
        if (rand(key) < 0.9) {
          status = "done";
          doneOn = r.event_date ? addDays(r.event_date, it.offset_days ?? 0) : ymd(-40 + i * 2);
        } else {
          status = "not_started";
          approver = "cancelled";
          notes = "Not needed this time.";
        }
      } else if (r.is_event && r.event_date) {
        const target = addDays(r.event_date, it.offset_days ?? 0);
        const x = rand(key);
        if (target < today) {
          if (x < 0.66) status = "done";
          else if (x < 0.74) status = "follow_up";
          else if (x < 0.86) status = "need_info";
          else if (x < 0.92) {
            status = "not_started";
            approver = "cancelled";
          } else status = "dont_know";
          if (status === "done") doneOn = target;
        } else if (target === today) {
          status = x < 0.5 ? "done" : "initiated";
          if (status === "done") doneOn = today;
        }
        if (status === "need_info" || status === "follow_up") {
          notes = helpNotes[Math.floor(rand(`${key}|n`) * helpNotes.length)]!;
        }
      } else {
        // A standing list: the first rows done, one stuck, one under way, the rest open.
        const x = rand(key);
        if (i < Math.ceil(items.length * 0.5)) {
          status = x < 0.85 ? "done" : "need_info";
          if (status === "done") doneOn = ymd(-6 + i);
          else notes = helpNotes[Math.floor(rand(`${key}|n`) * helpNotes.length)]!;
        } else if (i === Math.ceil(items.length * 0.5)) status = "initiated";
      }
      if (!status) continue;
      await pg.query(
        `insert into ops_checklist_checks (run_id, item_id, status, notes, done_at, approver_status, updated_by_id)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [r.id, it.id, status, notes, doneOn ? `${doneOn}T16:30:00+05:30` : null, approver, it.doer_id ?? me],
      );
    }
  }
  /* JDs that go to the Event Checklist, placed into live events (2026-09-18:
     the Event box picks events). What syncEventRows writes: a row in the
     event's checklist pointing back at the JD, on the event day. */
  const JD_EVENTS: [number, number[]][] = [
    [16, [3, 4]], // SOP review → both Sales Masterclasses
    [29, [3, 4]], // workshop reminder emailer
    [31, [3]], // testimonials — Mumbai
    [34, [2]], // plan next month's batches — PSO Ahmedabad
    [48, [2, 3]], // travel and hotels
    [59, [4]], // process audit
    [61, [3]], // campus-hiring drive
  ];
  for (const [jdN, runNs] of JD_EVENTS) {
    const jd = await one<{ task: string; category: string | null; client: string | null }>(
      `select task, category, client from jd_entries where id = $1 and push_event`,
      [id("8014", jdN)],
    );
    if (!jd) continue;
    for (const runN of runNs) {
      await pg.query(
        `insert into ops_checklist_items
           (run_id, title, category, client, offset_days, jd_entry_id, sort_order, initiator_id, created_by_id)
         select $1, $2, $3, $4, 0, $5, 900, $6, $6
         where exists (select 1 from ops_checklist_runs where id = $1 and is_event and status = 'active')
           and not exists (select 1 from ops_checklist_items where run_id = $1 and jd_entry_id = $5)`,
        [id("8019", runN), jd.task, jd.category, jd.client, id("8014", jdN), me],
      );
    }
  }

  await bump("ops_checklist_runs");
  await bump("ops_checklist_items");
  await bump("ops_checklist_checks");

  /* ── JD-For Recruitment ──────────────────────────────────────────────── */
  const hasRecruitment = await one(`select 1 from information_schema.columns where table_name = 'recruitment_jds' and column_name = 'slug'`);
  if (hasRecruitment) {
    for (const s of RECRUITMENT_JD_SEED) {
      await pg.query(
        `insert into recruitment_jds (slug, title, sort_order, master_content, master_updated_at, master_updated_by_id)
         values ($1,$2,$3,$4::jsonb, now() - interval '20 days', $5) on conflict (slug) do nothing`,
        [s.slug, s.title, s.sortOrder, JSON.stringify(s.content), me],
      );
    }
    for (const r of EXTRA_ROLES) {
      await pg.query(
        `insert into recruitment_jds (slug, title, sort_order, master_content, master_updated_at, master_updated_by_id)
         values ($1,$2,$3,$4::jsonb, $5, $6) on conflict (slug) do nothing`,
        [r.slug, r.title, r.sortOrder, r.content ? JSON.stringify(r.content) : null, r.content ? at(9, 15) : null, r.content ? P.sneha : null],
      );
    }
    for (const [idx, editor, daysAgo, changes] of RECRUITER_EDITS) {
      const s = RECRUITMENT_JD_SEED[idx];
      if (!s) continue;
      const edited = { ...normalizeJdContent(s.content, s.title), ...changes };
      await pg.query(
        `update recruitment_jds set recruiter_content = $2::jsonb, recruiter_updated_by_id = $3, recruiter_updated_at = $4
         where slug = $1 and recruiter_content is null`,
        [s.slug, JSON.stringify(edited), editor, at(daysAgo, 12, 20)],
      );
    }
    const roles = new Map(
      (await pg.query<{ id: string; slug: string; title: string; content: unknown }>(
        `select id, slug, title, coalesce(recruiter_content, master_content) as content from recruitment_jds`,
      )).rows.map((r) => [r.slug, r]),
    );
    let sendN = 0;
    for (const [slug, channel, name, phone, email, status, by, daysAgo, hour, error] of SENDS) {
      sendN++;
      const role = roles.get(slug);
      if (!role || !role.content) continue;
      await pg.query(
        `insert into recruitment_jd_sends
           (id, jd_id, position_label, channel, recipient_name, recipient_phone, recipient_email, content, status, error, sent_by_id, sent_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) on conflict (id) do nothing`,
        [id("8030", sendN), role.id, role.title, channel, name, phone, email, JSON.stringify(role.content), status, error, by, at(daysAgo, hour, (sendN * 7) % 60)],
      );
    }
    await bump("recruitment_jds");
    await bump("recruitment_jd_sends");
  }

  /* ── DCC ─────────────────────────────────────────────────────────────── */
  // The board keys its colours off the canonical casing; an earlier seed wrote lowercase.
  await pg.query(`
    update dcc_entries set status = case lower(status)
      when 'done' then 'Done' when 'not done' then 'Not done' when 'na' then 'NA' when 'pending' then 'Pending' end
    where status in ('done', 'not done', 'na', 'pending')`);
  // Items written before the schedule columns were filled read as "due every day, Sunday too".
  const unscheduled = (
    await pg.query<{ id: string; frequency: string | null }>(`select id, frequency from dcc_kpi_items where weekdays is null and frequency is not null`)
  ).rows;
  for (const it of unscheduled) {
    const pf = parseFrequency(it.frequency);
    await pg.query(`update dcc_kpi_items set weekdays = $2, schedule_kind = $3, needs_review = $4 where id = $1`, [it.id, pf.weekdays, pf.scheduleKind, pf.needsReview]);
  }

  for (const [n, desig, section, code, title, frequency, target, unit] of DCC_MASTERS) {
    const exists = await one(`select 1 from dcc_master_items where designation_id = $1 and code = $2`, [desigIds.get(desig)!, code]);
    if (exists) continue;
    await pg.query(
      `insert into dcc_master_items (id, designation_id, section, code, title, frequency, target_number, unit, sort_order, created_by_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing`,
      [id("8040", n), desigIds.get(desig)!, section, code, title, frequency, target, unit, 100 + n, me],
    );
  }
  await bump("dcc_master_items");

  // What the master sync does for every holder: one live-linked KPI per master item.
  const masters = (
    await pg.query<{
      id: string; designation_id: string; section: string | null; code: string | null; title: string;
      frequency: string | null; target_number: string | null; unit: string | null; sort_order: number; created_by_id: string | null;
    }>(`select * from dcc_master_items where is_active`)
  ).rows;
  const people = (
    await pg.query<{ id: string; designation_id: string | null; manager_id: string | null }>(
      `select id, designation_id, manager_id from employees where is_active`,
    )
  ).rows;
  for (const person of people) {
    for (const m of masters.filter((x) => x.designation_id === person.designation_id)) {
      const linked = await one(`select 1 from dcc_master_links where owner_employee_id = $1 and master_item_id = $2`, [person.id, m.id]);
      if (linked) continue;
      const master: MasterItem = {
        id: m.id,
        designationId: m.designation_id,
        section: m.section,
        code: m.code,
        title: m.title,
        frequency: m.frequency,
        targetNumber: m.target_number,
        unit: m.unit,
        sortOrder: m.sort_order,
        isActive: true,
        createdById: m.created_by_id,
      };
      const f = masterKpiFields(master);
      const row = await one<{ id: string }>(
        `insert into dcc_kpi_items
           (owner_employee_id, section, code, title, frequency, weekdays, schedule_kind, needs_review, target_number, unit, sort_order, created_by_id, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() - interval '60 days') returning id`,
        [person.id, f.section, f.code, f.title, f.frequency, f.weekdays, f.scheduleKind, f.needsReview, f.targetNumber, f.unit, f.sortOrder, me],
      );
      await pg.query(
        `insert into dcc_master_links (item_id, master_item_id, owner_employee_id) values ($1,$2,$3) on conflict do nothing`,
        [row!.id, m.id, person.id],
      );
    }
  }
  for (const [owner, section, code, title, frequency, target, unit] of PERSONAL_KPIS) {
    const exists = await one(`select 1 from dcc_kpi_items where owner_employee_id = $1 and code = $2`, [owner, code]);
    if (exists) continue;
    const pf = parseFrequency(frequency);
    await pg.query(
      `insert into dcc_kpi_items
         (owner_employee_id, section, code, title, frequency, weekdays, schedule_kind, needs_review, target_number, unit, sort_order, created_by_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() - interval '60 days')`,
      [owner, section, code, title, frequency, pf.weekdays, pf.scheduleKind, pf.needsReview, target, unit, 10, me],
    );
  }
  await bump("dcc_kpi_items");
  await bump("dcc_master_links");

  // Four weeks of filling, ending today.
  const WINDOW = 27;
  const days: string[] = [];
  for (let o = -WINDOW; o <= 0; o++) days.push(ymd(o));
  const isSunday = (d: string) => localDate(d).getDay() === 0;

  const items = (
    await pg.query<{
      id: string; owner_employee_id: string; weekdays: number | null; schedule_kind: string;
      is_participant_list: boolean; target_number: string | null;
    }>(
      `select k.id, k.owner_employee_id, k.weekdays, k.schedule_kind, k.is_participant_list, k.target_number
       from dcc_kpi_items k join employees e on e.id = k.owner_employee_id
       where not k.archived and e.is_active`,
    )
  ).rows;
  for (const it of items) {
    const quality = QUALITY[it.owner_employee_id] ?? 0.8;
    const rows: unknown[][] = [];
    for (const date of days) {
      if (isSunday(date)) continue;
      if (!scheduledDueOn({ id: it.id, weekdays: it.weekdays, scheduleKind: it.schedule_kind, isParticipantList: it.is_participant_list }, localDate(date))) continue;
      const x = rand(`${it.id}|${date}|status`);
      let status: string | null;
      if (date === today) status = x < 0.45 ? "Done" : x < 0.6 ? "Pending" : null; // today is half done on purpose
      else if (x < quality) status = "Done";
      else if (x < quality + 0.07) status = "Not done";
      else if (x < quality + 0.11) status = "NA";
      else if (x < quality + 0.15) status = "Pending";
      else status = null; // never filled — what a miss looks like
      if (!status) continue;

      const target = it.target_number === null ? null : Number(it.target_number);
      const value =
        target === null || status !== "Done"
          ? null
          : Math.max(1, Math.round(target * (0.75 + rand(`${it.id}|${date}|v`) * 0.5)));
      const note =
        status === "Not done" ? NOT_DONE_NOTES[Math.floor(rand(`${it.id}|${date}|note`) * NOT_DONE_NOTES.length)]! : null;
      rows.push([it.id, date, status, value, note, it.owner_employee_id]);
    }
    if (rows.length === 0) continue;
    const params: unknown[] = [];
    const values = rows.map((r) => {
      const base = params.length;
      params.push(...r);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6}, ($${base + 2}::date + time '18:40')::timestamptz)`;
    });
    await pg.query(
      `insert into dcc_entries (item_id, entry_date, status, value_number, note, filled_by_id, updated_at)
       values ${values.join(",")} on conflict do nothing`,
      params,
    );
  }
  await bump("dcc_entries");

  // A manager's sign-off on most past days, with the occasional rework.
  const owners = new Set(items.map((i) => i.owner_employee_id));
  for (const person of people.filter((p) => owners.has(p.id))) {
    const reviewer = person.manager_id ?? OLD.manan;
    for (const date of days) {
      if (isSunday(date) || date >= today) continue;
      const x = rand(`${person.id}|${date}|review`);
      const status = x < 0.64 ? "approved" : x < 0.76 ? "needs_rework" : null;
      if (!status) continue;
      await pg.query(
        `insert into dcc_reviews (owner_employee_id, review_date, reviewer_id, status, note, updated_at)
         values ($1,$2,$3,$4,$5, ($2::date + time '19:30')::timestamptz) on conflict do nothing`,
        [person.id, date, reviewer, status, status === "needs_rework" ? "Two items marked Done without the evidence attached." : null],
      );
    }
  }
  await bump("dcc_reviews");

  // The SP1 sheet: every caller's calls by outcome, up to today.
  for (const [emp, volume] of CALLERS) {
    for (const date of days) {
      if (isSunday(date)) continue;
      const busy = (0.7 + rand(`${emp}|${date}|busy`) * 0.7) * (date === today ? 0.5 : 1);
      const total = Math.round(46 * volume * busy);
      for (const d of SP1_DISPOSITIONS) {
        const count = Math.round(total * CALL_MIX[d] * (0.6 + rand(`${emp}|${date}|${d}`) * 0.8));
        if (count <= 0) continue;
        await pg.query(
          `insert into dcc_call_logs (employee_id, log_date, disposition, count, filled_by_id)
           select $1,$2,$3,$4,$1
           where not exists (select 1 from dcc_call_logs where employee_id = $1 and log_date = $2 and disposition = $3)`,
          [emp, date, d, count],
        );
      }
    }
  }
  await bump("dcc_call_logs");

  return counts;
}
