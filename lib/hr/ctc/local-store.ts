/**
 * CTC WORKBENCH — browser-local persistence + the Workbench → letter bridge.
 *
 * Two small, purely client-side concerns backed by `localStorage`:
 *
 *  1. BACK-STATE DRAFT — the in-progress (possibly half-filled, unsaved) CTC edit
 *     for an employee, keyed by employee id. The Workbench writes it on every
 *     dirty change and clears it on an explicit save; on mount it restores the
 *     last employee that still has a draft, so navigating away (e.g. to a
 *     compensation letter) and pressing Back keeps the 50%-filled state.
 *
 *  2. LETTER PRE-FILL — a one-shot payload the Workbench drops right before it
 *     opens a compensation letter (`/hr/letters/<key>?employee=…&ctc=current`).
 *     The letter editor reads it, maps the numeric components onto the CTC-letter
 *     field ids (`ctcComponentsToLetterValues`, skipping zero components) and
 *     clears it. `CTC_LETTER_COMPONENTS` (from the template) is the single source
 *     of the component → field-id mapping.
 *
 * PURE + CLIENT-SAFE — no server imports. Every `localStorage` touch is guarded
 * so it is a no-op under SSR. Load-neutral.
 */

import type { EntityId } from "@/lib/hr/entities";
import {
  CTC_COMPONENT_BY_ID,
  annualOf,
  computeTotals,
  formatINR,
  monthlyOf,
  num,
  type CtcComponents,
  type CtcReason,
  type GrowthEntry,
} from "@/lib/hr/ctc/model";
import {
  CTC_LETTER_COMPONENTS,
  CTC_LETTER_TOTALS,
} from "@/lib/hr/letters/templates/ctc-breakup";

/* ------------------------------------------------------------------ */
/* Keys                                                                 */
/* ------------------------------------------------------------------ */

const DRAFT_PREFIX = "altus:ctc-draft:";
const LAST_EMPLOYEE_KEY = "altus:ctc-last-employee";
const LETTER_PREFILL_KEY = "altus:ctc-letter-prefill";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/* ------------------------------------------------------------------ */
/* Back-state draft                                                     */
/* ------------------------------------------------------------------ */

/** The in-progress Workbench edit, persisted so Back restores it. */
export interface CtcDraft {
  activeId: string | null;
  entity: EntityId;
  reason: CtcReason;
  effectiveDate: string;
  components: CtcComponents;
  growth: GrowthEntry[];
}

export function writeCtcDraft(employeeId: string, draft: CtcDraft): void {
  if (!hasStorage() || !employeeId) return;
  try {
    window.localStorage.setItem(DRAFT_PREFIX + employeeId, JSON.stringify(draft));
    window.localStorage.setItem(LAST_EMPLOYEE_KEY, employeeId);
  } catch {
    /* quota / disabled storage → ignore */
  }
}

export function readCtcDraft(employeeId: string): CtcDraft | null {
  if (!hasStorage() || !employeeId) return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + employeeId);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<CtcDraft>;
    if (!d || typeof d !== "object" || !d.components) return null;
    return {
      activeId: typeof d.activeId === "string" ? d.activeId : null,
      entity: (d.entity ?? "altus-corp") as EntityId,
      reason: (d.reason ?? "initial") as CtcReason,
      effectiveDate: typeof d.effectiveDate === "string" ? d.effectiveDate : "",
      components: (d.components ?? {}) as CtcComponents,
      growth: Array.isArray(d.growth) ? (d.growth as GrowthEntry[]) : [],
    };
  } catch {
    return null;
  }
}

export function hasCtcDraft(employeeId: string): boolean {
  if (!hasStorage() || !employeeId) return false;
  return window.localStorage.getItem(DRAFT_PREFIX + employeeId) !== null;
}

export function clearCtcDraft(employeeId: string): void {
  if (!hasStorage() || !employeeId) return;
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + employeeId);
  } catch {
    /* ignore */
  }
}

/** The employee whose draft was most recently touched (for Back-restore on mount). */
export function readCtcLastEmployee(): string | null {
  if (!hasStorage()) return null;
  return window.localStorage.getItem(LAST_EMPLOYEE_KEY);
}

/* ------------------------------------------------------------------ */
/* Letter pre-fill                                                      */
/* ------------------------------------------------------------------ */

/** The one-shot payload the Workbench drops before opening a letter. */
export interface CtcLetterPrefill {
  employeeId: string;
  components: CtcComponents;
  entity: EntityId;
}

export function writeCtcLetterPrefill(payload: CtcLetterPrefill): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(LETTER_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readCtcLetterPrefill(): CtcLetterPrefill | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(LETTER_PREFILL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CtcLetterPrefill>;
    if (!p || typeof p.employeeId !== "string" || !p.components) return null;
    return {
      employeeId: p.employeeId,
      components: p.components as CtcComponents,
      entity: (p.entity ?? "altus-corp") as EntityId,
    };
  } catch {
    return null;
  }
}

export function clearCtcLetterPrefill(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(LETTER_PREFILL_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Components → CTC-letter field values                                 */
/* ------------------------------------------------------------------ */

/**
 * Map a Workbench components map onto the CTC-breakup letter's editable field
 * ids: each component's ₹ per-month + per-annum (and, where the letter carries a
 * "% of Basic" field, its computed percentage), plus the SUB-TOTAL and Net
 * Salary lines. Zero components are SKIPPED so the letter never seeds ₹0 rows —
 * which then stay hidden in the produced document.
 */
export function ctcComponentsToLetterValues(components: CtcComponents): Record<string, string> {
  const out: Record<string, string> = {};
  const totals = computeTotals(components);
  const grossMonthly = totals.grossMonthly;

  for (const c of CTC_LETTER_COMPONENTS) {
    if (!c.workbenchId) continue;
    const def = CTC_COMPONENT_BY_ID[c.workbenchId];
    if (!def) continue;
    const raw = num(components[c.workbenchId]);
    if (raw <= 0) continue; // skip zero components — do NOT seed 0 rows
    out[c.pmId] = formatINR(monthlyOf(def, raw));
    out[c.paId] = formatINR(annualOf(def, raw));
    // The letter annotates each component as a "% of CTC" (of gross monthly).
    if (c.pctId && grossMonthly > 0) {
      out[c.pctId] = String(Math.round((monthlyOf(def, raw) / grossMonthly) * 100));
    }
  }

  if (grossMonthly > 0) {
    out[CTC_LETTER_TOTALS.subtotalPm] = formatINR(totals.grossMonthly);
    out[CTC_LETTER_TOTALS.subtotalPa] = formatINR(totals.grossAnnual);
    out[CTC_LETTER_TOTALS.netPm] = formatINR(totals.netMonthly);
    out[CTC_LETTER_TOTALS.netPa] = formatINR(totals.netAnnual);
  }
  return out;
}
