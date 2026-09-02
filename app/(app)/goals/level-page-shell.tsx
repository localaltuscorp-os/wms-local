import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { goalsCascadeEnabled, goalsCanvasOn } from "@/lib/goals/flag";
import { GoalsLevelBoard } from "@/components/goals/board/goals-level-board";
import {
  type GoalPeriod,
  quartersOfFy,
  monthKeysOfFy,
  quarterKey,
  monthKey,
  fyStartYearOfMonthKey,
} from "@/lib/goals/types";
import { loadBoardData } from "./board-data";

/** The query params every level page understands. `period` is the canonical
 *  bucket carrier the board itself pushes; `q` ("Q2") and `m` ("2026-07") are
 *  shareable deep-link sugar for the quarterly / monthly pages. */
export interface LevelPageSearchParams {
  emp?: string;
  fy?: string;
  period?: string;
  q?: string;
  m?: string;
  /** Deep-link: open this goal's drawer on mount. */
  focus?: string;
}

/**
 * Shared shell for the Goals LEVEL PAGES (Yearly / Quarterly / Monthly).
 * Each route is a thin wrapper that renders this with its level + heading; the
 * page renders the weekly-goals-BOARD design (GoalsLevelBoard) locked to that
 * level, with period pills (Q1–Q4 / the 12 FY months) as the in-page bucket
 * nav + always-on drop targets. ONE lean data-load (loadBoardData).
 * Gated by GOALS_CANVAS_ON (redirects to /goals when off, so production —
 * where the flag is off — is unaffected).
 */
export async function LevelPageShell({
  sp,
  level,
  basePath,
  heading,
  tagline,
}: {
  sp: LevelPageSearchParams;
  /** The level this page is locked to. */
  level: GoalPeriod;
  /** The page's own route ("/goals/quarterly") — bucket/person/FY nav stays on it. */
  basePath: string;
  /** Page H1 ("Quarterly Goals"). */
  heading: string;
  /** One-line subtitle under the H1 (the board has a sensible default). */
  tagline?: string;
}) {
  if (!goalsCascadeEnabled()) notFound();
  if (!goalsCanvasOn()) redirect("/goals");

  // A MONTH deep-link carries its own financial year. `?m=2027-05` alone would
  // otherwise load the current FY, fail the `buckets.includes` test below and
  // silently open today's month instead of the linked one — the shared link
  // quietly lies. Derive the FY from the month key when the URL doesn't say.
  // (The board's own picks always send `fy` explicitly; this is for pasted
  // links, and only where the key itself pins the year.)
  const spEffective = { ...sp, fy: sp.fy ?? fyOfMonthParam(level, sp) };

  const data = await loadBoardData(spEffective);
  const periodKey = resolveBucket(level, data.fyStartYear, sp);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      {/* `<main>` is a GROWING flex column on every level page. The sticky-footer
          chain — ChromeShell's `min-h-dvh` column → `(app)/template.tsx` → this
          fragment's `mt-auto` footer — already pinned the bar to the bottom, but
          a plain `w-full` main did not grow, so on a short board the board's
          gradient surface ended at the last table row and left a strip of bare
          page background between it and the footer. `flex-1` hands that leftover
          space to the board, which fills it with its own surface. */}
      <main className="flex w-full flex-1 flex-col">
        <GoalsLevelBoard
          {...data}
          level={level}
          periodKey={periodKey}
          basePath={basePath}
          heading={heading}
          tagline={tagline}
          focusId={sp.focus ?? null}
        />
      </main>
    </>
  );
}

/** The FY (as the `?fy=` string the loader parses) that owns a MONTH deep-link
 *  on the Monthly page — `?m=2027-05` / `?period=2027-05` → "2026" if the FY
 *  starts in April. `undefined` for every other level or a malformed key, which
 *  leaves the loader on its own default (today's FY). */
function fyOfMonthParam(level: GoalPeriod, sp: LevelPageSearchParams): string | undefined {
  if (level !== "month") return undefined;
  const key = sp.period ?? sp.m;
  if (!key || !/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return undefined;
  return String(fyStartYearOfMonthKey(key));
}

/** Pick the selected bucket at `level` inside the viewed FY: an explicit
 *  (valid) URL param wins; otherwise the CURRENT quarter/month when the viewed
 *  FY contains it; otherwise the FY's first bucket (Q1 / April). */
function resolveBucket(
  level: GoalPeriod,
  fy: number,
  sp: LevelPageSearchParams,
): string {
  if (level === "year") return String(fy);

  const buckets = level === "quarter" ? quartersOfFy(fy) : monthKeysOfFy(fy);
  const sugar =
    level === "quarter"
      ? sp.q && /^Q[1-4]$/i.test(sp.q)
        ? `${fy}-${sp.q.toUpperCase()}`
        : undefined
      : sp.m;
  const wanted = sp.period ?? sugar;
  if (wanted && buckets.includes(wanted)) return wanted;

  const current = level === "quarter" ? quarterKey(new Date()) : monthKey(new Date());
  if (buckets.includes(current)) return current;
  return buckets[0] ?? String(fy);
}
