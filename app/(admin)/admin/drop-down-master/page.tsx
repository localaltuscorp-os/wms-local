import Link from "next/link";
import { ChevronRight, ListFilter } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { ADMIN_PANEL_ENTRY, MODULE_THEME } from "@/lib/module-theme";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { DROP_DOWN_MASTER_MODULES, dropDownMasterModule } from "@/lib/admin/drop-down-master";

export const dynamic = "force-dynamic";

export default async function DropDownMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const selectedId = Array.isArray(params.module) ? params.module[0] : params.module;
  const selected = dropDownMasterModule(selectedId);

  return (
    <>
      <PageCommandBar title="Drop Down Master" />

      <section aria-label="Drop Down Master modules" className="grid grid-cols-6 gap-3 max-2xl:grid-cols-4 max-xl:grid-cols-3 max-md:grid-cols-2">
        {DROP_DOWN_MASTER_MODULES.map((module) => {
          const theme = module.workspaceId ? MODULE_THEME[module.workspaceId] : ADMIN_PANEL_ENTRY;
          const Icon = theme.Icon;
          const active = selected?.id === module.id;
          return (
            <Link
              key={module.id}
              href={`/admin/drop-down-master?module=${module.id}`}
              className="group flex min-h-[84px] flex-col justify-between rounded-xl border px-3 py-3 transition-colors hover:bg-surface-soft"
              style={{
                borderColor: active ? theme.accent : "var(--color-hairline)",
                boxShadow: active ? `inset 3px 0 0 ${theme.accent}` : undefined,
              }}
            >
              <Icon size={17} strokeWidth={2.3} style={{ color: theme.accentDeep }} />
              <span className="text-[13px] font-bold text-ink-strong">{module.label}</span>
              <span className="text-[11px] font-medium text-ink-subtle">{module.entries.length} {module.entries.length === 1 ? "dropdown" : "dropdowns"}</span>
            </Link>
          );
        })}
      </section>

      {selected && (
        <section className="mt-4 overflow-hidden rounded-xl border border-hairline bg-surface-card">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <ListFilter size={16} strokeWidth={2.3} style={{ color: selected.workspaceId ? MODULE_THEME[selected.workspaceId].accentDeep : ADMIN_PANEL_ENTRY.accentDeep }} />
            <h2 className="text-[15px] font-bold text-ink-strong">{selected.label}</h2>
          </div>
          <div className="divide-y divide-hairline">
            {selected.entries.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="flex items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
              >
                {entry.label}
                <ChevronRight size={16} className="shrink-0 text-ink-subtle" strokeWidth={2.4} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
