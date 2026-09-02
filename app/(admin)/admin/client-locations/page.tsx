import { MapPin } from "lucide-react";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { canEditClientLocations } from "@/lib/auth/attendance-permissions";
import { listClientLocations } from "@/lib/attendance/client-locations";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { ClientLocationList } from "@/components/admin/client-location-list";

export const dynamic = "force-dynamic";

/**
 * Admin · Client Locations — the places a "Client Site" attendance day may
 * point at.
 *
 * TWO GATES, not one. `requireAdmin()` decides who may SEE the list: every admin
 * needs to know where the firm's clients are. `canEditClientLocations` decides
 * who may CHANGE it — Manan, Rutvisha and Ruchita — and is passed down so the
 * page renders read-only for everyone else.
 *
 * The read-only rendering is a courtesy, not the control: the server actions
 * check the same predicate, so a hidden button and a refused write can never
 * disagree.
 */
export default async function ClientLocationsPage() {
  await requireAdmin();
  const me = await requireUser();
  const canEdit = canEditClientLocations(me.email);

  const rows = await listClientLocations({ includeInactive: true });
  const active = rows.filter((r) => r.isActive);
  const pinned = active.filter((r) => r.lat != null && r.lng != null);

  return (
    <AdminSection
      eyebrow="Admin · Attendance"
      title="Client Locations"
      subtitle={
        canEdit
          ? `${active.length} active · ${pinned.length} with a map pin`
          : `${active.length} active · view only — ask Manan, Rutvisha or Ruchita to change these`
      }
      icon={MapPin}
      stats={[
        { label: "Active", value: active.length, tone: "green" },
        { label: "With a pin", value: pinned.length, tone: "red" },
        { label: "Retired", value: rows.length - active.length },
      ]}
    >
      <ClientLocationList rows={rows} canEdit={canEdit} />
    </AdminSection>
  );
}
