import type { RenderedAgreement } from "@/lib/agreements/templates";
import type { Signatory } from "@/lib/salary/signatories";

/**
 * On-brand letter preview for an agreement. PURE presentational — no hooks — so it
 * renders in the live client workbench AND in server pages. Fed by
 * renderAgreement(); the signatory block + (once signed) the employee acceptance
 * stamp close it. The pdfkit route mirrors this layout from the same source.
 */
export function AgreementPreview({
  rendered,
  signatory,
  signed,
}: {
  rendered: RenderedAgreement;
  signatory: Signatory;
  /** Present once the employee has e-signed → prints the acceptance stamp. */
  signed?: { name: string; at: string } | null;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[720px] rounded-2xl border border-hairline bg-white px-10 py-9 text-ink-strong shadow-sm max-md:px-5 max-md:py-6"
      style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
    >
      {/* Masthead */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-hairline pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Altus" className="h-11 w-auto" />
        <div className="text-right">
          <div className="text-[15px] font-bold tracking-tight text-ink-strong">{rendered.recipientBlock[2] ?? ""}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">{rendered.title}</div>
        </div>
      </div>

      {/* Ref + date */}
      <div className="mb-5 flex items-start justify-between gap-4 text-[12.5px] text-ink-muted">
        <span>{rendered.refLine ?? ""}</span>
        <span>{rendered.dateLine}</span>
      </div>

      {/* Recipient */}
      <div className="mb-4 text-[13.5px] leading-snug">
        {rendered.recipientBlock.map((l, i) => (
          <div key={i} className={i === 0 ? "font-bold text-ink-strong" : "text-ink-muted"}>
            {l}
          </div>
        ))}
      </div>

      {/* Subject */}
      <p className="mb-4 text-[13.5px] font-bold text-ink-strong">{rendered.subject}</p>

      {/* Salutation + body */}
      <p className="mb-3 text-[13.5px]">{rendered.salutation}</p>
      <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-strong">
        {rendered.body.map((para, i) => (
          <p key={i} className="whitespace-pre-line text-justify">{para}</p>
        ))}
      </div>

      {/* Particulars table */}
      {rendered.particulars && rendered.particulars.length > 0 && (
        <table className="my-4 w-full border-collapse text-[13px]">
          <tbody>
            {rendered.particulars.map((row, i) => (
              <tr key={i} className="border-b border-hairline">
                <td className="py-1.5 pr-4 text-ink-muted">{row.label}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-ink-strong">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Numbered clauses */}
      {rendered.clauses.length > 0 && (
        <ol className="my-4 space-y-2 text-[13px] leading-relaxed text-ink-strong">
          {rendered.clauses.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-bold text-ink-muted">{i + 1}.</span>
              <span className="text-justify">{c}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Signatory block */}
      <div className="mt-8 flex items-end justify-between gap-6">
        <div className="text-[13px]">
          <p className="mb-6 text-ink-strong">{rendered.closing}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatory.assetSrc}
            alt=""
            aria-hidden
            className="mb-1 h-10 w-auto object-contain"
            style={{ maxWidth: 160 }}
          />
          <div className="border-t border-ink-strong pt-1 font-semibold text-ink-strong" style={{ minWidth: 180 }}>
            {signatory.name}
          </div>
          <div className="text-[11.5px] text-ink-soft">Authorised Signatory</div>
        </div>

        {/* Employee acceptance stamp — only once signed. */}
        {rendered.needsEmployeeAcceptance && (
          <div className="text-[13px]">
            <p className="mb-6 text-ink-muted">Accepted &amp; agreed,</p>
            {signed ? (
              <>
                <div
                  className="mb-1 text-[18px] text-[color:var(--color-green-deep,#15803d)]"
                  style={{ fontFamily: "var(--font-serif), cursive" }}
                >
                  {signed.name}
                </div>
                <div className="border-t border-ink-strong pt-1 font-semibold text-ink-strong" style={{ minWidth: 180 }}>
                  {signed.name}
                </div>
                <div className="text-[11.5px] text-ink-soft">Signed on {signed.at}</div>
              </>
            ) : (
              <>
                <div className="mb-1 h-6" />
                <div className="border-t border-solid border-ink-soft pt-1 text-ink-soft" style={{ minWidth: 180 }}>
                  Employee Signature
                </div>
                <div className="text-[11.5px] text-ink-soft">Date: ____________</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
