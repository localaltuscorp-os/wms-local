import Link from "next/link";
import type { Route } from "next";
import { Plus } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { listMaterials, isManager } from "@/lib/queries/training";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { MaterialsTable } from "@/components/training/materials-table";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const me = await requireWorkspace("training");
  const manager = (await isManager(me.id)) || me.isAdmin || isSuperAdmin(me.email);
  const [rows, employeeOptions] = await Promise.all([
    listMaterials(me.id, { includeArchived: manager }),
    listEmployeeOptions(),
  ]);
  const canManage = manager;
  const employeesById = Object.fromEntries(employeeOptions.map((e) => [e.id, e.name]));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--color-altus-red-deep)" }}>
              Training Centre
            </span>
            <h1 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 3.4vw, 44px)", letterSpacing: "-0.025em", lineHeight: 1.04, marginTop: 6 }}>
              Material Library
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Watch the material and take its tests. {canManage ? "Add and manage material here." : ""}
            </p>
          </div>
          {canManage && (
            <Link href={"/training/new" as Route} className="inline-flex items-center gap-2 rounded-xl py-3 px-5 text-[15px] font-bold text-white transition-transform active:scale-[0.99]" style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -12px rgba(225,6,0,0.6)" }}>
              <Plus size={17} strokeWidth={2.6} /> Add Material
            </Link>
          )}
        </header>

        <MaterialsTable rows={rows} employeesById={employeesById} canManage={canManage} />
      </main>
    </>
  );
}
