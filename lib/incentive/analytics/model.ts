import {
  INCENTIVE_STATUS_LABELS,
  INCENTIVE_TYPE_LABELS,
  type IncentiveStatus,
  type IncentiveType,
} from "@/db/enums";
import type { IncentiveEntry, IncentiveParticipant, IncentiveProject } from "@/db/schema";
import { INCENTIVE_DATE_KEY } from "@/lib/incentive-fields";
import { foldIncentiveSources, nameKey } from "@/lib/incentive/payout-sources";
import {
  competitionRanks,
  finite,
  gradeFor,
  pctOfCtc,
  periodCtc,
  rankMovement,
  round2,
  type IncentiveGrade,
  type RankCandidate,
  type RankMovement,
} from "./grading";
import { addMonths, isMonthKey, monthKeyOf, type ResolvedPeriod } from "./periods";

/**
 * INCENTIVE DASHBOARD — THE CALCULATION LAYER.
 *
 * Pure: everything here takes already-loaded rows and returns the dashboard, so
 * every rule is unit-testable and nothing is computed in a component. The
 * database half (lib/queries/incentive-analytics.ts) loads rows for ONE period
 * and ONE viewer scope and calls `buildIncentiveAnalytics`.
 *
 * ── WHERE EACH NUMBER COMES FROM (confirmed with the business) ─────────────
 *  · Approved / Not Approved / Due / Not Due — DECIDED INCENTIVE REQUESTS, by
 *    their approval-workflow status. A request has no amount of its own, so it
 *    is valued at its scheme's amount in the Incentive Master
 *    (`incentive_catalog`). A request whose scheme the Master prices per batch
 *    ("4 Google Reviews a month", "10 Referrals") has no per-request amount and
 *    counts as "amount not set" — never as ₹0 and never as a guess.
 *  · Paid / Unpaid — the INCENTIVE LEDGER (entries, project legs, team-split
 *    participants), exactly as the payout and the existing dashboard read it:
 *    paid = paid_amt, unpaid = approved_amt − paid_amt (never below 0).
 *  · Earnings, % of CTC, grade, rank, target vs actual — the ledger's APPROVED
 *    amount: what this module already calls "Total earned" and uses as the
 *    actual in Target vs Actual.
 *
 * ── WHO A LEDGER LINE BELONGS TO ───────────────────────────────────────────
 * The ledger was imported from a sheet whose names carry annotations —
 * "Mishtie Kanani ( Intern - Rohan C )" — and whose `employee_id` was resolved
 * on the LEADING name at import. So, in order:
 *   1. a linked `employee_id` that is a current employee → that employee;
 *   2. a linked `employee_id` that is someone who left / is excluded → dropped;
 *   3. the name with its bracketed annotation removed, matched to a current
 *      employee → that employee; matched to someone who left → dropped;
 *   4. anything else is an alias with no employee. It counts in company-wide
 *      totals (as the existing dashboard always has) but cannot be placed in
 *      anyone's team, graded or ranked.
 * Matching the raw name exactly — which the older readers do — would credit
 * fifteen of Mishtie's entries to a person who does not exist and grade her on
 * ₹0.
 *
 * ── WHO COUNTS ─────────────────────────────────────────────────────────────
 * `employees` must be ACTIVE, still-employed, non-candidate employees, without
 * the operational actors the ledger has always excluded.
 */

// ── Status cards ─────────────────────────────────────────────────────────────

export const STATUS_KEYS = ["not_approved", "approved", "due", "not_due", "paid", "unpaid"] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

export const STATUS_LABELS: Record<StatusKey, string> = {
  not_approved: "Not Approved",
  approved: "Approved",
  due: "Due",
  not_due: "Not Due",
  paid: "Paid",
  unpaid: "Unpaid",
};

/** The cards valued from requests (and so able to hold "amount not set"). */
export const REQUEST_STATUS_KEYS: readonly StatusKey[] = ["not_approved", "approved", "due", "not_due"];

/** Workflow state → the card it counts in. Pending, Reversed and Revision
 *  Requested are not among the six and count in none. */
export const REQUEST_STATUS_CARD: Partial<Record<IncentiveStatus, StatusKey>> = {
  approved: "approved",
  rejected: "not_approved",
  due: "due",
  not_due: "not_due",
};

// ── Request valuation (Incentive Master) ─────────────────────────────────────

/**
 * The Incentive Master scheme a request is valued at, or null when the Master
 * has no per-request scheme for it.
 *
 * Names are the catalog's own ("BSS Convert 1st", "Consulting Pitch", "JITO
 * Intro"); matching is case-insensitive. Client Happiness and Leads / Referrals
 * return null on purpose: the Master prices them per batch, so a single request
 * has no amount until Accounts records one.
 */
export function requestSchemeName(
  type: IncentiveType | string,
  details: Record<string, string> | null | undefined,
): string | null {
  const d = details && typeof details === "object" ? details : {};
  switch (type) {
    case "bss_conversion":
      if (d.conversion === "Direct") return "BSS Convert Direct";
      if (d.conversion === "1st Attempt") return "BSS Convert 1st";
      if (d.conversion === "2nd Attempt") return "BSS Convert 2nd";
      return null;
    case "sales_pitch":
      return "Consulting Pitch";
    case "group_intro":
      return ["Key Note", "Ascent Intro", "BNI Intro", "Jito Intro"].includes(d.event_type ?? "")
        ? (d.event_type as string)
        : null;
    default:
      return null;
  }
}

export interface CatalogScheme {
  name: string;
  amount: number;
  active: boolean;
}

/** Active, positive-amount schemes by lower-cased name. */
export function catalogAmounts(catalog: readonly CatalogScheme[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of catalog) {
    const amount = finite(c.amount);
    if (c.active && amount > 0) out.set(c.name.trim().toLowerCase(), amount);
  }
  return out;
}

/**
 * The name key of a ledger or target name with its sheet annotation removed:
 * "Mishtie Kanani ( Intern - Rohan C )" → "mishtie kanani".
 */
export function ledgerNameKey(name: string | null | undefined): string {
  return nameKey((name ?? "").replace(/\s*\([^()]*\)\s*$/, ""));
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface AnalyticsEmployee {
  id: string;
  name: string;
  code: string | null;
  /** annual CTC ÷ 12, from the salary module; null/0 when there is none. */
  monthlyCtc: number | null;
  /** "YYYY-MM" the person joined, or null when unknown. */
  joinedMonth: string | null;
}

export interface LedgerLine {
  key: string;
  source: "entry" | "project" | "participant";
  /** The ledger's own `employee_id` link, when the import resolved one. */
  employeeId: string | null;
  empName: string;
  label: string;
  /** "YYYY-MM" the incentive belongs to (`period_month`). */
  month: string | null;
  approved: number;
  paid: number;
}

export interface AnalyticsRequest {
  id: string;
  employeeId: string;
  type: IncentiveType | string;
  status: IncentiveStatus | string;
  details: Record<string, string> | null;
  split: { employeeId: string; name: string; pct: number }[] | null;
  /** "YYYY-MM-DD" the request was filed, in IST — the fallback incentive date. */
  createdYmd: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface AnalyticsTarget {
  empName: string;
  employeeId: string | null;
  /** "YYYY-MM-DD", first of month. For a quarter, its FIRST month (migration 0250). */
  periodMonth: string;
  /**
   * `month` for every row that has ever existed — including a whole-YEAR
   * target, which is stored as the January row. `quarter` for a quarterly
   * target, which anchors on its first month but must NOT be read as that
   * month's monthly target.
   */
  periodType: "month" | "quarter";
  amount: number;
}

/**
 * THE TWO VIEWS OF THE DASHBOARD.
 *
 *  · `team` — everyone this viewer is entitled to see: their downline through
 *    the existing `employees.manager_id` hierarchy, or the whole company for an
 *    admin / the incentive reviewer. This is the view the dashboard has always
 *    shown, and it is the default.
 *  · `user` — the signed-in person alone.
 *
 * The view can only ever NARROW what the viewer's own entitlement already
 * allows. `team` resolves to exactly the scope the server computed for them, so
 * there is nothing here a browser can push on to see more — see
 * `applyAnalyticsView` in ./scope.ts, which is the only place it is applied.
 */
export const ANALYTICS_VIEWS = ["team", "user"] as const;
export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number];

export interface AnalyticsScope {
  /** Company-wide viewer (admin, super-admin, incentive reviewer). */
  all: boolean;
  /** Everyone this viewer may see — self plus downline. Ignored when `all`. */
  employeeIds: ReadonlySet<string>;
  viewerId: string;
  label: string;
  /** Which of the two views this scope represents. Defaults to `team`. */
  view?: AnalyticsView;
  /**
   * Does this viewer have a Team view at all — i.e. does their entitlement
   * cover anyone besides themselves?
   *
   * Computed BEFORE the view narrows anything, because after narrowing to
   * `user` the scope can no longer tell you. It is what decides whether the
   * switcher is rendered: someone with no reports would otherwise be offered a
   * "Team" button that shows them their own figures under another name.
   */
  canSeeTeam?: boolean;
  /**
   * May this viewer read CTC figures for people who are NOT themselves?
   *
   * The rule the CTC restriction exists for is "a team lead must not read their
   * reports' pay". A viewer who was handed a company-wide scope was never that
   * person — they could already read every CTC on the page — and narrowing
   * their view to ONE employee must not take that away (see `narrowToEmployee`
   * in ./viewer.ts).
   *
   * Set ONLY by that narrowing, so every existing caller leaves it undefined and
   * the restriction behaves exactly as it always has.
   */
  ctcUnrestricted?: boolean;
}

export interface BuildInput {
  period: ResolvedPeriod;
  /** The current month in IST, for the target warning. */
  currentMonth: string;
  /**
   * WHOSE DASHBOARD THIS IS, when it is not the signed-in person's.
   *
   * `me` in the result is the row the dashboard is ABOUT — the figure the KPI
   * band's Grade and % of CTC cards print. It used to be "the signed-in
   * employee", which is the same thing until somebody opens somebody else's
   * dashboard (`?emp=`): at that point the two disagree, and the band would
   * print the READER's grade under the viewed person's name.
   *
   * `viewer` stays the signed-in identity and is deliberately not reused for
   * this. The CTC restriction is computed from `viewer` — a manager must not
   * read a report's pay — so swapping it for the subject would hand them the
   * very figure the rule withholds. Defaults to the viewer, so every existing
   * caller is unchanged.
   */
  subjectId?: string;
  employees: readonly AnalyticsEmployee[];
  /** Name keys of people who must not be counted — left, inactive or excluded. */
  inactiveNameKeys: ReadonlySet<string>;
  /** Ids of employees who must not be counted — left, inactive or excluded. */
  excludedEmployeeIds: ReadonlySet<string>;
  /** Ledger lines covering the period AND its previous window. */
  ledger: readonly LedgerLine[];
  /** Decided requests; lines outside the period are ignored. */
  requests: readonly AnalyticsRequest[];
  catalog: readonly CatalogScheme[];
  /** Target rows covering the period, the current month and the next. */
  targets: readonly AnalyticsTarget[];
  scope: AnalyticsScope;
  viewer: { id: string; name: string };
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export interface StatusCard {
  key: StatusKey;
  label: string;
  count: number;
  amount: number;
  /** Requests counted here that the Incentive Master has no amount for. */
  unvaluedCount: number;
}

export interface StatusRecord {
  id: string;
  source: "request" | "ledger";
  statuses: StatusKey[];
  employeeLabel: string;
  employeeCodes: string;
  typeLabel: string;
  /** ISO date; for a ledger line, the first of its month. */
  incentiveDate: string;
  dateIsMonth: boolean;
  /** Request: its valued amount (this viewer's share when split); ledger: approved. */
  amount: number | null;
  paidAmount: number | null;
  unpaidAmount: number | null;
  approvalLabel: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  product: string | null;
  paymentLabel: string;
}

export type CtcState = "ok" | "missing" | "restricted" | "not_employed";

export interface EmployeePerformance {
  employeeId: string;
  name: string;
  code: string | null;
  isSelf: boolean;
  /** CTC for the period; null unless `ctcState` is "ok". */
  ctc: number | null;
  ctcState: CtcState;
  earned: number;
  pctOfCtc: number | null;
  grade: IncentiveGrade | null;
  /** Null when not ranked: no CTC, or nothing earned in the period. */
  rank: number | null;
  previousRank: number | null;
  movement: RankMovement;
  target: number | null;
  /** earned − target; negative is a deficit. Null without a target. */
  difference: number | null;
}

export interface TargetWarning {
  currentMonth: string;
  nextMonth: string;
  missingCurrent: boolean;
  missingNext: boolean;
}

export interface IncentiveAnalytics {
  period: ResolvedPeriod;
  scope: {
    all: boolean;
    label: string;
    view: AnalyticsView;
    canSeeTeam: boolean;
    /** The signed-in employee's own id — used for their own-document links. */
    viewerId: string;
  };
  statuses: StatusCard[];
  records: StatusRecord[];
  employees: EmployeePerformance[];
  /** How many people hold a rank company-wide ("rank 3 of 18"). */
  rankedCount: number;
  previousRanksAvailable: boolean;
  summary: {
    people: number;
    earned: number;
    target: number | null;
    grades: Record<IncentiveGrade | "none", number>;
  };
  /**
   * THE PERIOD, MONTH BY MONTH — one entry per month it spans, ascending.
   *
   * What the dashboard's "earned over time" bar strip draws, and the only
   * series on the page that shows SHAPE (a quarter that started badly) rather
   * than a single total. Every figure is a real sum of the rows in that month:
   * a month with nothing in it is a genuine zero, never a gap filled in.
   *
   * `target` is null when no monthly target was set for that month, so the
   * strip can tell "no target" from "a target of zero" — the same distinction
   * the target warning makes. A QUARTERLY target is deliberately absent here:
   * it is a commitment for the period as a whole, and spreading it across its
   * months would invent three monthly targets nobody set.
   */
  monthly: { month: string; earned: number; target: number | null }[];
  me: EmployeePerformance | null;
  targetWarning: TargetWarning | null;
  /**
   * EVERYONE THIS VIEWER MAY LOOK AT — the employee picker's rows.
   *
   * A property of the VIEWER's entitlement, not of the period, and deliberately
   * NOT narrowed when the dashboard is: the picker must keep offering everybody
   * while you are viewing one of them, or selecting somebody would leave you
   * unable to select anybody else.
   *
   * Set by the loader (lib/queries/incentive-analytics.ts), which is the layer
   * that holds both the un-narrowed scope and the eligible roster. ABSENT means
   * the caller did not resolve it, which reads as "no picker" — the safe
   * direction, and what every existing caller gets.
   */
  viewablePeople?: readonly { id: string; name: string }[];
}

// ── Ledger folding ───────────────────────────────────────────────────────────

function isoDate(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
}

/**
 * Raw ledger rows → one line per earner, through the SAME fold the payout uses
 * (`foldIncentiveSources`): a team split's participants replace their parent's
 * own amounts, and the operational actors are dropped.
 */
export function ledgerLinesFrom(
  entries: readonly IncentiveEntry[],
  projects: readonly IncentiveProject[],
  participants: readonly IncentiveParticipant[],
): LedgerLine[] {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const participantById = new Map(participants.map((p) => [p.id, p]));
  return foldIncentiveSources([...entries], [...projects], [...participants]).map((s) => {
    let label = "Incentive";
    if (s.table === "entry") {
      label = entryById.get(s.rowId)?.incentiveName?.trim() || "Incentive";
    } else if (s.table === "project") {
      const name = projectById.get(s.rowId)?.projectName?.trim() || "Project incentive";
      label = `${name} · ${s.leg === "intern" ? "Intern" : "Supervisor"}`;
    } else {
      const part = participantById.get(s.rowId);
      const parent =
        (part?.entryId && entryById.get(part.entryId)?.incentiveName?.trim()) ||
        (part?.projectId && projectById.get(part.projectId)?.projectName?.trim()) ||
        "Incentive";
      label = `${parent} · Split`;
    }
    return {
      key: s.key,
      source: s.table,
      employeeId: s.employeeId ?? null,
      empName: s.empName,
      label,
      month: monthKeyOf(isoDate(s.periodMonth)),
      approved: finite(s.approved),
      paid: finite(s.paid),
    };
  });
}

/** A request's incentive date: the form's Incentive Date, else the day it was filed. */
export function requestIncentiveDate(r: Pick<AnalyticsRequest, "details" | "createdYmd">): string {
  const d = r.details?.[INCENTIVE_DATE_KEY];
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : r.createdYmd;
}

// ── Target warning ───────────────────────────────────────────────────────────

/**
 * Has this person entered a target for the current and the next month?
 * A row with a positive amount counts; a ₹0 row is treated as not filled in.
 */
export function targetWarningFor(
  viewer: { id: string; name: string },
  targets: readonly AnalyticsTarget[],
  currentMonth: string,
): TargetWarning {
  const nextMonth = addMonths(currentMonth, 1);
  const key = ledgerNameKey(viewer.name);
  // MONTHLY rows only. The warning asks for a MONTHLY target; a quarterly row
  // anchored on the same month is a different commitment and must not satisfy
  // it (migration 0250).
  const has = (month: string) =>
    targets.some(
      (t) =>
        t.periodType === "month" &&
        monthKeyOf(t.periodMonth) === month &&
        finite(t.amount) > 0 &&
        (t.employeeId === viewer.id || (key !== "" && ledgerNameKey(t.empName) === key)),
    );
  return { currentMonth, nextMonth, missingCurrent: !has(currentMonth), missingNext: !has(nextMonth) };
}

// ── The build ────────────────────────────────────────────────────────────────

export function buildIncentiveAnalytics(input: BuildInput): IncentiveAnalytics {
  const { period, scope } = input;
  const nowMonths = new Set(period.months);
  const prevMonths = new Set(period.previous?.months ?? []);

  const empById = new Map(input.employees.map((e) => [e.id, e]));
  const activeByName = new Map<string, AnalyticsEmployee>();
  for (const e of input.employees) {
    const k = ledgerNameKey(e.name);
    if (k && !activeByName.has(k)) activeByName.set(k, e);
  }
  const canSee = (employeeId: string | null | undefined): boolean =>
    scope.all || (!!employeeId && scope.employeeIds.has(employeeId));

  /** Who a ledger line belongs to — see "WHO A LEDGER LINE BELONGS TO" above. */
  const resolveEarner = (line: LedgerLine): { emp: AnalyticsEmployee | null; drop: boolean } => {
    if (line.employeeId) {
      const linked = empById.get(line.employeeId);
      if (linked) return { emp: linked, drop: false };
      if (input.excludedEmployeeIds.has(line.employeeId)) return { emp: null, drop: true };
    }
    const k = ledgerNameKey(line.empName);
    if (!k || k === "none") return { emp: null, drop: true };
    const named = activeByName.get(k);
    if (named) return { emp: named, drop: false };
    if (input.inactiveNameKeys.has(k)) return { emp: null, drop: true };
    return { emp: null, drop: false };
  };

  // ── Ledger: earnings (now + previous) and Paid / Unpaid records ──
  const earnedNow = new Map<string, number>();
  const earnedPrev = new Map<string, number>();
  /** The same earnings, bucketed by month — the "earned over time" series. */
  const earnedByMonth = new Map<string, number>();
  let prevTotal = 0;
  const records: StatusRecord[] = [];

  for (const line of input.ledger) {
    if (!line.month) continue;
    const { emp, drop } = resolveEarner(line);
    if (drop) continue;

    if (nowMonths.has(line.month)) {
      if (emp) earnedNow.set(emp.id, (earnedNow.get(emp.id) ?? 0) + line.approved);
      // Same test `summary.earned` sums through (`visible` = the employees this
      // viewer may see), so the monthly strip and the Total Actual KPI above it
      // are the same money counted two ways — never two different answers.
      if (emp && canSee(emp.id)) {
        earnedByMonth.set(line.month, (earnedByMonth.get(line.month) ?? 0) + line.approved);
      }
      const paid = round2(Math.max(0, line.paid));
      const unpaid = round2(Math.max(0, line.approved - line.paid));
      if ((paid > 0 || unpaid > 0) && (emp ? canSee(emp.id) : scope.all)) {
        const statuses: StatusKey[] = [];
        if (paid > 0) statuses.push("paid");
        if (unpaid > 0) statuses.push("unpaid");
        records.push({
          id: `ledger:${line.key}`,
          source: "ledger",
          statuses,
          employeeLabel: emp?.name ?? line.empName,
          employeeCodes: emp?.code ?? "",
          typeLabel: line.label,
          incentiveDate: `${line.month}-01`,
          dateIsMonth: true,
          amount: round2(line.approved),
          paidAmount: paid,
          unpaidAmount: unpaid,
          approvalLabel: "Recorded in ledger",
          reviewerName: null,
          reviewedAt: null,
          reviewNote: null,
          product: null,
          paymentLabel: paid > 0 && unpaid === 0 ? "Paid" : paid > 0 ? "Partly paid" : "Unpaid",
        });
      }
    }
    if (prevMonths.has(line.month) && emp) {
      earnedPrev.set(emp.id, (earnedPrev.get(emp.id) ?? 0) + line.approved);
      prevTotal += line.approved;
    }
  }

  // ── Requests: Approved / Not Approved / Due / Not Due ──
  const amounts = catalogAmounts(input.catalog);
  for (const r of input.requests) {
    const card = REQUEST_STATUS_CARD[r.status as IncentiveStatus];
    if (!card) continue;
    const date = requestIncentiveDate(r);
    if (!nowMonths.has(date.slice(0, 7))) continue;
    const owner = empById.get(r.employeeId);
    if (!owner) continue; // filed by someone who has left, or is not eligible

    const people =
      r.split && r.split.length > 0
        ? r.split.map((s) => ({ emp: empById.get(s.employeeId) ?? null, pct: finite(s.pct) }))
        : [{ emp: owner as AnalyticsEmployee | null, pct: 100 }];
    const shown = people.filter((p) => p.emp && canSee(p.emp.id));
    if (shown.length === 0) continue;

    const scheme = requestSchemeName(r.type, r.details);
    const full = scheme ? (amounts.get(scheme.toLowerCase()) ?? null) : null;
    const amount =
      full === null ? null : round2(scope.all ? full : shown.reduce((s, p) => s + (full * p.pct) / 100, 0));

    const split = r.split && r.split.length > 0;
    records.push({
      id: `request:${r.id}`,
      source: "request",
      statuses: [card],
      employeeLabel: shown
        .map((p) => (split ? `${p.emp!.name} ${round2(p.pct)}%` : p.emp!.name))
        .join(" · "),
      employeeCodes: shown.map((p) => p.emp!.code ?? "").filter(Boolean).join(" · "),
      typeLabel: INCENTIVE_TYPE_LABELS[r.type as IncentiveType] ?? String(r.type),
      incentiveDate: date,
      dateIsMonth: false,
      amount,
      paidAmount: null,
      unpaidAmount: null,
      approvalLabel: INCENTIVE_STATUS_LABELS[r.status as IncentiveStatus] ?? String(r.status),
      reviewerName: r.decidedByName,
      reviewedAt: r.decidedAt,
      reviewNote: r.decisionNote,
      product: r.details?.product || r.details?.products || null,
      paymentLabel: "Not applicable",
    });
  }

  records.sort((a, b) => b.incentiveDate.localeCompare(a.incentiveDate) || a.employeeLabel.localeCompare(b.employeeLabel));

  const statuses: StatusCard[] = STATUS_KEYS.map((key) => {
    const recs = records.filter((r) => r.statuses.includes(key));
    const amount = recs.reduce(
      (s, r) => s + finite(key === "paid" ? r.paidAmount : key === "unpaid" ? r.unpaidAmount : r.amount),
      0,
    );
    return {
      key,
      label: STATUS_LABELS[key],
      count: recs.length,
      amount: round2(amount),
      unvaluedCount: REQUEST_STATUS_KEYS.includes(key) ? recs.filter((r) => r.amount === null).length : 0,
    };
  });

  // ── Targets for the period ──
  //
  // PERIOD-TYPE AWARE (migration 0250). A MONTHLY row counts when its month is
  // one of the period's months — which is what every existing row is, so every
  // existing figure is unchanged. A QUARTERLY row counts only when the selected
  // period IS that quarter, and is added ON TOP of the months it spans: the
  // quarter's own target is a separate commitment, not a substitute for the
  // monthly ones inside it. Without this a Q3 target stored at 2026-07-01 would
  // be read as July's monthly target and inflate YTD.
  const targetByEmp = new Map<string, number>();
  /** Monthly targets, bucketed by month — the strip's target line. */
  const targetByMonth = new Map<string, number>();
  for (const t of input.targets) {
    const m = monthKeyOf(t.periodMonth);
    if (!m) continue;
    const isQuarterly = t.periodType === "quarter";
    if (isQuarterly ? t.periodMonth !== period.quarterStart : !nowMonths.has(m)) continue;
    const emp = (t.employeeId ? empById.get(t.employeeId) : undefined) ?? activeByName.get(ledgerNameKey(t.empName));
    if (!emp) continue;
    targetByEmp.set(emp.id, (targetByEmp.get(emp.id) ?? 0) + finite(t.amount));
    // A QUARTERLY target is NOT spread across its months — see `monthly` in the
    // result type. Only a monthly row lands in a monthly bucket, so the strip
    // never shows three monthly targets nobody set.
    if (!isQuarterly && canSee(emp.id)) {
      targetByMonth.set(m, (targetByMonth.get(m) ?? 0) + finite(t.amount));
    }
  }

  // ── Performance, ranks (company-wide), movement ──
  const previousMeaningful = period.previous !== null && prevTotal > 0;
  const nowCandidates: RankCandidate[] = [];
  const prevCandidates: RankCandidate[] = [];
  // Only people who EARNED something in a window are ranked in it. Ranking
  // everyone would tie every ₹0 at the bottom — and in a month nobody has
  // earned in yet, it would show the whole company as "#1".
  const rankScore = (pct: number | null, earned: number) => (pct !== null && earned > 0 ? pct : null);
  const base = input.employees.map((e) => {
    const pc = periodCtc(e.monthlyCtc, period.months, e.joinedMonth);
    const earned = round2(earnedNow.get(e.id) ?? 0);
    const pct = pc ? pctOfCtc(earned, pc.ctc) : null;
    nowCandidates.push({ key: e.id, score: rankScore(pct, earned), earned, name: e.name });
    if (period.previous) {
      const ppc = periodCtc(e.monthlyCtc, period.previous.months, e.joinedMonth);
      const pe = round2(earnedPrev.get(e.id) ?? 0);
      prevCandidates.push({ key: e.id, score: rankScore(ppc ? pctOfCtc(pe, ppc.ctc) : null, pe), earned: pe, name: e.name });
    }
    return { e, pc, earned, pct };
  });
  const ranks = competitionRanks(nowCandidates);
  const prevRanks = previousMeaningful ? competitionRanks(prevCandidates) : new Map<string, number>();

  const all: EmployeePerformance[] = base.map(({ e, pc, earned, pct }) => {
    const isSelf = e.id === input.viewer.id;
    const hasCtc = typeof e.monthlyCtc === "number" && Number.isFinite(e.monthlyCtc) && e.monthlyCtc > 0;
    let ctcState: CtcState = !hasCtc ? "missing" : pc ? "ok" : "not_employed";
    // Narrowing a company-wide view to one employee keeps the CTC that viewer
    // was already entitled to — see `ctcUnrestricted` on AnalyticsScope.
    if (ctcState === "ok" && !scope.all && !scope.ctcUnrestricted && !isSelf) ctcState = "restricted";
    const rank = ranks.get(e.id) ?? null;
    const previousRank = prevRanks.get(e.id) ?? null;
    const target = targetByEmp.has(e.id) ? round2(targetByEmp.get(e.id)!) : null;
    return {
      employeeId: e.id,
      name: e.name,
      code: e.code,
      isSelf,
      ctc: ctcState === "ok" && pc ? pc.ctc : null,
      ctcState,
      earned,
      pctOfCtc: pct,
      grade: gradeFor(pct),
      rank,
      previousRank: previousMeaningful ? previousRank : null,
      movement: rankMovement(rank, previousRank, previousMeaningful),
      target,
      difference: target === null ? null : round2(earned - target),
    };
  });

  const visible = all
    .filter((p) => canSee(p.employeeId))
    .sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        b.earned - a.earned ||
        a.name.localeCompare(b.name),
    );

  const grades: Record<IncentiveGrade | "none", number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  let earnedSum = 0;
  let targetSum = 0;
  let anyTarget = false;
  for (const p of visible) {
    grades[p.grade ?? "none"] += 1;
    earnedSum += p.earned;
    if (p.target !== null) {
      anyTarget = true;
      targetSum += p.target;
    }
  }

  // ── THE ROW THIS DASHBOARD IS ABOUT ──────────────────────────────────────
  //
  // The SUBJECT, not the reader. They are the same person until somebody opens
  // somebody else's dashboard, and at that point the KPI band's Grade and
  // % of CTC cards must follow the person whose name is in the title — not the
  // person looking at it. `isSelf` stays the READER's identity, because the CTC
  // restriction is computed from it.
  const subjectId = input.subjectId ?? input.viewer.id;
  const me = all.find((p) => p.employeeId === subjectId) ?? null;
  const viewerEligible = empById.has(input.viewer.id);

  return {
    period,
    // `canSeeTeam` defaults to FALSE, not true: a scope built without it (every
    // existing caller, and every test fixture) gets no switcher, which is the
    // safe direction to fail — an unusable control is worse than none.
    scope: {
      all: scope.all,
      label: scope.label,
      view: scope.view ?? "team",
      canSeeTeam: scope.canSeeTeam ?? false,
      // The viewer's OWN id, and only ever their own — `viewerId` is set from
      // the signed-in identity when the scope is resolved and is never derived
      // from anything the browser sent. It exists so the "your performance"
      // block can link to that person's own breakup letter; every other row on
      // the dashboard stays keyed by name, as before.
      viewerId: scope.viewerId,
    },
    statuses,
    records,
    employees: visible,
    rankedCount: ranks.size,
    previousRanksAvailable: previousMeaningful,
    summary: {
      people: visible.length,
      earned: round2(earnedSum),
      target: anyTarget ? round2(targetSum) : null,
      grades,
    },
    // One entry per month in the period, ascending, so the strip's shape is the
    // period's shape. `targetByMonth` is consulted by month, and a month with no
    // target row reads null rather than zero.
    monthly: period.months.map((month) => ({
      month,
      earned: round2(earnedByMonth.get(month) ?? 0),
      target: targetByMonth.has(month) ? round2(targetByMonth.get(month)!) : null,
    })),
    me,
    targetWarning:
      viewerEligible && isMonthKey(input.currentMonth)
        ? targetWarningFor(input.viewer, input.targets, input.currentMonth)
        : null,
  };
}
