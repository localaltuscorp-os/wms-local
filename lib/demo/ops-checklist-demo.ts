/**
 * EVENT CHECKLIST - the demo dataset and its in-memory writes.
 *
 * Used only while migration 0221 is unapplied; see lib/demo/store.ts for why
 * that window exists and why it is safe. Every shape here is the one the real
 * query returns, so the grid cannot tell the difference - which is the point:
 * a demo the components have to special-case stops proving they work.
 */
import type {
  CheckStatus,
  ChecklistEventRow,
  ChecklistItemRow,
  ChecklistPersonRow,
  ChecklistRunRow,
  ChecklistTemplateRow,
} from "@/lib/operations/checklist";
import { demoId, demoStore, shiftYmd, todayIst } from "@/lib/demo/store";

interface Data {
  people: ChecklistPersonRow[];
  events: ChecklistEventRow[];
  templates: ChecklistTemplateRow[];
  templateItems: Record<string, Omit<ChecklistItemRow, "status" | "notes" | "doneAt">[]>;
  runs: ChecklistRunRow[];
  items: Record<string, ChecklistItemRow[]>;
}

const P = [
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
];

/** A person's id - deterministic, so the pickers round-trip. */
const pid = (name: string) => `demo-person-${P.indexOf(name)}`;

let seq = 0;
const iid = () => `demo-item-${++seq}`;

/** One grid row, with the boilerplate filled in. */
function row(
  n: number,
  title: string,
  offsetDays: number | null,
  doer: string,
  backup: string,
  extra: Partial<ChecklistItemRow> = {},
): ChecklistItemRow {
  return {
    id: iid(),
    code: String(n),
    title,
    category: null,
    offsetDays,
    targetDate: null,
    doerId: pid(doer),
    doerName: doer,
    backupId: pid(backup),
    backupName: backup,
    instructions: null,
    fileLink: null,
    jdEntryId: null,
    sortOrder: n * 10,
    isActive: true,
    status: "Pending" as CheckStatus,
    notes: null,
    doneAt: null,
    ...extra,
  };
}

/** Ticks a row, actually completed on `actual` - so Actual and Variance read. */
function done(
  r: ChecklistItemRow,
  actual: string,
  notes: string | null = null,
): ChecklistItemRow {
  return { ...r, status: "Done", doneAt: `${actual}T10:30:00.000Z`, notes };
}

function seed(): Data {
  const today = todayIst();

  /* An event three weeks out: mid-flight, which is the state worth showing -
     the early rows ticked, the near ones due, the far ones untouched. */
  const annualDay = shiftYmd(today, 21);
  /* One that has already happened, so the After rows and real variances show. */
  const diwali = shiftYmd(today, -9);
  const auditVisit = shiftYmd(today, 6);

  const events: ChecklistEventRow[] = [
    { id: "demo-event-1", title: "Annual Day 2026", eventDate: annualDay, categoryName: "Company" },
    { id: "demo-event-2", title: "Diwali Client Gifting", eventDate: diwali, categoryName: "Client" },
    { id: "demo-event-3", title: "ISO Audit - Surveillance", eventDate: auditVisit, categoryName: "Compliance" },
    { id: "demo-event-4", title: "Dealer Meet - Pune", eventDate: shiftYmd(today, 45), categoryName: "Sales" },
    { id: "demo-event-5", title: "Founders Day", eventDate: shiftYmd(today, 88), categoryName: "Company" },
  ];

  const annualItems: ChecklistItemRow[] = [
    done(row(1, "Fix the date and book the auditorium", -30, "Rakesh Mehta", "Aarti Deshpande"), shiftYmd(today, -12)),
    done(row(2, "Circulate the theme and dress code on the group", -25, "Aarti Deshpande", "Priya Nair"), shiftYmd(today, -9)),
    done(row(3, "Collect headcount confirmations from every function", -21, "Priya Nair", "Sneha Kulkarni"), shiftYmd(today, -2), "Apps team still 4 short - chasing."),
    { ...row(4, "Finalise the caterer and sign the quote", -14, "Sneha Kulkarni", "Kunal Joshi"), status: "Need Help", notes: "Two quotes 18% apart - need Rakesh to pick." },
    row(5, "Order trophies and the long-service mementoes", -12, "Kunal Joshi", "Om Trivedi"),
    row(6, "Print the programme and the name badges", -7, "Om Trivedi", "Rudra Shah"),
    { ...row(7, "Arrange transport for the Pune office", -5, "Rohan Choudhary", "Manan Vasa"), status: "Not Applicable", notes: "Pune office is attending on video this year." },
    row(8, "Rehearsal - sound, lights, running order", -2, "Manan Vasa", "Vinal Patil"),
    row(9, "Stage set-up and AV check", -1, "Vinal Patil", "Rudra Shah"),
    row(10, "Registration desk open from 09:30", 0, "Priya Nair", "Aarti Deshpande"),
    row(11, "Run the programme to the printed running order", 0, "Rakesh Mehta", "Manan Vasa"),
    row(12, "Photography and the group photograph", 0, "Rudra Shah", "Om Trivedi"),
    row(13, "Settle the vendor bills and file the receipts", 3, "Kunal Joshi", "Sneha Kulkarni"),
    row(14, "Share the photo album with everyone", 5, "Aarti Deshpande", "Priya Nair"),
    row(15, "Feedback form out, and a note of what to change next year", 7, "Rakesh Mehta", "Vinal Patil"),
  ];

  const diwaliItems: ChecklistItemRow[] = [
    done(row(1, "Lock the client list with Sales", -20, "Vinal Patil", "Rakesh Mehta"), shiftYmd(today, -31)),
    done(row(2, "Choose the hamper and get three quotes", -15, "Sneha Kulkarni", "Kunal Joshi"), shiftYmd(today, -27)),
    done(row(3, "Approve the spend", -12, "Rakesh Mehta", "Manan Vasa"), shiftYmd(today, -19), "Approved at 1,850 a hamper."),
    done(row(4, "Place the order", -10, "Kunal Joshi", "Sneha Kulkarni"), shiftYmd(today, -22)),
    done(row(5, "Print and sign the greeting cards", -7, "Aarti Deshpande", "Priya Nair"), shiftYmd(today, -14)),
    done(row(6, "Sort hampers by delivery route", -3, "Om Trivedi", "Rohan Choudhary"), shiftYmd(today, -13)),
    done(row(7, "Dispatch - courier outstation, hand delivery in the city", 0, "Rohan Choudhary", "Om Trivedi"), shiftYmd(today, -9)),
    { ...row(8, "Confirm every delivery landed", 2, "Priya Nair", "Aarti Deshpande"), status: "Need Help", notes: "Three Nashik deliveries unconfirmed - courier not answering." },
    done(row(9, "File the bills with Accounts", 5, "Sneha Kulkarni", "Kunal Joshi"), shiftYmd(today, -3)),
  ];

  const auditItems: ChecklistItemRow[] = [
    done(row(1, "Confirm the audit date with the certifying body", -21, "Manan Vasa", "Rakesh Mehta"), shiftYmd(today, -18)),
    done(row(2, "Internal audit of every clause", -14, "Om Trivedi", "Rudra Shah"), shiftYmd(today, -8)),
    { ...row(3, "Close last year's non-conformities", -10, "Rudra Shah", "Om Trivedi"), status: "Need Help", notes: "NC-3 needs a signed process change." },
    row(4, "Refresh the document register", -7, "Priya Nair", "Sneha Kulkarni"),
    row(5, "Brief every department head", -3, "Rakesh Mehta", "Manan Vasa"),
    row(6, "Opening meeting, 09:00", 0, "Rakesh Mehta", "Om Trivedi"),
    row(7, "Escort the auditor, floor by floor", 0, "Om Trivedi", "Rudra Shah"),
    row(8, "Closing meeting and note the findings", 0, "Manan Vasa", "Rakesh Mehta"),
    row(9, "Corrective action plan to the auditor", 10, "Rudra Shah", "Priya Nair"),
  ];

  /* A standing checklist: no event, so each row carries its own date and the
     Offset column is blank. Worth having in the demo because it is the case
     that proves is_event lives on the CHECKLIST and not on the row. */
  const reviewItems: ChecklistItemRow[] = [
    done({ ...row(1, "Pull the month's sales figures from the dashboard", null, "Vinal Patil", "Manan Vasa"), targetDate: shiftYmd(today, -4) }, shiftYmd(today, -4)),
    done({ ...row(2, "Reconcile against the Accounts ledger", null, "Sneha Kulkarni", "Kunal Joshi"), targetDate: shiftYmd(today, -3) }, shiftYmd(today, -1), "Two invoices dated in the wrong month."),
    { ...row(3, "Chase every quote open more than 30 days", null, "Rakesh Mehta", "Vinal Patil"), targetDate: shiftYmd(today, -1) },
    { ...row(4, "Prepare the deck", null, "Priya Nair", "Aarti Deshpande"), targetDate: today },
    { ...row(5, "Circulate the deck 24 hours before the call", null, "Aarti Deshpande", "Priya Nair"), targetDate: shiftYmd(today, 2) },
    { ...row(6, "Hold the review and minute the actions", null, "Rakesh Mehta", "Manan Vasa"), targetDate: shiftYmd(today, 3) },
  ];

  const runs: ChecklistRunRow[] = [
    {
      id: "demo-run-1",
      title: "Annual Day 2026",
      isEvent: true,
      eventId: "demo-event-1",
      eventDate: annualDay,
      eventTitle: "Annual Day 2026",
      /* The event has since MOVED in the Events Master. The grid offers
         "recalculate?" rather than silently rewriting dates people worked to. */
      calendarDate: shiftYmd(annualDay, 3),
      status: "active",
      notes: "Auditorium confirmed. Budget signed off.",
    },
    {
      id: "demo-run-2",
      title: "ISO Audit - Surveillance",
      isEvent: true,
      eventId: "demo-event-3",
      eventDate: auditVisit,
      eventTitle: "ISO Audit - Surveillance",
      calendarDate: null,
      status: "active",
      notes: null,
    },
    {
      id: "demo-run-3",
      title: "Diwali Client Gifting",
      isEvent: true,
      eventId: "demo-event-2",
      eventDate: diwali,
      eventTitle: "Diwali Client Gifting",
      calendarDate: null,
      status: "active",
      notes: "142 hampers. Nashik route still open.",
    },
    {
      id: "demo-run-4",
      title: "Monthly Sales Review - September",
      isEvent: false,
      eventId: null,
      eventDate: null,
      eventTitle: null,
      calendarDate: null,
      status: "active",
      notes: null,
    },
  ];

  const strip = (r: ChecklistItemRow) => {
    const { status: _s, notes: _n, doneAt: _d, ...rest } = r;
    return rest;
  };

  const templates: ChecklistTemplateRow[] = [
    {
      id: "demo-tpl-1",
      name: "Company Event - standard plan",
      isEvent: true,
      description: "The fifteen steps every in-house event goes through.",
      isActive: true,
      itemCount: annualItems.length,
    },
    {
      id: "demo-tpl-2",
      name: "ISO Surveillance Audit",
      isEvent: true,
      description: "Clause review through to the corrective action plan.",
      isActive: true,
      itemCount: auditItems.length,
    },
    {
      id: "demo-tpl-3",
      name: "Monthly Review (standing)",
      isEvent: false,
      description: "No event date - each row carries its own.",
      isActive: true,
      itemCount: reviewItems.length,
    },
  ];

  return {
    people: P.map((name) => ({ id: pid(name), name })),
    events,
    templates,
    templateItems: {
      "demo-tpl-1": annualItems.map(strip),
      "demo-tpl-2": auditItems.map(strip),
      "demo-tpl-3": reviewItems.map(strip),
    },
    runs,
    items: {
      "demo-run-1": annualItems,
      "demo-run-2": auditItems,
      "demo-run-3": diwaliItems,
      "demo-run-4": reviewItems,
    },
  };
}

const store = demoStore<Data>("ops-checklist", seed);

export const checklistDemoActive = () => store.isActive();

/* -- Reads ----------------------------------------------------------------- */

export function demoChecklistSnapshot() {
  const d = store.get();
  return { runs: d.runs, events: d.events, templates: d.templates, people: d.people };
}

export function demoGetRun(id: string): ChecklistRunRow | null {
  return store.get().runs.find((r) => r.id === id) ?? null;
}

export function demoRunItems(runId: string): ChecklistItemRow[] {
  return (store.get().items[runId] ?? []).filter((i) => i.isActive);
}

/* -- Writes ---------------------------------------------------------------- */

/**
 * Add an event to the demo calendar.
 *
 * The demo dataset ships five events, and "the one I actually need is not in
 * the list" is the first thing anybody hits when trying the screen out — so the
 * inline Add event has to work here too, or the feature reads as broken to
 * every reviewer who sees it before migration 0221 runs.
 */
export function demoCreateEvent(v: { title: string; eventDate: string }): {
  id: string;
  title: string;
  eventDate: string;
} {
  const d = store.get();
  const existing = d.events.find(
    (e) => e.title.toLowerCase() === v.title.toLowerCase() && e.eventDate === v.eventDate,
  );
  if (existing) return { id: existing.id, title: existing.title, eventDate: existing.eventDate };

  const row = { id: demoId("event"), title: v.title, eventDate: v.eventDate, categoryName: null };
  d.events.push(row);
  // The picker reads this list in order, and the real query returns events by
  // date — so a new one has to land in its place rather than at the end.
  d.events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return { id: row.id, title: row.title, eventDate: row.eventDate };
}


export function demoCreateRun(v: {
  title: string;
  isEvent: boolean;
  eventId: string | null;
  eventDate: string | null;
  templateId: string | null;
}): string {
  const d = store.get();
  const ev = v.eventId ? d.events.find((e) => e.id === v.eventId) ?? null : null;
  const id = demoId("demo-run");

  d.runs.unshift({
    id,
    title: v.title,
    isEvent: v.isEvent,
    eventId: v.isEvent ? v.eventId : null,
    eventDate: v.isEvent ? v.eventDate ?? ev?.eventDate ?? null : null,
    eventTitle: v.isEvent ? ev?.title ?? null : null,
    calendarDate: null,
    status: "active",
    notes: null,
  });

  const from = v.templateId ? d.templateItems[v.templateId] ?? [] : [];
  d.items[id] = from.map((r) => ({
    ...r,
    id: demoId("demo-item"),
    status: "Pending" as CheckStatus,
    notes: null,
    doneAt: null,
  }));
  return id;
}

export function demoUpdateRun(v: {
  id: string;
  title?: string;
  eventDate?: string | null;
  status?: ChecklistRunRow["status"];
  notes?: string | null;
}): boolean {
  const d = store.get();
  const run = d.runs.find((r) => r.id === v.id);
  if (!run) return false;
  if (v.title !== undefined) run.title = v.title;
  if (v.notes !== undefined) run.notes = v.notes;
  if (v.status !== undefined) run.status = v.status;
  if (v.eventDate !== undefined) {
    run.eventDate = v.eventDate;
    // Accepting the new date is what clears the "event moved" prompt - the
    // banner must not survive the click that answered it.
    if (v.eventDate && v.eventDate === run.calendarDate) run.calendarDate = null;
  }
  return true;
}

export function demoCreateItem(v: {
  runId: string;
  title: string;
  offsetDays: number | null;
  targetDate: string | null;
  doerId: string | null;
  backupId: string | null;
}): string | null {
  const d = store.get();
  if (!d.runs.some((r) => r.id === v.runId)) return null;
  const list = (d.items[v.runId] ??= []);
  const nameOf = (id: string | null) => d.people.find((p) => p.id === id)?.name ?? null;
  const id = demoId("demo-item");

  list.push({
    id,
    code: String(list.length + 1),
    title: v.title,
    category: null,
    offsetDays: v.offsetDays,
    targetDate: v.targetDate,
    doerId: v.doerId,
    doerName: nameOf(v.doerId),
    backupId: v.backupId,
    backupName: nameOf(v.backupId),
    instructions: null,
    fileLink: null,
    jdEntryId: null,
    sortOrder: (list.at(-1)?.sortOrder ?? 0) + 10,
    isActive: true,
    status: "Pending",
    notes: null,
    doneAt: null,
  });
  return id;
}

export function demoUpdateItem(v: Record<string, unknown> & { id: string }): boolean {
  const d = store.get();
  const nameOf = (id: unknown) => d.people.find((p) => p.id === id)?.name ?? null;

  for (const list of Object.values(d.items)) {
    const it = list.find((i) => i.id === v.id);
    if (!it) continue;
    for (const k of [
      "title",
      "offsetDays",
      "targetDate",
      "instructions",
      "fileLink",
      "category",
      "code",
    ] as const) {
      if (v[k] !== undefined) (it as unknown as Record<string, unknown>)[k] = v[k];
    }
    if (v.doerId !== undefined) {
      it.doerId = (v.doerId as string | null) ?? null;
      it.doerName = nameOf(v.doerId);
    }
    if (v.backupId !== undefined) {
      it.backupId = (v.backupId as string | null) ?? null;
      it.backupName = nameOf(v.backupId);
    }
    return true;
  }
  return false;
}

export function demoRemoveItem(id: string): boolean {
  const d = store.get();
  for (const list of Object.values(d.items)) {
    const it = list.find((i) => i.id === id);
    if (it) {
      it.isActive = false;
      return true;
    }
  }
  return false;
}

export function demoSetCheck(v: {
  itemId: string;
  status: CheckStatus;
  notes?: string | null;
  doneAt?: string | null;
}): boolean {
  const d = store.get();
  for (const list of Object.values(d.items)) {
    const it = list.find((i) => i.id === v.itemId);
    if (!it) continue;
    it.status = v.status;
    if (v.notes !== undefined) it.notes = v.notes;
    if (v.doneAt !== undefined) {
      it.doneAt = v.doneAt;
    } else if (v.status === "Done" && !it.doneAt) {
      it.doneAt = new Date().toISOString();
    } else if (v.status !== "Done") {
      // Un-ticking clears the actual date, or the row reads as completed on a
      // day nobody completed it.
      it.doneAt = null;
    }
    return true;
  }
  return false;
}

export function demoSaveRunAsTemplate(runId: string, name: string): string | null {
  const d = store.get();
  const run = d.runs.find((r) => r.id === runId);
  if (!run) return null;
  const rows = (d.items[runId] ?? []).filter((i) => i.isActive);
  const id = demoId("demo-tpl");
  d.templates.push({
    id,
    name,
    isEvent: run.isEvent,
    description: `Saved from ${run.title}.`,
    isActive: true,
    itemCount: rows.length,
  });
  d.templateItems[id] = rows.map(({ status: _s, notes: _n, doneAt: _d, ...rest }) => rest);
  return id;
}
