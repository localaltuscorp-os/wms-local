import { redirect } from "next/navigation";

/**
 * `/dcc/call-log` IS GONE — you fill the sheet on the dashboard (DCC-SPEC §7).
 *
 * Account holder, 2026-09-17: "add the call log in the dcc dashboard only,
 * don't put it in the sidebar". The fifteen numbers are typed straight into the
 * SP1 sheet at the top of `/dcc/dashboard`, so a separate entry screen would be
 * a second place to type the same day. The rail entry and the permission node
 * were removed with it.
 *
 * THIS FILE STAYS as a redirect rather than being deleted outright, because the
 * old address is in people's bookmarks and in the daily reminders that have
 * already gone out. A 404 there would read as the call log having been taken
 * away, on the one screen everybody is asked to open every evening.
 *
 * `./actions.ts` stays where it is — `saveCallLog` is still the one write path,
 * and it is now called from the sheet.
 */
export default function DccCallLogRedirect() {
  redirect("/dcc/dashboard");
}
