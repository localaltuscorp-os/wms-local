import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getLetter } from "@/lib/hr/letters/registry";
import { loadLetterRoster, loadLetterCandidates } from "@/lib/hr/letters/roster";
import { listActiveDepartments } from "@/lib/queries/departments";
import {
  LetterEditor,
  type LetterRosterOption,
  type LetterCandidateOption,
} from "@/components/hr/letters/letter-editor";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";

export const dynamic = "force-dynamic";

/**
 * A single letter, on its own full-screen page: `/hr/letters/<key>`. Loads the
 * template from the registry, renders it on the shared <Letterhead> with the red
 * editable fields inline, and offers Export PDF + Issue. Keys not yet authored
 * show a friendly "coming soon" panel (so lifecycle links never dead-end).
 */
export default async function LetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ candidate?: string; employee?: string; ctc?: string }>;
}) {
  const me = await requireHrStaff();
  const { key } = await params;
  const { candidate, employee } = await searchParams;
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);
  const template = getLetter(key);

  return (
    <div className="min-h-full bg-[#faf9fb]">
      <HrTitleBar
        title={template ? template.title : "Letter"}
      />

      <PageShell width="wide" py={false} className="pt-8 pb-24">
        {template ? (
          <LetterEditorLoader
            templateKey={key}
            isAdmin={isAdmin}
            initialCandidateId={candidate}
            initialEmployeeId={employee}
          />
        ) : (
          <ComingSoon />
        )}
      </PageShell>
    </div>
  );
}

/** Server sub-component: fetches the (optional) attach-employee roster for admins. */
async function LetterEditorLoader({
  templateKey,
  isAdmin,
  initialCandidateId,
  initialEmployeeId,
}: {
  templateKey: string;
  isAdmin: boolean;
  initialCandidateId?: string;
  initialEmployeeId?: string;
}) {
  const template = getLetter(templateKey)!;
  let roster: LetterRosterOption[] = [];
  let candidates: LetterCandidateOption[] = [];
  let departments: string[] = [];
  if (isAdmin) {
    const [rows, cands, depts] = await Promise.all([
      loadLetterRoster().catch(() => []),
      loadLetterCandidates().catch(() => []),
      listActiveDepartments().catch(() => []),
    ]);
    roster = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      designation: r.designation,
      payingEntity: r.payingEntity,
    }));
    candidates = cands.map((c) => ({ id: c.id, name: c.name, gender: c.gender }));
    departments = depts.map((d) => d.name).filter(Boolean);
  }
  return (
    <LetterEditor
      template={template}
      roster={roster}
      candidates={candidates}
      departments={departments}
      isAdmin={isAdmin}
      initialCandidateId={initialCandidateId}
      initialEmployeeId={initialEmployeeId}
    />
  );
}

function ComingSoon() {
  return (
    <div className="mx-auto mt-10 max-w-[560px] rounded-2xl border border-solid border-hairline-strong bg-white px-8 py-14 text-center">
      <span
        className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "#E106001a", color: "#A80400" }}
      >
        <FileText size={26} strokeWidth={2.1} />
      </span>
      <h1
        className="text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 22 }}
      >
        This letter is being authored
      </h1>
      <p className="mt-2 text-[14px] font-medium leading-relaxed text-ink-muted">
        The template for this letter hasn&apos;t been written yet. It will appear here as a fully
        editable letter on the Altus letterhead soon.
      </p>
    </div>
  );
}
