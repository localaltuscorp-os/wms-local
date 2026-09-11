import CandidateFormPage from "@/app/candidate/form/page";

export const dynamic = "force-dynamic";

/**
 * The candidate's own interview form, reached by an access link instead of a
 * sign-in.
 *
 * RE-EXPORTS the signed-in page rather than copying it. Both routes resolve the
 * row through `requireCandidateOwner()`, which now answers for either path (see
 * lib/hr/candidate/candidate-owner.ts) — so this is genuinely the same page, the
 * same queries and the same `CandidateFormLauncher`, reached two ways. A second
 * copy here would be a second thing to keep in step, and the copy that gets
 * forgotten is always the public one.
 *
 * `dynamic` is re-declared because route-segment config is read per file; it is
 * not inherited through an import.
 */
export default CandidateFormPage;
