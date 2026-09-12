import { redirect } from "next/navigation";

/**
 * Job Description moved to the Operations room on 2026-09-12.
 *
 * The ROUTE had to move with it, not just the rail entry: everything under
 * app/(app)/hr/ is wrapped in the HR console shell, so listing the old path in
 * Operations' rail would have opened a page still wearing HR's three-column
 * chrome and highlighting HR's rail.
 *
 * This stub is what keeps the old path honest — bookmarks, anything already
 * linked, and the `hr.job-description` permission node's route list all still
 * resolve instead of 404-ing.
 */
export default function MovedJobDescriptionPage(): never {
  redirect("/operations/job-description");
}
