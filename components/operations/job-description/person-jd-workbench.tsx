"use client";

import * as React from "react";
import { UserRound } from "lucide-react";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { JdBank } from "@/components/operations/job-description/jd-bank";
import {
  JdPersonPicker,
  rememberPersonInUrl,
} from "@/components/operations/job-description/jd-person-picker";
import { buildPersonIndex } from "@/lib/jd/person-index";
import type { JdEntryRow, JdEventOption, JdPositionRow, JdRankRow } from "@/lib/queries/job-description";
import type { SeatHolder } from "@/components/operations/job-description/jd-detail";
import type { JdRosters } from "@/components/operations/job-description/jd-rosters";

/**
 * OPERATIONS → MASTERS → Person-specific JD, as one client island.
 *
 * It exists ONLY to put the person picker beside the page heading (account
 * holder, 2026-09-16). The heading is rendered by MastersHeader, the JD by
 * JdBank, and they are siblings — so whichever of them owns "who is chosen"
 * cannot tell the other. This owns it and hands it to both.
 *
 * The page itself stays a server component and still does all the loading; this
 * receives rows, not queries.
 */
export function PersonJdWorkbench({
  entries,
  positions,
  ranks,
  people,
  holders,
  events = [],
  rosters,
  initialPersonId,
}: {
  entries: JdEntryRow[];
  positions: JdPositionRow[];
  ranks: JdRankRow[];
  people: { id: string; name: string }[];
  holders: SeatHolder[];
  events?: JdEventOption[];
  rosters?: JdRosters;
  initialPersonId: string | null;
}) {
  const [personId, setPersonId] = React.useState(() =>
    initialPersonId && people.some((p) => p.id === initialPersonId)
      ? initialPersonId
      : (people[0]?.id ?? ""),
  );

  const index = React.useMemo(() => buildPersonIndex(entries, holders), [entries, holders]);
  const positionTitle = React.useMemo(
    () => new Map(positions.map((p) => [p.id, p.title])),
    [positions],
  );

  const choose = React.useCallback((id: string) => {
    setPersonId(id);
    rememberPersonInUrl(id);
  }, []);

  return (
    <>
      <MastersHeader
        Icon={UserRound}
        topic="Job Description"
        title="JD-Specific Person"
        description="One person's whole Job Description — their seat's tasks, tasks given to them by name, and tasks written for them alone."
        actions={
          people.length > 0 ? (
            <JdPersonPicker
              people={people}
              personId={personId}
              onChange={choose}
              index={index}
              positionTitle={positionTitle}
            />
          ) : undefined
        }
      />
      <JdBank
        entries={entries}
        positions={positions}
        ranks={ranks}
        people={people}
        holders={holders}
        events={events}
        rosters={rosters}
        mode="person"
        personId={personId}
        onPersonChange={choose}
      />
    </>
  );
}
