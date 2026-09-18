"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { localDateString } from "@/lib/format";
import { canEditPastDccEntries } from "@/lib/security/capabilities";
import { checkDccEntryWindow } from "@/lib/dcc/entry-lock";
import { loadDccScope, canFillFor } from "@/lib/dcc/access";
import { emptyCounts, isSp1Disposition } from "@/lib/dcc/sp1";
import { isMissingSp1Table, saveSp1Day } from "@/lib/queries/dcc-sp1";

/**
 * Saving a day of call outcomes (DCC-SPEC §7).
 *
 * THE SAME TWO GATES AS A COMPLIANCE ENTRY, deliberately: the call log is part
 * of the day's record, so it closes at 11:59 pm IST with everything else, and
 * only `dcc.edit_past_entries` reaches back. Letting it stay open longer would
 * make "yesterday" mean two different things on two screens of one module.
 */

const Input = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counts: z.record(z.string(), z.number().int().min(0).max(100_000)),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveCallLog(raw: z.input<typeof Input>): Promise<SaveResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That didn't look like a day of call counts." };
  const { employeeId, date, counts } = parsed.data;

  // WHOSE day may you fill — yourself, your downline, or anyone as a super-admin.
  const scope = await loadDccScope(me);
  if (!canFillFor(scope, employeeId)) {
    return { ok: false, error: "You can't fill the call log for this person." };
  }

  const window = checkDccEntryWindow({
    date,
    today: localDateString("Asia/Kolkata"),
    canEditPast: canEditPastDccEntries(me.email),
  });
  if (!window.ok) return { ok: false, error: window.error };

  /* REBUILT FROM THE VOCABULARY, not trusted from the client. An unknown key is
     dropped and a missing one becomes zero, so the fifteen rows written are
     always exactly the fifteen rows that exist — a client that sends a
     sixteenth cannot invent a row, and one that omits a cleared cell cannot
     leave yesterday's number standing. */
  const clean = emptyCounts();
  for (const [k, v] of Object.entries(counts)) {
    if (isSp1Disposition(k)) clean[k] = Math.max(0, Math.trunc(v));
  }

  try {
    await saveSp1Day({ employeeId, date, counts: clean, filledById: me.id });
  } catch (e) {
    if (isMissingSp1Table(e)) {
      return {
        ok: false,
        error: "The call log table isn't in this database yet — migration 0235 must be applied.",
      };
    }
    throw e;
  }

  // ONE PATH, because there is only one screen: the sheet on the dashboard is
  // both where the number is typed and where it is read back.
  revalidatePath("/dcc/dashboard");
  return { ok: true };
}
