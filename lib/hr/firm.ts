/**
 * Firm-name tokens — so every HR letter, agreement and policy re-brands to the
 * SELECTED paying entity instead of a hardcoded "Altus Corp".
 *
 * Author document text with these tokens; the renderer resolves them against the
 * issuing entity chosen in the toolbar:
 *
 *   {firm}       → entity.displayName   e.g. "Altus Corp", "The Perfect Blend (Khushboo Shah)"
 *   {firmLegal}  → entity.legalName     the full legal name for formal contexts
 *
 * PURE + CLIENT-SAFE (imports only the entity registry). Applied at the same
 * render points as the pronoun engine — wrap it around applyPronouns() so a
 * document is resolved for BOTH gender and firm in one pass. Load-neutral.
 */

import { getEntity, type Entity, type EntityId } from "@/lib/hr/entities";

/**
 * HR desk contact — the single source of truth for the HR email + HR Manager
 * phone rendered in the letterhead footer (code-rendered, beneath the baked
 * footer art) and used as the CC/BCC on the "Export & Email PDF" flow.
 *
 * Spelling confirmed by the user: "altUScorp" (matches the company domain
 * altuscorp.in), NOT the "altAscorp" that appeared in the spec.
 */
export const HR_CONTACT = {
  /** HR desk email (confirmed spelling: altUScorp). */
  email: "hr.altuscorp@gmail.com",
  /** HR Manager phone. */
  phone: "+91 99877 41410",
} as const;

/**
 * Where automated HR mail is actually DELIVERED — submitted forms, letter
 * copies, anything the product sends without a human choosing a recipient.
 *
 * Separate from `HR_CONTACT.email`, which is the address PRINTED on letterheads
 * and stays a literal. Overridable because a staging deploy must not post real
 * exit interviews into the live HR inbox, and because changing where compliance
 * mail lands should not require a code deploy.
 *
 * Call this from server code only. It reads `process.env`, which is inlined as
 * undefined on the client — `HR_CONTACT` above is what client components import.
 */
export function hrDeskEmail(): string {
  return process.env.HR_DESK_EMAIL?.trim() || HR_CONTACT.email;
}

/**
 * The HR-desk signatory identity — the name + designation printed in the
 * signature block of every HR-signed letter (see `signatoryOf`). The Director
 * letters (CTC + Appointment) keep their authored "CA Manan Vasa" block instead.
 */
export const HR_SIGNATORY = {
  name: "HR Team",
  designation: "Human Resources",
} as const;

/**
 * The HR desk's scanned signature, applied automatically to every HR-signed
 * letter — the same way `proprietor-signature.jpg` already backs the Director
 * letters. Before this, HR letters reserved a blank strip and someone had to
 * upload a scan per issue (or sign the printout), so most went out unsigned.
 *
 * Public-relative on purpose: the PDF renderer resolves it under `public/` on
 * disk and the on-screen letter serves it as a URL, so one constant keeps the
 * preview and the issued PDF showing the same mark.
 *
 * PNG with a transparent background and black ink, so it sits on the letter
 * paper without a white box around it. An uploaded `signatureImage` still wins
 * over this, and a per-block `imageSrc` (the Selection letter's founder sign-off)
 * still wins over both — this is only the default for the HR desk.
 */
export const HR_SIGNATURE_IMAGE = "/signatures/hr-signature.png";

/** Resolve `{firm}` / `{firmLegal}` in `text` against the issuing entity. */
export function applyFirm(
  text: string,
  entity: EntityId | Entity | string | null | undefined,
): string {
  if (!text || text.indexOf("{") === -1) return text;
  const e = getEntity(entity ?? null);
  return text.replace(/\{firmLegal\}/g, e.legalName).replace(/\{firm\}/g, e.displayName);
}

export default applyFirm;
