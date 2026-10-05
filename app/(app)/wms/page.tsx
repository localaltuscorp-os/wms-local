import { redirect } from "next/navigation";

/**
 * Legacy WMS entry point.
 *
 * Workspace navigation enters through `/ws/wms`, which applies the normal
 * workspace access check and records WMS as the active workspace before taking
 * the user to its dashboard. Keep the old `/wms` URL as a forwarder so existing
 * bookmarks and local development links do not render the global 404 page.
 */
export default function WmsLegacyEntryPage() {
  redirect("/ws/wms");
}
