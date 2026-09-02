import type { Employee } from "@/db/schema";

export type DashboardAccent = "blue" | "amber" | "purple";
export type DashboardIconName = "Building2" | "Receipt" | "TrendingUp";

export interface DashboardLink {
  id: "leads" | "liasoning" | "mandate-collection";
  label: string;
  description: string;
  url: string;
  accent: DashboardAccent;
  iconName: DashboardIconName;
  visibleTo: (e: Employee) => boolean;
}

// Lowercased once, matched against the also-lowercased employee email.
// Kept here (not in env / DB) because Manan asked for exactly these two
// people; a third address would be a one-line edit + redeploy.
const SPECIAL_EMAILS = new Set<string>([
  "altus@vpinnacle.com",
  "pravin@vpinnacle.com",
]);

function isSpecialOrAdmin(e: Employee): boolean {
  if (e.isAdmin) return true;
  const email = e.email.trim().toLowerCase();
  return SPECIAL_EMAILS.has(email);
}

export const EXTERNAL_DASHBOARDS: readonly DashboardLink[] = [
  {
    id: "leads",
    label: "Leads Dashboard",
    description: "Sales pipeline and lead tracking",
    url: "https://script.google.com/a/macros/vpinnacle.com/s/AKfycbxEy22N4i8sMZQrvDKS34ootPYG5iqUmkmYlDc8HfeGg4J09HH9A1LIJOxbcS_aoNWS/exec",
    accent: "purple",
    iconName: "TrendingUp",
    visibleTo: isSpecialOrAdmin,
  },
  {
    id: "liasoning",
    label: "Liasoning Dashboard",
    description: "Bank liasoning operations",
    url: "https://script.google.com/a/macros/vpinnacle.com/s/AKfycbz1JvHQt5khqN7paoAryLEL7dw_R2bBQERS8g6O1wp_kABxlaD9ho9WJ49EIprEtLrq/exec",
    accent: "blue",
    iconName: "Building2",
    visibleTo: isSpecialOrAdmin,
  },
  {
    id: "mandate-collection",
    label: "Mandate and Collection Dashboard",
    description: "Mandate setup and collection tracking",
    url: "https://script.google.com/a/macros/vpinnacle.com/s/AKfycbzg_sOjeR2i5u05_-4b65AHZl8uecQsIcfIxIM8UsIK9zFn4OXkV-tzEB5Pt3qiPJ6g5A/exec",
    accent: "amber",
    iconName: "Receipt",
    visibleTo: isSpecialOrAdmin,
  },
];

/**
 * Serializable shape forwarded from server → client (drops the predicate function).
 */
export interface VisibleDashboard {
  id: DashboardLink["id"];
  label: string;
  description: string;
  url: string;
  accent: DashboardAccent;
  iconName: DashboardIconName;
}

export function getVisibleDashboards(employee: Employee | null): VisibleDashboard[] {
  if (!employee) return [];
  return EXTERNAL_DASHBOARDS.filter((d) => d.visibleTo(employee)).map(
    ({ id, label, description, url, accent, iconName }) => ({
      id,
      label,
      description,
      url,
      accent,
      iconName,
    }),
  );
}
