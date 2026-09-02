import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listRoutes, listAssignableHandlers } from "@/lib/queries/hr-support";
import { HR_TICKET_CATEGORIES, HR_TICKET_CATEGORY_LABELS } from "@/db/enums";
import { RoutingEditor } from "@/components/hr/routing/routing-editor";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const me = await requireHrStaff();
  if (!hrSupportEnabled()) notFound();
  if (!me.isAdmin && !isSuperAdmin(me.email)) redirect("/hr");

  const [routes, handlers] = await Promise.all([listRoutes(), listAssignableHandlers()]);
  const routeByCat = new Map(routes.map((r) => [r.category, r]));

  const rows = HR_TICKET_CATEGORIES.map((category) => {
    const existing = routeByCat.get(category);
    return {
      category,
      label: HR_TICKET_CATEGORY_LABELS[category],
      ownerId: existing?.ownerId ?? null,
      ownerName: existing?.ownerName ?? null,
      isActive: existing?.isActive ?? true,
    };
  });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="narrow" style={{ maxWidth: "820px" }}>
        <Link
          href={"/hr" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition hover:text-ink-strong"
        >
          <ArrowLeft size={15} /> Back to HR
        </Link>
        <header className="mb-6">
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,3vw,34px)", letterSpacing: "-0.02em" }}
          >
            Ticket routing
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[13.5px] font-medium text-ink-muted">
            Choose who owns each category of HR request. New tickets auto-route to
            the owner here. Leave an owner blank to fall back to super-admins, so
            no request is ever born unowned.
          </p>
        </header>
        <RoutingEditor rows={rows} handlers={handlers} />
      </PageShell>
    </>
  );
}
