import Link from "next/link";
import type { Route } from "next";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { employees, designations, broadcasts } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { listActiveDepartments } from "@/lib/queries/departments";
import { listBroadcastSegments, listBroadcastTemplates } from "@/lib/ecos/queries";
import { PageShell } from "@/components/layout/page-shell";
import { BroadcastComposer, type ComposerDraft } from "@/components/communications/broadcast-composer";
import type { AudienceRule } from "@/lib/ecos/audience";
import type { BroadcastAttachment } from "@/app/(app)/hr/communications/actions-types";

export const dynamic = "force-dynamic";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * ECOS Broadcast Composer — HR-staff-only authoring surface. Fetches the
 * audience option lists (active roster + department / designation masters) and
 * hands them to the client composer. `?draft=<id>` resumes an editable draft.
 */
export default async function ComposeBroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await requireHrStaff();
  const { draft: draftId } = await searchParams;

  const [roster, desigRows, deptRows, segments, templates] = await Promise.all([
    db
      .select({
        id: employees.id,
        name: employees.name,
        avatarUrl: employees.avatarUrl,
        department: employees.department,
        designation: designations.name,
      })
      .from(employees)
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
    db
      .select({ id: designations.id, name: designations.name })
      .from(designations)
      .where(eq(designations.isActive, true))
      .orderBy(asc(designations.sortOrder), asc(designations.name)),
    listActiveDepartments(),
    listBroadcastSegments(),
    listBroadcastTemplates(),
  ]);

  const departments = deptRows.map((d) => ({ id: d.id, name: d.name }));

  // Resume a draft (drafts / scheduled only remain editable server-side).
  let draft: ComposerDraft | null = null;
  if (draftId) {
    const row = await db.query.broadcasts.findFirst({
      where: eq(broadcasts.id, draftId),
    });
    if (row && (row.status === "draft" || row.status === "scheduled")) {
      draft = {
        id: row.id,
        title: row.title,
        bodyHtml: row.bodyHtml,
        bodyText: row.bodyText,
        category: row.category,
        priority: row.priority,
        ackMode: row.ackMode,
        requireLock: row.requireLock,
        authorIdentity: row.authorIdentity,
        senderName: row.senderName,
        attachments: (row.attachments as BroadcastAttachment[]) ?? [],
        audience: (row.audience as AudienceRule) ?? { scope: "org" },
        channels: (row.channels as string[]) ?? ["in_app", "email"],
        scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
        recurrence: row.recurrence,
        recurrenceUntil: row.recurrenceUntil,
        poll: row.poll ?? null,
        reminderAfterDays: row.reminderAfterDays,
        escalateToManager: row.escalateToManager,
      };
    }
  }

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <Link
            href={"/communications" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{
              background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)",
              boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">Communications</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      <PageShell width="wide" py={false} className="pt-8 pb-24">
        <header className="mb-6 wg-rise">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Megaphone size={13} strokeWidth={2.6} /> Communications
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(28px,3.4vw,44px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.02,
            }}
          >
            {draft ? "Edit broadcast" : "New broadcast"}
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[15px] font-medium text-ink-muted">
            Compose the message, choose who receives it, and publish. Every broadcast lands in the
            in-app inbox; email is optional. Critical &amp; Emergency broadcasts can lock the app
            until acknowledged.
          </p>
        </header>

        <BroadcastComposer
          employees={roster}
          departments={departments}
          designations={desigRows}
          draft={draft}
          segments={segments}
          templates={templates}
        />
      </PageShell>
    </div>
  );
}
