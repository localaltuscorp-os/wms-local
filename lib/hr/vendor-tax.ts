/** Returns the PAN portion of a valid Indian GSTIN, or null when it is incomplete. */
export function panFromGstin(value: string | null | undefined): string | null {
  const gstin = String(value ?? "").trim().toUpperCase().replace(/\s/g, "");
  const match = gstin.match(/^\d{2}([A-Z]{5}\d{4}[A-Z])[A-Z0-9]Z[A-Z0-9]$/);
  return match?.[1] ?? null;
}
