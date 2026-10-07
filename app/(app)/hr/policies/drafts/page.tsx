import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FilePenLine, PencilLine, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { policyDocuments } from "@/db/schema";
import { requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { formatDateHr } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Private authoring queue. Draft policies never appear in the employee handbook. */
export default async function PolicyDraftsPage() {
  await requireWorkspaceAdmin("hr");
  const drafts = await db
    .select({ key: policyDocuments.key, title: policyDocuments.title, summary: policyDocuments.summary, updatedAt: policyDocuments.updatedAt })
    .from(policyDocuments)
    .where(eq(policyDocuments.status, "draft"))
    .orderBy(desc(policyDocuments.updatedAt));

  return <div className="min-h-full bg-[#faf9fb]"><HrTitleBar title={<span className="inline-flex items-center gap-1.5"><FilePenLine size={17} strokeWidth={2.4} style={{ color: "#A80400" }} />Policy drafts</span>} />
    <PageShell width="wide" py={false} className="pt-8 pb-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center justify-between gap-3"><p className="text-sm font-medium text-ink-muted">Private drafts are visible only to HR administrators until published.</p><Link href="/hr/policies/new" className="inline-flex items-center gap-1.5 rounded-xl bg-altus-red px-3.5 py-2 text-sm font-bold text-white"><Plus size={15} /> Create policy</Link></div>
        {drafts.length === 0 ? <div className="rounded-2xl border border-dashed border-hairline bg-white px-6 py-16 text-center"><FilePenLine className="mx-auto text-ink-soft" size={30} /><h2 className="mt-3 font-bold text-ink-strong">No policy drafts</h2><p className="mt-1 text-sm text-ink-muted">Create one when HR is ready to prepare a new policy.</p></div> : <ul className="space-y-3">{drafts.map((draft) => <li key={draft.key} className="flex items-center gap-4 rounded-2xl border border-hairline bg-white px-5 py-4"><span className="grid size-10 place-items-center rounded-xl bg-red-50 text-altus-red"><FilePenLine size={19} /></span><div className="min-w-0 flex-1"><h2 className="truncate font-bold text-ink-strong">{draft.title}</h2><p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{draft.summary || "No summary yet"}</p><p className="mt-1 text-xs font-semibold text-ink-soft">Last updated {formatDateHr(draft.updatedAt.toISOString())}</p></div><Link href={`/hr/policies/${draft.key}/edit`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline-strong px-3 py-2 text-sm font-bold text-ink-strong hover:border-altus-red"><PencilLine size={14} /> Edit freely</Link></li>)}</ul>}
      </div>
    </PageShell>
  </div>;
}
