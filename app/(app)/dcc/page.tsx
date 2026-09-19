import { redirect } from "next/navigation";

/**
 * `/dcc` — My Day — IS NOW WCC (account holder, 2026-09-18).
 *
 * DCC's daily board became the Weekly Compliance Checklist (/dcc/wcc) and the
 * Monthly Compliance Checklist (/dcc/mcc), built the way the Accounts
 * checklists are. The same compliances and the same fills are on them.
 *
 * THIS FILE STAYS as a redirect rather than being deleted, because `/dcc` is in
 * people's bookmarks, in the Android app's links and in the 10 pm emails that
 * have already gone out.
 */
export default function DccRedirect() {
  redirect("/dcc/wcc");
}
