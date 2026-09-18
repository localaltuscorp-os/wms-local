import { redirect } from "next/navigation";

/**
 * `/dcc/sp1` IS GONE — the sheet is the dashboard now (DCC-SPEC §8, §9).
 *
 * Account holder, 2026-09-17: the Daily Compliance dashboard is Jeevan's SP1
 * sheet, and there is no separate SP1 door. The rail entry and the permission
 * node were removed with it.
 *
 * THIS FILE STAYS as a redirect rather than being deleted outright, because the
 * old address is in people's bookmarks and in the 10 pm email that has already
 * gone out. A 404 there would read as the report having been taken away.
 */
export default function DccSp1Redirect() {
  redirect("/dcc/dashboard");
}
