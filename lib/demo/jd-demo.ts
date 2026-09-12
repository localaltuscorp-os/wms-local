/**
 * JOB DESCRIPTION - the demo dataset and its in-memory writes.
 *
 * Used only while migration 0222 is unapplied; see lib/demo/store.ts for why
 * that window exists and why it is safe.
 *
 * The dataset is built to show the thing the module is ABOUT, not just to fill
 * a table: there are deliberately VACANT seats (Sales Executive, Apps Sr.
 * Executive) carrying live job descriptions, because a JD Bank where every seat
 * happens to be filled demonstrates none of the escalation the module exists
 * for.
 */
import type { JdEntryRow, JdPositionRow, JdRankRow } from "@/lib/queries/job-description";
import { RANK_LADDER } from "@/lib/jd/ladder";
import { readRecurrence, type Recurrence } from "@/lib/jd/recurrence";
import {
  EMPTY_TARGET_PEOPLE,
  JD_TARGETS,
  type TargetPeople,
} from "@/lib/jd/assignment-targets";
import type { BusinessFunction } from "@/lib/org/functions";
import { demoId, demoStore, shiftYmd, todayIst } from "@/lib/demo/store";

/** A seat, plus who is sitting in it - the join table, not a column. */
export interface DemoHolder {
  positionId: string;
  employeeId: string;
  name: string;
}

interface Data {
  ranks: JdRankRow[];
  positions: JdPositionRow[];
  entries: JdEntryRow[];
  people: { id: string; name: string }[];
  holders: DemoHolder[];
}

const PEOPLE = [
  "Rakesh Mehta",
  "Vinal Patil",
  "Manan Vasa",
  "Sneha Kulkarni",
  "Rohan Choudhary",
  "Aarti Deshpande",
  "Om Trivedi",
  "Rudra Shah",
  "Priya Nair",
  "Kunal Joshi",
  "Ishaan Bhatt",
  "Meera Rane",
];

const pid = (name: string) => `demo-emp-${PEOPLE.indexOf(name)}`;
const rankId = (name: string) => `demo-rank-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

/** Position ids are readable so the ladder is legible in the dropdown. */
const posId = (fn: string, rank: string) =>
  `demo-pos-${fn}-${rank.toLowerCase().replace(/[^a-z]+/g, "-")}`;

const FUNCTION_LABEL: Record<string, string> = {
  sales: "Sales",
  marketing: "Marketing",
  operations: "Operations",
  handholding: "Handholding",
  hr: "HR",
  admin: "Admin",
  accounts: "Accounts",
  apps: "Apps",
};

let seq = 0;

function seed(): Data {
  const ranks: JdRankRow[] = RANK_LADDER.map((r) => ({
    id: rankId(r.name),
    name: r.name,
    rankOrder: r.order,
    band: r.band,
  }));

  /* [function, rank, who sits there] - an empty array is a VACANT seat, and
     two of them are vacant on purpose. */
  const seats: [BusinessFunction, string, string[]][] = [
    /* These three were SALES until 2026-09-12. Sales is still a real function
       of the firm — employees and the org chart use it — but it is not one of
       the seven a job description can be filed under, and a demo showing a
       function the picker does not offer teaches the wrong thing. */
    ["marketing", "Sr. Executive", ["Kunal Joshi"]],
    ["marketing", "Manager", ["Rakesh Mehta"]],
    ["marketing", "Executive", ["Meera Rane"]],
    ["marketing", "Assistant Manager", ["Aarti Deshpande"]],
    ["operations", "Executive", ["Om Trivedi", "Ishaan Bhatt"]],
    ["operations", "Deputy Manager", ["Rohan Choudhary"]],
    ["hr", "Executive", ["Priya Nair"]],
    ["hr", "Manager", ["Sneha Kulkarni"]],
    ["accounts", "Sr. Executive", ["Sneha Kulkarni"]],
    ["apps", "Sr. Executive", []],
    ["apps", "Assistant Manager", ["Vinal Patil"]],
    ["apps", "Manager", ["Manan Vasa"]],
    ["handholding", "Executive", ["Rudra Shah"]],
  ];

  const holders: DemoHolder[] = [];
  const positions: JdPositionRow[] = seats.map(([fn, rank, who]) => {
    const id = posId(fn, rank);
    who.forEach((name) => holders.push({ positionId: id, employeeId: pid(name), name }));
    return {
      id,
      functionKey: fn,
      rankId: rankId(rank),
      rankName: rank,
      rankOrder: RANK_LADDER.find((r) => r.name === rank)?.order ?? 0,
      variant: null,
      title: `${FUNCTION_LABEL[fn]} - ${rank}`,
      holderCount: who.length,
    };
  });

  const daily: Recurrence = { kind: "daily" };
  const sat: Recurrence = { kind: "weekdays", days: [5] };
  const mwf: Recurrence = { kind: "weekdays", days: [0, 2, 4] };
  const mon: Recurrence = { kind: "weekdays", days: [0] };
  const d15: Recurrence = { kind: "interval", everyDays: 15, anchor: todayIst() };
  const d30: Recurrence = { kind: "interval", everyDays: 30, anchor: todayIst() };
  const sat2: Recurrence = { kind: "monthly_ordinal", ordinal: 2, weekday: 5 };
  const mon1: Recurrence = { kind: "monthly_ordinal", ordinal: 1, weekday: 0 };
  const yearly: Recurrence = { kind: "yearly", month: 4, day: 1 };
  const once: Recurrence = { kind: "once", date: shiftYmd(todayIst(), 45) };

  /* [function, rank, task, recurrence, minutes, targets, assignees] */
  const raw: [
    BusinessFunction,
    string,
    string,
    Recurrence,
    number,
    { dcc?: boolean; wms?: boolean; event?: boolean },
    string[],
  ][] = [
    ["marketing", "Sr. Executive", "Reconcile the pipeline against the CRM", sat, 60, { wms: true }, ["Kunal Joshi"]],
    ["marketing", "Sr. Executive", "Visit two existing clients", d15, 180, { wms: true }, []],
    ["marketing", "Manager", "Review the funnel with each executive", mon, 90, { dcc: true }, ["Rakesh Mehta"]],
    /* A one-off and an annual, so the two frequencies added on 2026-09-12 are
       visible in the Bank rather than only reachable through the form. */
    ["marketing", "Manager", "Sign off the year's marketing budget", yearly, 120, {}, ["Rakesh Mehta"]],
    ["admin", "Executive", "Renew the office fire-safety certificate", once, 90, { wms: true }, []],

    ["marketing", "Executive", "Schedule the week's social posts", mon, 60, { dcc: true }, ["Meera Rane"]],
    ["marketing", "Executive", "Reply to every comment and DM", daily, 20, { dcc: true }, ["Meera Rane"]],
    ["marketing", "Assistant Manager", "Report reach and engagement to the founder", sat2, 75, { wms: true }, ["Aarti Deshpande"]],

    ["operations", "Executive", "Open the shop floor and log attendance", daily, 10, { dcc: true }, ["Om Trivedi"]],
    ["operations", "Executive", "Dispatch check against the day's orders", daily, 40, { dcc: true, wms: true }, ["Om Trivedi", "Ishaan Bhatt"]],
    ["operations", "Executive", "Stock count of fast-moving items", mwf, 50, { wms: true }, ["Ishaan Bhatt"]],
    ["operations", "Deputy Manager", "Chair the event checklist review", mon, 45, { wms: true, event: true }, ["Rohan Choudhary"]],
    ["operations", "Deputy Manager", "Vendor payment sheet to Accounts", d15, 40, { wms: true }, ["Rohan Choudhary"]],

    ["hr", "Executive", "Mark and correct yesterday's attendance", daily, 30, { dcc: true }, ["Priya Nair"]],
    ["hr", "Executive", "Screen new applications and shortlist", mwf, 60, { wms: true }, ["Priya Nair"]],
    ["hr", "Manager", "One-to-one with two team members", mon, 60, { wms: true }, ["Sneha Kulkarni"]],
    ["hr", "Manager", "Payroll input cut-off and verification", d30, 120, { wms: true }, ["Sneha Kulkarni"]],

    ["accounts", "Sr. Executive", "Bank reconciliation", daily, 45, { dcc: true }, ["Sneha Kulkarni"]],
    ["accounts", "Sr. Executive", "GST working and challan check", sat2, 150, { wms: true }, ["Sneha Kulkarni"]],

    ["apps", "Sr. Executive", "Triage the error inbox", daily, 30, { dcc: true }, []],
    ["apps", "Sr. Executive", "Release notes for whatever shipped", sat, 30, { wms: true }, []],
    ["apps", "Assistant Manager", "Review every open pull request", daily, 60, { dcc: true, wms: true }, ["Vinal Patil"]],
    ["apps", "Manager", "Sprint planning and estimate review", mon, 90, { wms: true }, ["Manan Vasa"]],
    ["apps", "Manager", "Backup and restore drill", d30, 120, { wms: true }, ["Manan Vasa"]],

    ["handholding", "Executive", "Call every client onboarded this week", mwf, 90, { dcc: true, wms: true }, ["Rudra Shah"]],
    ["handholding", "Executive", "Log every support call in the tracker", daily, 25, { dcc: true }, ["Rudra Shah"]],
  ];

  const counters: Record<string, number> = {};
  const entries: JdEntryRow[] = raw.map(([fn, rank, task, recurrence, minutes, targets, assignees]) => {
    const prefix = fn.slice(0, 3).toUpperCase();
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const id = posId(fn, rank);
    return {
      id: `demo-jd-${++seq}`,
      serialNo: `${prefix}-${String(counters[prefix]).padStart(3, "0")}`,
      positionId: id,
      positionTitle: `${FUNCTION_LABEL[fn]} - ${rank}`,
      functionKey: fn,
      task,
      notesHtml: null,
      recurrence,
      estimatedMinutes: minutes,
      videoUrl: null,
      guidelinesUrl: null,
      templateUrl: null,
      pushDcc: !!targets.dcc,
      pushWms: !!targets.wms,
      pushEvent: !!targets.event,
      isActive: true,
      assignees,
      /* The seeded people cover whichever destinations their JD pushes to —
         which is what a single assignee list meant before destinations were
         separable, and what migration 0225 backfills for real rows. */
      targetPeople: {
        dcc: targets.dcc ? assignees.map(pid) : [],
        wms: targets.wms ? assignees.map(pid) : [],
        event: targets.event ? assignees.map(pid) : [],
      },
    };
  });

  return {
    ranks,
    positions,
    entries,
    people: PEOPLE.map((name) => ({ id: pid(name), name })),
    holders,
  };
}

const store = demoStore<Data>("job-description", seed);

export const jdDemoActive = () => store.isActive();

/* -- Reads ----------------------------------------------------------------- */

export function demoJdSnapshot() {
  const d = store.get();
  return {
    entries: d.entries,
    positions: d.positions,
    ranks: d.ranks,
    people: d.people,
    holders: d.holders,
  };
}

/* -- Writes ---------------------------------------------------------------- */

export function demoCreatePosition(v: {
  functionKey: string;
  rankId: string;
  variant: string | null;
}): string {
  const d = store.get();
  const rank = d.ranks.find((r) => r.id === v.rankId) ?? d.ranks[0]!;
  const label = FUNCTION_LABEL[v.functionKey] ?? v.functionKey;
  const id = demoId("demo-pos");
  d.positions.push({
    id,
    functionKey: v.functionKey,
    rankId: rank.id,
    rankName: rank.name,
    rankOrder: rank.rankOrder,
    variant: v.variant,
    title: v.variant ? `${label} - ${rank.name} (${v.variant})` : `${label} - ${rank.name}`,
    holderCount: 0,
  });
  d.positions.sort((a, b) =>
    a.functionKey === b.functionKey
      ? a.rankOrder - b.rankOrder
      : a.functionKey.localeCompare(b.functionKey),
  );
  return id;
}

export function demoCreateEntry(v: {
  positionId: string;
  task: string;
  notesHtml?: string | null;
  /* Loose on the way in: the action hands over its zod output, whose weekday
     array widens to number[]. readRecurrence narrows it back. */
  recurrence: unknown;
  estimatedMinutes: number;
  videoUrl: string | null;
  guidelinesUrl: string | null;
  templateUrl: string | null;
  pushDcc: boolean;
  pushWms: boolean;
  pushEvent: boolean;
  targetPeople?: TargetPeople;
}): string | null {
  const d = store.get();
  const pos = d.positions.find((p) => p.id === v.positionId);
  if (!pos) return null;

  const prefix = pos.functionKey.slice(0, 3).toUpperCase();
  const used = d.entries.filter((e) => e.serialNo.startsWith(prefix)).length + 1;
  const id = demoId("demo-jd");

  d.entries.push({
    id,
    serialNo: `${prefix}-${String(used).padStart(3, "0")}`,
    positionId: pos.id,
    positionTitle: pos.title,
    functionKey: pos.functionKey,
    task: v.task,
    notesHtml: v.notesHtml ?? null,
    recurrence: readRecurrence(v.recurrence),
    estimatedMinutes: v.estimatedMinutes,
    videoUrl: v.videoUrl,
    guidelinesUrl: v.guidelinesUrl,
    templateUrl: v.templateUrl,
    pushDcc: v.pushDcc,
    pushWms: v.pushWms,
    pushEvent: v.pushEvent,
    isActive: true,
    assignees: namesOf(d.people, allIds(v.targetPeople ?? EMPTY_TARGET_PEOPLE)),
    targetPeople: v.targetPeople ?? EMPTY_TARGET_PEOPLE,
  });
  return id;
}

export function demoUpdateEntry(v: Record<string, unknown> & { id: string }): boolean {
  const d = store.get();
  const e = d.entries.find((x) => x.id === v.id);
  if (!e) return false;

  // Narrowed separately: zod widens the weekday array to number[].
  if (v.recurrence !== undefined) e.recurrence = readRecurrence(v.recurrence);

  for (const k of [
    "task",
    "estimatedMinutes",
    "videoUrl",
    "guidelinesUrl",
    "templateUrl",
    "pushDcc",
    "pushWms",
    "pushEvent",
  ] as const) {
    if (v[k] !== undefined) (e as unknown as Record<string, unknown>)[k] = v[k];
  }

  if (v.positionId !== undefined) {
    const pos = d.positions.find((p) => p.id === v.positionId);
    if (pos) {
      e.positionId = pos.id;
      e.positionTitle = pos.title;
      e.functionKey = pos.functionKey;
    }
  }

  if (v.targetPeople && typeof v.targetPeople === "object") {
    const tp = v.targetPeople as TargetPeople;
    e.targetPeople = {
      dcc: [...(tp.dcc ?? [])],
      wms: [...(tp.wms ?? [])],
      event: [...(tp.event ?? [])],
    };
    // The name list the grid reads is DERIVED, never edited on its own — two
    // copies of "who is assigned" would be two chances to disagree.
    e.assignees = namesOf(d.people, allIds(e.targetPeople));
  }
  return true;
}

/** Every id across the three destinations, once each. */
function allIds(tp: TargetPeople): string[] {
  const seen = new Set<string>();
  for (const t of JD_TARGETS) for (const id of tp[t] ?? []) seen.add(id);
  return [...seen];
}

function namesOf(people: { id: string; name: string }[], ids: string[]): string[] {
  return ids
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b));
}

export function demoSetEntryActive(id: string, isActive: boolean): boolean {
  const d = store.get();
  const e = d.entries.find((x) => x.id === id);
  if (!e) return false;
  e.isActive = isActive;
  return true;
}
