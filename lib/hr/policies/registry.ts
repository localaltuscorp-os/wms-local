/**
 * HR POLICIES — the registry. Maps a policy `key` → its `PolicyDoc`, and drives
 * the "All Policies" popup grid.
 *
 * ADDING A POLICY = adding ONE `PolicyDoc` object here (author it with the
 * builders from ./types) and flipping its card's `status` to "ready". Nothing
 * else is wired per-policy: the generic page (`/hr/policies/<key>`), the popup
 * and the Sign / Export actions all read from this registry.
 *
 * The three real policies (POSH, Exit, Anti-Harassment) are authored in their
 * own files and registered by the Assemble phase — this file seeds EMPTY and
 * exposes the card list so the popup renders even before they land (authored
 * cards open their page; the "coming soon" CLASH card renders greyed).
 *
 * PURE + CLIENT-SAFE (imports only ./types): the client popup, the page and any
 * print/PDF path all read the registry. Load-neutral.
 */

import type { PolicyDoc } from "./types";

// The authored policies — each a default-exported PolicyDoc in its own content
// file. The registry is keyed by each doc's OWN `.key`, so the card key, the
// URL segment (`/hr/policies/<key>`) and the acknowledgement key (doc.key, sent
// by <PolicyView>) all resolve to the same entry. Adding a policy = author its
// content file + import it here + add a "ready" POLICY_CARDS entry with the
// SAME key.
import poshPolicy from "./content/posh-policy";
import exitPolicy from "./content/exit-policy";
import antiHarassmentPolicy from "./content/anti-harassment-non-discrimination-policy";
import clashPolicy from "./content/clash-policy";
import preEmploymentTrainingEvaluationPolicy from "./content/pre-employment-training-evaluation-policy";
import attendancePolicy from "./content/attendance-policy";

/* ================================================================== */
/* The registry — key → PolicyDoc                                       */
/* ================================================================== */

/**
 * key → PolicyDoc. The three authored policies (POSH / Exit / Anti-Harassment),
 * each keyed by its own `.key`. CLASH has no PolicyDoc — it's advertised as a
 * "coming soon" card only (see POLICY_CARDS). Add a policy by importing its
 * content file above, adding it here, and adding its "ready" card below.
 */
export const POLICIES: Record<string, PolicyDoc> = {
  [poshPolicy.key]: poshPolicy,
  [exitPolicy.key]: exitPolicy,
  [antiHarassmentPolicy.key]: antiHarassmentPolicy,
  [clashPolicy.key]: clashPolicy,
  [preEmploymentTrainingEvaluationPolicy.key]: preEmploymentTrainingEvaluationPolicy,
  [attendancePolicy.key]: attendancePolicy,
};

/** Ordered list of every AUTHORED policy (iteration / listing). */
export const POLICY_LIST: PolicyDoc[] = Object.values(POLICIES);

/** Look up a policy by key (undefined if not yet authored / registered). */
export function getPolicy(key: string): PolicyDoc | undefined {
  return POLICIES[key];
}

/** True when `key` is an authored, registered policy. */
export function isPolicyKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(POLICIES, key);
}

/* ================================================================== */
/* Policy cards — the "All Policies" popup grid                         */
/* ================================================================== */

/**
 * A card in the popup grid. `status`:
 *   ready       — authored + registered; the card opens `/hr/policies/<key>`.
 *   coming-soon — planned but not yet authored (e.g. CLASH); renders greyed.
 *
 * The card list is intentionally SEPARATE from the registry so a policy can be
 * advertised (as "coming soon") before its `PolicyDoc` is written, and so the
 * grid keeps a stable order + copy regardless of authoring progress. When a
 * policy is authored, add it to POLICIES above and flip its card to "ready".
 */
export interface PolicyCard {
  key: string;
  title: string;
  blurb: string;
  /** One or two initials rendered in the card's brand chip. */
  badge: string;
  status: "ready" | "coming-soon";
}

/**
 * Every policy the organisation publishes, in display order. POSH, Exit and
 * Anti-Harassment are authored; CLASH is advertised as "coming soon" (greyed).
 * `getPolicy(key)` gates whether a "ready" card actually resolves — a card can
 * be flipped to "ready" the moment its PolicyDoc is registered.
 */
export const POLICY_CARDS: PolicyCard[] = [
  {
    key: "posh-policy",
    title: "Prevention of Sexual Harassment (POSH)",
    blurb: "Zero-tolerance framework, Internal Committee and complaint redressal.",
    badge: "PO",
    status: "ready",
  },
  {
    key: "exit-policy",
    title: "Exit & Separation Policy",
    blurb: "Resignation, notice, clearance, full-and-final and handover.",
    badge: "EX",
    status: "ready",
  },
  {
    key: "anti-harassment-non-discrimination-policy",
    title: "Anti-Harassment & Non-Discrimination",
    blurb: "Standards of conduct, prohibited behaviour and reporting channels.",
    badge: "AH",
    status: "ready",
  },
  {
    key: "clash",
    title: "Incentive Clash Policy",
    blurb: "Fair incentive attribution via CRM records, call recordings and teamwork.",
    badge: "IC",
    status: "ready",
  },
  {
    key: "pre-employment-training-evaluation-policy",
    title: "Pre-Employment Training & Evaluation",
    blurb: "Structured 15-day pre-employment training, evaluation criteria and stipend terms.",
    badge: "PT",
    status: "ready",
  },
  {
    key: "attendance-policy",
    title: "Attendance Policy",
    blurb: "Working hours, half-day & waiver rules, deductions, ex-gratia, comp-off, WFH and the attendance legend.",
    badge: "AT",
    status: "ready",
  },
];

/** Look up a policy card by key (undefined if not advertised). */
export function getPolicyCard(key: string): PolicyCard | undefined {
  return POLICY_CARDS.find((c) => c.key === key);
}

/**
 * True when `key` is advertised as coming-soon (or is a "ready" card whose
 * PolicyDoc hasn't been registered yet) — i.e. the page should show the tasteful
 * greyed placeholder rather than a rendered document.
 */
export function isComingSoon(key: string): boolean {
  const card = getPolicyCard(key);
  if (!card) return false;
  return card.status === "coming-soon" || !isPolicyKey(key);
}
