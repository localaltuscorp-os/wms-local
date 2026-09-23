import { redirect } from "next/navigation";

/**
 * TEMPORARY ACCESS moved under Control Panel. This route is kept so old links
 * and bookmarks still resolve; it redirects to the one canonical location.
 * The real page is app/(admin)/admin/control-panel/temporary-access/page.tsx.
 */
export default function TemporaryAccessRedirect() {
  redirect("/admin/control-panel/temporary-access");
}
