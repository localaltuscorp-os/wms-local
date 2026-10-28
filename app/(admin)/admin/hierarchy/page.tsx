import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function HierarchyPage() {
  redirect("/admin/employee-master?tab=hierarchy");
}
