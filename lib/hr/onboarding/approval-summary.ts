import { ONBOARDING_SECTIONS } from "@/lib/dossier/onboarding-schema";

export function onboardingReviewSummary(fields: Record<string, string>, files: Record<string, unknown>): string {
  const completedSections = ONBOARDING_SECTIONS.filter((section) => section.fields.some((field) => {
    if (field.type === "file") return Boolean(files[field.key]);
    return Boolean(fields[field.key]?.trim());
  })).length;
  const attachmentCount = Object.values(files).filter(Boolean).length;
  return `${completedSections}/${ONBOARDING_SECTIONS.length} sections · ${attachmentCount} file${attachmentCount === 1 ? "" : "s"}`;
}
