import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { getAmbassador, listAmbProducts } from "@/lib/queries/ambassadors";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { AmbassadorForm } from "@/components/ambassadors/ambassador-form";

export const dynamic = "force-dynamic";

export default async function EditAmbassadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWorkspace("sales");
  const { id } = await params;

  const [detail, products, employees] = await Promise.all([
    getAmbassador(id),
    listAmbProducts(),
    listEmployeeOptions(),
  ]);
  if (!detail) notFound();

  const a = detail.ambassador;
  const initial = {
    id: a.id,
    name: a.name,
    company: a.company,
    email: a.email,
    phone: a.phone,
    photoUrl: a.photoUrl,
    ownerId: a.ownerId,
    status: a.status,
    payoutType: a.payoutType,
    payoutValue: a.payoutValue,
    payoutTermsNotes: a.payoutTermsNotes,
    monthlyTarget: a.monthlyTarget,
    monthlyTargetCount: a.monthlyTargetCount,
    joinedOn: a.joinedOn,
    source: a.source,
    productIds: detail.products.map((p) => p.id),
  };

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
        <div className="mx-auto w-full max-w-[1100px]">
          <Link
            href={`/ambassadors/${a.id}` as Route}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft hover:text-altus-red"
          >
            <ArrowLeft size={15} strokeWidth={2.4} />
            {a.name}
          </Link>
          <header className="mt-3 mb-6">
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px, 3vw, 40px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.04,
              }}
            >
              Edit Ambassador
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5 }}>
              Update {a.name}&rsquo;s details and commission terms.
            </p>
          </header>

          <AmbassadorForm mode="edit" initial={initial} products={products} employees={employees} />
        </div>
      </main>
    </>
  );
}
