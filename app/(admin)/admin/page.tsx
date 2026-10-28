import { redirect } from "next/navigation";

/**
 * The Admin Panel no longer has a separate overview data surface. Send full
 * admins to the first current Admin destination instead of returning a 404.
 * The parent layout redirects roster-only users to their permitted Subjects
 * screen before this page can render.
 */
export default function AdminRootPage() {
  redirect("/admin/employee-master");
}
