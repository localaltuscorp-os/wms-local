"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Plus, Settings2 } from "lucide-react";
import { addDccItem } from "@/app/(app)/dcc/actions";
import {
  ComplianceForm,
  emptyDraft,
  type ComplianceDraft,
} from "@/components/dcc/compliance-form";

/**
 * "GIVE MYSELF A COMPLIANCE", ON THE SCREEN I ALREADY OPEN EVERY DAY.
 *
 * Authoring your own DCC was possible before this — but only at
 * `/dcc/masters` → By Person → find yourself in a dropdown, which is three
 * moves from My Day and reads like an administrator's screen. The people most
 * likely to want one more compliance are the ones standing here looking at
 * today's list, so the door is here too.
 *
 * ── WHY IT IS A BUTTON AND NOT A SECOND LIST ───────────────────────────────
 * It deliberately does NOT repeat the "manage my compliances" list that DCC
 * Masters already shows. Two lists of one thing is exactly what the rest of this
 * module has spent the week removing. One create button, one link to the full
 * manager — and the form is the SAME component both screens use, so a field
 * added there appears here without anybody remembering to.
 *
 * `meId` is passed in from the session on the server. The component offers no
 * "whose compliance is this" control at all, and the action re-checks:
 * `canManageItemsFor` lets anybody author their own, so this needs no privilege
 * and cannot reach anybody else's list even if the id were tampered with.
 */
export function NewCompliance({ meId, today }: { meId: string; today: string }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ComplianceDraft>(emptyDraft);
  const [busy, startWork] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    setError(null);
    startWork(async () => {
      const res = await addDccItem({
        ownerEmployeeId: meId,
        title: draft.title,
        section: draft.section,
        code: draft.code,
        schedule: draft.schedule,
        targetNumber: draft.targetNumber,
        unit: draft.unit,
      });
      if (!res.ok) setError(res.error);
      else {
        setOpen(false);
        setDraft(emptyDraft());
      }
    });
  }

  if (open) {
    return (
      <div className="mt-4">
        <ComplianceForm
          draft={draft}
          onChange={setDraft}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
          busy={busy}
          error={error}
          today={today}
          submitLabel="Add it to my day"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> New compliance for myself
      </button>
      <Link
        href={"/dcc/masters?tab=person" as Route}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-slate-500 hover:bg-slate-100"
      >
        <Settings2 className="h-4 w-4" aria-hidden /> Manage all of mine
      </Link>
      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
