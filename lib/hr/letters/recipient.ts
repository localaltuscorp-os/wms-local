/** Canonical recipient rule for letters issued to an existing employee. */
export function employeeLetterRecipientEmail(employee: {
  personalEmail?: string | null;
  email?: string | null;
}): string {
  return (employee.personalEmail ?? employee.email ?? "").trim();
}
