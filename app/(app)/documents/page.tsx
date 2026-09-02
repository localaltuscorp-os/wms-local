import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { DocumentLibrary } from "@/components/documents/document-library";
import { RecentDocumentEvents } from "@/components/documents/recent-document-events";
import { listDocuments } from "@/lib/queries/documents";
import { listRecentDocumentEvents } from "@/lib/queries/document-events";
import { requireUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const me = await requireUser();
  // The recent-events feed is admin-only — surfaces who renamed / replaced
  // / deleted what, which is a moderation surface, not an end-user one.
  const [documents, events] = await Promise.all([
    listDocuments(),
    me.isAdmin ? listRecentDocumentEvents({ limit: 30 }) : Promise.resolve([]),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[860px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6">
          <h1 className="text-display-lg text-ink-strong">Documents</h1>
          <p className="text-body-lg text-ink-subtle mt-1">
            Shared library of files. Title is required; description optional.
            Upload, download, edit, replace, or delete.
          </p>
        </header>
        <DocumentLibrary documents={documents} />
        {me.isAdmin && <RecentDocumentEvents rows={events} />}
      </main>
      <DashboardFooter />
    </>
  );
}
