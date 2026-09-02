import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileText, Home } from "lucide-react";
import { LetterBackButton } from "@/components/hr/letters/letter-back-button";
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
    <div className="min-h-dvh bg-[#faf9fb]">
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4 print:hidden">
        <div className="justify-self-start flex items-center gap-2">
          <LetterBackButton />
          <Link
            href={"/hr" as Route}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-ink-muted max-md:px-2.5 max-md:hidden"
          >
            <Home size={15} strokeWidth={2.4} />
            <span className="max-md:hidden">HR Home</span>
          </Link>
          <Link
            href={"/hr/letters" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{
              background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)",
              boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">All Letters</span>
            <span className="md:hidden">Back</span>
          </Link>
        </div>
        <span className="justify-self-center truncate text-[15px] font-extrabold tracking-tight text-ink-strong">
          {template ? template.title : "Letter"}
        </span>
        <span aria-hidden className="justify-self-end" />
      </header>

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
