import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listTcSubjects, listDepartmentOptions, isManager } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { MaterialForm } from "@/components/training/material-form";

export const dynamic = "force-dynamic";

export default async function NewMaterialPage() {
  const me = await requireWorkspace("training");
  const canManage = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!canManage) redirect("/training" as Route);

  const [subjects, employeeOptions, departmentOptions] = await Promise.all([
    listTcSubjects(),
    listEmployeeOptions(),
    listDepartmentOptions(),
  ]);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1100px]">
          <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
            <ArrowLeft size={15} strokeWidth={2.4} /> Training Centre
          </Link>
          <header className="mt-3 mb-6">
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px, 3vw, 40px)", letterSpacing: "-0.025em", lineHeight: 1.04 }}>
              Add Training Material
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Upload material, credit contributors, and flag induction.
            </p>
          </header>
          <MaterialForm
            subjects={subjects}
            employeeOptions={employeeOptions.map((e) => ({ value: e.id, label: e.name }))}
            departmentOptions={departmentOptions}
          />
        </div>
      </main>
    </>
  );
}
