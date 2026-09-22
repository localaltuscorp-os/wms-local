/**
 * WCC / MCC REMINDERS — who is emailed, and what the email says.
 *
 * PURE (no DB, no mailer), so every rule below is unit-tested without sending
 * anything. The cron route (app/api/cron/compliance-reminders) loads, this
 * plans and renders, the mailer sends.
 *
 * ── 10:01 PM, EVERY NIGHT (account holder, 2026-09-18) ───────────────────
 * Anybody who has not updated a WCC or MCC compliance due TODAY gets an email
 * listing what is left, and their Team Lead — their manager — gets one listing
 * each of their people who has not. One email per recipient, not per miss.
 * "Updated" means a Doer Status has been picked; a note alone is not an update.
 *
 * ── 10:02 PM, WEDNESDAY AND SATURDAY ─────────────────────────────────────
 * Manan Sir gets who did not fill in the last 3 days, and the grids:
 *   WCC — this week, Mon to Sun across, people down, team-wise
 *   MCC — this month, 1 to 31 across, people down, team-wise
 * A cell reads ✓ (all filled), ✗ n (n not filled), or NA when that person had
 * no compliance that day. The last 3 days are shaded.
 */

import { formatDeadline, shortDay, weekdayShort } from "./schedule";
import type { TeamGroup } from "./team";

export interface ReminderPerson {
  id: string;
  name: string;
  managerId: string | null;
  address: string | null;
}

/** One compliance due on a day, and whether its doer has filled it. */
export interface DueCompliance {
  ownerId: string;
  kind: "wcc" | "mcc";
  title: string;
  deadline: string;
  filled: boolean;
}

export interface PlannedEmail {
  kind: "self" | "lead" | "founder";
  recipientId: string;
  recipientName: string;
  to: string | null;
  subject: string;
  html: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLE = `<style>
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:13px}
h2{font-size:16px;margin:0 0 6px}
p{margin:0 0 10px;line-height:1.5}
table{border-collapse:collapse;margin:0 0 16px}
th,td{border:1px solid #cbd5e1;padding:4px 7px;text-align:left;font-size:12px}
th{background:#f1f5f9;font-weight:bold}
.g td{background:#fee2e2;color:#991b1b;font-weight:bold}
.c{text-align:center;white-space:nowrap}
.ok{background:#d1fae5;color:#065f46;font-weight:bold}
.no{background:#fee2e2;color:#991b1b;font-weight:bold}
.na{background:#f8fafc;color:#94a3b8}
.fu{background:#ffffff;color:#cbd5e1}
.h3{background:#fef3c7}
.pv{background:#fef3c7;border:1px solid #fcd34d;padding:8px 10px;margin:0 0 12px}
</style>`;

function page(body: string, previewFor: string | null): string {
  const banner = previewFor
    ? `<div class="pv"><b>Preview.</b> This email would go to ${esc(previewFor)}. It comes to you until the reminders are switched on (COMPLIANCE_REMINDERS_LIVE=true).</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8">${STYLE}</head><body>${banner}${body}</body></html>`;
}

const kindName = (k: "wcc" | "mcc") => (k === "wcc" ? "WCC" : "MCC");

function listTable(rows: DueCompliance[], withName?: (id: string) => string): string {
  const head = `<tr>${withName ? "<th>Employee</th>" : ""}<th>Checklist</th><th>Compliance</th><th>Deadline</th></tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr>${withName ? `<td>${esc(withName(r.ownerId))}</td>` : ""}<td>${kindName(r.kind)}</td><td>${esc(r.title)}</td><td class="c">${formatDeadline(r.deadline)}</td></tr>`,
    )
    .join("");
  return `<table>${head}${body}</table>`;
}

/**
 * The 10:01 pm emails: one to each person with something unfilled today, and
 * one to each Team Lead listing their people who have.
 */
export function planDailyReminders(args: {
  people: readonly ReminderPerson[];
  due: readonly DueCompliance[];
  day: string;
  siteUrl: string | null;
  previewTo?: (recipientName: string, to: string | null) => string | null;
}): PlannedEmail[] {
  const byId = new Map(args.people.map((p) => [p.id, p]));
  const missing = args.due.filter((d) => !d.filled && d.deadline === args.day);
  const byOwner = new Map<string, DueCompliance[]>();
  for (const d of missing) {
    if (!byId.has(d.ownerId)) continue;
    const list = byOwner.get(d.ownerId);
    if (list) list.push(d);
    else byOwner.set(d.ownerId, [d]);
  }
  const link = (path: string) => (args.siteUrl ? `<p><a href="${args.siteUrl}${path}">Open it</a></p>` : "");
  const dayLabel = shortDay(args.day);
  const out: PlannedEmail[] = [];

  const owners = [...byOwner.keys()].sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name));
  for (const id of owners) {
    const p = byId.get(id)!;
    const rows = byOwner.get(id)!;
    const subject = `Not updated: ${rows.length} WCC/MCC compliance${rows.length === 1 ? "" : "s"} due today (${dayLabel})`;
    const body =
      `<h2>Your compliance checklist is not updated</h2>` +
      `<p>Hi ${esc(p.name.split(" ")[0] ?? p.name)}, it is past 10 pm and ${rows.length === 1 ? "this compliance" : `these ${rows.length} compliances`} due today ${rows.length === 1 ? "has" : "have"} no Doer Status yet. Your Team Lead has been told too.</p>` +
      listTable(rows) +
      link(rows.some((r) => r.kind === "wcc") ? "/dcc/wcc" : "/dcc/mcc");
    out.push({
      kind: "self",
      recipientId: id,
      recipientName: p.name,
      to: p.address,
      subject,
      html: page(body, args.previewTo?.(p.name, p.address) ?? null),
    });
  }

  const byLead = new Map<string, string[]>();
  for (const id of owners) {
    const lead = byId.get(id)!.managerId;
    if (!lead || lead === id || !byId.has(lead)) continue;
    const list = byLead.get(lead);
    if (list) list.push(id);
    else byLead.set(lead, [id]);
  }
  for (const [leadId, members] of [...byLead.entries()].sort((a, b) => byId.get(a[0])!.name.localeCompare(byId.get(b[0])!.name))) {
    const lead = byId.get(leadId)!;
    const rows = members.flatMap((m) => byOwner.get(m)!);
    const names = members.map((m) => byId.get(m)!.name);
    const subject = `Your team: ${members.length} ${members.length === 1 ? "person has" : "people have"} not updated WCC/MCC today (${dayLabel})`;
    const body =
      `<h2>Your team's compliance checklist is not updated</h2>` +
      `<p>Hi ${esc(lead.name.split(" ")[0] ?? lead.name)}, at 10 pm ${esc(names.join(", "))} had not updated ${rows.length === 1 ? "this compliance" : `these ${rows.length} compliances`} due today.</p>` +
      listTable(rows, (id) => byId.get(id)?.name ?? "—") +
      link("/dcc/wcc?who=team");
    out.push({
      kind: "lead",
      recipientId: leadId,
      recipientName: lead.name,
      to: lead.address,
      subject,
      html: page(body, args.previewTo?.(lead.name, lead.address) ?? null),
    });
  }
  return out;
}

/* ── Manan Sir's grid ──────────────────────────────────────────────────── */

export type GridCell = { kind: "na" } | { kind: "future" } | { kind: "ok"; due: number } | { kind: "no"; missing: number; due: number };

/** One person × one day: NA when nothing was due, else filled or not. */
export function gridCell(due: readonly DueCompliance[], day: string, today: string): GridCell {
  if (due.length === 0) return { kind: "na" };
  if (day > today) return { kind: "future" };
  const missing = due.filter((d) => !d.filled).length;
  return missing === 0 ? { kind: "ok", due: due.length } : { kind: "no", missing, due: due.length };
}

function cellHtml(c: GridCell, shaded: boolean): string {
  const sh = shaded ? " h3" : "";
  if (c.kind === "na") return `<td class="c na${sh}">NA</td>`;
  if (c.kind === "future") return `<td class="c fu">·</td>`;
  if (c.kind === "ok") return `<td class="c ok">✓</td>`;
  return `<td class="c no" title="${c.missing} of ${c.due} not filled">✗ ${c.missing}</td>`;
}

function grid(args: {
  title: string;
  dates: string[];
  headOf: (d: string) => string;
  groups: readonly TeamGroup[];
  nameOf: (id: string) => string;
  dueOn: (ownerId: string, day: string) => DueCompliance[];
  today: string;
  last3: ReadonlySet<string>;
}): string {
  const head = `<tr><th>Employee</th>${args.dates
    .map((d) => `<th class="c${args.last3.has(d) ? " h3" : ""}">${args.headOf(d)}</th>`)
    .join("")}</tr>`;
  const body = args.groups
    .map((g) => {
      const rows = g.memberIds
        .map(
          (id) =>
            `<tr><td>${esc(args.nameOf(id))}</td>${args.dates
              .map((d) => cellHtml(gridCell(args.dueOn(id, d), d, args.today), args.last3.has(d)))
              .join("")}</tr>`,
        )
        .join("");
      return `<tr class="g"><td colspan="${args.dates.length + 1}">${esc(g.label)}</td></tr>${rows}`;
    })
    .join("");
  return `<h2>${esc(args.title)}</h2><table>${head}${body}</table>`;
}

/**
 * Manan Sir's Wednesday / Saturday email: who missed in the last 3 days, then
 * the WCC week grid and the MCC month grid, team-wise.
 */
export function buildFounderEmail(args: {
  founder: ReminderPerson;
  groups: readonly TeamGroup[];
  names: ReadonlyMap<string, string>;
  due: readonly DueCompliance[];
  today: string;
  /** Mon … Sun of this week. */
  weekDates: string[];
  /** 1st … last of this month. */
  monthDates: string[];
  /** The three days this email answers for, oldest first. */
  last3: string[];
  previewFor: string | null;
}): PlannedEmail {
  const nameOf = (id: string) => args.names.get(id) ?? "—";
  const index = new Map<string, DueCompliance[]>();
  for (const d of args.due) {
    const k = `${d.kind}|${d.ownerId}|${d.deadline}`;
    const list = index.get(k);
    if (list) list.push(d);
    else index.set(k, [d]);
  }
  const dueOf = (kind: "wcc" | "mcc") => (ownerId: string, day: string) => index.get(`${kind}|${ownerId}|${day}`) ?? [];
  const last3 = new Set(args.last3);

  /* Who missed, in the last 3 days, team-wise — the question the email is for. */
  const missLines: string[] = [];
  for (const g of args.groups) {
    for (const id of g.memberIds) {
      const parts: string[] = [];
      for (const day of args.last3) {
        const w = dueOf("wcc")(id, day).filter((d) => !d.filled).length;
        const m = dueOf("mcc")(id, day).filter((d) => !d.filled).length;
        if (w || m) {
          parts.push(`${shortDay(day)} (${[w ? `${w} WCC` : "", m ? `${m} MCC` : ""].filter(Boolean).join(", ")})`);
        }
      }
      if (parts.length) missLines.push(`<tr><td>${esc(g.label)}</td><td>${esc(nameOf(id))}</td><td>${esc(parts.join(" · "))}</td></tr>`);
    }
  }
  const range = `${shortDay(args.last3[0]!)} – ${shortDay(args.last3[args.last3.length - 1]!)}`;
  const summary = missLines.length
    ? `<h2>Not filled, ${esc(range)}</h2><table><tr><th>Team</th><th>Employee</th><th>Days not filled</th></tr>${missLines.join("")}</table>`
    : `<h2>Everybody filled WCC and MCC, ${esc(range)}</h2>`;

  const wcc = grid({
    title: `WCC — this week (${shortDay(args.weekDates[0]!)} – ${shortDay(args.weekDates[args.weekDates.length - 1]!)})`,
    dates: args.weekDates,
    headOf: (d) => `${weekdayShort(d)}<br>${+d.slice(8, 10)}`,
    groups: args.groups,
    nameOf,
    dueOn: dueOf("wcc"),
    today: args.today,
    last3,
  });
  const mcc = grid({
    title: `MCC — ${formatDeadline(args.monthDates[0]!).slice(3)}`,
    dates: args.monthDates,
    headOf: (d) => String(+d.slice(8, 10)),
    groups: args.groups,
    nameOf,
    dueOn: dueOf("mcc"),
    today: args.today,
    last3,
  });

  const key = `<p>✓ all filled · ✗ n = n not filled · NA = no compliance that day · shaded = the last 3 days.</p>`;
  return {
    kind: "founder",
    recipientId: args.founder.id,
    recipientName: args.founder.name,
    to: args.founder.address,
    subject: `WCC & MCC — ${missLines.length ? `${missLines.length} ${missLines.length === 1 ? "person" : "people"} did not fill` : "all filled"}, ${range}`,
    html: page(summary + key + wcc + mcc, args.previewFor),
  };
}
