import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getMaterial, listDepartmentOptions, getMaterialTests, isManager } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { MaterialViewer } from "@/components/training/material-viewer";
import { MaterialTests } from "@/components/training/material-tests";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MaterialPage({ params }: PageProps) {
  const { id } = await params;
  const me = await requireWorkspace("training");
  const [material, employeeOptions, departmentOptions, tests, manager] = await Promise.all([
    getMaterial(id, me.id),
    listEmployeeOptions(),
    listDepartmentOptions(),
    getMaterialTests(id, me.id),
    isManager(me.id),
  ]);
  if (!material) notFound();
  const canManage = me.isAdmin || isSuperAdmin(me.email) || manager;

  const empById = Object.fromEntries(employeeOptions.map((e) => [e.id, e.name]));
  const deptById = Object.fromEntries(departmentOptions.map((d) => [d.value, d.label]));
  const createdByNames = material.createdByIds.map((i) => empById[i]).filter(Boolean) as string[];
  const assistedByNames = material.assistedByIds.map((i) => empById[i]).filter(Boolean) as string[];
  const inductionDeptNames = material.inductionDeptIds.map((i) => deptById[i]).filter(Boolean) as string[];

  const title = material.fileName || (material.videoUrl ? "Video material" : material.subject || "Training material");

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <Link href={"/training" as Route} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red">
          <ArrowLeft size={15} strokeWidth={2.4} /> Material Library
        </Link>
        <header className="mt-3 mb-6">
          <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 2.6vw, 36px)", letterSpacing: "-0.02em", lineHeight: 1.06, overflowWrap: "anywhere" }}>
            {title}
          </h1>
          {material.subject && <p className="mt-1.5 font-semibold text-ink-muted" style={{ fontSize: 15 }}>{material.subject}{material.los ? ` · ${material.los}` : ""}</p>}
        </header>
        <MaterialViewer material={material} createdByNames={createdByNames} assistedByNames={assistedByNames} inductionDeptNames={inductionDeptNames} canManage={canManage} />
        <MaterialTests materialId={material.id} tests={tests} canManage={canManage} />
      </main>
    </>
  );
}
