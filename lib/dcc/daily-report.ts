/**
 * THE 10 PM DCC REPORT — who gets which report, and what it looks like.
 *
 * Pure (no DB, no mailer) so the recipient rules and the table can be tested
 * without sending a single email. The cron route loads, this plans and renders,
 * the mailer sends.
 *
 * ── WHO GETS WHAT (account holder, 2026-09-15) ───────────────────────────
 *   · Every person with KPIs on the day gets their OWN report.
 *   · Anyone with people reporting to them (a Team Lead — Manan included) gets
 *     ONE report covering everyone BELOW them, however many levels down.
 *   · The report owner gets ONE report of ALL employees.
 * Team membership is read from `employees.manager_id`, the reporting line the
 * rest of the app already uses, so a change of manager changes the report the
 * next night with nothing to maintain here.
 *
 * ── THE FORMAT ───────────────────────────────────────────────────────────
 * A spreadsheet-style table in the email body — gridlines, a grey header row,
 * row numbers, and the status cell filled the way a Google Sheet's conditional
 * formatting would. In the body rather than attached, so it reads on a phone
 * without opening anything.
 *
 * ── UNDER GMAIL'S 102 KB CLIP ────────────────────────────────────────────
 * Gmail cuts any message body over ~102 KB and hides the rest behind "View
 * entire message". With a style attribute on every cell the all-employees
 * report for one ordinary July day came to 277 KB, so styling lives in one
 * <style> block keyed by short class names, and a report that would still
 * exceed the limit drops the rows that were Done (see buildDccReportHtml).
 */
import { scheduledDueOn } from "./util";
import { localDate, outcomeOf, pct, type SlotOutcome } from "./dashboard";

/* ── Inputs ─────────────────────────────────────────────────────────────── */

export interface ReportEmployee {
  id: string;
  name: string;
  managerId: string | null;
  /** The work address a report goes to, or null when none is on file. */
  address: string | null;
}

export interface ReportItem {
  id: string;
  ownerEmployeeId: string;
  section: string | null;
  code: string | null;
  title: string;
  frequency: string | null;
  weekdays: number | null;
  scheduleKind: string | null;
  isParticipantList: boolean | null;
  /** First day the KPI can be due — see DashboardItem.activeFrom. */
  activeFrom: string | null;
}

/** The day's entry for a simple (non-participant) KPI. */
export interface ReportEntry {
  itemId: string;
  status: string | null;
  valueNumber: string | null;
  note: string | null;
}

/* ── One person's sheet ─────────────────────────────────────────────────── */

export interface ReportRow {
  section: string;
  code: string | null;
  title: string;
  frequency: string;
  outcome: SlotOutcome;
  value: string | null;
  note: string | null;
  /** False for a weekly / adhoc KPI that was not due but was filled anyway. */
  due: boolean;
}

export interface PersonReport {
  employee: ReportEmployee;
  rows: ReportRow[];
  due: number;
  done: number;
  notDone: number;
  notFilled: number;
  compliance: number | null;
  filled: number | null;
}

export const OUTCOME_LABEL: Record<SlotOutcome, string> = {
  done: "Done",
  notDone: "Not done",
  na: "NA",
  pending: "Pending",
  noted: "Filled",
  unfilled: "Not filled",
};

/**
 * Every person's rows for `day`, in their KPI order.
 *
 * A row is a KPI DUE that day (the dashboard's rule), plus any other KPI that
 * has an entry that day — a weekly KPI ticked on a Tuesday belongs in Tuesday's
 * report even though it never makes the day "due". People with no rows are
 * left out: nobody wants a nightly email that says nothing.
 */
export function buildPersonReports(
  employees: ReportEmployee[],
  items: ReportItem[],
  entries: ReportEntry[],
  day: string,
): PersonReport[] {
  const d = localDate(day);
  const entryByItem = new Map(entries.map((e) => [e.itemId, e]));
  const itemsByOwner = new Map<string, ReportItem[]>();
  for (const it of items) {
    const list = itemsByOwner.get(it.ownerEmployeeId);
    if (list) list.push(it);
    else itemsByOwner.set(it.ownerEmployeeId, [it]);
  }

  const out: PersonReport[] = [];
  for (const employee of employees) {
    const rows: ReportRow[] = [];
    for (const it of itemsByOwner.get(employee.id) ?? []) {
      const started = !it.activeFrom || day >= it.activeFrom;
      const due = started && scheduledDueOn(it, d);
      const entry = entryByItem.get(it.id);
      const outcome = outcomeOf(entry ? { ...entry, entryDate: day, subjectId: null } : undefined);
      if (!due && outcome === "unfilled") continue;
      rows.push({
        section: (it.section ?? "").trim() || "—",
        code: it.code,
        title: it.title,
        frequency: (it.frequency ?? "").trim() || "—",
        outcome,
        value: entry?.valueNumber ?? null,
        note: entry?.note?.trim() || null,
        due,
      });
    }
    if (rows.length === 0) continue;

    const dueRows = rows.filter((r) => r.due);
    const done = dueRows.filter((r) => r.outcome === "done").length;
    const notFilled = dueRows.filter((r) => r.outcome === "unfilled").length;
    out.push({
      employee,
      rows,
      due: dueRows.length,
      done,
      notDone: dueRows.filter((r) => r.outcome === "notDone").length,
      notFilled,
      compliance: pct(done, dueRows.length),
      filled: pct(dueRows.length - notFilled, dueRows.length),
    });
  }
  return out;
}

/* ── Who gets which email ───────────────────────────────────────────────── */

/**
 * Everyone below `rootId` in the reporting line, any depth, root excluded.
 * Cycle-safe: a manager_id loop in the data ends the walk instead of hanging it.
 */
export function downlineOf(employees: ReportEmployee[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const e of employees) {
    if (!e.managerId) continue;
    const list = children.get(e.managerId);
    if (list) list.push(e.id);
    else children.set(e.managerId, [e.id]);
  }
  const seen = new Set<string>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === rootId || seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return seen;
}

export type ReportKind = "self" | "team" | "all";

export interface PlannedEmail {
  kind: ReportKind;
  recipientName: string;
  /** Null when the recipient has no address on file — the cron skips and reports it. */
  to: string | null;
  subject: string;
  title: string;
  people: PersonReport[];
}

export function planDccDailyEmails(args: {
  employees: ReportEmployee[];
  reports: PersonReport[];
  day: string;
  owner: { name: string; email: string };
}): PlannedEmail[] {
  const { employees, reports, day, owner } = args;
  const label = reportDateLabel(day);
  const plan: PlannedEmail[] = [];

  for (const r of reports) {
    plan.push({
      kind: "self",
      recipientName: r.employee.name,
      to: r.employee.address,
      subject: `DCC Report — ${r.employee.name} — ${label} — ${fmtPct(r.compliance)}`,
      title: `${r.employee.name} · Daily Compliance`,
      people: [r],
    });
  }

  const hasReports = new Set(employees.map((e) => e.managerId).filter((id): id is string => Boolean(id)));
  for (const lead of employees) {
    if (!hasReports.has(lead.id)) continue;
    const below = downlineOf(employees, lead.id);
    const people = reports.filter((r) => below.has(r.employee.id));
    if (people.length === 0) continue;
    plan.push({
      kind: "team",
      recipientName: lead.name,
      to: lead.address,
      subject: `DCC Team Report — ${lead.name.split(" ")[0]}'s team — ${label}`,
      title: `${lead.name}'s Team · Daily Compliance`,
      people,
    });
  }

  if (reports.length > 0) {
    plan.push({
      kind: "all",
      recipientName: owner.name,
      to: owner.email,
      subject: `DCC Report — All Employees — ${label}`,
      title: "All Employees · Daily Compliance",
      people: reports,
    });
  }
  return plan;
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

export function reportDateLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtPct(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Gmail clips a body over ~102 KB. Stay under it with room for the BCC headers. */
export const GMAIL_CLIP_BYTES = 100_000;

const BRAND = "#E10600";

/**
 * The whole stylesheet. Status cells use the pastel conditional-formatting
 * palette of a Google Sheet; `n` is the row-number gutter down the left edge.
 */
const STYLE = `<style>
.dr{font-family:Arial,Helvetica,sans-serif;color:#202124;max-width:900px;margin:0 auto}
.g{border-collapse:collapse;width:100%}
.g th,.g td{border:1px solid #dadce0;padding:5px 8px;font-size:12.5px;vertical-align:top;text-align:left}
.g th{background:#f1f3f4;font-size:12px;white-space:nowrap}
.g .n{background:#f1f3f4;color:#5f6368;font-size:11px;text-align:center;width:28px}
.g .r{text-align:right}.g .w{white-space:nowrap}.g .m{color:#80868b}.g .b{font-weight:bold}
.g .c{text-align:center;font-weight:bold;white-space:nowrap}
.sd{background:#d9ead3;color:#274e13}.sx{background:#f4cccc;color:#990000}.sp{background:#fff2cc;color:#7f6000}
.sn{background:#efefef;color:#434343}.sf{background:#cfe2f3;color:#0b5394}.su{background:#fce8e6;color:#c5221f}
.bar{margin:22px 0 6px;padding:7px 10px;background:#202124;color:#ffffff;font-weight:bold;font-size:13px}
.sum{margin:6px 0 8px;font-size:12.5px;color:#5f6368}.sum span{margin-right:14px;white-space:nowrap}
.sum b{color:#202124}.sum .gd{color:#274e13}.sum .bd{color:#c5221f}
.note{margin:8px 0 0;font-size:12px;color:#5f6368}
</style>`;

const OUTCOME_CLASS: Record<SlotOutcome, string> = {
  done: "sd",
  notDone: "sx",
  pending: "sp",
  na: "sn",
  noted: "sf",
  unfilled: "su",
};

/** Green ≥80, amber ≥60, red below — the fill board's thresholds. */
function rateClass(p: number | null): string {
  if (p == null) return "m";
  if (p >= 80) return "sd";
  if (p >= 60) return "sp";
  return "sx";
}

interface Totals {
  due: number;
  done: number;
  notDone: number;
  notFilled: number;
  compliance: number | null;
  filled: number | null;
}

function summaryLine(t: Totals, extra = ""): string {
  const item = (label: string, value: string, cls = "") => `<span>${label} <b${cls ? ` class="${cls}"` : ""}>${value}</b></span>`;
  const complianceCls = t.compliance == null ? "" : t.compliance >= 80 ? "gd" : t.compliance >= 60 ? "" : "bd";
  return `<div class="sum">${item("Due", String(t.due))}${item("Done", String(t.done), "gd")}${item(
    "Not done",
    String(t.notDone),
    t.notDone ? "bd" : "",
  )}${item("Not filled", String(t.notFilled), t.notFilled ? "bd" : "")}${item("Filled", fmtPct(t.filled))}${item(
    "Compliance",
    fmtPct(t.compliance),
    complianceCls,
  )}${extra}</div>`;
}

function personSheet(r: PersonReport, opts: { nameBar: boolean; hideDone: boolean }): string {
  const shown = opts.hideDone ? r.rows.filter((row) => row.outcome !== "done") : r.rows;
  const hidden = r.rows.length - shown.length;
  const rows = shown
    .map((row, i) => {
      const code = row.code ? `<span class="m">${escapeHtml(row.code)}</span> ` : "";
      const notDue = row.due ? "" : ` <span class="m">(not due today)</span>`;
      return `<tr><td class="n">${i + 1}</td><td>${escapeHtml(row.section)}</td><td>${code}${escapeHtml(row.title)}${notDue}</td><td class="w">${escapeHtml(
        row.frequency,
      )}</td><td class="c ${OUTCOME_CLASS[row.outcome]}">${OUTCOME_LABEL[row.outcome]}</td><td class="r">${row.value ? escapeHtml(row.value) : ""}</td><td>${
        row.note ? escapeHtml(row.note) : ""
      }</td></tr>`;
    })
    .join("");

  const bar = opts.nameBar ? `<div class="bar">${escapeHtml(r.employee.name)}</div>` : "";
  const table =
    shown.length > 0
      ? `<table class="g" cellpadding="0" cellspacing="0"><thead><tr><th class="n"></th><th>Section</th><th>KPI</th><th>Frequency</th><th class="c">Status</th><th class="r">Value</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`
      : "";
  const hiddenNote = hidden > 0 ? `<p class="note">${hidden} KPI${hidden === 1 ? "" : "s"} marked Done not listed.</p>` : "";
  return `${bar}${summaryLine(r)}${table}${hiddenNote}`;
}

function peopleSummary(people: PersonReport[]): string {
  const sorted = [...people].sort(
    (a, b) => (a.compliance ?? 101) - (b.compliance ?? 101) || a.employee.name.localeCompare(b.employee.name),
  );
  const rows = sorted
    .map(
      (r, i) =>
        `<tr><td class="n">${i + 1}</td><td class="b w">${escapeHtml(r.employee.name)}</td><td class="r">${r.due}</td><td class="r">${r.done}</td><td class="r${
          r.notDone ? " b" : " m"
        }">${r.notDone}</td><td class="r${r.notFilled ? " b" : " m"}">${r.notFilled}</td><td class="r">${fmtPct(r.filled)}</td><td class="c ${rateClass(
          r.compliance,
        )}">${fmtPct(r.compliance)}</td></tr>`,
    )
    .join("");
  return `<table class="g" cellpadding="0" cellspacing="0"><thead><tr><th class="n"></th><th>Person</th><th class="r">Due</th><th class="r">Done</th><th class="r">Not done</th><th class="r">Not filled</th><th class="r">Filled</th><th class="c">Compliance</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * How much of a report goes in the body.
 *   full      — every row of every person's sheet.
 *   problems  — the sheets without their Done rows.
 *   summary   — the per-person totals table only (team and all-employee reports).
 */
type RenderMode = "full" | "problems" | "summary";

function renderReport(
  email: PlannedEmail,
  day: string,
  opts: { siteUrl?: string | null; previewFor?: string | null },
  mode: RenderMode,
): string {
  const hideDone = mode !== "full";
  const { people } = email;
  const sum = people.reduce(
    (acc, r) => {
      acc.due += r.due;
      acc.done += r.done;
      acc.notDone += r.notDone;
      acc.notFilled += r.notFilled;
      return acc;
    },
    { due: 0, done: 0, notDone: 0, notFilled: 0 },
  );
  const totals: Totals = { ...sum, compliance: pct(sum.done, sum.due), filled: pct(sum.due - sum.notFilled, sum.due) };

  const preview = opts.previewFor
    ? `<div style="margin:0 0 14px;padding:10px 12px;border:1px dashed #b45309;background:#fffbeb;font-size:12.5px;color:#92400e"><b>Preview.</b> In live mode this email goes to <b>${escapeHtml(
        opts.previewFor,
      )}</b>.</div>`
    : "";

  const trimmed =
    mode === "summary"
      ? `<p class="note">This report is too long for email, so only each person's totals are shown. Open the DCC Dashboard for every KPI.</p>`
      : mode === "problems"
        ? `<p class="note">This report is long, so KPIs marked Done are left out of the per-person sheets. The dashboard has the full list.</p>`
        : "";

  const body =
    email.kind === "self"
      ? personSheet(people[0]!, { nameBar: false, hideDone })
      : `${summaryLine(totals, `<span>· ${people.length} ${people.length === 1 ? "person" : "people"}</span>`)}${peopleSummary(people)}${trimmed}${
          mode === "summary" ? "" : people.map((r) => personSheet(r, { nameBar: true, hideDone })).join("")
        }`;

  const href = opts.siteUrl ? `${escapeHtml(opts.siteUrl)}/${email.kind === "self" ? "dcc" : "dcc/dashboard"}` : null;
  const cta = href
    ? `<p style="margin:22px 0 0"><a href="${href}" style="background:${BRAND};color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:bold;font-size:13px">${
        email.kind === "self" ? "Open my DCC" : "Open DCC Dashboard"
      }</a></p>`
    : "";

  return `${STYLE}<div class="dr">${preview}<div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:12px"><div style="font-weight:bold;font-size:12px;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Altus Corp · DCC</div><h1 style="margin:6px 0 2px;font-size:21px">${escapeHtml(
    email.title,
  )}</h1><div style="color:#5f6368;font-size:14px">${escapeHtml(reportDateLabel(day))}</div></div>${body}${cta}<p style="margin-top:22px;color:#9aa0a6;font-size:11px">Automated nightly report from the Altus Corp Dashboard. Due means a scheduled KPI for this day; compliance is done ÷ due.</p></div>`;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/**
 * The email body, sized to arrive whole.
 *
 * Renders every row. If that would pass Gmail's clip limit it renders again
 * without the Done rows — the ones a reader skims past anyway — so the Not done
 * and Not filled rows are never the part hidden behind a click. If a team or
 * all-employee report is STILL too long, it sends the per-person totals table
 * alone and points at the dashboard: a complete summary beats a clipped sheet.
 */
export function buildDccReportHtml(
  email: PlannedEmail,
  day: string,
  opts: { siteUrl?: string | null; previewFor?: string | null } = {},
): string {
  const full = renderReport(email, day, opts, "full");
  if (byteLength(full) <= GMAIL_CLIP_BYTES) return full;
  const problems = renderReport(email, day, opts, "problems");
  if (email.kind === "self" || byteLength(problems) <= GMAIL_CLIP_BYTES) return problems;
  return renderReport(email, day, opts, "summary");
}
