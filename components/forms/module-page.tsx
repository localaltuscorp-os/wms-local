import Link from "next/link";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { requireUser } from "@/lib/auth/current";
import { listModuleSubmissions } from "@/lib/queries/modules";
import { MODULES, type ModuleKey } from "@/lib/forms/modules";
import {
  resolveRequestFields,
  resolveAdminFields,
  resolveFields,
  requestKey,
  adminKey,
  getProductOptions,
} from "@/lib/forms/server";
import { DynamicFormDialog } from "./dynamic-form-dialog";
import { FormEditorDialog } from "./form-editor-dialog";
import { ModuleList } from "./module-list";

/** Per-module decision wording + headline field. */
const MODULE_UI: Record<ModuleKey, { grantLabel: string; approvedLabel: string; primaryKey: string }> = {
  reimbursement: { grantLabel: "Approve", approvedLabel: "Approved", primaryKey: "expense_for" },
  leave: { grantLabel: "Grant Leave", approvedLabel: "Granted", primaryKey: "leave_type" },
  reference: { grantLabel: "Mark Actioned", approvedLabel: "Actioned", primaryKey: "reference_name" },
  breakthrough: { grantLabel: "Acknowledge", approvedLabel: "Acknowledged", primaryKey: "participant_first_name" },
};

interface Props {
  module: ModuleKey;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function ModulePage({ module, searchParams }: Props) {
  const me = await requireUser();
  const sp = await searchParams;
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "archived" ? "archived" : "active";
  const def = MODULES[module];
  const ui = MODULE_UI[module];

  const [rows, requestFields, adminFieldsLive, products, requestFieldsRaw, adminFieldsRaw] = await Promise.all([
    listModuleSubmissions({ module, employeeId: me.id, isAdmin: me.isAdmin, archived: view === "archived" }),
    resolveRequestFields(module),
    resolveAdminFields(module),
    getProductOptions(),
    resolveFields(requestKey(module), def.requestFields),
    resolveFields(adminKey(module), def.adminFields),
  ]);

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const tab = (active: boolean) =>
    `px-4 py-2 text-[13.5px] font-bold transition-colors ${active ? "text-white" : "text-ink-soft"}`;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto max-w-[900px] px-8 max-md:px-4 pt-8 pb-16">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-display-lg text-ink-strong">{def.title}</h1>
            <p className="text-body-lg text-ink-subtle mt-1">
              {view === "archived"
                ? "Archived — restore or delete from the ⋯ menu."
                : me.isAdmin
                  ? `${pendingCount} pending review.`
                  : def.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {me.isAdmin && (
              <>
                <FormEditorDialog formKey={requestKey(module)} formName={`${def.title} — request`} fields={requestFieldsRaw} />
                <FormEditorDialog formKey={adminKey(module)} formName={`${def.title} — admin fields`} fields={adminFieldsRaw} />
              </>
            )}
            <DynamicFormDialog
              module={module}
              title={def.title}
              buttonLabel={def.buttonLabel}
              fields={requestFields}
              productOptions={products}
              isAdmin={me.isAdmin}
            />
          </div>
        </header>

        <div className="mb-5 inline-flex rounded-full border border-hairline bg-surface-card overflow-hidden">
          <Link href={def.path as Route} className={tab(view === "active")} style={{ background: view === "active" ? "var(--color-altus-red)" : "transparent" }}>Active</Link>
          <Link href={`${def.path}?view=archived` as Route} className={tab(view === "archived")} style={{ background: view === "archived" ? "var(--color-altus-red)" : "transparent" }}>Archived</Link>
        </div>

        <ModuleList
          rows={rows}
          isAdmin={me.isAdmin}
          requestFields={requestFields}
          adminFields={adminFieldsLive}
          productOptions={products}
          grantLabel={ui.grantLabel}
          approvedLabel={ui.approvedLabel}
          primaryKey={ui.primaryKey}
          view={view}
        />
      </main>
      <DashboardFooter />
    </>
  );
}
