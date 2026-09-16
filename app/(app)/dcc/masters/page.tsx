import Link from "next/link";
import type { Route } from "next";
import { TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isProtectedDccKpiAuthor } from "@/lib/security/capabilities";
import { loadDccScope, canManageItemsFor } from "@/lib/dcc/access";
import { loadDccMasterData } from "@/lib/queries/dcc-masters";
import { loadMasterLinksForItems } from "@/lib/dcc/master-sync";
import { listOwnerItems } from "@/lib/queries/dcc";
import { PositionMaster } from "@/components/dcc/masters/position-master";
import { PersonDcc, type PersonDccRow } from "@/components/dcc/masters/person-dcc";
import { DccPersonPicker, type PickerPerson } from "@/components/dcc/masters/dcc-person-picker";

export const dynamic = "force-dynamic";

/**
 * EMPLOYEES → DCC → DCC MASTERS (DCC-SPEC §3, §4).
 *
 * Two tabs, mirroring the Job Description module exactly:
 *   · BY POSITION — the template a seat carries, applied to every holder.
 *   · BY PERSON   — one person's whole DCC, in three groups.
 *
 * They are TABS on one page rather than two rail entries because they are two
 * views of one thing: a person's DCC is their position's template plus what was
 * added on top, and the author moves between them constantly while building it.
 */
export default async function DccMastersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; person?: string }>;
}) {
  const me = await requireUser();
  const [sp, scope, master] = await Promise.all([
    searchParams,
    loadDccScope(me),
    loadDccMasterData(),
  ]);

  const tab = sp.tab === "person" ? "person" : "position";
  const isAdmin = me.isAdmin || isSuperAdmin(me.email);

  // Only people this viewer may actually see. A Team Lead picks from their own
  // downline; a super-admin from everyone.
  const visible = master.employees.filter((e) => scope.visibleIds.has(e.id));
  const designationName = new Map(master.designations.map((d) => [d.id, d.name]));

  return (
    <PageShell width="wide">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">DCC Masters</h1>
          <p className="text-[13px] text-ink-muted">
            The template a position carries, and one person&apos;s whole Daily Compliance.
          </p>
        </div>
        <nav aria-label="View" className="flex items-center gap-1.5">
          <TabLink href={"/dcc/masters" as Route} active={tab === "position"}>
            By Position
          </TabLink>
          <TabLink href={"/dcc/masters?tab=person" as Route} active={tab === "person"}>
            By Person
          </TabLink>
        </nav>
      </header>

      {master.missing && (
        <p
          className="mb-3 flex items-start gap-2 rounded-xl px-4 py-3 text-[13px]"
          style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            DCC Masters aren&apos;t set up in this database yet — migration{" "}
            <code className="font-mono">0230_dcc_master_items.sql</code> has not been applied.
            Positions and people are listed below, but a template can&apos;t be saved until it is.
          </span>
        </p>
      )}

      {tab === "position" ? (
        <PositionMaster
          designations={master.designations}
          items={master.items}
          missing={master.missing}
          canEdit={isAdmin}
        />
      ) : (
        <PersonTab
          meId={me.id}
          meEmail={me.email}
          visible={visible}
          designationName={designationName}
          scopeCanEdit={(id: string) => canManageItemsFor(scope, id)}
          personId={sp.person ?? null}
        />
      )}
    </PageShell>
  );
}

/**
 * The By Person tab. A server component so the three groups and the author of
 * every row are resolved on the server — the delete guardrail is decided from
 * the author's EMAIL, which must never be shipped to the browser to be checked.
 */
async function PersonTab({
  meId,
  meEmail,
  visible,
  designationName,
  scopeCanEdit,
  personId,
}: {
  meId: string;
  meEmail: string | null;
  visible: { id: string; name: string; designationId: string | null }[];
  designationName: Map<string, string>;
  scopeCanEdit: (id: string) => boolean;
  personId: string | null;
}) {
  // Default to yourself — the person most likely to be looked at, and the one
  // page that is never empty.
  const chosen = personId && visible.some((v) => v.id === personId) ? personId : meId;
  const person = visible.find((v) => v.id === chosen) ?? null;

  const items = person ? await listOwnerItems(person.id) : [];
  const masters = await loadMasterLinksForItems(items.map((i) => i.id)).catch(
    () => new Map<string, string>(),
  );

  /* Counts for the dropdown come from ONE query, not one per person: a roster of
     200 would otherwise be 200 round trips to render a menu. The count shown is
     the person's own item count where we have it and 0 otherwise, which is
     honest — the picker is for choosing, not for reporting. */
  const people: PickerPerson[] = visible.map((v) => ({
    id: v.id,
    name: v.name,
    designation: v.designationId ? (designationName.get(v.designationId) ?? null) : null,
    count: v.id === chosen ? items.length : 0,
  }));

  const rows: PersonDccRow[] = items.map((it) => ({
    id: it.id,
    title: it.title,
    section: it.section,
    code: it.code,
    frequency: it.frequency,
    targetNumber: it.targetNumber,
    unit: it.unit,
    masterDesignation: masters.get(it.id) ?? null,
    authorName: it.createdByEmail ?? null,
    // Decided HERE, on the server, from the author's email. The browser never
    // sees the address, only the verdict.
    deleteLocked:
      isProtectedDccKpiAuthor(it.createdByEmail) && !isProtectedDccKpiAuthor(meEmail),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[16px] font-bold text-ink-strong">Person-specific DCC</h2>
        <DccPersonPicker people={people} selectedId={chosen} />
        {person && (
          <p className="text-[12.5px] text-ink-muted">
            {rows.length} compliance{rows.length === 1 ? "" : "s"} in total.
          </p>
        )}
      </div>

      {person ? (
        <PersonDcc
          personId={person.id}
          personName={person.name}
          rows={rows}
          canEdit={scopeCanEdit(person.id)}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-[13px] text-ink-muted">
          Pick a person to see their Daily Compliance.
        </p>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: Route;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
        active ? "text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
      style={active ? { background: "var(--color-altus-red)" } : undefined}
    >
      {children}
    </Link>
  );
}
