import { asc, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { isHrStaff } from "@/lib/hr/access";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { canExportHrRecords } from "@/lib/hr/records-export/access";
import { getDriveStatus } from "@/lib/hr/records-export/settings";
import { RecordsBackupScreen, type BackupPerson } from "@/components/hr/records-backup/records-backup-screen";

export const dynamic = "force-dynamic";

/**
 * HR · Records Backup — download any person's complete record as a ZIP, and
 * manage the scheduled save of every record into the HR Google Drive.
 *
 * HR staff reach the page from the HR console; only HR ADMINS, super-admins and
 * the people named in HR_RECORDS_EXTRA_ACCESS get past the notice
 * (lib/hr/records-export/access.ts — the export holds ID scans, which the
 * dossier vault keeps admin-only). The same check is repeated in every route and
 * action the screen calls.
 */
export default async function HrRecordsBackupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Not requireHrStaff(): people named in HR_RECORDS_EXTRA_ACCESS may use this
  // page without being in the HR department. Everyone else outside HR is sent
  // back to the HR landing, exactly as requireHrStaff() would.
  const me = await requireUser();
  const allowed = await canExportHrRecords(me);
  if (!allowed && !(await isHrStaff(me))) redirect("/hr");
  const sp = await searchParams;

  if (!allowed) {
    return (
      <>
        <DashboardHeader generatedAt={new Date()} />
        <HrTitleBar />
        <PageShell width="narrow" style={{ maxWidth: "720px" }}>
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-hairline bg-white p-5">
            <Lock size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
            <div>
              <p className="text-[15px] font-bold text-ink-strong">Records Backup is for HR admins</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                A complete record includes ID scans and signed letters, which only admins can open. Ask an admin in HR if
                you need someone&rsquo;s records downloaded.
              </p>
            </div>
          </div>
        </PageShell>
      </>
    );
  }

  const [status, people] = await Promise.all([
    getDriveStatus(),
    db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        isActive: employees.isActive,
        department: employees.department,
      })
      .from(employees)
      .where(ne(employees.accountType, "candidate"))
      .orderBy(asc(employees.name)),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <HrTitleBar />
      <PageShell width="full">
        <RecordsBackupScreen
          initialStatus={status}
          people={people satisfies BackupPerson[]}
          notice={typeof sp.drive === "string" ? sp.drive : null}
          noticeAccount={typeof sp.as === "string" ? sp.as : null}
        />
      </PageShell>
    </>
  );
}
