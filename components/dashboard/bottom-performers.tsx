"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight, TrendingDown } from "lucide-react";
import type { RankedPunctualityPerson } from "@/lib/types";
import { TOP_PERFORMER_RANKS } from "@/lib/transforms/performer-split";
import { useSectionSearch, matchesSearch } from "@/lib/client/section-search";
import { Avatar } from "@/components/ui/avatar";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import {
  CollapseToggle,
  CollapsibleBody,
  DASHBOARD_CARD_PADDED,
  SectionSearchBox,
} from "@/components/dashboard/section-chrome";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import type { SectionReport } from "@/lib/reports/section-report";
import { useCountUp } from "@/lib/use-count-up";
import { PerformerTaskDrawer } from "@/components/dashboard/performer-task-drawer";

/**
 * BOTTOM PERFORMERS — the mirror of Top Performers, for the people whose
 * delivery is slipping.
 *
 * ── WHY THIS READS FROM PUNCTUALITY, NOT FROM TopPerformer ───────────────
 * The obvious move is to take the Top Performers list and read it upside down.
 * That would be wrong: `TopPerformer` is ordered by COMPLETION COUNT, so its
 * tail is "people who finished the fewest tasks" — which catches anyone on
 * leave, anyone new, and anyone whose work is simply larger per item. None of
 * those is a performance problem.
 *
 * `PunctualityPerson` measures the thing this card claims to: of the dated work
 * a person actually delivered, how much landed late and by how far. Someone who
 * closed four tasks and was late on none does not belong here; someone who
 * closed forty and was late on thirty does.
 *
 * ── WHY VOLUME RANKS THE LIST BUT DOES NOT SELECT IT ─────────────────────
 * Rows are ordered by TOTAL TASKS ASCENDING, so the card answers "who is
 * getting the least done" rather than "whose percentage is worst" — a
 * 100%-late person with three tasks is exactly who this card is now for.
 *
 * THE DIRECTION INVERTED when the card became "People To Pull Up" (it read
 * "Bottom Performers" and ran heaviest-first). Note what that changes: `.sort`
 * is followed by `.slice(0, DEPTH)`, so flipping the comparator does not merely
 * reorder ten rows — it selects a DIFFERENT ten people. This card used to show
 * the ten busiest people carrying late work; it now shows the ten least
 * productive ones. That is the intent of the rename, and it is worth knowing
 * that the two lists may not overlap at all.
 *
 * The filter is what keeps that honest. Membership is still earned by having
 * late work at all (`late > 0`), so ordering by volume cannot promote a quiet,
 * punctual person onto a card about slippage. Selection is about lateness;
 * ordering is about output. Drop the filter and this becomes a list of people
 * whose only crime is a light week.
 *
 * MIN_SAMPLE MATTERS MORE IN THIS DIRECTION, not less. It exists because a
 * small sample makes a meaningless rate, and ascending order now points the
 * card straight at the smallest samples that clear it — the top rows will
 * routinely be people with three or four completions. That is intended (three
 * completions plus late work IS someone to pull up), but it means the floor is
 * now load-bearing: lower it and the card fills with noise.
 *
 * ── AND WHY IT ONLY LOOKS LIKE "Overdue by Person" ───────────────────────
 * That table is the analytical view: every person, every bucket, sortable,
 * paged. This is a LEADERBOARD — the handful worth a conversation, in the same
 * card shape as its opposite number so the pair reads as one idea.
 */

/** How tall the right column gets before it scrolls — level with the three
 *  featured cards beside it. Replaces the old depth cap. */
const LIST_MAX_H = "max-h-[520px]";
/** Below this, the on-time rate is rendered as a solid alarm rather than a tint. */
const CRITICAL_RATE = 50;
/* THE TWO ELIGIBILITY GATES ARE GONE, deliberately, and it changes what this
   card means.

   It used to admit only people with `late > 0` AND at least three dated
   completions. Both had defensible reasons — a 0% rate off two tasks is noise,
   and ordering by volume without a lateness gate promotes a quiet, punctual
   person onto a card about slippage. But the sample floor is what made the
   board demonstrably WRONG: the person with two completions — the lowest
   volume in the org, visible at the bottom of Top Performers — was excluded
   from the one card that ranks by lowest volume. A gate that hides the exact
   row the card exists to surface is not protecting anyone.

   So this is now every person, ordered least-done-first, and the subtitle says
   that rather than claiming a lateness filter that no longer runs. The cost is
   real and worth stating: someone with a light, punctual week now appears near
   the top. The on-time rate and the late count are both on every row, so that
   is readable rather than hidden — but it does mean rank 1 is "did the least",
   not "is in the most trouble". */

/** Ranks 1-3, as full cards down the left column. */
const FEATURED_COUNT = 3;

/**
 * The badge each featured rank carries — the inverse of Top Performers' PODIUM
 * map, and deliberately the same SHAPE so the two sections stay editable
 * together.
 *
 * Rank 1 is the only one that gets the warning mark. Two more warning icons
 * under it would say all three are equally urgent, which is the opposite of
 * what a ranked list is for.
 */
/* ONE ACCENT, ON RANK 1 ONLY. Ranks 2 and 3 were rose-tinted too, and at -50
   and -100 that wash read as decoration rather than as ranking — three chips
   competing to be the warning, while the seven neutral rows on the right made
   the left column look like a different card. Rank 1 keeps its mark and its
   rose ring; the other two are slate, exactly like Top Performers' silver and
   bronze are quieter than its gold. */
const PULL_UP = {
  1: {
    mark: "⚠️",
    ring: "ring-rose-300",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
  },
  2: {
    mark: null,
    ring: "ring-slate-300",
    chip: "border-slate-200 bg-slate-50 text-slate-700",
  },
  3: {
    mark: null,
    ring: "ring-slate-200",
    chip: "border-slate-200 bg-slate-50 text-slate-600",
  },
} as const;

type PullUpPlace = keyof typeof PULL_UP;
/**
 * Keyed on PLACE IN THIS CARD (1st, 2nd, 3rd from the top), NOT on the global
 * rank. Those used to be the same number because this board renumbered its
 * people from 1; it now shows their real standing, which starts at
 * TOP_PERFORMER_RANKS + 1 — so keying the treatment on `rank` would light up
 * nobody at all.
 */
const pullUpFor = (place: number) =>
  (PULL_UP as Record<number, (typeof PULL_UP)[PullUpPlace] | undefined>)[place];

/** A person plus the standing they hold on the whole-team leaderboard. */
type RankedPerson = RankedPunctualityPerson;

/**
 * ONE HOVER RECIPE, shared by the cards and the rows so both columns respond
 * identically to the pointer. Copied in spirit from Top Performers' ROW_HOVER
 * — and, like it, carries no `dark:` variant: this app registers no dark
 * theme, so `dark:hover:bg-slate-800/50` would darken the hover for anyone
 * whose OS is dark while the card under it stayed white with dark ink.
 */
const ROW_HOVER =
  "cursor-pointer rounded-xl transition-colors hover:bg-slate-50 hover:border-slate-300";

export function BottomPerformersSection({
  people,
  avatarById = {},
}: {
  /* ALREADY SPLIT AND ALREADY RANKED by the query — ranks 1-TOP_PERFORMER_RANKS
     went to Top Performers and never reach this card, and the `rank` on each
     row is its position on the ONE team leaderboard, not an index into this
     list. See lib/transforms/performer-split.ts. */
  people: RankedPunctualityPerson[];
  avatarById?: Record<string, string | null>;
}) {
  const [open, setOpen] = React.useState(true);
  const [drill, setDrill] = React.useState<RankedPerson | null>(null);

  // Two searches, ANDed — the FilterBar's and this card's own — exactly as Top
  // Performers does it, so the pair behaves identically.
  const sectionQuery = useSectionSearch();
  const [localQuery, setLocalQuery] = React.useState("");

  /* THE LEADERBOARD IS BUILT AND RANKED BEFORE EITHER SEARCH RUNS.
     
     That ordering is the fix for a bug the flat table hid. Rank used to be the
     row's index in the rendered list, computed after filtering — so searching
     for the person standing 7th displayed them as "#1". A flat table made that
     look like a harmless renumbering; a card headed "⚠️ 1st" states it as a
     fact about the person, which would be a lie the search box told.
     
     So rank is stamped here, once, on the un-searched top ten, and every badge
     below reads `p.rank`. The COLUMNS still describe position in what is shown
     (`.slice(0, FEATURED_COUNT)` on the filtered list) while the BADGES
     describe position in the standings — exactly the split Top Performers
     documents at the top of its own file. */
  /* NO RANKING HAPPENS HERE ANY MORE.
     
     This used to sort the roster and stamp `rank = index + 1`, which made this
     card its own separate leaderboard: the person it called "1st" was 1st ONLY
     here, and the same person was simultaneously somewhere in Top Performers'
     ordering under a different number. The query now ranks the whole team once
     and hands each card its slice (lib/transforms/performer-split.ts), so the
     number on a row is the person's real standing and the two cards read as one
     continuous list.
     
     The order arrives WORST FIRST (descending rank) for the same reason it used
     to be least-done first: the ⚠️ and the ring belong on the person most in
     need, and that is the last name on the team's standing. */
  const leaderboard = people;

  const ranked = React.useMemo(
    () =>
      leaderboard.filter(
        (p) =>
          (!sectionQuery || matchesSearch(sectionQuery, p.employeeName, p.department ?? "")) &&
          (!localQuery || matchesSearch(localQuery, p.employeeName, p.department ?? "")),
      ),
    [leaderboard, sectionQuery, localQuery],
  );

  /* 3 featured + 7 rows = the 10 the slice above guarantees. */
  const featured = ranked.slice(0, FEATURED_COUNT);
  const rest = ranked.slice(FEATURED_COUNT);

  const buildReport = React.useCallback((): SectionReport => {
    return {
      title: "People To Pull Up",
      subtitle: `Rank ${TOP_PERFORMER_RANKS + 1} and below, lowest standing first`,
      meta: localQuery.trim() ? [{ label: "Search", value: localQuery.trim() }] : [],
      summary: `${ranked.length} ${ranked.length === 1 ? "person" : "people"}`,
      columns: [
        { label: "Rank", weight: 0.6, align: "right" },
        { label: "Member", weight: 3, align: "left" },
        { label: "Department", weight: 2, align: "left" },
        { label: "Total tasks", weight: 1, align: "right", tone: "count" },
        { label: "On-time rate", weight: 1.2, align: "right" },
        { label: "Avg delay", weight: 1.2, align: "right" },
      ],
      rows: ranked.map((p) => [
        `#${p.rank}`,
        p.employeeName,
        p.department ?? "—",
        String(p.done),
        `${p.rate}%`,
        p.avgDaysLate != null ? `+${p.avgDaysLate} days` : "—",
      ]),
    };
  }, [ranked, localQuery]);

  return (
    <section className="relative min-w-0" aria-label="People to pull up">
      <DashboardSectionHeader
        icon={<SectionIcon icon={TrendingDown} tone="red" />}
        title="People To Pull Up"
        subtitle={`Everyone ranked ${TOP_PERFORMER_RANKS + 1} and below on the team leaderboard — the tail of Top Performers, lowest standing first. Nobody appears in both.`}
        actions={
          <>
            {/* SHARE ICONS FIRST, THEN THE SEARCH BOX — the order the other six
                sections use. This one and the On-time gauge had it the other way
                round, which is why their toolbars started with an input while
                every section above them started with the same pair of round
                icons: nothing lined up down the column. */}
            <SectionDispatch report={buildReport} />
            <SectionSearchBox
              query={localQuery}
              onQuery={setLocalQuery}
              placeholder="Search member..."
            />
            <CollapseToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label="People to pull up"
            />
          </>
        }
      />

      {/* CARD INSIDE THE FOLD, not around it.

          This was the other way round, with a comment claiming it was "how
          every other fold on this dashboard behaves". It is not: six of the
          nine sections put CollapsibleBody outermost, so collapsing removes the
          section down to its header. Here the padded, bordered card stayed
          mounted with nothing in it — an empty outlined strip under the title,
          on three sections and no others. That is what made the collapsed
          dashboard look ragged. */}
      <CollapsibleBody expanded={open}>
        <div className={`w-full max-w-none ${DASHBOARD_CARD_PADDED}`}>
          {ranked.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-16 text-center">
              <TrendingDown size={22} strokeWidth={2} className="text-gray-400" />
              <p className="text-[14px] font-bold text-ink-soft">
                {localQuery.trim() ? "No member matches that search" : "Nobody to show"}
              </p>
              <p className="max-w-[320px] text-[12.5px] font-semibold text-ink-subtle">
                {/* The old copy explained the sample floor that used to empty
                    this card. With no eligibility gate left, the only way here
                    is a genuinely empty roster for the current filters. */}
                {localQuery.trim()
                  ? "Clear the search to see the full list."
                  : "Nobody has completed a task in the current filters."}
              </p>
            </div>
          ) : (
            /* 5 / 7 in twelfths, `items-stretch`, one column below `lg` — the
               same grid Top Performers uses, spelled the same way, so the two
               sections' gutters line up down the page and the pair reads as one
               idea. The narrower half takes the three cards; the wider half
               takes the seven rows. */
            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
              {/* ── LEFT — ranks 1-3, as cards ─────────────────────────── */}
              <div className="flex flex-col gap-3 lg:col-span-5">
                {featured.map((p, i) => (
                  <FeaturedCard
                    key={p.employeeId}
                    person={p}
                    place={i + 1}
                    stagger={i}
                    avatarUrl={avatarById[p.employeeId] ?? null}
                    onOpen={() => setDrill(p)}
                  />
                ))}
              </div>

              {/* ── RIGHT — ranks 4-10, as rows ────────────────────────── */}
              <div className="flex min-w-0 flex-col lg:col-span-7">
                {rest.length === 0 ? (
                  /* Reachable two ways: three or fewer people slipping at all,
                     or a search that matched only the featured three. Saying so
                     beats an empty half-grid, which reads as a failed render. */
                  <p className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-[12.5px] font-semibold text-slate-500">
                    No one outside the first three
                    {localQuery.trim() || sectionQuery ? " matches this search." : "."}
                  </p>
                ) : (
                  /* `h-full` — the list SPANS the column rather than stacking
                     from the top and leaving a white tail under the last row.
                     The grid is `items-stretch`, so this half is already as
                     tall as the three cards beside it; without `h-full` the
                     list claimed only its content height and the rest of that
                     box stayed empty.

                     THE SLACK GOES INTO THE ROWS, NOT THE GAPS. This was
                     `justify-between` over a `gap-1.5` floor, which spread the
                     leftover height across six gaps — so the rows stayed thin
                     and the column read as seven strips floating in uneven
                     white bands. Each row now carries `flex-1` (see PullUpRow)
                     and the gap is a fixed 8px, so the extra height lands
                     inside the cards where it makes them feel solid.

                     The earlier objection to `flex-1` — that row height would
                     then vary with the count — is real but is the lesser
                     problem: every row still matches every other row, which is
                     what the eye actually checks, and a short board now fills
                     its column instead of trailing off. `justify-between` is
                     kept as the fallback for the case where the rows cannot
                     grow (their min-height already exceeds the column). */
                  <ol
                    className={`slim-scroll flex h-full w-full flex-col justify-between gap-2 ${LIST_MAX_H} overflow-y-auto overscroll-contain pr-1`}
                  >
                    {/* Scrolls past the featured three rather than lengthening
                        the section. Rows keep their `min-h` floor, so a long
                        roster fills this box and scrolls instead of squeezing
                        every row thinner. */}
                    {rest.map((p) => (
                      <PullUpRow
                        key={p.employeeId}
                        person={p}
                        avatarUrl={avatarById[p.employeeId] ?? null}
                        onOpen={() => setDrill(p)}
                      />
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </CollapsibleBody>

      {/* The drill-down is now the SAME drawer Top Performers opens, replacing
          a link out to /tasks. That link was chosen when this card was a flat
          table and had no drawer to share; mirroring the layout without
          mirroring the interaction would leave two twin sections that behave
          differently on click. The drawer lists one person's completions and
          can filter them to the late ones, which is the question this card
          raises. */}
      <PerformerTaskDrawer
        open={drill !== null}
        employeeId={drill?.employeeId ?? ""}
        employeeName={drill?.employeeName ?? ""}
        onClose={() => setDrill(null)}
      />
    </section>
  );
}

/* ── Featured card (ranks 1-3) ──────────────────────────────────────────── */

function FeaturedCard({
  person,
  place,
  stagger,
  avatarUrl,
  onOpen,
}: {
  person: RankedPerson;
  /** 1-3 — position in THIS card, which drives the ⚠️ and the ring. Distinct
   *  from `person.rank`, the team-wide standing shown on the chip. */
  place: number;
  /** Position in the rendered column — only staggers the count-up. */
  stagger: number;
  avatarUrl?: string | null;
  onOpen: () => void;
}) {
  const badge = pullUpFor(place);
  const animated = useCountUp(person.done, 900 + stagger * 120);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${person.employeeName}'s tasks — rank ${person.rank}, ${person.done} completed, ${person.rate}% on time`}
      className={`group relative block w-full border border-slate-200 bg-white p-4 text-left ${ROW_HOVER}`}
    >
      {/* The warning mark sits on the person at the very BOTTOM of the team's
          standing — the mirror of the crown Top Performers gives its true #1.
          Keyed on `place`, not `rank`: rank is now a team-wide number starting
          past the top-performer cut, so `rank === 1` can never be true here. */}
      {place === 1 && (
        <span aria-hidden className="absolute right-4 top-4 text-rose-500">
          <AlertTriangle size={20} strokeWidth={2.4} />
        </span>
      )}

      <span className="flex items-center gap-3">
        <Avatar
          name={person.employeeName}
          avatarUrl={avatarUrl}
          size={44}
          className={badge ? `ring-2 ring-offset-2 ${badge.ring}` : undefined}
        />
        <span className="min-w-0">
          <span
            className="block truncate text-[14px] font-bold text-slate-900"
            title={person.employeeName}
          >
            {person.employeeName}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {badge && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.chip}`}
              >
                {badge.mark && <span aria-hidden>{badge.mark}</span>}
                {/* The team-wide position, not "1st/2nd/3rd in this card" —
                    those labels claimed a standing the person did not hold. */}
                #{person.rank}
              </span>
            )}
            {person.department && (
              <span className="inline-block max-w-[16ch] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {person.department}
              </span>
            )}
          </span>
        </span>
      </span>

      {/* `done` is DATED COMPLETIONS — what this person delivered and could be
          scored on, not everything on their plate. PunctualityPerson carries no
          count of still-open work, so the title states the scope rather than
          letting a bare number imply a wider one. */}
      <span
        className="mt-3 flex items-baseline gap-2 border-t border-slate-100 pt-3"
        title={`${person.done} dated completions — ${person.late} of them late`}
      >
        {/* text-2xl / font-bold / slate-900 — Top Performers' exact treatment.
            This was text-3xl font-black in rose-600, which made the count the
            loudest thing in the section and coloured a neutral fact (how many
            tasks someone closed) as though the NUMBER were the alarm. The rank
            badge is the alarm; the count is just a count. */}
        <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">
          {animated.toLocaleString("en-IN")}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          completed
        </span>
      </span>
      {/* The same three figures Top Performers' podium card carries, in the
          same order and the same type: the rate, the fraction it came from,
          then the average. The FRACTION was missing here — a bare "18% on
          time" is a mystery where "18% on time (2/11)" is a fact, and it is
          the one thing that tells a reader whether the percentage is built on
          a sample worth acting on. */}
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] font-bold">
        <span
          className="text-slate-700"
          title={`${person.onTime} of ${person.done} dated completions landed on time`}
        >
          {person.rate}% on time
          <span className="ml-1 font-semibold text-slate-400">
            ({person.onTime}/{person.done})
          </span>
        </span>
        <span aria-hidden className="text-slate-300">
          ·
        </span>
        <span className="text-slate-500">
          {person.avgDaysLate != null ? `${person.avgDaysLate.toFixed(1)}d avg` : "N/A avg"}
        </span>
      </span>
    </button>
  );
}

/* ── Compact row (ranks 4-10) ───────────────────────────────────────────── */

function PullUpRow({
  person,
  avatarUrl,
  onOpen,
}: {
  person: RankedPerson;
  avatarUrl?: string | null;
  onOpen: () => void;
}) {
  return (
    /* `flex-1` — every row takes an EQUAL share of whatever height the three
       cards opposite set, which is what closes the white tail under the last
       one. Basis-0 rather than `grow`: rows differ in content height (only some
       people carry a department chip), and growing from unequal bases would
       finish unequal. From a zero basis they all land on the same number.

       `min-h-[3.5rem]` is a FLOOR, not a fixed height — with a zero basis a
       short column would otherwise squeeze the rows under their own content.
       If the floor wins, the list simply grows past the cards and the grid row
       stretches to match; nothing clips.

       Still no margin: the <ol> owns the 8px gap, and a margin here would stack
       on top of it. */
    <li className="flex min-h-[3.5rem] flex-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${person.employeeName}'s tasks — rank ${person.rank}, ${person.done} completed, ${person.rate}% on time`}
        className={`group flex h-full w-full items-center justify-between gap-3 border border-slate-200 bg-white px-4 py-3 text-left ${ROW_HOVER}`}
      >
        {/* Left — rank · avatar · name · department */}
        <span className="flex min-w-0 items-center gap-3">
          {/* Neutral, exactly as Top Performers' — a rose badge on every row
              turned seven rows into seven warnings. */}
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-700">
            {person.rank}
          </span>
          {/* 28px as a NUMBER prop — Avatar ignores an h-7/w-7 class, and a
              32px avatar would quietly set the row height instead of the
              padding above. */}
          <Avatar name={person.employeeName} avatarUrl={avatarUrl} size={28} />
          <span className="min-w-0">
            <span
              className="block truncate text-[13.5px] font-bold text-slate-900"
              title={person.employeeName}
            >
              {person.employeeName}
            </span>
            {person.department && (
              <span className="mt-0.5 inline-block max-w-[16ch] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {person.department}
              </span>
            )}
          </span>
        </span>

        {/* Right — bar · on-time · count · chevron, in ONE group.

            The on-time label used to live with the bar in a separate, `flex-1`
            centre group. That container grew to fill the row while its contents
            (a capped bar and a `w-24` figure) did not, so the leftover width
            collected AFTER the label — opening a gap between "82% on time" and
            the count pill that widened with the viewport and read as two
            unrelated clusters. Moving the label into this group closes it: the
            group is `shrink-0`, so the slack now falls to the LEFT of the bar,
            where the name has a use for it.

            `gap-3` throughout, including before the chevron (it was `gap-2`):
            one spacing rule for four elements that now sit on one rail. */}
        <span className="flex shrink-0 items-center gap-3">
          {/* THE BAR MEASURES THE RATE ITSELF, not a share of some leader. Top
              Performers' bar is relative to its own #1 because completion
              volume has no ceiling; a percentage already has one, so a full
              track is 100% on time and a nearly-empty one is the alarm. Making
              this relative would have drawn the WORST performer a full bar.

              Fixed width rather than `flex-1 max-w-*`: inside a shrink-0 group
              there is nothing to flex into, and a fixed track starts at the
              same x on every row. Hidden below md, where the on-time label it
              belongs to is hidden too.

              128px from md, 192px from xl — up from 80/100px, which read as a
              token rather than a measurement. Both steps are live: at `lg` this
              half is only seven twelfths of the page and a 192px track there
              would eat the width the name needs, so the wide track waits for
              the viewport that can pay for it. `h-2`, not `h-1.5`, so the track
              stays in proportion to the taller row.

              NO `dark:bg-slate-800`. This app registers no dark theme — the
              card under this track is hardcoded white — so a `dark:` variant
              would paint a near-black bar on a white row for anyone whose OS is
              in dark mode. Same call as ROW_HOVER above. */}
          <span className="hidden h-2 w-32 overflow-hidden rounded-full bg-slate-100 md:block xl:w-48">
            {/* Rose-500 — the same tone as this card's rank-1 warning mark,
                so the section reads in one colour rather than two reds.

                WORTH KNOWING, because the fill now says the opposite of what
                its colour implies: a FULLER bar here is BETTER (the track is
                100% on time, so a nearly-empty one is the alarm). Painting it
                red gives the worst performer the least red. The neutral slate
                it replaces was deliberately silent on that point. */}
            <span
              className="block h-full rounded-full bg-rose-500 transition-all"
              style={{ width: `${person.rate}%` }}
            />
          </span>
          {/* `w-24 text-right` stays: it is what keeps the count pills in a
              column instead of stepping sideways as the percentage gains or
              loses a digit. */}
          {/* NEUTRAL, and deliberately not Top Performers' emerald. That green
              means "on time is good news" — true on that card, false on this
              one, where an 18% rate painted emerald would read as a pass.
              Slate states the number without grading it. */}
          <span
            className="hidden w-24 text-right text-[12px] font-bold tabular-nums text-slate-700 md:block"
            title={`${person.onTime} of ${person.done} dated completions landed on time`}
          >
            {person.rate}% on time
          </span>
          {/* Top Performers' pill shape and weight, in slate rather than its
              emerald: a LOW count is not good news, and green would say the
              opposite of what this card is for. */}
          <span
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold tabular-nums text-slate-700"
            title={`${person.done} dated completions — ${person.late} of them late`}
          >
            {person.done.toLocaleString("en-IN")}
          </span>
          <ChevronRight
            size={16}
            strokeWidth={2.6}
            className="text-slate-400 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </button>
    </li>
  );
}
