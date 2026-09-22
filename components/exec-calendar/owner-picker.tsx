"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";

/**
 * Whose calendar to read (§5, team view).
 *
 * A plain select that navigates, so the choice lands in the URL and the page
 * re-reads on the server — which is the only place the masking can safely
 * happen. Choosing a colleague here never reveals more than they published: the
 * rows are filtered in `maskAll` before they are serialised.
 *
 * Your own name is pinned to the top and labelled, because the common case is
 * coming back to your own week.
 */
export function ExecOwnerPicker({
  owners,
  ownerId,
  meId,
  view,
  day,
}: {
  owners: { id: string; name: string }[];
  ownerId: string;
  meId: string;
  view: string;
  day: string;
}) {
  const router = useRouter();
  const mine = owners.find((o) => o.id === meId);
  const others = owners.filter((o) => o.id !== meId);

  return (
    <select
      aria-label="Whose calendar"
      value={ownerId}
      onChange={(e) => {
        const next = e.target.value;
        const own = next === meId ? "" : `&owner=${next}`;
        router.push(`/events?view=${view}&day=${day}${own}` as Route);
      }}
      className="w-[190px] appearance-none rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 !pr-9 text-[12.5px] font-semibold text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]"
    >
      {mine && <option value={mine.id}>{mine.name} (me)</option>}
      {others.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
