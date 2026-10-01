import { redirect } from "next/navigation";

/** Keep the Employees module landing useful instead of exposing a 404. */
export default function EmployeesPage() {
  redirect("/employees/dashboard");
}
