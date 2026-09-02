
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { DashboardHeader } from "@/components/layout/header";
import { requireUser } from "@/lib/auth/current";
import { requireHrSupport } from "@/lib/hr/flag";
import { TicketComposer } from "@/components/hr/ticket-composer/ticket-composer";
import { getInboxNotificationsByIds } from "@/lib/queries/notifications";
import {
  CATEGORY_LABELS,
  categoryOfKind,
  formatPeriod,
  formatShortDate,
  notificationPeriod,
} from "@/lib/notifications/categories";
import type { HrTicketCategory } from "@/db/enums";

export const dynamic = "force-dynamic";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

/** The ticket body is plain text in a <textarea>; this is its line break. */
const NL = "\n";

/**
 * Ticket context carried in from the Inbox (`/support/new?n=<id>,<id>`).
 *
 * The ids are the ONLY thing the URL carries; every word below is read back out
 * of the database, scoped to the signed-in recipient, so a hand-edited query
 * string can neither fabricate a notification nor pull someone else's into a
 * ticket. Unknown ids simply drop out and the form opens blank.
 */
async function inboxContext(
  raw: string | undefined,
  userId: string,
): Promise<
  | { subject: string; description: string; category: HrTicketCategory; note: string }
  | undefined
> {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (ids.length === 0) return undefined;

  const rows = await getInboxNotificationsByIds(ids, userId);
  if (rows.length === 0) return undefined;

  const blocks = rows.map((n, i) => {
    const period = formatPeriod(notificationPeriod(n));
    const lines = [
      `${rows.length > 1 ? `${i + 1}. ` : ""}${n.title}`,
      `   Category: ${CATEGORY_LABELS[categoryOfKind(n.kind)]}`,
      `   Notification date: ${formatShortDate(n.createdAt)}`,
      `   Period: ${period ?? "—"}`,
      `   From: ${n.actorName ?? "System"}`,
    ];
    return lines.join(NL);
  });

  const first = rows[0]!;
  const subject =
    rows.length === 1
      ? first.title.slice(0, 200)
      : `Query about ${rows.length} inbox notifications`.slice(0, 200);

  // Attendance notifications are the common reason someone raises a ticket
  // about their inbox, and they have an exact HR category. Everything else
  // opens on "Other" rather than guessing.
  const category: HrTicketCategory =
    rows.every((n) => categoryOfKind(n.kind) === "attendance") ? "leave_attendance" : "other";

  const description = [
    "Raised from a notification in my Inbox.",
    "",
    ...blocks,
    "",
    "What I need help with:",
    "",
  ].join(NL);

  return {
    subject,
    description,
    category,
    note:
      rows.length === 1
        ? `Raising this about your notification from ${formatShortDate(first.createdAt)} — "${first.title}". Edit anything below before you send it.`
        : `Raising this about ${rows.length} notifications from your Inbox. Edit anything below before you send it.`,
  };
}

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspace("hr");
  requireHrSupport();
  const me = await requireUser();
  const sp = await searchParams;
  const nRaw = sp["n"];
  const context = await inboxContext(Array.isArray(nRaw) ? nRaw[0] : nRaw, me.id);
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[720px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            HR · New request
          </span>
          <h1
            className="mt-1.5 text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,2.6vw,34px)", letterSpacing: "-0.025em" }}
          >
            Raise a Ticket
          </h1>
          <p className="mt-1 text-[14px] font-medium text-ink-muted">
            Pick a category, tell us what you need, and we&apos;ll route it to the right person.
          </p>
        </header>
        <TicketComposer
          mode="support"
          initialSubject={context?.subject}
          initialDescription={context?.description}
          initialCategory={context?.category}
          contextNote={context?.note}
        />
      </main>
    </>
  );
}
