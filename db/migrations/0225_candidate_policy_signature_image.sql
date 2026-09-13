-- CANDIDATE POLICY SIGNING — the signature IMAGE.
--
-- A typed name was the whole signature (see 0222). The candidate now also
-- uploads a photo of their handwritten signature, and the policy cannot be
-- signed without it, so the storage key is recorded next to the name it backs.
--
-- NULLABLE on purpose, even though the app requires it from here on: rows
-- signed before this column existed were validly signed under the rule that
-- applied then, and back-filling them with an empty string would forge a
-- signature that was never collected. A null therefore means "typed-only,
-- signed before images were required" — a real distinction worth keeping.
--
-- The path is a key into the PRIVATE documents bucket, never a public URL, and
-- lives under `candidate-intake/<employee id>/` so the ownership check that
-- guards every other candidate upload also guards this one.
ALTER TABLE candidate_policy_signatures
  ADD COLUMN IF NOT EXISTS signature_path text;
