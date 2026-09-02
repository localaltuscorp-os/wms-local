import { notFound } from "next/navigation";

import { requireWorkspace } from "@/lib/auth/workspace-access";
import { DashboardHeader } from "@/components/layout/header";
import { requireHrSupport } from "@/lib/hr/flag";
import {
  resolveViewer,
  getTicketBundle,
  listAssignableHandlers,
} from "@/lib/queries/hr-support";
import { TicketThread } from "@/components/hr/ticket-thread/ticket-thread";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketDetailPage({ params }: PageProps) {
  const me = await requireWorkspace("hr");
  requireHrSupport();
  const { id } = await params;
  const v = await resolveViewer(me);
  const bundle = await getTicketBundle(v, id);
  if (!bundle) notFound();

  const assignees = bundle.canHandle ? await listAssignableHandlers() : [];
  const t = bundle.ticket;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[820px] px-8 max-md:px-4 pt-8 pb-16">
        <TicketThread
          ticket={{
            id: t.id,
            ticketNo: t.ticketNo,
            subject: t.subject,
            category: t.category,
            status: t.status,
            priority: t.priority,
            confidential: t.confidential,
            source: t.source,
            requesterName: t.requesterName,
            assigneeId: t.assigneeId,
            assigneeName: t.assigneeName,
            createdAt: t.createdAt.toISOString(),
            closedAt: t.closedAt ? t.closedAt.toISOString() : null,
            csatScore: t.csatScore ?? null,
            csatComment: t.csatComment ?? null,
          }}
          messages={bundle.messages.map((m) => ({
            id: m.id,
            authorId: m.authorId,
            authorName: m.authorName,
            body: m.body,
            internal: m.internal,
            createdAt: m.createdAt.toISOString(),
          }))}
          attachments={bundle.attachments.map((a) => ({
            id: a.id,
            messageId: a.messageId,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            signedUrl: a.signedUrl,
            createdAt: a.createdAt.toISOString(),
          }))}
          meId={me.id}
          canHandle={bundle.canHandle}
          isRequester={bundle.isRequester}
          assignees={assignees}
        />
      </main>
    </>
  );
}
