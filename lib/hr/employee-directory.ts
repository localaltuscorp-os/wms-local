import { parseRepeaterRows } from "@/lib/dossier/onboarding-schema";

type OnboardingValues = Record<string, unknown>;

export interface EmployeeDirectoryFallback {
  name: string;
  personalEmail: string | null;
  email: string | null;
  phone: string | null;
  whatsappPhone: string | null;
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/**
 * Employee Directory is a live view of the onboarding form. Emergency contacts
 * are stored as JSON text in the submission, so this keeps their extraction in
 * one tested place instead of treating that field as an in-memory array.
 */
export function employeeDirectoryDetailsFromOnboarding(
  fields: OnboardingValues,
  fallback: EmployeeDirectoryFallback,
) {
  const [fallbackFirstName = "", ...fallbackLastName] = fallback.name.trim().split(/\s+/);
  const firstName = text(fields.firstName) || fallbackFirstName;
  const lastName = text(fields.lastName) || fallbackLastName.join(" ");
  const contactRows = Array.isArray(fields.emergencyContacts)
    ? fields.emergencyContacts.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    : parseRepeaterRows(text(fields.emergencyContacts));
  const contacts = contactRows.flatMap((row) => {
    const name = text(row.name) || null;
    const cell = text(row.mobile) || text(row.phone) || null;
    return name || cell ? [{ name, cell }] : [];
  });

  return {
    firstName,
    lastName,
    cell: text(fields.phone) || fallback.phone || fallback.whatsappPhone || null,
    personalEmail: text(fields.personalEmail) || fallback.personalEmail || fallback.email || null,
    contact1Name: contacts[0]?.name ?? null,
    contact1Cell: contacts[0]?.cell ?? null,
    contact2Name: contacts[1]?.name ?? null,
    contact2Cell: contacts[1]?.cell ?? null,
  };
}
