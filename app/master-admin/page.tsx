import Link from "next/link";
import type { Route } from "next";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { getSignedInEmployee } from "@/lib/auth/current";
import { isMasterAdmin } from "@/lib/security/capabilities";
import { storedOverridesFor } from "@/lib/permissions/resolve";
import { allPermissionNodes } from "@/lib/permissions/catalog";
import { PageShell } from "@/components/layout/page-shell";
import {
  PermissionMatrix,
  type MatrixPerson,
} from "@/components/admin/permission-matrix";

/**
 * MASTER ADMIN — the permission matrix.
 *
 * Authorization is the LAYOUT's job (and every action re-checks it); this page
 * assembles the data. It is reached from the avatar menu, not from a nav rail:
 * two people use it, and a rail entry that is invisible to everybody else is a
 * rail entry that mostly exists to be explained.
 */
export const dynamic = "force-dynamic";

export default async function MasterAdminPage() {
  // The layout has already refused anybody without `master_admin.manage`, so
  // this resolution is for the initial selection, not for a gate.
  const me = await getSignedInEmployee();

  const roster = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      accountType: employees.accountType,
    })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  const people: MatrixPerson[] = roster
    .filter((r) => r.accountType === "employee")
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      isMasterAdmin: isMasterAdmin(r.email),
    }));

  // Open on the first person the matrix can actually govern, so the page shows
  // something useful rather than an empty selector. A master admin is skipped —
  // they are exempt, so their matrix is inert.
  const first = people.find((p) => !p.isMasterAdmin) ?? null;
  const initialOverrides: Record<string, { show: boolean; view: boolean; edit: boolean }> = {};
  if (first) {
    for (const [key, v] of await storedOverridesFor(first.id)) {
      initialOverrides[key] = { show: v.canShow, view: v.canView, edit: v.canEdit };
    }
  }

  const nodes = allPermissionNodes();
  const moduleCount = nodes.filter((n) => n.depth === 1).length;
  const subCount = nodes.filter((n) => n.depth === 2).length;
  const subSubCount = nodes.filter((n) => n.depth === 3).length;

  return (
    <PageShell width="wide">
      <header className="mb-6">
        {/*
          A WAY BACK.

          This route deliberately sits OUTSIDE the `(app)` group, so it renders
          without the sidebar, top bar and module footer — and therefore without
          any navigation at all. Being outside is the point: the `(app)` layout
          carries the compulsory daily-ritual gate chain, and a recovery tool for
          the permission system must not be unreachable because somebody has not
          filled in their daily goals yet. So the link is explicit.
        */}
        <Link
          href={"/hub" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A]"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Back to the app
        </Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
          Master Admin
        </p>
        <h1
          className="mt-1 text-[30px] leading-tight text-[#0F172A]"
          style={{ fontFamily: "var(--font-serif), system-ui, sans-serif", letterSpacing: "-0.02em" }}
        >
          Module permissions
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] text-[#64748B]" style={{ lineHeight: 1.6 }}>
          Decide who can see, read and change each module, sub-module and
          sub-sub-module. The tree below is generated from the application&apos;s
          real routes, so every switch here corresponds to something the server
          actually enforces.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-[#64748B]">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#334155]">
            <ShieldCheck size={14} strokeWidth={2.2} />
            {me?.name ?? "You"}
          </span>
          <span>{moduleCount} modules</span>
          <span>{subCount} sub-modules</span>
          <span>{subSubCount} sub-sub-modules</span>
        </div>
      </header>

      <PermissionMatrix
        people={people}
        initialPersonId={first?.id ?? null}
        initialOverrides={initialOverrides}
      />
    </PageShell>
  );
}
