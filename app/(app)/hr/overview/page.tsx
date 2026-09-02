import {
  ClipboardList,
  FileSignature,
  FolderLock,
  ScrollText,
  Mail,
  PartyPopper,
  LifeBuoy,
} from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireHrStaff } from "@/lib/hr/access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { HR_STAGES } from "@/lib/hr/lifecycle";
import { HrPageHeader, HrCard, type HrCardDef } from "@/components/hr/hr-chrome";

export const dynamic = "force-dynamic";

/**
 * HR Overview — the flat index: every lifecycle stage (incl. Exit) plus the
 * cross-cutting surfaces that don't belong to one stage (HR Record, Dossier,
 * Agreements, Letters, Policies, Holiday List, Help Desk).
 */
export default async function HrOverviewPage() {
  const me = await requireHrStaff();
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  const stageCards: HrCardDef[] = HR_STAGES.map((s) => ({
    slug: `/hr/${s.slug}`,
    title: s.title,
    blurb: s.blurb,
    Icon: s.Icon,
    soon: s.items.every((it) => it.kind === "screen"),
  }));

  const surfaceCards: HrCardDef[] = [
    ...(isAdmin
      ? [{
          slug: "/attendance/hr-record",
          title: "HR Record",
          blurb: "The master attendance & paid-leave log.",
          Icon: ClipboardList,
        } as HrCardDef]
      : []),
    { slug: "/dossier", title: "Dossier", blurb: "Every person's complete document file.", Icon: FolderLock },
    { slug: "/agreements", title: "Agreements", blurb: "Issue, sign and archive employee agreements digitally.", Icon: FileSignature },
    { slug: "/hr/letters", title: "Letters", blurb: "Every letter on the Altus letterhead — editable red fields, export or issue.", Icon: Mail },
    { slug: "/policies", title: "Policies", blurb: "The company handbook — every policy in one place.", Icon: ScrollText },
    { slug: "/holidays", title: "Holiday List", blurb: "The official holiday calendar for the year.", Icon: PartyPopper },
    { slug: "/support", title: "Help Desk", blurb: "Questions, requests and escalations to the HR desk.", Icon: LifeBuoy },
  ];

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <HrPageHeader
          title="HR Overview"
          subtitle="Every HR surface in one index — the five lifecycle stages and the cross-cutting record, document and support surfaces."
        />

        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-soft">Lifecycle stages</h2>
        <section className="grid gap-4 max-md:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {stageCards.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={i * 40} />
          ))}
        </section>

        <h2 className="mb-3 mt-9 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-soft">Records &amp; documents</h2>
        <section className="grid gap-4 max-md:gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {surfaceCards.map((c, i) => (
            <HrCard key={c.slug} card={c} delay={i * 40} />
          ))}
        </section>
      </PageShell>
    </>
  );
}
