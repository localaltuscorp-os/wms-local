import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { getHrStage, getHrItem } from "@/lib/hr/lifecycle";
import { HrPageHeader, HrPlanned } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * A single lifecycle-stage surface. "link" items redirect to their existing
 * module; "doc" items redirect to the letter's own page (`/hr/letters/<key>`)
 * where it opens on the Altus letterhead; "screen" items show a planned
 * placeholder.
 */
export default async function HrStageItemPage({
  params,
}: {
  params: Promise<{ stage: string; item: string }>;
}) {
  await requireHrStaff();
  const { stage, item } = await params;
  const st = getHrStage(stage);
  const it = getHrItem(stage, item);
  if (!st || !it) notFound();

  // Link items have no page of their own — bounce to the real module.
  if (it.kind === "link" && it.href) redirect(it.href as Route);

  // Doc items now open as their own full-screen letter page.
  if (it.kind === "doc" && it.typeKey) redirect(`/hr/letters/${it.typeKey}` as Route);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <HrPageHeader
          title={`${st.title} · ${it.label}`}
          subtitle={it.blurb}
          backHref={`/hr/${st.slug}`}
        />
        <HrPlanned title={it.label} />
      </PageShell>
    </>
  );
}
