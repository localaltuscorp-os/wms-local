import { requireAdmin } from "@/lib/auth/current";
import { listClientsWithCounts } from "@/lib/queries/clients";
import { ClientList } from "@/components/admin/client-list";
import { CreateClientDialog } from "@/components/admin/create-client-dialog";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireAdmin();
  const rows = await listClientsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalTasks = rows.reduce((sum, r) => sum + r.taskCount, 0);

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold">
            Admin · Clients
          </div>
          <h1
            className="mt-1 text-ink-strong"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Clients
          </h1>
          <p className="text-body-lg text-ink-subtle mt-2 max-w-2xl tabular-nums">
            {rows.length} total · {activeCount} active · {totalTasks} tasks mapped
          </p>
        </div>
        <div className="mt-1">
          <CreateClientDialog />
        </div>
      </header>
      <ClientList clients={rows} />
    </div>
  );
}
