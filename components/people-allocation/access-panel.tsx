"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AccessDialog } from "@/components/people-allocation/access-dialog";
import { BulkAddDialog } from "@/components/people-allocation/bulk-add-dialog";
import type { AccessActivity, Participant } from "@/lib/queries/people-allocation";

/**
 * HAND-HOLDING › ADMIN PANEL — the Access / Permissions surface, inline.
 *
 * Renders the SAME component the Hand-holding page opens as a modal, in its
 * page variant. One implementation, so the panel and the dialog cannot drift:
 * a change to the role tabs, the fields or the activity table lands on both.
 *
 * What a page adds over a modal: its Close goes back to the room rather than
 * dismissing an overlay, and it owns the two Bulk Add buttons.
 */
export function AccessPanel({
  canEdit,
  activity,
  participants,
}: {
  canEdit: boolean;
  activity: AccessActivity[];
  /** Existing participants — so Bulk Add can grey out anyone already on a product. */
  participants: Participant[];
}) {
  const router = useRouter();
  const [bulkSection, setBulkSection] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  /** "kind:name" of everyone already on the product being bulk-added. */
  const alreadyOn = React.useMemo(() => {
    if (!bulkSection) return new Set<string>();
    return new Set(
      participants
        .filter((p) => p.section === bulkSection)
        .map((p) => `${p.ownerKind === "intern" ? "intern" : "employee"}:${p.name}`),
    );
  }, [participants, bulkSection]);

  return (
    <>
      {note && (
        <p
          role="status"
          className="mb-4 rounded-xl px-4 py-3 text-[13.5px] font-bold"
          style={{
            background: "color-mix(in srgb, #16a34a 9%, transparent)",
            color: "#15803d",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, #16a34a 28%, transparent)",
          }}
        >
          {note}
        </p>
      )}

      <AccessDialog
        variant="page"
        canEdit={canEdit}
        activity={activity}
        onBulkAdd={(section) => {
          setNote(null);
          setBulkSection(section);
        }}
        // Close and Cancel both leave the panel; there is no overlay to dismiss.
        onClose={() => router.push("/people-allocation")}
      />

      {bulkSection && (
        <BulkAddDialog
          section={bulkSection}
          alreadyOn={alreadyOn}
          onClose={() => setBulkSection(null)}
          onDone={(summary) => {
            setBulkSection(null);
            setNote(summary);
            // The rows are written; pull the server's fresh copy so the
            // participant tables show them without a manual reload.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
