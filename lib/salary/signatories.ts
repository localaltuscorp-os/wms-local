/**
 * WS-5 — Salary documents · Entity → Authorised Signatory mapping.
 *
 * Source of truth (ALTUS-MEGA-SPEC.md, WS-5):
 *   • Altus Corp, MJV HUF, JSV HUF → Manan Vasa
 *   • Unleashed                    → CMV
 *   • ALL OTHERS                   → Rutvisha
 *
 * The signatory block prints `For <Entity>` + a signature IMAGE + the words
 * "Authorised Signatory" + Date + Place. There is deliberately NO rubber-stamp
 * text anywhere in this feature.
 *
 * ⚠️ Signature image files are PENDING from Sir. Until real scans arrive, the
 * repo ships clearly-labelled PLACEHOLDER PNGs at /public/signatures/<key>.png
 * (a blank panel with a red baseline). Both the on-screen block and the PDF
 * renderer degrade gracefully — if the asset is missing they draw a ruled line
 * with the signatory's typed name instead of a forged image.
 */

export type SignatoryKey = "manan" | "cmv" | "rutvisha";

export interface Signatory {
  key: SignatoryKey;
  /** Printed under the signature line as the person signing "For <Entity>". */
  name: string;
  /** Public URL of the signature image (web <img> src). */
  assetSrc: string;
  /** Path segment used to resolve the file on disk in the PDF route. */
  assetFile: string;
}

const SIGNATORIES: Record<SignatoryKey, Signatory> = {
  manan: {
    key: "manan",
    name: "Manan Vasa",
    assetSrc: "/signatures/manan.png",
    assetFile: "manan.png",
  },
  cmv: {
    key: "cmv",
    name: "CMV",
    assetSrc: "/signatures/cmv.png",
    assetFile: "cmv.png",
  },
  rutvisha: {
    key: "rutvisha",
    name: "Rutvisha",
    assetSrc: "/signatures/rutvisha.png",
    assetFile: "rutvisha.png",
  },
};

/** Entities (case/space-insensitive) that route to Manan Vasa. Includes both the
 *  legacy spellings AND the canonical HR display names (migration 0158 renamed
 *  "MJV HUF" → "The Gainmakers (MJV HUF)", "JSV HUF" → "Legacy Creators (JSV
 *  HUF)") so signatory routing keeps working after the roster is reconciled. */
const MANAN_ENTITIES = new Set([
  "altus corp",
  "mjv huf",
  "jsv huf",
  "the gainmakers (mjv huf)",
  "legacy creators (jsv huf)",
]);
/** Entities (case/space-insensitive) that route to CMV. */
const CMV_ENTITIES = new Set(["unleashed"]);

function normalize(entity: string): string {
  return entity.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve the Authorised Signatory for a paying entity. Unknown / empty
 * entities fall through to Rutvisha (the spec's "ALL OTHERS" bucket), so this
 * never throws and always yields a printable block.
 */
export function signatoryForEntity(entity: string | null | undefined): Signatory {
  const n = normalize(entity ?? "");
  if (MANAN_ENTITIES.has(n)) return SIGNATORIES.manan;
  if (CMV_ENTITIES.has(n)) return SIGNATORIES.cmv;
  return SIGNATORIES.rutvisha;
}

export function signatoryByKey(key: SignatoryKey): Signatory {
  return SIGNATORIES[key];
}
