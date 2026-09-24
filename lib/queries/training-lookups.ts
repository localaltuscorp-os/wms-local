import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcLookups } from "@/db/schema";
import { LOOKUP_KINDS, type LookupKind, type LookupOption } from "@/lib/training/lookups";
import {
  TRAINING_TYPES, TRAINING_TYPE_LABELS,
  AUDIENCE_SCOPES, AUDIENCE_SCOPE_LABELS,
  SHARE_SLOTS, SHARE_SLOT_LABELS,
  SELF_LEARNING_SOURCES, SELF_LEARNING_SOURCE_LABELS,
} from "@/db/enums";

/** The enum arrays, as the FALLBACK shape — used when the table has no rows. */
function enumFallback(kind: LookupKind): LookupOption[] {
  const pairs: Record<LookupKind, readonly string[]> = {
    training_type: TRAINING_TYPES,
    audience_scope: AUDIENCE_SCOPES,
    share_slot: SHARE_SLOTS,
    self_learning_source: SELF_LEARNING_SOURCES,
  };
  const labels: Record<LookupKind, Record<string, string>> = {
    training_type: TRAINING_TYPE_LABELS,
    audience_scope: AUDIENCE_SCOPE_LABELS,
    share_slot: SHARE_SLOT_LABELS,
    self_learning_source: SELF_LEARNING_SOURCE_LABELS,
  };
  return pairs[kind].map((v, i) => ({
    id: `enum:${kind}:${v}`,
    value: v,
    label: labels[kind][v] ?? v,
    isActive: true,
    sortOrder: (i + 1) * 10,
  }));
}

/** Active options for a picker — the table's rows, else the enum fallback. */
export async function lookupOptions(kind: LookupKind): Promise<LookupOption[]> {
  const rows = await db
    .select({
      id: tcLookups.id,
      value: tcLookups.value,
      label: tcLookups.label,
      isActive: tcLookups.isActive,
      sortOrder: tcLookups.sortOrder,
    })
    .from(tcLookups)
    .where(eq(tcLookups.kind, kind))
    .orderBy(asc(tcLookups.sortOrder), asc(tcLookups.label))
    .catch(() => []);

  const active = rows.filter((r) => r.isActive);
  return active.length > 0 ? active : enumFallback(kind);
}

/** Every row (active and retired) — the configuration screen's editor list. */
export async function listLookups(kind: LookupKind): Promise<LookupOption[]> {
  const rows = await db
    .select({
      id: tcLookups.id,
      value: tcLookups.value,
      label: tcLookups.label,
      isActive: tcLookups.isActive,
      sortOrder: tcLookups.sortOrder,
    })
    .from(tcLookups)
    .where(eq(tcLookups.kind, kind))
    .orderBy(asc(tcLookups.sortOrder), asc(tcLookups.label))
    .catch(() => []);
  return rows;
}

/** True when `value` is an active option of this kind (or the enums are empty). */
export async function isActiveLookup(kind: LookupKind, value: string): Promise<boolean> {
  const options = await lookupOptions(kind);
  return options.some((o) => o.value === value);
}
