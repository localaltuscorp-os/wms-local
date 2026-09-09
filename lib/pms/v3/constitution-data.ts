/**
 * PMS v3 (WS-2) — the Altus Corp Constitution, pulled para-by-para from the
 * source Google Doc and captured VERBATIM here as the seed for
 * pms_constitution_para.
 *
 * ✅ FETCH WORKED (2026-07-09) via
 *    https://docs.google.com/document/d/116crHfTQnAIGn9jQFnYl5Z3hDFmpJefT25Cc5yY4T34/export?format=txt
 * The 29 items below are the document's own headings + paragraphs, in order.
 * `isHeading` items are section headers (not scored); the rest are scorable
 * paragraphs. The admin distributes the 100 total weight across the scorable
 * paragraphs on the Constitution screen; if the Doc changes, re-run the seed
 * (scripts/seed-pms-constitution.ts — see INTEGRATION NOTE) to refresh.
 */

export interface ConstitutionSeedPara {
  position: number;
  isHeading: boolean;
  /** heading label (when isHeading) — else null. */
  title: string | null;
  body: string;
}

export const CONSTITUTION_SEED: ConstitutionSeedPara[] = [
  { position: 1, isHeading: true, title: "Our Constitution", body: "Our Constitution" },
  { position: 2, isHeading: true, title: "Purpose", body: "Purpose" },
  { position: 3, isHeading: false, title: null, body: "We are the SPACE in which ideas and intentions become New Tangible Realities" },
  { position: 4, isHeading: true, title: "Who our Customers are for us?", body: "Who our Customers are for us?" },
  { position: 5, isHeading: false, title: null, body: "Our Customers are people who want Unprecedented Growth" },
  { position: 6, isHeading: true, title: "Who we are for our Customers?", body: "Who we are for our Customers?" },
  { position: 7, isHeading: false, title: null, body: "We UNDERSTAND! We take them from where they are to where they want to be. We stand by them; we NEVER GIVE UP!" },
  { position: 8, isHeading: true, title: "Who we are for ourselves?", body: "Who we are for ourselves?" },
  { position: 9, isHeading: false, title: null, body: "We are Pioneers in creating New Tangible Realities. We are constantly evolving ourselves to deliver World-class Solutions" },
  { position: 10, isHeading: true, title: "Who our people are for us", body: "Who our people are for us" },
  { position: 11, isHeading: false, title: null, body: "Our people are Unstoppable, constantly Evolving, Innovating" },
  { position: 12, isHeading: false, title: null, body: "Our people are expanding their Leadership & Self-Expression ongoingly" },
  { position: 13, isHeading: false, title: null, body: "Our people are Living the Purpose and Values of our Enterprise" },
  { position: 14, isHeading: true, title: "Our Values", body: "Our Values" },
  { position: 15, isHeading: false, title: null, body: "Growth — We deliver Unprecedented Results" },
  { position: 16, isHeading: false, title: null, body: "Persistence — We NEVER GIVE UP!" },
  { position: 17, isHeading: false, title: null, body: "Commitment — We simply Make Things Happen" },
  { position: 18, isHeading: false, title: null, body: "Creativity — We bring things into Existence from Nothing!" },
  { position: 19, isHeading: false, title: null, body: "Excellence — We are Impeccable at everything" },
  { position: 20, isHeading: false, title: null, body: "Trustworthiness — If it is Trust, it is Us" },
  { position: 21, isHeading: false, title: null, body: "Humility — Confidence without Ego!" },
  { position: 22, isHeading: false, title: null, body: "Empathy — We understand Humanity better than anyone else" },
  { position: 23, isHeading: false, title: null, body: "Customer Centric — Everything we do Evolves & Revolves around our Customers" },
  { position: 24, isHeading: true, title: "Our Principles", body: "Our Principles" },
  { position: 25, isHeading: false, title: null, body: "Truth — Our thinking, saying & actions are in sync and Facts & Reality are the evidence to that" },
  { position: 26, isHeading: false, title: null, body: "Honesty — People will get the same answers about us, no matter who they ask & when they ask" },
  { position: 27, isHeading: false, title: null, body: "Integrity — We are who we say we are, we do what we say we do, nothing more nothing less" },
  { position: 28, isHeading: false, title: null, body: "Transparency — Nothing hidden, we are what you see" },
  { position: 29, isHeading: false, title: null, body: "Full Communication — If there is a doubt, we say it regardless of consequences. Over Communication is better than Under Communication" },
];

/** Scorable paragraphs (non-heading) — the set the admin weights + scores. */
export const CONSTITUTION_SCORABLE = CONSTITUTION_SEED.filter((p) => !p.isHeading);
