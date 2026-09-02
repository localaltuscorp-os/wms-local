import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { getHrStage, hrItemHref } from "@/lib/hr/lifecycle";
import { HrPageHeader, HrCard, type HrCardDef } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * A lifecycle stage sub-hub — its own sidebar (main-nav HR_SECTION_NAV) plus a
 * card grid of the stage's surfaces. Every card + rail item is driven by the
 * single lifecycle source (lib/hr/lifecycle.ts).
 */
export default async function HrStagePage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  await requireHrStaff();
  const { stage } = await params;
  const st = getHrStage(stage);
  if (!st) notFound();

  const cards: HrCardDef[] = st.items.map((it) => ({
    slug: hrItemHref(st.slug, it),
    title: it.label,
    blurb: it.blurb,
    Icon: it.Icon,
    soon: it.kind === "screen",
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <HrPageHeader title={st.title} subtitle={st.blurb} />
        <section
          className="grid gap-4 max-md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
        >
          {cards.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={i * 40} />
          ))}
        </section>
      </PageShell>
    </>
  );
}
