import { redirect } from "next/navigation";

/**
 * /admin/departments → /admin/functions.
 *
 * The screen moved when Departments became Functions (migration 0234). This
 * stub stays because the old URL is bookmarked, linked from
 * `department-multi-select.tsx`'s empty state, and printed in older HR
 * documents — a 404 there would read as the feature having been removed.
 *
 * `permanentRedirect` is deliberately NOT used: a 308 is cached by the browser
 * for good, which would make the old URL unusable if this ever needs to become
 * a real page again.
 */
export default function DepartmentsMovedPage(): never {
  redirect("/admin/functions");
}
