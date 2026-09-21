SIGNATURE ASSETS
================

hr-signature.png  -> THE HR DESK'S REAL SIGNATURE (Rutvisha, replaced
                     2026-09-17). Applied automatically to
                     every HR-signed letter (that is every template except
                     ctc-breakup and appointment, which the Director signs --
                     see signatoryOf in lib/hr/letters/types.ts).
                     Black ink on a transparent background so it sits on the
                     letter paper with no white box around it.
                     Referenced by HR_SIGNATURE_IMAGE in lib/hr/firm.ts; both
                     the on-screen letter (lib/hr/letters/rich.ts) and the
                     issued PDF (lib/hr/letters/pdf.ts) read that one constant,
                     so preview and PDF cannot drift apart.

manan-vasa-sign.png      -> MANAN VASA'S REAL SIGNATURE. Backs BOTH the Director
                            sign-off (ctc-breakup, appointment, via
                            PROPRIETOR_SIGNATURE_IMAGE in lib/hr/firm.ts) and the
                            Selection letter's founder block (per-template
                            imageSrc). Transparent PNG.

proprietor-signature.jpg -> SUPERSEDED 2026-09-17, no longer referenced by any
manan-sign.jpeg             code. Kept only so an old issued PDF can be traced
proprietor-signature.png    back to the mark it was stamped with.

manan-sign.png           -> the same Manan Vasa scan, untrimmed (added upstream
manan.png                   2026-09-17). manan.png backs the salary signatory
                            (lib/salary/signatories.ts); manan-sign.png is unused.
                            Letters use the trimmed manan-vasa-sign.png.

PRECEDENCE, highest first:
  1. an uploaded scanned signature passed as `signatureImage` at issue time
  2. a per-template `imageSrc` on the signature block
  3. the standing signature for the signatory (HR or proprietor)
  4. nothing -> a blank strip is reserved so the letter can be signed by hand

TO REPLACE any of these: drop a new file at the same path and filename. No code
change needed. PNG with a transparent background works best. If a file is
missing at runtime the renderer degrades to the blank signing strip rather than
showing a broken image.

--- PLACEHOLDERS still pending real scans (WS-5 salary documents) ---
These are blank panels with a red baseline, NOT real signatures. See
lib/salary/signatories.ts:
  manan.png     -> Manan Vasa   (Altus Corp, MJV HUF, JSV HUF)
                   real no-background scan (2026-09-17), no longer a placeholder
  cmv.png       -> CMV          (Unleashed)
  rutvisha.png  -> Rutvisha     (all other entities)
