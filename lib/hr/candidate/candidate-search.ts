/**
 * Local Candidate Records search deliberately excludes the email domain.
 * Domains are commonly shared (`.com`, `.in`) and therefore make short text
 * queries match nearly every record. The local part remains searchable because
 * it identifies the candidate's mailbox.
 */
export type CandidateSearchRecord = {
  fullName: string;
  positionApplied: string | null;
  mobile: string | null;
  email: string | null;
};

export function matchesCandidateSearch(candidate: CandidateSearchRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const emailLocalPart = (candidate.email ?? "").split("@", 1)[0] ?? "";
  return [candidate.fullName, candidate.positionApplied ?? "", candidate.mobile ?? "", emailLocalPart].some((value) =>
    value.toLowerCase().includes(needle),
  );
}
